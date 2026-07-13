/**
 * One-shot production setup: completes every prerequisite flow so the ops
 * dashboard and a full demo custody run work end-to-end.
 *
 * Seeds (idempotent — safe to re-run):
 *   1. adminPhones/<phone>       — ops-dashboard access for the given number(s)
 *   2. corridors/lon-bhm + lon-man — pricing/splits reference data (if missing)
 *   3. Demo shops on each corridor (if missing), printing their scan links
 *   4. Optionally marks a user identityVerified (demo traveller) via --traveller
 *
 * Run with real credentials (either works):
 *   a) Application Default Credentials:
 *        gcloud auth application-default login
 *        node scripts/setup-ops.mjs --admin +923001234567
 *   b) Service account key:
 *        GOOGLE_APPLICATION_CREDENTIALS=key.json node scripts/setup-ops.mjs --admin +923001234567
 *
 * Flags:
 *   --admin +44...       phone to grant ops access (repeatable)
 *   --traveller <uid>    mark this uid identityVerified=true (DEMO ONLY —
 *                        real travellers must pass Stripe Identity)
 *   --dry                print what would change, write nothing
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";

const PROJECT = process.env.GCLOUD_PROJECT ?? "pbuddy-uk";
initializeApp({ projectId: PROJECT, credential: applicationDefault() });
const db = getFirestore();

// --- parse args --------------------------------------------------------------
const args = process.argv.slice(2);
const admins = [];
let travellerUid = null;
let dry = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--admin") admins.push(args[++i]);
  else if (args[i] === "--traveller") travellerUid = args[++i];
  else if (args[i] === "--dry") dry = true;
}
if (admins.length === 0 && !travellerUid) {
  console.error("Usage: node scripts/setup-ops.mjs --admin +92300... [--admin +44...] [--traveller <uid>] [--dry]");
  process.exit(1);
}
const E164 = /^\+[1-9]\d{7,14}$/;
for (const p of admins) {
  if (!E164.test(p)) {
    console.error(`Not E.164 (must be like +923001234567, no spaces): ${p}`);
    process.exit(1);
  }
}
const write = async (label, fn) => {
  if (dry) console.log(`DRY  would: ${label}`);
  else { await fn(); console.log(`OK   ${label}`); }
};

// --- 1. admin phones ----------------------------------------------------------
for (const phone of admins) {
  const ref = db.doc(`adminPhones/${phone}`);
  if ((await ref.get()).exists) console.log(`SKIP adminPhones/${phone} already exists`);
  else await write(`grant ops access to ${phone}`, () =>
    ref.set({ role: "admin", createdAt: FieldValue.serverTimestamp() }));
}

// --- 2. corridors (reference data; only created if absent) --------------------
const CORRIDORS = {
  "lon-bhm": { name: "London ↔ Birmingham", distanceKm: 180, requirePayment: true, priceGbp: 4.99,
    splits: { travellerGbp: 2.2, shopAGbp: 0.5, shopBGbp: 0.5 } },
  "lon-man": { name: "London ↔ Manchester", distanceKm: 296, requirePayment: true, priceGbp: 6.99,
    splits: { travellerGbp: 3.2, shopAGbp: 0.6, shopBGbp: 0.6 } },
};
for (const [id, data] of Object.entries(CORRIDORS)) {
  const ref = db.doc(`corridors/${id}`);
  if ((await ref.get()).exists) console.log(`SKIP corridors/${id} already exists (left untouched)`);
  else await write(`create corridor ${id}`, () => ref.set(data));
}

// --- 3. demo shops (two per corridor if that corridor has none) ---------------
const DEMO_SHOPS = {
  "lon-bhm": ["Euston Corner Store", "New St Off-Licence"],
  "lon-man": ["Kings Cross Kiosk", "Piccadilly News"],
};
for (const [corridorId, names] of Object.entries(DEMO_SHOPS)) {
  const existing = await db.collection("shops").where("corridorId", "==", corridorId).get();
  if (!existing.empty) {
    console.log(`SKIP shops for ${corridorId} exist:`);
    for (const d of existing.docs)
      console.log(`     ${d.get("name")}: https://pbuddy-uk.web.app/?shop=${d.id}&token=${d.get("linkToken")}`);
    continue;
  }
  for (const name of names) {
    const linkToken = randomBytes(12).toString("hex");
    const ref = db.collection("shops").doc();
    await write(`create shop "${name}" (${corridorId})`, () =>
      ref.set({ name, corridorId, linkToken, createdAt: FieldValue.serverTimestamp() }));
    if (!dry) console.log(`     scan link: https://pbuddy-uk.web.app/?shop=${ref.id}&token=${linkToken}`);
  }
}

// --- 4. demo traveller verification -------------------------------------------
if (travellerUid) {
  console.log("WARN --traveller bypasses Stripe Identity — demo/test accounts only.");
  await write(`mark users/${travellerUid} identityVerified`, () =>
    db.doc(`users/${travellerUid}`).set({ identityVerified: true }, { merge: true }));
}

console.log(dry ? "\nDry run complete — nothing written." : "\nSetup complete. Refresh ops.html.");
process.exit(0);
