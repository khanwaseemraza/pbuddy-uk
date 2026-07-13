/**
 * End-to-end protocol smoke test against the Firebase emulators.
 * Run: firebase emulators:exec --project pbuddy-uk "node scripts/smoke.mjs"
 *
 * Walks one shipment through the entire custody chain:
 * signup -> createShipment -> DEPOSITED -> assignTraveller -> COLLECTED
 * -> ARRIVED -> DELIVERED, then asserts final state + co2eAvoidedKg,
 * and checks replay/misuse is rejected.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import assert from "node:assert/strict";

const PROJECT = process.env.GCLOUD_PROJECT ?? "pbuddy-uk";
const FN = (name) => `http://127.0.0.1:5001/${PROJECT}/europe-west2/${name}`;
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake";

initializeApp({ projectId: PROJECT });
const db = getFirestore();

async function signUp() {
  const res = await fetch(AUTH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const body = await res.json();
  assert.ok(body.idToken, `auth emulator signUp failed: ${JSON.stringify(body)}`);
  return { idToken: body.idToken, uid: body.localId };
}

async function call(name, data, idToken) {
  const res = await fetch(FN(name), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const body = await res.json();
  return { status: res.status, ...body };
}

// --- seed reference data (server-side, as ops would) -----------------------
await db.doc("corridors/lon-bhm").set({ name: "London ↔ Birmingham", distanceKm: 180, requirePayment: true, priceGbp: 4.99 });
await db.doc("shops/shop-a").set({ name: "Euston Corner Store", linkToken: "tok-a", corridorId: "lon-bhm" });
await db.doc("shops/shop-b").set({ name: "New St Off-Licence", linkToken: "tok-b", corridorId: "lon-bhm" });

const sender = await signUp();
const traveller = await signUp();
const admin = await signUp();
await db.doc(`admins/${admin.uid}`).set({ role: "ops" });

// --- 1. sender creates shipment --------------------------------------------
const created = await call(
  "createShipment",
  { corridorId: "lon-bhm", sizeCategory: "small", itemCategory: "clothing", declaredValueGbp: 40 },
  sender.idToken
);
assert.equal(created.status, 200, `createShipment: ${JSON.stringify(created)}`);
const { shipmentId, depositCode } = created.result;
console.log(`1. CREATED       shipment=${shipmentId} depositCode=${depositCode}`);

// unauthenticated create must fail
const anon = await call("createShipment", { corridorId: "lon-bhm", sizeCategory: "small", itemCategory: "x", declaredValueGbp: 1 });
assert.equal(anon.status, 401, "unauthenticated createShipment should 401");

// --- 2. shop A scans deposit -------------------------------------------------
const scan = (data) => call("scanTransition", data, undefined);

// unpaid deposit must be blocked (payment gate), then simulate the Stripe
// webhook marking it paid
const unpaid = await scan({ shipmentId, code: depositCode, purpose: "deposit", shopId: "shop-a", linkToken: "tok-a", photoRef: "photos/x/dep0.jpg" });
assert.equal(unpaid.status, 400, "unpaid deposit should be rejected");
assert.match(JSON.stringify(unpaid), /payment_required/);
console.log("   unpaid deposit blocked ✓");
await db.doc(`shipments/${shipmentId}`).set({ paid: true }, { merge: true });

const dep = await scan({ shipmentId, code: depositCode, purpose: "deposit", shopId: "shop-a", linkToken: "tok-a", photoRef: "photos/x/dep.jpg" });
assert.equal(dep.status, 200, `deposit scan: ${JSON.stringify(dep)}`);
console.log("2. DEPOSITED     via shop-a");

// replayed deposit code must fail
const replay = await scan({ shipmentId, code: depositCode, purpose: "deposit", shopId: "shop-a", linkToken: "tok-a", photoRef: "photos/x/dep2.jpg" });
assert.equal(replay.status, 400, "replayed code should be rejected");
console.log("   replay of used deposit code rejected ✓");

// bad shop token must fail
const badShop = await scan({ shipmentId, code: depositCode, purpose: "deposit", shopId: "shop-a", linkToken: "wrong" });
assert.equal(badShop.status, 403, "bad linkToken should be rejected");
console.log("   bad shop linkToken rejected ✓");

// --- 3. admin assigns traveller ---------------------------------------------
const assign = await call("assignTraveller", { shipmentId, travellerUid: traveller.uid }, admin.idToken);
assert.equal(assign.status, 200, `assignTraveller: ${JSON.stringify(assign)}`);
const tCodes = (await db.doc(`shipments/${shipmentId}/private/travellerCodes`).get()).data();
console.log("3. matched       traveller codes issued");

// non-admin assign must fail
const notAdmin = await call("assignTraveller", { shipmentId, travellerUid: traveller.uid }, sender.idToken);
assert.equal(notAdmin.status, 403, "non-admin assign should be rejected");

// --- 4. shop A hands to traveller / 5. shop B receives ----------------------
const col = await scan({ shipmentId, code: tCodes.collectionCode, purpose: "collection", shopId: "shop-a", linkToken: "tok-a", photoRef: "photos/x/col.jpg" });
assert.equal(col.status, 200, `collection scan: ${JSON.stringify(col)}`);
console.log("4. COLLECTED     via shop-a");

const drop = await scan({ shipmentId, code: tCodes.dropCode, purpose: "drop", shopId: "shop-b", linkToken: "tok-b", photoRef: "photos/x/drop.jpg" });
assert.equal(drop.status, 200, `drop scan: ${JSON.stringify(drop)}`);
console.log("5. ARRIVED       via shop-b");

// --- 6. recipient collects ----------------------------------------------------
const pickup = (await db.doc(`shipments/${shipmentId}/private/pickupCode`).get()).data();
const del = await scan({ shipmentId, code: pickup.pickupCode, purpose: "pickup", shopId: "shop-b", linkToken: "tok-b" });
assert.equal(del.status, 200, `pickup scan: ${JSON.stringify(del)}`);
console.log("6. DELIVERED     via shop-b");

// --- final assertions ---------------------------------------------------------
const ship = (await db.doc(`shipments/${shipmentId}`).get()).data();
assert.equal(ship.state, "DELIVERED");
assert.ok(ship.co2eAvoidedKg > 0.4 && ship.co2eAvoidedKg < 1, `co2eAvoidedKg=${ship.co2eAvoidedKg}`);
const events = await db.collection(`shipments/${shipmentId}/events`).get();
assert.equal(events.size, 4, "expected 4 custody events");
const failures = await db.collection(`shipments/${shipmentId}/scanFailures`).get();
assert.ok(failures.size >= 1, "replay attempt should be logged as scanFailure");

console.log(`\nPROTOCOL SMOKE PASSED ✓  state=DELIVERED events=4 co2eAvoided=${ship.co2eAvoidedKg}kg failuresLogged=${failures.size}`);
