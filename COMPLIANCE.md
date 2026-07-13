# pbuddy — Legal, Privacy & Regulatory Plan

> Status column: ☐ todo · ◐ designed into product · ✅ done.
> This file feeds BUSINESS.md §4 (Disclosures). Everything here is
> engineering-informed planning, **not legal advice** — a UK solicitor
> reviews ToS/privacy policy before public launch.

## 1. Data protection (UK GDPR / DPA 2018)

| Item | Plan | Status |
|---|---|---|
| ICO registration | Register pbuddy Ltd as data controller (~£40–60/yr tier) before processing real user data | ☐ |
| Data residency | Pin Firestore/Storage to **europe-west2 (London)** at project creation — cannot be changed later | ◐ |
| Lawful bases | Contract (delivery service), legitimate interest (fraud prevention: custody photos, geo), consent (marketing only) | ☐ document |
| Data map | Phone numbers, IDs (verification), custody photos, geolocation of scans, addresses of shops (business, not personal). Recipients are data subjects who never signed up — pickup-code SMS must carry privacy notice link | ◐ |
| Custody photos | Photograph **parcels, not people** — shop-page UI framing + guidance enforces this; incidental capture handled by retention limits | ◐ |
| Retention | Custody events: 6 years (limitation period, disputes). Photos: 12 months unless dispute open. ID documents: verify-then-delete where possible (keep result, not document) | ◐ |
| Cross-border access | Muniba (Pakistan, pre-visa) accessing UK user data = restricted transfer. Options: IDTA with herself as processor is awkward — cleaner: **dev/staging uses synthetic data only; production access UK-only** until she relocates | ◐ |
| DSARs / deletion | Append-only custody ledger vs. erasure right: personal identifiers pseudonymised in events (uid refs), so account deletion severs identity without destroying the audit chain | ◐ |
| DPIA | Do a lightweight one before pilot: geo + ID + photos of the public is exactly the profile that warrants it | ☐ |

## 2. Payments & money handling

- **Never hold user money on our own books.** "Escrow" is a regulated
  activity if we take possession of funds. Use **Stripe Connect** with
  delayed transfers/manual payouts — Stripe holds funds, we control release
  on DELIVERED. Stripe handles KYC/AML on travellers and shops being paid.
- v0.1 pilot: Stripe payment links; no cash at counters (shops never handle
  our money — keeps shop agreements simple).
- Wording rule: say "payment protection", not "escrow", in user-facing copy.

## 3. Carriage, liability & insurance

- Parcel carriage in the UK is broadly unregulated (no licence needed;
  postal regulation targets letters). Confirm with solicitor that our model
  doesn't cross into "postal packets" territory.
- **Goods-in-transit insurance** (platform-level policy) + public liability.
  Per-parcel declared-value cap in v0.1 (e.g. £100) with liability capped in
  ToS to declared value.
- **Traveller motor insurance**: carrying goods for payment is "hire and
  reward" use — excluded from standard private car policies; an accident
  mid-carriage could void the traveller's own cover. Options: require
  business-use confirmation at signup, per-trip top-up partner (Zego-style),
  or pilot with **rail/coach travellers only** (no vehicle → no issue, and
  intercity rail is the strongest use-case anyway). Decide before pilot.
- Platform is the single party liable to senders (ToS): claims come to
  pbuddy up to declared value (£100 cap v0.1), backed by the GIT policy —
  users never pursue individual travellers or shops.
- Do NOT sell per-parcel insurance to users — that is FCA-regulated
  insurance distribution. Cover is included in the service ("payment
  protection up to declared value"), backed by our own policy.
- Permitted items: **parcels only — no letters/correspondence**, keeping us
  outside Ofcom's postal (letters) regime; solicitor to confirm.
- Travellers are independent contractors, not workers — matching is
  job-board-style acceptance, no penalties for declining, no schedule
  control. (Uber/Deliveroo worker-status case law makes design choices here
  load-bearing; revisit with solicitor.)
- Shops: simple partner agreement — handling fee per scan, no custody
  liability beyond safe-keeping, right to refuse any parcel.

## 4. Prohibited items & criminal misuse

- ToS prohibited list mirroring courier norms (drugs, weapons, cash,
  perishables, batteries beyond spec, age-restricted goods).
- Controls designed into v0.1 (see PRODUCT.md): sender ID verification,
  category declaration, tamper-evident sealed bags sold at counter, shop
  refusal right, random-inspection right in ToS, single-corridor pilot =
  human oversight of every parcel.
- Report-and-cooperate posture: retain custody chain for law-enforcement
  requests (the append-only ledger is exactly what they'd ask for).

## 5. Consumer & platform law

- Consumer Contracts Regs: pre-contract info, cancellation rights (carved
  out once service begins — i.e., once DEPOSITED).
- Complaints/disputes process documented before pilot (Envestors will ask).
- Terms of Service + Privacy Policy: draft in-repo, solicitor review before
  any non-staged parcel moves.

## 6. Corporate & IP

- Incorporate pbuddy Ltd (UK co-founder can act now). Founders' agreement:
  equity split, vesting, roles.
- **IP assignment**: all pre-incorporation work (this repo) assigned to the
  company in writing — matters for the endorsement ("the venture owns its
  innovation") and for any future investment.
- Brother-in-KSA funding: document as gift-to-founder or loan-to-company
  (decide → ADR 0005), with source-of-funds evidence retained.

## Sequencing

1. **Now (pre-pilot, synthetic data):** region pinning, data map, ToS/privacy
   drafts, prohibited-items list, IP assignment, incorporation.
2. **Before first real parcel:** ICO registration, insurance quote bound,
   solicitor pass on ToS + worker-status design, DPIA, Stripe Connect setup.
3. **Before endorsement application:** everything above evidenced in
   BUSINESS.md §4 — compliance maturity is a viability signal.
