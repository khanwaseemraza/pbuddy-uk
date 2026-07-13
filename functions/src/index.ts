/**
 * Cloud Functions entry point — thin wrappers around the pure modules.
 * All custody writes happen here, inside Firestore transactions (ADR 0003).
 * Region: europe-west2 (ADR 0005).
 *
 * Firestore layout:
 *   shipments/{id}                 shipment doc (state, parties, corridor)
 *   shipments/{id}/events/{n}      append-only custody events
 *   shipments/{id}/codes/{purpose} hashed code records (no client access)
 *   shipments/{id}/private/codes   plaintext codes for the traveller flow
 *                                  (v0.1 pragmatism — TODO: FCM delivery)
 *   shops/{shopId}                 deposit points (linkToken auth, ADR 0002)
 *   corridors/{id}                 station pair, distanceKm
 */

import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getMessaging } from "firebase-admin/messaging";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

import { validateTransition, type CustodyState, type Actor } from "./custody.js";
import { issueCode, verifyCode, type CodePurpose, type CodeRecord } from "./codes.js";
import { canCancel, staleness, CANCEL_AFTER_DEPOSIT_FEE_GBP } from "./lifecycle.js";
import { co2eAvoidedKg } from "./co2.js";

initializeApp();
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const db = getFirestore();
// Custody events legitimately omit geo/photoRef on some steps; drop
// undefined keys instead of erroring mid-transaction.
db.settings({ ignoreUndefinedProperties: true });
const REGION = "europe-west2";

/** Fire-and-forget push to a user; missing tokens and send errors are non-fatal. */
async function notify(uid: string | undefined, title: string, body: string) {
  if (!uid) return;
  try {
    const token = (await db.doc(`users/${uid}`).get()).get("fcmToken") as string | undefined;
    if (token) await getMessaging().send({ token, notification: { title, body } });
  } catch (e) {
    console.warn(`notify(${uid}) failed:`, (e as Error).message);
  }
}

const CUSTODY_PUSH: Record<CustodyState, { title: string; body: string } | null> = {
  CREATED: null,
  DEPOSITED: { title: "Parcel accepted 📦", body: "Your parcel is safely at the origin shop, sealed and photographed." },
  COLLECTED: { title: "On its way 🚆", body: "A verified traveller has collected your parcel and it's moving." },
  ARRIVED: { title: "Arrived at destination ✅", body: "Your parcel is at the destination shop — share the pickup code with your recipient." },
  DELIVERED: { title: "Delivered 🎉", body: "Your parcel was collected. Zero-van delivery — thanks for shipping green." },
};

const PURPOSE_TO_STATE: Record<CodePurpose, CustodyState> = {
  deposit: "DEPOSITED",
  collection: "COLLECTED",
  drop: "ARRIVED",
  pickup: "DELIVERED",
};

const SIZE_CATEGORIES = ["small", "medium"] as const; // fits in a backpack — rail travellers (ADR 0006)
const MAX_DECLARED_VALUE_GBP = 100;

function requireAuth(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "sign in required");
  return uid;
}

/** Ops access: uid listed in admins/, or verified phone listed in adminPhones/. */
async function requireAdmin(auth: { uid?: string; token?: { phone_number?: string } } | undefined): Promise<string> {
  const uid = requireAuth(auth?.uid);
  if ((await db.doc(`admins/${uid}`).get()).exists) return uid;
  const phone = auth?.token?.phone_number;
  if (phone && (await db.doc(`adminPhones/${phone}`).get()).exists) return uid;
  throw new HttpsError("permission-denied", "ops access only");
}

/** Shop auth v0.1: unique link carries shopId + linkToken (ADR 0002). */
async function requireShop(shopId: unknown, linkToken: unknown) {
  if (typeof shopId !== "string" || typeof linkToken !== "string") {
    throw new HttpsError("invalid-argument", "shopId and linkToken required");
  }
  const shop = await db.doc(`shops/${shopId}`).get();
  if (!shop.exists || shop.get("linkToken") !== linkToken) {
    throw new HttpsError("permission-denied", "unknown shop or bad token");
  }
  return { shopId, name: shop.get("name") as string };
}

