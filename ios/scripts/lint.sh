#!/usr/bin/env bash
# Lints the iOS app: swift-format (format) and SwiftLint (rules), both strict.
# Used by the pre-commit hook (lefthook.yml) and by the iOS CI workflow.
#
#   bash ios/scripts/lint.sh                 # CI: a missing tool is an error
#   bash ios/scripts/lint.sh --if-installed  # hook: a missing tool is a warning
#
# The hook must not block a commit on a machine without Xcode (someone working
# only on the web); the iOS workflow is the gate.
set -euo pipefail

cd "$(dirname "$0")/.."

SWIFTLINT_VERSION="$(sed -n 's/^swiftlint_version: *//p' .swiftlint.yml)"
soft=false
[ "${1:-}" = "--if-installed" ] && soft=true

skip() {
  if $soft; then
    echo "ios lint: $1 — skipped (the iOS workflow runs it)." >&2
    return 0
  fi
  echo "ios lint: $1" >&2
  exit 1
}

if xcrun --find swift-format >/dev/null 2>&1; then
  xcrun swift-format lint --strict --recursive --parallel \
    --configuration .swift-format Coco CocoAccesos CocoTests
else
  skip "swift-format not found (it ships with Xcode 16 or later)"
fi

if ! command -v swiftlint >/dev/null 2>&1; then
  skip "swiftlint not found (brew install swiftlint, version $SWIFTLINT_VERSION)"
elif [ "$(swiftlint version)" != "$SWIFTLINT_VERSION" ]; then
  skip "swiftlint $(swiftlint version) installed, the project pins $SWIFTLINT_VERSION"
else
  swiftlint lint --quiet
fi
