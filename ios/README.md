# pbuddy iOS

Swift/SwiftUI sender flow (v0.1): create a shipment, show the deposit
QR/6-digit code at the shop, track the custody timeline live, see CO₂e
avoided on delivery. Traveller flow (jobs + codes wallet) comes next.

## Structure

- `project.yml` — XcodeGen spec (the `.xcodeproj` is generated; regenerate
  with `xcodegen generate` after adding files)
- `pbuddy/Models.swift` — mirrors the custody states in `functions/src/custody.ts`
- `pbuddy/Services/ShipmentStore.swift` — Firestore listener + callable
  functions (europe-west2); plaintext codes stay on-device (`CodeVault`)
- `pbuddy/Views/` — Home, NewShipment, DepositCode (QR), ShipmentDetail
- `pbuddy/GoogleService-Info.plist` — pbuddy-uk iOS app config

## Build & run

```sh
xcodegen generate
xcodebuild -project pbuddy.xcodeproj -scheme pbuddy \
  -destination 'generic/platform=iOS Simulator' build
open pbuddy.xcodeproj   # or run on a simulator from Xcode
```

## v0.1 shortcuts (tracked)

- Anonymous auth — phone-number auth (the trust layer) needs APNs setup
- Codes in UserDefaults — move to Keychain
- Single hard-coded corridor (`lon-bhm`) — picker arrives with corridor #2
- Client-side sort of shipments — add composite index when lists grow