// ---------------------------------------------------------------------------
// createShipment (sender, iOS app)
// ---------------------------------------------------------------------------
export const createShipment = onCall({ region: REGION }, async (req) => {
  const senderUid = requireAuth(req.auth?.uid);
  const { corridorId, sizeCategory, itemCategory, declaredValueGbp, recipientName, recipientPhone } = req.data ?? {};

  if (!SIZE_CATEGORIES.includes(sizeCategory)) {
    throw new HttpsError("invalid-argument", `sizeCategory must be one of ${SIZE_CATEGORIES.join(", ")}`);
  }
  if (typeof itemCategory !== "string" || !itemCategory) {
    throw new HttpsError("invalid-argument", "itemCategory declaration is required");
  }
  if (typeof declaredValueGbp !== "number" || declaredValueGbp <= 0 || declaredValueGbp > MAX_DECLARED_VALUE_GBP) {
    throw new HttpsError("invalid-argument", `declaredValueGbp must be 0–${MAX_DECLARED_VALUE_GBP}`);
  }
  const corridor = await db.doc(`corridors/${corridorId}`).get();
  if (!corridor.exists) throw new HttpsError("invalid-argument", "unknown corridor");

  const now = new Date();
  const shipmentRef = db.collection("shipments").doc();
  const { plaintext, record } = issueCode(shipmentRef.id, "deposit", now);
  // Public tracking token — lets the recipient follow the parcel and see the
  // pickup code without an account (they never installed the app).
  const trackToken = randomBytes(9).toString("base64url");

  const batch = db.batch();
  batch.set(shipmentRef, {
    state: "CREATED" satisfies CustodyState,
    senderUid,
    corridorId,
    sizeCategory,
    itemCategory,
    declaredValueGbp,
    recipientName: typeof recipientName === "string" ? recipientName.slice(0, 80) : null,
    recipientPhone: typeof recipientPhone === "string" ? recipientPhone.slice(0, 20) : null,
    trackToken,
    createdAt: Timestamp.fromDate(now),
    stateEnteredAt: Timestamp.fromDate(now),
  });
  batch.set(shipmentRef.collection("codes").doc("deposit"), toFirestoreCode(record));
  // Reverse lookup for the public tracking page (token -> shipment).
  batch.set(db.doc(`trackTokens/${trackToken}`), { shipmentId: shipmentRef.id });
  await batch.commit();

  // Plaintext goes only to the sender's device; server keeps the hash.
  return {
    shipmentId: shipmentRef.id,
    depositCode: plaintext,
    expiresAt: record.expiresAt.toISOString(),
    trackUrl: `https://pbuddy-uk.web.app/track.html?t=${trackToken}`,
  };
});

// ---------------------------------------------------------------------------
// getTracking (public) — recipient/sender follow a parcel by share token.
// No auth: the unguessable token IS the capability. Returns only what a
// recipient needs, including the pickup code once ARRIVED.
// ---------------------------------------------------------------------------
export const getTracking = onCall({ region: REGION }, async (req) => {
  const { token } = req.data ?? {};
  if (typeof token !== "string" || token.length < 8) {
    throw new HttpsError("invalid-argument", "token required");
  }
  const lookup = await db.doc(`trackTokens/${token}`).get();
  if (!lookup.exists) throw new HttpsError("not-found", "unknown tracking link");
  const shipmentId = lookup.get("shipmentId") as string;
  const ship = await db.doc(`shipments/${shipmentId}`).get();
  if (!ship.exists) throw new HttpsError("not-found", "parcel not found");

  const state = ship.get("state") as CustodyState;
  let pickupCode: string | null = null;
  if (state === "ARRIVED") {
    const pk = await db.doc(`shipments/${shipmentId}/private/pickupCode`).get();
    pickupCode = (pk.get("pickupCode") as string) ?? null;
  }
  return {
    state,
    itemCategory: ship.get("itemCategory"),
    corridorId: ship.get("corridorId"),
    recipientName: ship.get("recipientName") ?? null,
    co2eAvoidedKg: ship.get("co2eAvoidedKg") ?? null,
    pickupCode, // only present when ARRIVED
  };
});

// ---------------------------------------------------------------------------
// assignTraveller (admin, manual matching v0.1)
// ---------------------------------------------------------------------------
export const assignTraveller = onCall({ region: REGION }, async (req) => {
  await requireAdmin(req.auth);

  const { shipmentId, travellerUid } = req.data ?? {};
  if (typeof shipmentId !== "string" || typeof travellerUid !== "string") {
    throw new HttpsError("invalid-argument", "shipmentId and travellerUid required");
  }
  // Trust gate: only ID-verified travellers may carry (PRODUCT.md).
  const traveller = await db.doc(`users/${travellerUid}`).get();
  if (traveller.get("identityVerified") !== true) {
    throw new HttpsError("failed-precondition", "traveller_not_verified");
  }

  const now = new Date();
  const shipmentRef = db.doc(`shipments/${shipmentId}`);
  const collection = issueCode(shipmentId, "collection", now);
  const drop = issueCode(shipmentId, "drop", now);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(shipmentRef);
    if (!snap.exists) throw new HttpsError("not-found", "no such shipment");
    if (snap.get("state") !== "DEPOSITED") {
      throw new HttpsError("failed-precondition", "can only assign a DEPOSITED shipment");
    }
    tx.update(shipmentRef, { travellerUid });
    tx.set(shipmentRef.collection("codes").doc("collection"), toFirestoreCode(collection.record));
    tx.set(shipmentRef.collection("codes").doc("drop"), toFirestoreCode(drop.record));
    // v0.1: traveller app reads plaintexts from this doc (rules: traveller only).
    // TODO: deliver via FCM data message and drop this doc entirely.
    tx.set(shipmentRef.collection("private").doc("travellerCodes"), {
      travellerUid,
      collectionCode: collection.plaintext,
      dropCode: drop.plaintext,
    });
  });

  await notify(travellerUid, "New parcel to carry 🎒", "A parcel on your route is ready — your collection code is in the Carry tab.");
  return { ok: true };
});

