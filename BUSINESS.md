# pbuddy — Living Business Plan

> Update every sprint. Sections map 1:1 to Envestors' portal so the
> endorsement application assembles itself from here. Mark every number as
> **[assumed]** or **[measured]** — the goal is to convert assumed → measured
> via the pilot before applying.

## 1. Company Overview

- Brand: **ParcelBuddy** (short: Pbuddy) — decided 2026-07-12, ADR 0007
- Entity: ParcelBuddy Ltd (or pbuddy Ltd — confirm at Companies House name
  check) — **TODO: incorporate** (UK co-founder, on Graduate visa)
- Founders: Muniba Nisar (technical/product founder, Innovator Founder
  applicant) · [UK co-founder — name, commercial founder, Graduate visa]
- Cap table: **TODO** (decide brother-in-KSA structure: gift→founder capital
  vs. loan to company — see decisions/0005 when made)

## 2. Financials

- Rule from Envestors scorecard feedback (reported by past applicants):
  no revenue before ~month 4–6; profitability path visible by year 3.
- Anchor every forecast line to a pilot measurement or a named benchmark
  (Evri/InPost published pricing, agreed shop commission).
- **[assumed]** unit economics per parcel, now enforced in code (corridor
  doc splits + automatic Stripe transfers on DELIVERED):
  price £4.99 → traveller £2.20 · shop A £0.50 · shop B £0.50 ·
  pbuddy gross £1.79 (~36%) before Stripe fees (~£0.37) → net ~£1.42.
  Pilot must validate: is £2.20 enough to motivate a commuter? Is £0.50/scan
  enough for a shopkeeper? → replace with pilot data.

## 3. Capital Requirement

- Source: family funding (brother, KSA). Target form: **transferred and
  sitting in company/founder account before application**, with source-of-
  funds evidence (his bank statements, employment/business proof, relationship
  documents, signed letter stating amount + terms).
- Amount: £__ (size to 12 months runway per §2).
- Separate: Muniba's personal £1,270 maintenance, own account, 28 days.

## 4. Disclosures

- IP: custody-protocol authorship trail (this repo, ADRs). Consider
  provisional filing later.
- Legal/regulatory: ToS, prohibited-items policy, insurance per leg,
  ICO registration (personal data), sealed-bag chain-of-custody policy.

## 5. Business Proposal (market & progress)

- Problem: P2P delivery has failed repeatedly on the synchronous-handoff
  problem (meetup friction, safety, no-shows) — name the dead: Shyp, Nimber
  et al. Incumbent couriers can't do cheap intercity same-day.
- Solution: asynchronous handoff via deposit points; see PRODUCT.md.
  **Rail/coach travellers only** (ADR 0006): zero-van delivery, ~zero
  marginal emissions, recurring commuter supply on fixed corridors.
- Beachhead: ONE rail corridor (e.g. London↔Birmingham), C2C marketplace
  sellers (Vinted/eBay/Depop) + students. Deposit shops recruited within
  walking radius of the two stations. **[decide corridor]**
  Platform is multi-corridor **[measured]** 2026-07-13: London↔Birmingham
  (£4.99) and London↔Manchester (£6.99) both live end-to-end; distance-based
  pricing/CO₂e/payout-splits are per-corridor config, so adding a route is
  data entry, not code — the core of the scalability claim.
- Progress log (append per sprint):
  - 2026-07: repo scaffolded; custody protocol specified.
  - 2026-07-12: custody engine built and tested (27 unit tests); full
    protocol verified end-to-end in emulator (replay + bad-shop rejection
    included); dedicated Firebase project `pbuddy-uk` created, Firestore
    pinned to europe-west2 (London, ADR 0005); security rules deployed
    (clients cannot write custody state); shop scan page at
    https://pbuddy-uk.web.app.
  - 2026-07-12 (payments): Stripe sandbox wired — £4.99 payment link for
    the pilot corridor, payment gate (no custody until paid), signed
    webhook marks shipments paid; Stripe holds all funds (COMPLIANCE §2).
    Photo capture live on shop scans (London bucket, shop-token auth).
  - 2026-07-12 (system demo): full loop exercised on production with a real
    Stripe sandbox payment (pi_3TsTQX…, £4.99) and a complete custody chain
    to DELIVERED — 5 states, per-step photos in the London bucket, 0.498 kg
    CO₂e recorded. NB: this is a *technical* end-to-end proof (internal test
    data, shops played by us), NOT pilot traction. Real traction = parcels
    moved by independent senders/travellers/shops, still to come. Keep the
    two clearly separate in any endorsement evidence.
  - 2026-07-12 (later): Blaze enabled; all four Cloud Functions live in
    production and verified end-to-end with a real shipment (0.498 kg CO₂e
    recorded); demo shops seeded with phone-testable links; iOS sender app
    (SwiftUI) built and compiling — create parcel, deposit QR/code, live
    custody timeline, CO₂e badge.

## 6. Business Criteria (innovation · viability · scalability)

- **Innovation**: the asynchronous custody protocol — not "a delivery app".
  Evidence: ADRs, commit history (Muniba as author), pilot custody-chain data,
  named differentiation from failed predecessors.
- **Viability**: pilot unit economics; founder capability (Muniba = platform,
  UK co-founder = commercial); funded runway per §3.
- **Scalability**: corridor playbook repeats city-pair by city-pair; shop
  network is asset-light; every parcel adds supply-side data. Jobs created:
  ops + engineering hires by year 2–3 **[forecast in §2]**.
  Load evidence **[measured]** 2026-07-12: 1,000 concurrent shipments,
  4,000 custody scans, 0 failures, ~164 scans/sec on dev hardware
  (≈14M parcels/day equivalent at sustained rate; serverless scales
  horizontally beyond this).

## Known constraints (say them before the assessor does)

- iOS-first halves the traveller/sender pool → Android on roadmap, pilot
  recruits iPhone users deliberately.
- Contraband risk cannot be zeroed → sealed bags, ID verification, category
  limits, inspection right, insurance. Designed in from first commit.
- Marketplace cold-start → single corridor, single vertical, manual matching.
