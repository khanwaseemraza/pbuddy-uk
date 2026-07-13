# ADR 0001: iOS-first for consumer apps

**Status:** accepted · 2026-07-12

## Decision
Sender and traveller apps ship on iOS (Swift/SwiftUI) first. Android and
consumer web follow after pilot validation.

## Context
Two-founder team, limited build capacity. Pilot is invite-only on one
corridor, so we control who joins and can recruit iPhone users.

## Consequences
- ~Half the UK market (Android) excluded until later — acceptable for an
  invite-only pilot, must be on the roadmap in the business plan.
- One codebase to polish for the endorsement demo.
- Shop side is NOT iOS (see ADR 0002) so shopkeeper device ownership is
  irrelevant.