// ---------------------------------------------------------------------------
// scanTransition (shop web page — the single endpoint for events 2–5)
// ---------------------------------------------------------------------------
export const scanTransition = onCall({ region: REGION, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  const { shipmentId, code, purpose, shopId, linkToken, photoRef, geo } = req.data ?? {};
  const shop = await requireShop(shopId, linkToken);

  if (typeof shipmentId !== "string" || typeof code !== "string") {
    throw new HttpsError("invalid-argument", "shipmentId and code required");
  }
  if (!(purpose in PURPOSE_TO_STATE)) {
    throw new HttpsError("invalid-argument", "bad purpose");
  }
  const p = purpose as CodePurpose;
  const now = new Date();
  const shipmentRef = db.doc(`shipments/${shipmentId}`);
  const codeRef = shipmentRef.collection("codes").doc(p);

  const result = await db.runTransaction(async (tx) => {
    const [shipSnap, codeSnap] = await Promise.all([tx.get(shipmentRef), tx.get(codeRef)]);
    if (!shipSnap.exists) throw new HttpsError("not-found", "no such shipment");
    if (!codeSnap.exists) throw new HttpsError("failed-precondition", "no code issued for this step");

    // Transactions require all reads before any write — fetch the corridor
    // now; consumed by the payment gate (deposit) and CO2e calc (pickup).
    const corridorSnap =
      p === "pickup" || p === "deposit"
        ? await tx.get(db.doc(`corridors/${shipSnap.get("corridorId")}`))
        : null;

    // Payment gate: no custody until the sender has paid (COMPLIANCE §2 —
    // Stripe holds the money; we only ever see the webhook).
    if (p === "deposit" && corridorSnap?.get("requirePayment") === true && shipSnap.get("paid") !== true) {
      return { ok: false as const, reason: "payment_required" };
    }

    const codeCheck = verifyCode({
      record: fromFirestoreCode(codeSnap.data()!),
      presented: code,
      purpose: p,
      shipmentId,
      now,
    });
    if (!codeCheck.ok) {
      // Log the attempt — failed scans are fraud-signal data.
      tx.create(shipmentRef.collection("scanFailures").doc(), {
        purpose: p,
        reason: codeCheck.reason,
        shopId: shop.shopId,
        at: Timestamp.fromDate(now),
      });
      return { ok: false as const, reason: codeCheck.reason };
    }

    const actor: Actor = { kind: "shop", shopId: shop.shopId };
    const transition = validateTransition({
      shipmentId,
      current: shipSnap.get("state") as CustodyState,
      requested: PURPOSE_TO_STATE[p],
      actor,
      codeHash: codeSnap.get("hash"),
      photoRef: typeof photoRef === "string" ? photoRef : undefined,
      geo,
    });
    if (!transition.ok) return { ok: false as const, reason: transition.reason };

    tx.update(codeRef, { usedAt: Timestamp.fromDate(now) });
    tx.create(shipmentRef.collection("events").doc(), {
      ...transition.event,
      at: Timestamp.fromDate(now),
    });

    const update: Record<string, unknown> = {
      state: transition.event.to,
      stateEnteredAt: Timestamp.fromDate(now),
    };

    if (transition.event.to === "ARRIVED") {
      // Issue the pickup code; sender relays to recipient v0.1 (TODO: SMS
      // with privacy-notice link — recipient is a data subject, COMPLIANCE §1).
      const pickup = issueCode(shipmentId, "pickup", now);
      tx.set(shipmentRef.collection("codes").doc("pickup"), toFirestoreCode(pickup.record));
      tx.set(shipmentRef.collection("private").doc("pickupCode"), {
        senderUid: shipSnap.get("senderUid"),
        pickupCode: pickup.plaintext,
      });
    }
    if (transition.event.to === "DELIVERED") {
      update.co2eAvoidedKg = co2eAvoidedKg(corridorSnap!.get("distanceKm"));
      // TODO: Stripe transfer release goes here (COMPLIANCE §2).
    }
    tx.update(shipmentRef, update);
    return { ok: true as const, state: transition.event.to };
  });

  if (!result.ok) throw new HttpsError("failed-precondition", `scan rejected: ${result.reason}`);

  const push = CUSTODY_PUSH[result.state];
  if (push) {
    const ship = await shipmentRef.get();
    await notify(ship.get("senderUid"), push.title, push.body);
    if (result.state === "DELIVERED") {
      await notify(ship.get("travellerUid"), "Handover complete 🙌", "The parcel you carried was delivered. Thanks for travelling with pbuddy.");
      await payoutDelivered(STRIPE_SECRET_KEY.value(), shipmentId).catch((e) =>
        console.error(`payout ${shipmentId} failed:`, (e as Error).message)
      );
    }
  }
  return result;
});

// ---------------------------------------------------------------------------
// uploadScanPhoto (shop web page) — photo lands in Storage BEFORE the scan;
// scanTransition then records the returned photoRef in the custody event.
// Photos frame parcels, not people (ADR 0005); 12-month retention.
// ---------------------------------------------------------------------------
const SCAN_BUCKET = "pbuddy-uk-scans";
const MAX_PHOTO_BYTES = 3 * 1024 * 1024; // ~3MB after client-side downscale

