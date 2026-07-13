/**
 * Load evidence (ROADMAP Phase 4): drive N shipments through the full
 * custody protocol concurrently against the emulator suite.
 * Run: firebase emulators:exec --project pbuddy-uk --only functions,firestore \
 *        "node functions/scripts/loadtest.mjs"
 * Env: N (default 1000), CONCURRENCY (default 100)
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { issueCode } from "../lib/codes.js";

const N = Number(process.env.N ?? 1000);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 100);
const PROJECT = process.env.GCLOUD_PROJECT ?? "pbuddy-uk";
const FN = `http://127.0.0.1:5001/${PROJECT}/europe-west2/scanTransition`;

initializeApp({ projectId: PROJECT });
const db = getFirestore();

await db.doc("corridors/load").set({ name: "Load ↔ Test", distanceKm: 180, requirePayment: true, priceGbp: 4.99 });
await db.doc("shops/load-a").set({ name: "Load Shop A", linkToken: "lt-a", corridorId: "load" });
await db.doc("shops/load-b").set({ name: "Load Shop B", linkToken: "lt-b", corridorId: "load" });

const latencies = [];
let failures = 0;

async function scan(body) {
  const t0 = performance.now();
  const res = await fetch(FN, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: body }),
  });
  latencies.push(performance.now() - t0);
  if (res.status !== 200) {
    failures++;
    throw new Error(`${body.purpose}: ${res.status} ${await res.text()}`);
  }
}

async function chain(i) {
  const id = `load-${i}`;
  const now = new Date();
  const deposit = issueCode(id, "deposit", now);
  const collection = issueCode(id, "collection", now);
  const drop = issueCode(id, "drop", now);
  const ts = Timestamp.fromDate(now);
  const code = (r) => ({ shipmentId: r.shipmentId, purpose: r.purpose, hash: r.hash, issuedAt: ts, expiresAt: Timestamp.fromDate(r.expiresAt) });

  const batch = db.batch();
  const ref = db.doc(`shipments/${id}`);
  batch.set(ref, {
    state: "CREATED", senderUid: `sender-${i}`, travellerUid: `traveller-${i}`,
    corridorId: "load", sizeCategory: "small", itemCategory: "loadtest",
    declaredValueGbp: 10, paid: true, createdAt: ts, stateEnteredAt: ts,
  });
  batch.set(ref.collection("codes").doc("deposit"), code(deposit.record));
  batch.set(ref.collection("codes").doc("collection"), code(collection.record));
  batch.set(ref.collection("codes").doc("drop"), code(drop.record));
  await batch.commit();

  const A = { shopId: "load-a", linkToken: "lt-a" };
  const B = { shopId: "load-b", linkToken: "lt-b" };
  await scan({ shipmentId: id, code: deposit.plaintext, purpose: "deposit", ...A, photoRef: "load/p.jpg" });
  await scan({ shipmentId: id, code: collection.plaintext, purpose: "collection", ...A, photoRef: "load/p.jpg" });
  await scan({ shipmentId: id, code: drop.plaintext, purpose: "drop", ...B, photoRef: "load/p.jpg" });
  const pickup = (await db.doc(`shipments/${id}/private/pickupCode`).get()).get("pickupCode");
  await scan({ shipmentId: id, code: pickup, purpose: "pickup", ...B });

  const final = await db.doc(`shipments/${id}`).get();
  if (final.get("state") !== "DELIVERED") throw new Error(`${id} ended ${final.get("state")}`);
}

const t0 = performance.now();
let next = 0, done = 0, chainFailures = 0;
async function worker() {
  while (next < N) {
    const i = next++;
    try { await chain(i); } catch (e) { chainFailures++; if (chainFailures <= 3) console.error(e.message); }
    done++;
    if (done % 200 === 0) console.log(`${done}/${N} chains complete`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const wallSec = (performance.now() - t0) / 1000;

latencies.sort((a, b) => a - b);
const pct = (p) => Math.round(latencies[Math.floor(latencies.length * p)]);
console.log(`
LOAD TEST COMPLETE
shipments:        ${N} (concurrency ${CONCURRENCY})
delivered:        ${N - chainFailures}  failed chains: ${chainFailures}  failed scans: ${failures}
custody events:   ${latencies.length} scans in ${wallSec.toFixed(1)}s  ->  ${(latencies.length / wallSec).toFixed(0)} scans/sec
scan latency ms:  p50=${pct(0.5)}  p95=${pct(0.95)}  p99=${pct(0.99)}
`);
