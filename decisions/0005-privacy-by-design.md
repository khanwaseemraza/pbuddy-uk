# ADR 0005: Privacy by design — region pinning, pseudonymised ledger, synthetic dev data

**Status:** accepted · 2026-07-12

## Decision
1. Firebase project pinned to **europe-west2 (London)** for Firestore and
   Storage at creation (irreversible — must be set before any data exists).
2. Custody events reference actors by uid/shopId only — no names, phones, or
   addresses inside events. Account deletion severs identity from the ledger
   without breaking the append-only audit chain (GDPR erasure vs. audit).
3. Development and staging environments use **synthetic data only**.
   Production data access is UK-only until Muniba relocates — avoids an
   international-transfer problem during the pre-visa build phase.
4. Custody photos frame parcels, not people; retention 12 months (6 years
   for events), ID documents verify-then-delete.

## Context
See COMPLIANCE.md §1. Geo + ID + photos is a high-scrutiny data profile;
retrofitting any of this is expensive, and demonstrable privacy maturity is
a viability signal for endorsement.

## Consequences
- Two Firebase projects from day one: `pbuddy-dev` (synthetic), `pbuddy-prod`
  (London-pinned, locked down).
- Seed scripts for synthetic shipments/shops become part of `functions/`.
- Event schema (custody.ts) keeps Actor as ids only — already true.