export const uploadScanPhoto = onRequest(
  { region: REGION, cors: ["https://pbuddy-uk.web.app", "http://localhost:5000"] },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "POST only" });
        return;
      }
      const { shopId, linkToken, shipmentId, purpose, imageBase64 } = req.body ?? {};
      await requireShop(shopId, linkToken);
      if (typeof shipmentId !== "string" || typeof purpose !== "string" || typeof imageBase64 !== "string") {
        res.status(400).json({ error: "shipmentId, purpose, imageBase64 required" });
        return;
      }
      const bytes = Buffer.from(imageBase64, "base64");
      if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) {
        res.status(400).json({ error: `image must be 1B–${MAX_PHOTO_BYTES}B` });
        return;
      }
      const path = `scans/${shipmentId}/${purpose}-${Date.now()}.jpg`;
      await getStorage().bucket(SCAN_BUCKET).file(path).save(bytes, {
        contentType: "image/jpeg",
        metadata: { metadata: { shopId, purpose } },
      });
      res.json({ photoRef: `gs://${SCAN_BUCKET}/${path}` });
    } catch (e) {
      const httpsErr = e as HttpsError;
      const code = httpsErr.httpErrorCode?.status ?? 500;
      res.status(code).json({ error: httpsErr.message ?? "internal" });
    }
  }
);

// ---------------------------------------------------------------------------
// stripeWebhook — marks shipments paid on checkout.session.completed.
// Senders pay via a Stripe Payment Link carrying ?client_reference_id=
// <shipmentId>; Stripe holds funds (we never do — COMPLIANCE §2).
// ---------------------------------------------------------------------------
const WEBHOOK_TOLERANCE_S = 600;

