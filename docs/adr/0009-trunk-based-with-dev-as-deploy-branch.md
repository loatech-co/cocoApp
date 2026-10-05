# 0009 — Trunk-based integration; `Dev` stays the deploy branch for now

- Status: accepted
- Date: 2026-10-05 (D20 of the standards, D8 of the autonomous log)
- Deciders: the owner, phase 7

## Context and problem statement

Phase 7 adopted trunk-based development: short branches, one PR each, merged
with CI green. The plan's trunk is `main`. But the host deploys whatever
branch its hPanel GitHub integration points to — today `Dev` — and that
setting is not in any file reachable from the repository or SSH. The private
repository on GitHub's free plan has no enforceable branch protection either.

## Decision outcome

**`Dev` stays the deploy branch until the owner switches hPanel to `main`.
Every change reaches it only through `scripts/merge.sh`.**

- `merge.sh` is the compensating control for the missing branch protection:
  it refuses without a PR, refuses if the pushed branch differs from the
  local one, waits for every check and refuses unless all are green, then
  fast-forwards `Dev` so the SHAs CI tested are the SHAs that deploy.
- Nobody pushes to `Dev` or `main` by hand. No force-push to `Dev`, ever;
  undoing is `git revert` through a PR. Work branches may be rebased and
  re-pushed — nothing deploys from them.
- After the switch, `merge.sh` squash-merges into `main` (`DEPLOY_BRANCH`).

## Consequences

- Good: linear, tested history on the branch that deploys.
- Bad: the protection depends on everyone using the script.
- Owner action pending: point hPanel to `main` and retire `Dev`.
