# 0028 — release-please stays off until the owner gives it a token; no CHANGELOG until then

- Status: accepted (postponed item of the senior checklist)
- Date: 2026-10-09
- Deciders: the owner, the director of phase 7, step J-6b

## Context and problem statement

Decision D21 of phase 7 picked release-please: versions come from the
Conventional Commits and the release is merging its PR, which also writes
`CHANGELOG.md` (CONTRIBUTING, "Versioning"). The workflow exists since step
7.6 (`.github/workflows/release-please.yml`), but it needs a fine-grained
token, `RELEASE_PLEASE_TOKEN`: a PR opened with `GITHUB_TOKEN` does not
trigger workflows, so `ci.yml` would never run on the release PR and
`scripts/merge.sh` would refuse to integrate it.

Creating that token is a GitHub account action. An agent cannot do it and
should not hold the credential. So at the close of phase 7 there is no
release, no tag and no `CHANGELOG.md`, and the senior checklist asks for both.

## Decision

1. **release-please stays in the repo, switched off.** While the secret is
   missing the job does nothing. Since step J-7 (PR #110) it is gated by the
   repository variable `RELEASE_PLEASE_ENABLED`, so it bills no minutes
   either; before that it ran for a minute and skipped with a warning.
2. **No hand-written `CHANGELOG.md`.** A changelog written by hand next to a
   tool that will write it is two sources that drift. Until the first
   release, the history is the commit log (`git log --oneline`, Conventional
   Commits), the phase reports and `docs/registro-autonomo.md`.
3. **Turning it on is an owner action** (runbook, "Owner actions"): create the
   token (this repo only, Contents and Pull requests read and write, with an
   expiry), store it as `RELEASE_PLEASE_TOKEN`, set `RELEASE_PLEASE_ENABLED`
   to `true`. The first release PR then writes the changelog from the last
   tag, or from the start if there is none.
4. When the deploy branch moves to `main` (ADR 0009), `branches` and
   `target-branch` in the workflow move with it.

## Considered options

- **Run it with `GITHUB_TOKEN`.** The release PR would never get CI, so
  `merge.sh` could not integrate it, and bypassing `merge.sh` breaks the one
  rule that is never broken.
- **Changesets or semantic-release.** Same token problem, and D21 already
  weighed them.
- **Delete the workflow until the token exists.** Throws away a reviewed,
  pinned configuration to save nothing: switched off it costs zero.

## Consequences

- The senior checklist item stays **postponed**, with this ADR as its
  evidence, and so does the CHANGELOG in the documentation item.
- Nothing in the code depends on a version number; `/health` reports the
  deployed commit, which is what an incident needs.
- The day the token expires, release-please fails loudly on the next push;
  the token's expiry belongs in the owner's calendar, like the iOS signing.