/** Minimal Stripe REST client — form-encoded, no SDK dependency. */
async function stripe(
  key: string,
  method: "GET" | "POST",
  path: string,
  params?: Record<string, string>
): Promise<Record<string, any>> {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const res = await fetch(`https://api.stripe.com/v1/${path}${method === "GET" && body ? `?${body}` : ""}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(method === "POST" && body ? { body } : {}),
  });
  const json = (await res.json()) as Record<string, any>;
  if (!res.ok) throw new HttpsError("internal", `stripe ${path}: ${json.error?.message ?? res.status}`);
  return json;
}

// ---------------------------------------------------------------------------
// createCheckoutSession (sender) — server-priced from the corridor doc, so
// clients can never choose their own price. Stripe hosts payment and holds
// funds (COMPLIANCE §2); our webhook flips `paid`.
// ---------------------------------------------------------------------------
export const createCheckoutSession = onCall(
  { region: REGION, secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    const uid = requireAuth(req.auth?.uid);
    const { shipmentId } = req.data ?? {};
    if (typeof shipmentId !== "string") throw new HttpsError("invalid-argument", "shipmentId required");

    const ship = await db.doc(`shipments/${shipmentId}`).get();
    if (!ship.exists) throw new HttpsError("not-found", "no such shipment");
    if (ship.get("senderUid") !== uid) throw new HttpsError("permission-denied", "not your shipment");
    if (ship.get("paid") === true) throw new HttpsError("failed-precondition", "already paid");

    const corridor = await db.doc(`corridors/${ship.get("corridorId")}`).get();
    const priceGbp = corridor.get("priceGbp") as number;
    if (!priceGbp) throw new HttpsError("failed-precondition", "corridor has no price");

    const session = await stripe(STRIPE_SECRET_KEY.value(), "POST", "checkout/sessions", {
      mode: "payment",
      client_reference_id: shipmentId,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "gbp",
      "line_items[0][price_data][unit_amount]": String(Math.round(priceGbp * 100)),
      "line_items[0][price_data][product_data][name]": `pbuddy delivery — ${corridor.get("name")}`,
      success_url: "https://pbuddy-uk.web.app/paid.html",
      cancel_url: "https://pbuddy-uk.web.app/payment-cancelled.html",
    });
    return { url: session.url as string };
  }
);

function verifyStripeSignature(rawBody: Buffer, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t)) return false;
  if (Math.abs(Date.now() / 1000 - t) > WEBHOOK_TOLERANCE_S) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody.toString("utf8")}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const stripeWebhook = onRequest(
  { region: REGION, secrets: [STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (typeof sig !== "string" || !verifyStripeSignature(req.rawBody, sig, STRIPE_WEBHOOK_SECRET.value())) {
      res.status(400).json({ error: "bad signature" });
      return;
    }
    const event = JSON.parse(req.rawBody.toString("utf8"));
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const shipmentId = session.client_reference_id;
      if (typeof shipmentId === "string" && shipmentId) {
        await db.doc(`shipments/${shipmentId}`).set(
          {
            paid: true,
            paidAt: FieldValue.serverTimestamp(),
            paymentSessionId: session.id,
            amountPaid: session.amount_total,
          },
          { merge: true }
        );
      }
    }
    if (event.type === "identity.verification_session.verified") {
      const uid = event.data.object?.metadata?.uid;
      if (typeof uid === "string" && uid) {
        await db.doc(`users/${uid}`).set(
          { identityVerified: true, identityStatus: "verified", identityVerifiedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
        await notify(uid, "Identity verified ✅", "You're fully verified — you can now carry parcels.");
      }
    }
    if (event.type === "identity.verification_session.requires_input") {
      const uid = event.data.object?.metadata?.uid;
      if (typeof uid === "string" && uid) {
        await db.doc(`users/${uid}`).set({ identityStatus: "requires_input" }, { merge: true });
      }
    }
    res.json({ received: true });
  }
);

// ---------------------------------------------------------------------------
// createIdentityVerification — Stripe Identity hosted document check.
// The trust layer (PRODUCT.md): verified humans, but pbuddy never sees the
// documents — verify-then-delete by design (COMPLIANCE §1, ADR 0005).
// ---------------------------------------------------------------------------
export const createIdentityVerification = onCall(
  { region: REGION, secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    const uid = requireAuth(req.auth?.uid);
    const user = await db.doc(`users/${uid}`).get();
    if (user.get("identityVerified") === true) {
      throw new HttpsError("failed-precondition", "already verified");
    }
    const session = await stripe(STRIPE_SECRET_KEY.value(), "POST", "identity/verification_sessions", {
      type: "document",
      "metadata[uid]": uid,
      return_url: "https://pbuddy-uk.web.app/verified.html",
    });
    await db.doc(`users/${uid}`).set(
      { identitySessionId: session.id, identityStatus: "pending" },
      { merge: true }
    );
    return { url: session.url as string };
  }
);

// ---------------------------------------------------------------------------
// createConnectOnboarding (traveller) — Stripe Express account + hosted
// onboarding link. Stripe handles KYC/AML on payees (COMPLIANCE §2).
// ---------------------------------------------------------------------------
export const createConnectOnboarding = onCall(
  { region: REGION, secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    const uid = requireAuth(req.auth?.uid);
    const key = STRIPE_SECRET_KEY.value();
    const userRef = db.doc(`users/${uid}`);

    let accountId = (await userRef.get()).get("stripeAccountId") as string | undefined;
    if (!accountId) {
      const account = await stripe(key, "POST", "accounts", {
        type: "express",
        country: "GB",
        business_type: "individual",
        "capabilities[transfers][requested]": "true",
        "metadata[uid]": uid,
      });
      accountId = account.id as string;
      await userRef.set({ stripeAccountId: accountId }, { merge: true });
    }

    const link = await stripe(key, "POST", "account_links", {
      account: accountId,
      type: "account_onboarding",
      refresh_url: "https://pbuddy-uk.web.app/payout-setup.html",
      return_url: "https://pbuddy-uk.web.app/payout-done.html",
    });
    return { url: link.url as string };
  }
);

/**
 * Pay out a delivered shipment: traveller + both shops, per corridor splits.
 * Never blocks custody — failures are recorded for ops retry.
 */
async function payoutDelivered(key: string, shipmentId: string) {
  const shipmentRef = db.doc(`shipments/${shipmentId}`);
  const ship = await shipmentRef.get();
  if (ship.get("paid") !== true || ship.get("payouts")) return;

  const corridor = await db.doc(`corridors/${ship.get("corridorId")}`).get();
  const travellerCut = (corridor.get("travellerCutPence") as number) ?? 0;
  const shopCut = (corridor.get("shopCutPence") as number) ?? 0;

  // Shops involved = actors of the DEPOSITED and ARRIVED events.
  const events = await shipmentRef.collection("events").get();
  const shopIds = new Set<string>();
  for (const e of events.docs) {
    const to = e.get("to");
    if (to === "DEPOSITED" || to === "ARRIVED") {
      const actor = e.get("actor");
      if (actor?.shopId) shopIds.add(actor.shopId);
    }
  }

  const legs: Array<{ label: string; account?: string; amount: number }> = [];
  const travellerUid = ship.get("travellerUid") as string | undefined;
  if (travellerUid && travellerCut > 0) {
    const account = (await db.doc(`users/${travellerUid}`).get()).get("stripeAccountId");
    legs.push({ label: `traveller:${travellerUid}`, account, amount: travellerCut });
  }
  for (const shopId of shopIds) {
    if (shopCut > 0) {
      const account = (await db.doc(`shops/${shopId}`).get()).get("stripeAccountId");
      legs.push({ label: `shop:${shopId}`, account, amount: shopCut });
    }
  }

  const payouts: Record<string, string> = {};
  for (const leg of legs) {
    if (!leg.account) {
      payouts[leg.label] = "pending_onboarding";
      continue;
    }
    try {
      const transfer = await stripe(key, "POST", "transfers", {
        amount: String(leg.amount),
        currency: "gbp",
        destination: leg.account,
        "metadata[shipmentId]": shipmentId,
      });
      payouts[leg.label] = transfer.id as string;
    } catch (e) {
      payouts[leg.label] = `failed: ${(e as Error).message.slice(0, 80)}`;
    }
  }
  await shipmentRef.update({ payouts, payoutsAt: FieldValue.serverTimestamp() });
}

// ---------------------------------------------------------------------------
// cancelShipment (sender)
// ---------------------------------------------------------------------------
export const cancelShipment = onCall(
  { region: REGION, secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    const uid = requireAuth(req.auth?.uid);
    const { shipmentId } = req.data ?? {};
    if (typeof shipmentId !== "string") throw new HttpsError("invalid-argument", "shipmentId required");

    const shipmentRef = db.doc(`shipments/${shipmentId}`);
    const cancelled = await db.runTransaction(async (tx) => {
      const snap = await tx.get(shipmentRef);
      if (!snap.exists) throw new HttpsError("not-found", "no such shipment");
      if (snap.get("senderUid") !== uid) throw new HttpsError("permission-denied", "not your shipment");

      const check = canCancel(snap.get("state") as CustodyState);
      if (!check.ok) throw new HttpsError("failed-precondition", check.reason);

      tx.update(shipmentRef, {
        state: "CANCELLED",
        cancelledAt: FieldValue.serverTimestamp(),
        refund: check.refund,
      });
      return {
        refund: check.refund,
        note: check.note,
        paid: snap.get("paid") === true,
        sessionId: snap.get("paymentSessionId") as string | undefined,
        amountPaid: snap.get("amountPaid") as number | undefined,
      };
    });

    // Refund outside the transaction (external call): full at CREATED,
    // minus shop handling once DEPOSITED (lifecycle.ts).
    let refundId: string | undefined;
    if (cancelled.paid && cancelled.sessionId) {
      const key = STRIPE_SECRET_KEY.value();
      const session = await stripe(key, "GET", `checkout/sessions/${cancelled.sessionId}`);
      const handlingPence = cancelled.refund === "minus_handling" ? Math.round(CANCEL_AFTER_DEPOSIT_FEE_GBP * 100) : 0;
      const amount = Math.max(0, (cancelled.amountPaid ?? 0) - handlingPence);
      if (amount > 0 && typeof session.payment_intent === "string") {
        const refund = await stripe(key, "POST", "refunds", {
          payment_intent: session.payment_intent,
          amount: String(amount),
        });
        refundId = refund.id as string;
        await shipmentRef.update({ refundId, refundedPence: amount });
      }
    }
    return { ok: true, refund: cancelled.refund, note: cancelled.note, refundId };
  }
);

// ---------------------------------------------------------------------------
// getShopActivity (shop web page) — today's scans + estimated earnings.
// The shopkeeper's daily reconciliation: what came in, what left, what
// they earned. Auth: shop link token, same as scanning (ADR 0002).
// ---------------------------------------------------------------------------
export const getShopActivity = onCall({ region: REGION }, async (req) => {
  const { shopId, linkToken } = req.data ?? {};
  const shop = await requireShop(shopId, linkToken);

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const events = await db
    .collectionGroup("events")
    .where("actor.shopId", "==", shop.shopId)
    .where("at", ">=", Timestamp.fromDate(startOfDay))
    .orderBy("at", "desc")
    .limit(100)
    .get();

  const rows = events.docs.map((d) => ({
    shipmentId: d.ref.parent.parent!.id,
    to: d.get("to") as CustodyState,
    at: (d.get("at") as Timestamp).toDate().toISOString(),
  }));

  // A shop earns its cut once per parcel it custodies: DEPOSITED at origin,
  // ARRIVED at destination (corridor shopCutPence, paid out on DELIVERED).
  const earningParcels = new Set(
    rows.filter((r) => r.to === "DEPOSITED" || r.to === "ARRIVED").map((r) => r.shipmentId)
  );

  return {
    shopName: shop.name,
    scansToday: rows,
    parcelsHandled: earningParcels.size,
    estimatedEarningsPence: earningParcels.size * 50,
  };
});

// ---------------------------------------------------------------------------
// Ops console callables (shop-web/public/ops.html)
// ---------------------------------------------------------------------------
export const opsOverview = onCall({ region: REGION }, async (req) => {
  await requireAdmin(req.auth);

  const [parcels, travellers, shops, applications] = await Promise.all([
    db.collection("shipments").orderBy("createdAt", "desc").limit(50).get(),
    db.collection("users").where("identityVerified", "==", true).limit(50).get(),
    db.collection("shops").get(),
    db.collection("shopApplications").where("status", "==", "pending").limit(50).get(),
  ]);

  return {
    parcels: parcels.docs.map((d) => ({
      id: d.id,
      state: d.get("state"),
      paid: d.get("paid") === true,
      staleKind: d.get("staleKind") ?? null,
      travellerUid: d.get("travellerUid") ?? null,
      itemCategory: d.get("itemCategory"),
      createdAt: (d.get("createdAt") as Timestamp | undefined)?.toDate().toISOString(),
      payouts: d.get("payouts") ?? null,
    })),
    travellers: travellers.docs.map((d) => ({
      uid: d.id,
      hasPayouts: Boolean(d.get("stripeAccountId")),
    })),
    shops: shops.docs.map((d) => ({
      id: d.id,
      name: d.get("name"),
      corridorId: d.get("corridorId"),
      link: `https://pbuddy-uk.web.app/?shop=${d.id}&token=${d.get("linkToken")}`,
      hasPayouts: Boolean(d.get("stripeAccountId")),
    })),
    applications: applications.docs.map((d) => ({
      id: d.id,
      name: d.get("name"),
      contactName: d.get("contactName"),
      phone: d.get("phone"),
      address: d.get("address"),
      corridorId: d.get("corridorId"),
    })),
  };
});

