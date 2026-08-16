#!/usr/bin/env bash
# Build every destination that matters, plus the package tests, and report.
#
# Written because "BUILD SUCCEEDED" on the simulator was reported as ready
# twice while the DEVICE build failed on signing. A green simulator says
# nothing about whether the app can be signed for a phone.
set -uo pipefail
cd "$(dirname "$0")"
export DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer

# A stale .swiftpm makes Xcode fail to load the package; a stale project makes
# it fail to find it. Both have cost a debugging session already.
rm -rf PattadarKit/.swiftpm PattadarKit/.build
xcodegen generate >/dev/null 2>&1 || { echo "FAIL  xcodegen"; exit 1; }

fail=0
step() {
  printf '  %-26s ' "$1"; shift
  if out=$("$@" 2>&1); then echo "PASS"; else
    echo "FAIL"; fail=1
    echo "$out" | grep -E "error:" | sort -u | sed 's/^/      /' | head -6
  fi
}

# A misspelled SF Symbol is not a compile error — it renders as a blank box at
# runtime, which is only ever found by looking at every screen.
step "sf symbols" ./check-symbols.sh
step "swift tests" env -C PattadarKit swift test
step "iPhone simulator" xcodebuild -project Pattadar.xcodeproj -scheme Pattadar \
  -destination "platform=iOS Simulator,name=iPhone 17e" -derivedDataPath build -quiet build
step "iPad simulator" xcodebuild -project Pattadar.xcodeproj -scheme Pattadar \
  -destination "platform=iOS Simulator,name=iPad Pro 13-inch (M5)" -derivedDataPath build -quiet build
# -allowProvisioningUpdates is NOT optional, and signing into Xcode is not
# enough on its own. Xcode.app creates provisioning profiles for you; from the
# command line xcodebuild refuses to unless this flag says it may, and reports
# it as "No profiles for '…' were found" — which reads like a missing account
# rather than a missing flag. The App Group the widget needs is exactly the
# kind of capability that has to be registered on the fly, so without this the
# device build fails, verify.sh skips the install, and the phone quietly keeps
# running whatever binary it had.
step "physical iPhone" xcodebuild -project Pattadar.xcodeproj -scheme Pattadar \
  -destination "id=1524B702-D5DD-53CA-B0A5-9A55D39C0A33" -derivedDataPath build-device \
  -allowProvisioningUpdates -quiet build

# Installing a stale binary is worse than not installing: it reports success
# while the change under test is not on the device. Builds must pass first.
if [ $fail -ne 0 ]; then
  rm -rf PattadarKit/.swiftpm PattadarKit/.build
  echo "  install                    SKIPPED — build failed, device left untouched"
  echo "SOME DESTINATIONS FAILED"
  exit $fail
fi

# A build is not a delivery. This script reported "physical iPhone PASS" while
# the phone went on running an older binary, and a fix that had only ever been
# COMPILED got described as shipped. Installing is part of passing.
step "install on iPhone" xcrun devicectl device install app \
  --device 1524B702-D5DD-53CA-B0A5-9A55D39C0A33 \
  build-device/Build/Products/Debug-iphoneos/Pattadar.app
step "install on simulator" sh -c '
  xcrun simctl boot "iPhone 17e" 2>/dev/null || true
  xcrun simctl install "iPhone 17e" build/Build/Products/Debug-iphonesimulator/Pattadar.app'

# Xcode chokes on a .swiftpm left behind by `swift test`.
rm -rf PattadarKit/.swiftpm PattadarKit/.build
[ $fail -eq 0 ] && echo "ALL DESTINATIONS PASS" || echo "SOME DESTINATIONS FAILED"
exit $fail
