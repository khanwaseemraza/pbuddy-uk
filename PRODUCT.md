# pbuddy — Product Spec (v0.1)

Peer-to-peer parcel delivery over journeys people are already making, with
**asynchronous handoffs** through deposit points (partnered convenience
stores / off-licences; lockers later). Nobody meets anybody. The custody
chain is the product.

## The custody protocol

A shipment moves through five custody events. Every event is recorded
server-side with timestamp, geolocation, actor, and a photo where custody
physically changes hands. The event log is **append-only** — events are
never edited or deleted.

```
CREATED ──▶ DEPOSITED ──▶ COLLECTED ──▶ ARRIVED ──▶ DELIVERED
         (sender→shop A) (shop A→traveller) (traveller→shop B) (shop B→recipient)
```

| # | Event | Actor scanning | Code used | Photo | Notes |
|---|-------|----------------|-----------|-------|-------|
| 1 | CREATED | — (sender, in app) | — | — | Sender declares size/category, gets **deposit code** (QR + 6-digit) |
| 2 | DEPOSITED | Shop A (web) | deposit code | ✅ parcel at counter | Sealed-bag check; weight/size confirmed; sender notified |
| 3 | COLLECTED | Shop A (web) | traveller's **collection code** | ✅ handover | Custody → traveller; recipient notified with ETA window |
| 4 | ARRIVED | Shop B (web) | traveller's **drop code** | ✅ parcel at counter | Custody → shop B; recipient gets **pickup code** |
| 5 | DELIVERED | Shop B (web) | pickup code | optional | Journey closes; escrow releases (traveller + both shops paid) |

### Invariants (enforced in Cloud Functions, never in clients)

- Transitions only in the order above; any out-of-order scan is rejected and logged.
- Codes are single-use, shipment-bound, and expire (deposit code: 48h; pickup code: 7 days).
- Clients have **no write access** to custody state — all transitions go
  through callable functions; Firestore rules block direct writes.
- A shipment with no COLLECTED event within its window auto-triggers
  re-match or return-to-sender flow.

## Edge cases (v0.1 answers)

- **Traveller no-show**: parcel simply stays at shop A — no stranded meetup.
  Re-match manually; sender can cancel for refund minus shop handling fee.
- **Traveller collects, never arrives**: identity is phone+ID verified,
  escrow is withheld, last custody photo shows the handover. Insurance claim
  path; traveller banned. (This is the residual risk the deposit model
  cannot remove — price it, insure it, say so honestly.)
- **Recipient never collects**: after 7 days, return leg is offered to
  travellers as a paid job; after 14, sender arranges recovery.
- **Shop disputes a scan**: every event has photo + timestamp; shop-side
  scans happen on the shop's own device via their unique link.
- **Prohibited items**: category declaration at CREATED; tamper-evident
  sealed bag sold at shop counter (own SKU); shop refuses unsealed/oversize
  at DEPOSITED; sender ID verified at signup; random-inspection right in ToS.

## Surfaces

1. **iOS app (Swift/SwiftUI)** — sender flow (create, track), traveller flow
   (browse jobs, codes wallet). Android/web later.
2. **Shop scan page (TypeScript, Firebase Hosting)** — camera QR scan +
   manual code entry. No install; each shop has a unique authenticated link.
   Must work on any phone the shopkeeper owns.
3. **Cloud Functions (TypeScript)** — custody state machine, code
   generation/validation, notifications, (later) Stripe escrow.
4. **Admin (manual for v0.1)** — traveller↔shipment matching done by hand;
   automation is a later milestone, not an MVP requirement.

## Explicitly NOT in v0.1

Automated matching, in-app payments (Stripe payment links only), ratings,
routing optimisation, Android, lockers/InPost, multi-leg journeys.
