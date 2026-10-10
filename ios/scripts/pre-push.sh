#!/usr/bin/env bash
# The iOS gate before a push: swift-format (strict) and the test suite on the
# simulator. Run by the pre-push hook (lefthook.yml) on every push; it decides
# here whether the push concerns iOS, with the same triggers as the `ios` job
# of ci.yml, so the macOS minutes CI would spend cost zero.
#
#   bash ios/scripts/pre-push.sh
#
# Without Xcode (someone working only on the web) it warns and lets the push
# through: the `ios` job of ci.yml is still the gate.
set -euo pipefail

cd "$(dirname "$0")/.."

# ── Does this push concern iOS? ─────────────────────────────────────────────
# Compared with origin/Dev and not with what lefthook calls the push's files:
# a branch pushed for the first time has no remote counterpart, and lefthook
# then diffed against the default branch, far behind Dev, so a docs-only push
# ran the whole iOS suite (step J-7). Keep this pattern equal to `ios_files` in
# .github/workflows/ci.yml. Without origin/Dev it runs, to be safe.
IOS_TRIGGERS='^(ios/|frontend/src/shared/lib/(native-contract|bridge)\.ts$|api/openapi\.v2\.json$|\.github/workflows/ci\.yml$)'
if git rev-parse --verify -q origin/Dev >/dev/null; then
  changed="$(git diff --name-only origin/Dev...HEAD)"
  if [ "$(grep -cE "$IOS_TRIGGERS" <<<"$changed" || true)" -eq 0 ]; then
    echo "ios: nada de iOS frente a origin/Dev; sin pruebas." >&2
    exit 0
  fi
fi

if ! command -v xcodebuild >/dev/null 2>&1 || ! xcrun --find swift-format >/dev/null 2>&1; then
  echo "aviso: Xcode no está instalado; el push sigue sin probar la app de iOS." >&2
  exit 0
fi

xcrun swift-format lint --strict --recursive --parallel \
  --configuration .swift-format Coco CocoWidgets CocoTests

# The newest iPhone simulator available, as the ios job picks it.
read -r device udid < <(xcrun simctl list devices available -j | python3 -c '
import json, sys
d = json.load(sys.stdin)["devices"]
print(next((x["name"].replace(" ", "_") + " " + x["udid"] for r in sorted(d, reverse=True)
            if "iOS" in r for x in d[r] if x["name"].startswith("iPhone")), ""))') || true
if [ -z "${udid:-}" ]; then
  echo "aviso: no hay un simulador de iPhone; el push sigue sin las pruebas de iOS." >&2
  exit 0
fi
device="${device//_/ }"

# ── The simulator ───────────────────────────────────────────────────────────
# The test host can die before it connects ("operation never finished
# bootstrapping") when the simulator is still booting or is wedged — several
# sessions share it. xcodebuild then spent 600 s collecting a sysdiagnose
# before failing. So: boot it first and wait, never collect diagnostics, cap
# each attempt, and retry ONCE on a fresh boot. A real test failure is not
# retried.
ATTEMPT_LIMIT="${IOS_TEST_LIMIT:-300}" # seconds; a warm run takes about one minute

boot() {
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" >/dev/null 2>&1 || true
}

run_tests() { # $1: log file. Exit 124 when the cap is hit.
  xcodebuild test -scheme Coco -destination "platform=iOS Simulator,id=$udid" \
    -collect-test-diagnostics never CODE_SIGNING_ALLOWED=NO >"$1" 2>&1 &
  local pid=$! waited=0
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$waited" -ge "$ATTEMPT_LIMIT" ]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 124
    fi
    sleep 2
    waited=$((waited + 2))
  done
  wait "$pid"
}

echo "ios: xcodebuild test en $device" >&2
log="$(mktemp -t coco-ios-test)"
boot
for attempt in 1 2; do
  status=0
  run_tests "$log" || status=$?
  if [ "$status" -eq 0 ]; then
    grep -E "Executed [0-9]+ tests" "$log" | tail -n 1 >&2
    rm -f "$log"
    exit 0
  fi
  if [ "$attempt" -eq 1 ] \
    && { [ "$status" -eq 124 ] || grep -qE "never finished bootstrapping|before establishing connection" "$log"; }; then
    echo "ios: el simulador no arrancó la app; se reinicia y se reintenta una vez." >&2
    xcrun simctl shutdown "$udid" 2>/dev/null || true
    boot
    continue
  fi
  break
done

tail -n 40 "$log" >&2
[ "$status" -eq 124 ] && echo "ios: se cortó tras ${ATTEMPT_LIMIT}s (IOS_TEST_LIMIT)." >&2
echo "ios: las pruebas fallaron (registro completo en $log)" >&2
exit 1
