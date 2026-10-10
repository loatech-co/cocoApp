# 0030 — iOS tests in CI are not run on every push

- Status: accepted
- Date: 2026-10-09
- Deciders: the owner (the Actions quota), the director of phase 7, steps 7.13 and J-7

## Context and problem statement

The senior checklist asks for the iOS tests in CI. They exist: swift-format,
SwiftLint and the XCTest suite on the simulator, in a GitHub Actions job on
`macos-26`. But on the free plan a macOS minute counts as ten against the
monthly quota, and Actions was already blocked once during phase 7 by its
billing (step 7.2-p waited for it). A full iOS run takes several minutes, so running it on
every push would spend most of the month on code that did not touch iOS.

## Decision

1. **iOS does not run on every push.** Until step J-7 the `ios` workflow was
   manual only (`workflow_dispatch`). With PR #110 it becomes a job of
   `ci.yml` behind the `hygiene` areas: it runs on the pull requests that
   touch `ios/`, the two bridge files, the contract its tests copy, or
   `ci.yml` itself, and never on a push.
2. **The routine Swift checks run locally at zero minutes**: swift-format and
   SwiftLint in the pre-commit hook (`lefthook.yml`), and the suite on the
   simulator in the pre-push hook (`ios/scripts/pre-push.sh`) when the push
   carries changes under `ios/`.
3. **Before every app release the full suite runs**, by hand if no PR has run
   it since the last change.
4. Its timeout stays at 40 minutes until there is a measured duration; then
   it goes down (a hung run at ten times the price is 400 minutes).

## Considered options

- **On every PR.** The quota does not allow it.
- **A self-hosted macOS runner.** Free minutes, but a machine to keep
  patched and online, and repository code running on the owner's laptop.
- **No iOS in CI at all.** Then nothing outside the laptop checks the
  contract tests that read `api/openapi.v2.json`.

## Consequences

- The senior checklist item "iOS tests in CI" is **postponed** with this ADR:
  CI covers iOS where iOS changed, not on every change.
- A change outside `ios/` that breaks the app (the bridge, the contract) is
  caught only if it touches one of the files the area lists; that list lives
  in `hygiene` and grows with what the tests read.
- CONTRIBUTING, "iOS", and the runbook, "CI minutes", carry the details.