export const createShop = onCall({ region: REGION }, async (req) => {
  await requireAdmin(req.auth);
  const { name, corridorId } = req.data ?? {};
  if (typeof name !== "string" || !name || typeof corridorId !== "string") {
    throw new HttpsError("invalid-argument", "name and corridorId required");
  }
  const corridor = await db.doc(`corridors/${corridorId}`).get();
  if (!corridor.exists) throw new HttpsError("invalid-argument", "unknown corridor");

  const linkToken = randomBytes(12).toString("hex");
  const ref = db.collection("shops").doc();
  await ref.set({ name, corridorId, linkToken, createdAt: FieldValue.serverTimestamp() });
  return { shopId: ref.id, link: `https://pbuddy-uk.web.app/?shop=${ref.id}&token=${linkToken}` };
});

export const createShopOnboarding = onCall(
  { region: REGION, secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    await requireAdmin(req.auth);
    const { shopId } = req.data ?? {};
    if (typeof shopId !== "string") throw new HttpsError("invalid-argument", "shopId required");
    const shopRef = db.doc(`shops/${shopId}`);
    const shop = await shopRef.get();
    if (!shop.exists) throw new HttpsError("not-found", "no such shop");

    const key = STRIPE_SECRET_KEY.value();
    let accountId = shop.get("stripeAccountId") as string | undefined;
    if (!accountId) {
      const account = await stripe(key, "POST", "accounts", {
        type: "express",
        country: "GB",
        "capabilities[transfers][requested]": "true",
        "metadata[shopId]": shopId,
      });
      accountId = account.id as string;
      await shopRef.update({ stripeAccountId: accountId });
    }
    const link = await stripe(key, "POST", "account_links", {
      account: accountId,
      type: "account_onboarding",
      refresh_url: "https://pbuddy-uk.web.app/payout-setup.html",
      return_url: "https://pbuddy-uk.web.app/payout-done.html",
    });
    return { url: link.url as string };
  }
);

