#!/usr/bin/env bash
# Copies the web half of the bridge into the test bundle, under `Web/`.
#
# The simulator cannot read the repo from wherever it is checked out, so
# what the bridge tests read from the web goes inside the bundle, like the
# app's own sources for VisibleTextTests:
#   - `native-contract.ts` and `bridge.ts`, read by ContractsTests;
#   - `api/openapi.v2.json`, also read by ContractsTests (the native header
#     and the receipts field);
#   - `frontend/dist`, if it is built, loaded by WebBridgeSmokeTests in a real
#     WKWebView. Without it that test is skipped: build the web first
#     (`npm run build --workspace frontend`).
#
# Run by Xcode as a build phase of CocoTests (project.yml).
set -euo pipefail

web="$SRCROOT/../frontend"
dest="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/Web"

rm -rf "$dest"
mkdir -p "$dest"
cp "$web/src/shared/lib/native-contract.ts" "$web/src/shared/lib/bridge.ts" "$dest/"
cp "$SRCROOT/../api/openapi.v2.json" "$dest/"
if [ -f "$web/dist/index.html" ]; then
  # Without the OCR engine: the smoke test never reads a receipt.
  rsync -a --exclude tesseract "$web/dist/" "$dest/dist/"
fi
