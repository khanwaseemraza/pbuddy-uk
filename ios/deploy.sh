#!/bin/zsh
# Build the pbuddy iOS app and push it to the connected iPhone.
# This is THE build command — every build goes to the device (owner request).
set -e
cd "$(dirname "$0")"

DEVICE="${PBUDDY_DEVICE:-BACDF9EE-5E90-5F83-BA3D-EB1DD3B59C7B}" # Waseem's iPhone 15 Pro Max
APP="build/Build/Products/Debug-iphoneos/pbuddy.app"

xcodegen generate

xcodebuild -project pbuddy.xcodeproj -scheme pbuddy \
  -destination 'generic/platform=iOS' \
  -derivedDataPath build \
  -allowProvisioningUpdates \
  build | grep -E "error:|warning: .*deprecated|BUILD" | tail -10

xcrun devicectl device install app --device "$DEVICE" "$APP"
if xcrun devicectl device process launch --device "$DEVICE" --terminate-existing com.pbuddy.app 2>/dev/null; then
  echo "✓ installed and launched on iPhone"
else
  echo "✓ installed on iPhone (couldn't auto-launch — phone locked; open pbuddy manually)"
fi