// ---------------------------------------------------------------------------
// Shop self-onboarding: shopkeeper applies from a public page; ops approves
// and the shop + scan link are created automatically. Replaces manual shop
// creation as the pipeline (F7: shop pipeline, intent-to-partner).
// ---------------------------------------------------------------------------
export const applyShop = onCall({ region: REGION }, async (req) => {
  const { name, contactName, phone, address, corridorId } = req.data ?? {};
  for (const [k, v] of Object.entries({ name, contactName, phone, address, corridorId })) {
    if (typeof v !== "string" || !v.trim()) throw new HttpsError("invalid-argument", `${k} required`);
    if ((v as string).length > 200) throw new HttpsError("invalid-argument", `${k} too long`);
  }
  if (!/^\+[1-9]\d{7,14}$/.test((phone as string).replace(/\s/g, ""))) {
    throw new HttpsError("invalid-argument", "phone must be international format, e.g. +44 7911 123456");
  }
  if (!(await db.doc(`corridors/${corridorId}`).get()).exists) {
    throw new HttpsError("invalid-argument", "unknown corridor");
  }
  // One open application per phone (idempotent resubmit, spam brake).
  const phoneKey = (phone as string).replace(/\s/g, "");
  const dup = await db.collection("shopApplications")
    .where("phoneKey", "==", phoneKey).where("status", "==", "pending").limit(1).get();
  if (!dup.empty) return { ok: true, note: "already applied — we'll be in touch" };

  await db.collection("shopApplications").add({
    name: (name as string).trim(), contactName: (contactName as string).trim(),
    phone: (phone as string).trim(), phoneKey, address: (address as string).trim(),
    corridorId, status: "pending", createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

export const decideShopApplication = onCall({ region: REGION }, async (req) => {
  const adminUid = await requireAdmin(req.auth);
  const { applicationId, approve } = req.data ?? {};
  if (typeof applicationId !== "string" || typeof approve !== "boolean") {
    throw new HttpsError("invalid-argument", "applicationId and approve required");
  }
  const appRef = db.doc(`shopApplications/${applicationId}`);
  const snap = await appRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "no such application");
  if (snap.get("status") !== "pending") throw new HttpsError("failed-precondition", "already decided");

  if (!approve) {
    await appRef.update({ status: "rejected", decidedBy: adminUid, decidedAt: FieldValue.serverTimestamp() });
    return { ok: true };
  }
  const linkToken = randomBytes(12).toString("hex");
  const shopRef = db.collection("shops").doc();
  await shopRef.set({
    name: snap.get("name"), corridorId: snap.get("corridorId"), linkToken,
    contactName: snap.get("contactName"), contactPhone: snap.get("phone"),
    address: snap.get("address"), applicationId,
    createdAt: FieldValue.serverTimestamp(),
  });
  await appRef.update({ status: "approved", shopId: shopRef.id, decidedBy: adminUid, decidedAt: FieldValue.serverTimestamp() });
  return { ok: true, shopId: shopRef.id, link: `https://pbuddy-uk.web.app/?shop=${shopRef.id}&token=${linkToken}` };
});

// ---------------------------------------------------------------------------
// opsResolve — dispute + refund actions (ops.html). Two admin overrides:
//   cancel_refund: cancel a stuck/problem parcel (any non-terminal state)
//                  and refund the sender in full — ops discretion, unlike
//                  the sender's own canCancel() path.
//   refund_only:   dispute refund on a DELIVERED parcel; custody chain and
//                  state stay intact (append-only ledger untouched).
// Every action is recorded on the shipment with who/why/when.
// ---------------------------------------------------------------------------
export const opsResolve = onCall(
  { region: REGION, secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    const adminUid = await requireAdmin(req.auth);
    const { shipmentId, action, reason } = req.data ?? {};
    if (typeof shipmentId !== "string") throw new HttpsError("invalid-argument", "shipmentId required");
    if (action !== "cancel_refund" && action !== "refund_only") {
      throw new HttpsError("invalid-argument", "action must be cancel_refund or refund_only");
    }
    if (typeof reason !== "string" || reason.trim().length < 5) {
      throw new HttpsError("invalid-argument", "a reason (min 5 chars) is required — it goes on the audit trail");
    }

    const shipmentRef = db.doc(`shipments/${shipmentId}`);
    const info = await db.runTransaction(async (tx) => {
      const snap = await tx.get(shipmentRef);
      if (!snap.exists) throw new HttpsError("not-found", "no such shipment");
      const state = snap.get("state") as CustodyState | "CANCELLED";

      if (action === "cancel_refund") {
        if (state === "DELIVERED" || state === "CANCELLED") {
          throw new HttpsError("failed-precondition", `cannot cancel a ${state} parcel — use refund_only for disputes`);
        }
        tx.update(shipmentRef, { state: "CANCELLED", cancelledAt: FieldValue.serverTimestamp(), refund: "ops_full" });
      } else if (state !== "DELIVERED") {
        throw new HttpsError("failed-precondition", "refund_only is for DELIVERED parcels; use cancel_refund otherwise");
      }
      if (snap.get("opsRefundId")) throw new HttpsError("failed-precondition", "already refunded by ops");

      return {
        paid: snap.get("paid") === true,
        sessionId: snap.get("paymentSessionId") as string | undefined,
        amountPaid: snap.get("amountPaid") as number | undefined,
      };
    });

    // Full refund outside the transaction (external call), as cancelShipment does.
    let refundId: string | undefined;
    if (info.paid && info.sessionId && (info.amountPaid ?? 0) > 0) {
      const key = STRIPE_SECRET_KEY.value();
      const session = await stripe(key, "GET", `checkout/sessions/${info.sessionId}`);
      if (typeof session.payment_intent === "string") {
        const refund = await stripe(key, "POST", "refunds", {
          payment_intent: session.payment_intent,
          amount: String(info.amountPaid),
        });
        refundId = refund.id as string;
      }
    }
    await shipmentRef.update({
      ...(refundId ? { opsRefundId: refundId, refundedPence: info.amountPaid } : {}),
      opsActions: FieldValue.arrayUnion({
        action, reason: reason.trim(), by: adminUid, at: Timestamp.now(),
        ...(refundId ? { refundId } : { refund: "none (unpaid or no session)" }),
      }),
    });
    return { ok: true, refundId: refundId ?? null };
  }
);

// ---------------------------------------------------------------------------
// staleSweep — hourly: flag stuck shipments per lifecycle.staleness().
// Ops (manual v0.1) works the flagged list: re-match, return-leg, refunds.
// ---------------------------------------------------------------------------
export const staleSweep = onSchedule(
  { region: REGION, schedule: "every 1 hours" },
  async () => {
    const open = await db
      .collection("shipments")
      .where("state", "in", ["CREATED", "DEPOSITED", "ARRIVED"])
      .get();

    const now = new Date();
    const batch = db.batch();
    let flagged = 0;
    for (const doc of open.docs) {
      const enteredAt = (doc.get("stateEnteredAt") as Timestamp | undefined)?.toDate();
      if (!enteredAt) continue;
      const kind = staleness(doc.get("state") as CustodyState, enteredAt, now);
      if (kind !== "none" && doc.get("staleKind") !== kind) {
        batch.update(doc.ref, { staleKind: kind, staleFlaggedAt: Timestamp.fromDate(now) });
        flagged++;
      }
    }
    if (flagged > 0) await batch.commit();
    console.log(`staleSweep: ${open.size} open, ${flagged} newly flagged`);
  }
);

// ---------------------------------------------------------------------------
// Firestore <-> CodeRecord marshalling
// ---------------------------------------------------------------------------
function toFirestoreCode(r: CodeRecord) {
  return {
    shipmentId: r.shipmentId,
    purpose: r.purpose,
    hash: r.hash,
    issuedAt: Timestamp.fromDate(r.issuedAt),
    expiresAt: Timestamp.fromDate(r.expiresAt),
    ...(r.usedAt ? { usedAt: Timestamp.fromDate(r.usedAt) } : {}),
  };
}
function fromFirestoreCode(d: FirebaseFirestore.DocumentData): CodeRecord {
  return {
    shipmentId: d.shipmentId,
    purpose: d.purpose,
    hash: d.hash,
    issuedAt: (d.issuedAt as Timestamp).toDate(),
    expiresAt: (d.expiresAt as Timestamp).toDate(),
    usedAt: d.usedAt ? (d.usedAt as Timestamp).toDate() : undefined,
  };
}

// TODO (next): scheduled staleness sweep (lifecycle.staleness) via
// onSchedule — flags never_deposited / no_traveller / not_collected.
