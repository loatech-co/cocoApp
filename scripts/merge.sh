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

echo "▸ Waiting for the checks of PR #$PR…"
if ! gh pr checks "$PR" --watch --fail-fast --interval 20; then
  echo "Refusing: a check failed on PR #$PR." >&2
  exit 1
fi
if [ "$(gh pr checks "$PR" --json state -q 'length')" = "0" ]; then
  echo "Refusing: PR #$PR has no checks at all." >&2
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

echo "✓ PR #$PR integrated into $DEPLOY_BRANCH."
