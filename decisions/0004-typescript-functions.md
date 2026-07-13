# ADR 0004: TypeScript for Cloud Functions and shop web

**Status:** accepted · 2026-07-12

## Decision
Backend (Cloud Functions) and shop scan page are TypeScript. iOS is
Swift/SwiftUI. No Python anywhere in the stack.

## Context
TypeScript is Firebase's first-class runtime: best SDK/emulator support,
docs, and ecosystem for callable functions and Firestore triggers. One
language covers backend + shop web. Stack chosen for product fit, not to
match existing team CVs — founders upskill to the stack, not vice versa.

## Consequences
- Single toolchain (Node 20, firebase-tools, Vitest) outside Xcode.
- Shared types between functions and shop page (custody events, codes).
