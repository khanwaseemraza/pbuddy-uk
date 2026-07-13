# pbuddy

Peer-to-peer delivery over journeys people are already making — "already
going there? take this with you" — with asynchronous, chain-of-custody
handoffs through deposit points (partnered shops; lockers later).

- [PRODUCT.md](PRODUCT.md) — custody protocol spec (start here)
- [BUSINESS.md](BUSINESS.md) — living business plan, mapped to Envestors' portal sections
- [decisions/](decisions/) — architecture decision records

## Layout

| Path | What | Stack |
|---|---|---|
| `ios/` | Sender + traveller app | Swift / SwiftUI |
| `functions/` | Custody state machine, codes, notifications | TypeScript, Cloud Functions |
| `shop-web/` | Shop scan page (unique link per shop) | TypeScript, Firebase Hosting |

## Develop & verify

```sh
npm --prefix functions test          # unit tests (pure protocol modules)
npm --prefix functions run build     # typecheck + compile
firebase emulators:exec --project pbuddy-uk \
  "node functions/scripts/smoke.mjs" # full protocol end-to-end in emulator
firebase deploy --project pbuddy-uk # rules + functions + hosting
```

- Firebase project: `pbuddy-uk` (Firestore pinned europe-west2 — ADR 0005)
- Shop page: https://pbuddy-uk.web.app/?shop=SHOP_ID&token=LINK_TOKEN
- Functions: https://europe-west2-pbuddy-uk.cloudfunctions.net/…

## Working agreements

- Custody logic lives in `functions/src/custody.ts` as a pure, tested module
  (ADR 0003). Clients never write custody state.
- Every meaningful choice gets an ADR; every sprint updates BUSINESS.md.
- Commits authored by whoever did the work — the history is evidence.
