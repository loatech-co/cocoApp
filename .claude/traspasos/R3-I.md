# R3-I: iOS findings of round 3

Branch `fix/r3-ios`, from `Dev` at 9dd3dbfe. Only `ios/` changed.

## Done

- I1: `NativeSession.refresh` catches `APIError.cancelled` and `CancellationError` and rethrows without publishing; `Task.checkCancellation()` right after the answer, before the rotated token is written. `discard`/`signOut` now end in `signedOut` with no `offline` after it. Test: `testDiscardWhileARefreshIsInFlightLeavesTheSessionSignedOut` (a transport that blocks until cancelled).
- I4: `storedRefreshToken()` distinguishes `nil` from a Keychain that throws; `refreshTokenOrPublish()` goes `offline` and keeps the token on a throw. `restore()` no longer reads the Keychain twice. Test with `errSecInteractionNotAllowed`.
- `JSONSlicer` moved to its own file (`NativeSession.swift` was over 300 lines); `project.pbxproj` regenerated with xcodegen.
- I2: `CaptureDestination` (`AppEnum`, `manual`/`photo`) replaces the free `String` parameter of `OpenCaptureIntent`; `CaptureURL.url(destination:)` takes it. Its display texts fall under the existing whole-file exception of `VisibleTextTests` (intent contract).
- I3: `L10n.Shortcuts.smsSenderNote` → key `shortcuts.sms.senderNote` («De: %@») in the catalog and the baseline; `ActionParametersTests.testSMSWithText` keeps asserting the result.
- I5: `WebBridge.isExternalOpenAllowed` (http, https, mailto) gates both `decidePolicyFor` and `createWebViewWith` through `openOutside`; the pure helpers live in an `extension WebBridge` (the class body was at SwiftLint's 250-line limit). Test `testOnlyWebAndMailLinksLeaveTheApp`.
- I6: `SettingsView` keeps `storedBase` (from `APIConfiguration.current(defaults:)`), updated on save and reset; `hasChanged(validated:stored:)` is pure and tested in the existing `SettingsViewTests` (`DependenciesTests.swift`).

## Verification

`ios/scripts/lint.sh` green. `xcodebuild test` on iPhone 18 Pro, derived data inside the clone: 255 tests, 0 failures, 0 skipped (with `frontend/dist` built, so the smoke test ran). Monorepo: `prettier --check` and `npm run lint` green; no API, web or e2e run because nothing outside `ios/` changed (CI's `ios` job covers it).

## Pending

- `WebBridge.swift` is 393 lines (pre-existing); splitting the delegates out is a refactor for its own step.
- The AppEnum display texts («Destino», «Formulario», «Cámara») are literals in the intent, like its title: the extension catalog has no key for them (ADR 0021 exception).

## Deleted

Nothing in the repo. The clone `cocoApp-work/r3-i` and its `ios/.derived` are removed at the end of the step.
