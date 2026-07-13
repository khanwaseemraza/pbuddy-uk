# ADR 0002: Shop interface is a web page, never an app

**Status:** accepted · 2026-07-12

## Decision
Shops interact through a camera-enabled web page on Firebase Hosting.
Each shop gets a unique authenticated link. QR scan + manual code fallback.

## Context
Shopkeepers will not install an app; their devices are mixed iOS/Android;
onboarding friction is the #1 killer of shop partnerships. Deposit-point
partners are also potential future integrations (lockers) that will be
API-based anyway.

## Consequences
- Works on any device with a browser and camera on day one.
- Scan UX must survive poor lighting, cracked screens, busy counters —
  manual 6-digit entry is a first-class path, not a fallback afterthought.
- Auth is link-based + PIN, not accounts (shopkeepers share devices).
