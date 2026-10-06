#!/usr/bin/env bash
# The iOS gate before a push: swift-format (strict) and the test suite on the
# simulator. Run by the pre-push hook (lefthook.yml) only when the push
# carries changes under ios/, so the macOS minutes CI would spend cost zero.
#
#   bash ios/scripts/pre-push.sh
#
# Without Xcode (someone working only on the web) it warns and lets the push
# through: the manual iOS workflow is still there before a release.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v xcodebuild >/dev/null 2>&1 || ! xcrun --find swift-format >/dev/null 2>&1; then
  echo "aviso: Xcode no está instalado; el push sigue sin probar la app de iOS." >&2
  exit 0
fi

xcrun swift-format lint --strict --recursive --parallel \
  --configuration .swift-format Coco CocoWidgets CocoTests

# The newest iPhone simulator available, as the iOS workflow picks it.
device="$(xcrun simctl list devices available -j | python3 -c '
import json, sys
d = json.load(sys.stdin)["devices"]
print(next((x["name"] for r in sorted(d, reverse=True) if "iOS" in r for x in d[r]
            if x["name"].startswith("iPhone")), ""))')"
if [ -z "$device" ]; then
  echo "aviso: no hay un simulador de iPhone; el push sigue sin las pruebas de iOS." >&2
  exit 0
fi

echo "ios: xcodebuild test en $device" >&2
log="$(mktemp -t coco-ios-test)"
if xcodebuild test -scheme Coco -destination "platform=iOS Simulator,name=$device" \
  CODE_SIGNING_ALLOWED=NO >"$log" 2>&1; then
  grep -E "Executed [0-9]+ tests" "$log" | tail -n 1 >&2
  rm -f "$log"
else
  tail -n 40 "$log" >&2
  echo "ios: las pruebas fallaron (registro completo en $log)" >&2
  exit 1
fi
