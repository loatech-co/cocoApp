#!/usr/bin/env bash
#
# The only way a branch reaches the deploy branch (phase 7.6).
#
# On GitHub's free plan a PRIVATE repository gets no enforced branch
# protection or rulesets, so "nothing merges with red CI" cannot be a server
# setting. This script is the compensating control: it waits for the PR's
# checks, refuses if any failed or none ran, and only then integrates.
#
#   - Deploy branch `Dev` (today): fast-forward only, so the history stays
#     linear and the SHAs that CI tested are the SHAs that deploy.
#   - Deploy branch `main` (after the trunk-based switch): squash merge.
#
# Usage: scripts/merge.sh [branch]   (default: the current branch)
set -euo pipefail

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-Dev}"

if [ "$BRANCH" = "$DEPLOY_BRANCH" ] || [ "$BRANCH" = "main" ]; then
  echo "Refusing: '$BRANCH' is not a work branch." >&2
  exit 1
fi

PR=$(gh pr view "$BRANCH" --json number -q .number 2>/dev/null || true)
if [ -z "$PR" ]; then
  echo "Refusing: no pull request for '$BRANCH'. Open one first (gh pr create --base $DEPLOY_BRANCH)." >&2
  exit 1
fi

# The PR head must be exactly what is about to be integrated.
git fetch -q origin "$BRANCH" "$DEPLOY_BRANCH"
if [ "$(git rev-parse "origin/$BRANCH")" != "$(git rev-parse "$BRANCH")" ]; then
  echo "Refusing: local '$BRANCH' differs from the pushed one; push it and let CI run." >&2
  exit 1
fi

echo "▸ Waiting for the checks of PR #${PR}…"
# The exit code of `gh pr checks --watch` is NOT trusted: on PR #14 it returned
# 0 while two jobs had been CANCELLED (they never got a runner during a GitHub
# Actions incident) and the branch was integrated with them unrun. The verdict
# comes from the explicit state of every check below.
gh pr checks "$PR" --watch --fail-fast --interval 20 || true

# One verdict per check: the listing keeps every attempt (a cancelled run and its
# re-run both appear). A pending attempt is the newest; otherwise the last to finish.
CHECKS=$(gh pr checks "$PR" --json name,bucket,workflow,completedAt -q '
  group_by(.workflow + "/" + .name)
  | map(if any(.bucket == "pending") then (map(select(.bucket == "pending")) | first)
        else max_by(.completedAt) end)
  | .[] | "\(.bucket)\t\(.workflow)/\(.name)"')
if [ -z "$CHECKS" ]; then
  echo "Refusing: PR #${PR} has no checks at all." >&2
  exit 1
fi
# Only `pass` and `skipping` are green. fail, cancel and pending all refuse.
NOT_GREEN=$(printf '%s\n' "$CHECKS" | grep -vE '^(pass|skipping)\t' || true)
if [ -n "$NOT_GREEN" ]; then
  echo "Refusing: these checks of PR #${PR} are not green:" >&2
  printf '%s\n' "$NOT_GREEN" | sed 's/^/  /' >&2
  echo "Re-run them (gh run rerun <id> --failed) and run this again." >&2
  exit 1
fi

if [ "$DEPLOY_BRANCH" = "main" ]; then
  gh pr merge "$PR" --squash --delete-branch
else
  if ! git merge-base --is-ancestor "origin/$DEPLOY_BRANCH" "$BRANCH"; then
    echo "Refusing: not a fast-forward of origin/$DEPLOY_BRANCH. Rebase '$BRANCH' first." >&2
    exit 1
  fi
  git push origin "$BRANCH:$DEPLOY_BRANCH"
  git branch -f "$DEPLOY_BRANCH" "$BRANCH" 2>/dev/null || true
fi

echo "✓ PR #${PR} integrated into $DEPLOY_BRANCH."
