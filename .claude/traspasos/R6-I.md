# R6-I: iOS findings of round 5

Branch `fix/r6-ios`, from `Dev` at 575bac87. Only `ios/` and this file changed.

## Done

- I1: `signOut`/`discard` now go through `cancelRefreshInFlight()`, which cancels the task AND empties the slot. Test: `testACallerArrivingRightAfterDiscardDoesNotInheritTheCancelledRefresh` (a private `DeafTransport` that ignores cancellation until released keeps the window open; without the fix the second caller inherits the cancelled task and gets `.cancelled`, with it it gets `.signedOut` with a single `/auth/refresh` on the wire).
- I2: `signIn` clears `unsavedRefreshToken` after the Keychain write. Test: `testSignInDropsTheUnsavedTokenOfThePreviousFamily` (unsaved rotation, sign-in, next refresh uses the token the sign-in wrote). `closing` is left alone: `closeLocally()` already resets it at the end of every sign-out path.
- I3: nothing to do. The root `.gitignore` already has `ios/.derived/` (R5-D); `npm run lint` ran green with derived data inside the clone.
- R4-I pending: the three queue benches are now one. `CaptureQueueProblemTests` and `CaptureQueueHardeningTests` inherit `CaptureQueueTestCase` and lost their own `setUp`/`tearDown`/`queue()`/`body`. One deliberate difference: the hardening tests now run on the bench's controlled clock instead of `Date.init`; no test there reads wall time through the queue (budgets use `ContinuousClock`).

Both new tests were run once with the fix reverted: both fail; with it, both pass.

## Verification

`ios/scripts/lint.sh` green. `xcodebuild test` (iPhone 18 Pro, `-derivedDataPath ios/.derived`, `frontend/dist` built): 259 tests (257 + 2), 0 failures, 0 skipped. Monorepo: `prettier --check` and `npm run lint` green. No API, web or e2e run: nothing outside `ios/` changed; CI's `ios` job repeats the suite. Pushed with `LEFTHOOK=0` after running the full suite by hand.

## Pending

Nothing from the round-5 iOS block.

## Deleted

Nothing in the repo. The clone `cocoApp-work/r6-i` (with `ios/.derived`) is removed at the end of the step.
