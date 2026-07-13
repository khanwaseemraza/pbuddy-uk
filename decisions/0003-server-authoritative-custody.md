# ADR 0003: Custody state lives server-side, append-only

**Status:** accepted · 2026-07-12

## Decision
All custody transitions execute in Cloud Functions. Clients (iOS app, shop
page) can only *request* a transition by presenting a code; the function
validates order, code, expiry, and actor, then appends a custody event.
Firestore security rules deny direct client writes to shipments and events.
Events are append-only: corrections are new events, never edits.

## Context
The custody chain is the product's trust claim and the venture's innovation
claim. A ledger a client can rewrite is neither. Fraud (fake scans, replayed
codes) and disputes (who had the parcel when) are resolved from this log.

## Consequences
- The state machine is a single, unit-testable module — the core IP artefact.
- Offline scanning is deferred (shop page requires connectivity in v0.1).
- Every event carries: shipment id, transition, actor, timestamp (server),
  geo, photo ref, code-hash used.
