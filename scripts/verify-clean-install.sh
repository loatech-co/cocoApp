#!/usr/bin/env bash
# Reproduces what Hostinger's hbuilds does on every deploy, from a fresh clone
# of the current commit: `npm install` with NODE_ENV=production (so no
# devDependencies — vitest, jest and eslint are NOT there) and then the build.
#
# Why: three deploys failed on things a normal local check never saw, because
# the local checkout always has every devDependency installed and a warm
# node_modules. This catches the same class of failure before pushing:
#   - install that only passes with --legacy-peer-deps (two esbuild versions)
#   - a production build that imports something only tests install (vitest)
#
# Usage: bash scripts/verify-clean-install.sh   (checks the committed HEAD)
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
commit="$(git -C "$repo_root" rev-parse --short HEAD)"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/coco-clean-install.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT

if [ -n "$(git -C "$repo_root" status --porcelain --untracked-files=no)" ]; then
  echo "warning: uncommitted changes are NOT part of this check (it clones HEAD $commit)" >&2
fi

echo "==> clone $commit into $work_dir"
git clone --quiet --no-hardlinks "$repo_root" "$work_dir/repo"
cd "$work_dir/repo"

echo "==> npm install (NODE_ENV=production, no --legacy-peer-deps)"
NODE_ENV=production npm install --no-audit --no-fund --loglevel=error

echo "==> exactly one esbuild in the tree"
versions="$(npm ls esbuild --all --parseable --long 2>/dev/null | grep -oE 'esbuild@[0-9.]+' | sort -u)"
echo "$versions"
if [ "$(echo "$versions" | wc -l | tr -d ' ')" != "1" ]; then
  echo "FAIL: more than one esbuild version — the server install breaks on this" >&2
  exit 1
fi

echo "==> build (NODE_ENV=production)"
NODE_ENV=production npm run build --loglevel=error >/dev/null

echo "==> the Prisma client ships inside the api build (ADR 0020)"
for f in api/dist/main.js api/dist/generated/prisma/client.js; do
  [ -f "$f" ] || { echo "FAIL: $f is missing from the production build" >&2; exit 1; }
done

echo "OK: clean install and production build pass for $commit"
