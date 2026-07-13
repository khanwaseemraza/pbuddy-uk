# ADR 0006: Rail/coach travellers only; sustainability as core positioning

**Status:** accepted · 2026-07-12

## Decision
1. v0.1 and the pilot accept travellers on **rail and coach journeys only**.
   Private-car travellers are out of scope until a hire-and-reward insurance
   solution exists (see COMPLIANCE.md §3).
2. Sustainability is core positioning, not a marketing afterthought:
   "zero-van delivery" — parcels ride journeys already happening on public
   transport, ~zero marginal emissions.
3. Every DELIVERED event computes `co2eAvoided` (DEFRA conversion factors,
   van-delivery baseline for the corridor distance) so the pilot generates
   substantiated impact numbers automatically.

## Context
- Solves the traveller motor-insurance problem entirely (no vehicle).
- Rail commuters = recurring, schedule-predictable supply on fixed
  corridors → better match rates than ad-hoc drivers; the UK rail map is
  the expansion roadmap.
- Stations anchor shop recruitment geographically (deposit points near
  station exits).
- Endorsing bodies weight measurable sustainability; incumbents cannot
  copy "zero-van" — their asset base is vans.

## Green-claims discipline (CMA Green Claims Code)
- Publish the methodology; count only genuinely avoided van-km.
- Claim "near-zero additional emissions per parcel", never "carbon neutral"
  (we make no offsetting claim).
- Baseline and factors reviewed when DEFRA updates annual figures.

## Consequences
- Traveller onboarding asks for journey mode; car journeys rejected in v0.1.
- Corridor definition = station pair + deposit shops within walking radius.
- `co2eAvoided` field added to shipment close-out; BUSINESS.md progress log
  reports cumulative kg CO₂e avoided per sprint.
- Revisit car travellers only with per-trip hire-and-reward cover partner.
