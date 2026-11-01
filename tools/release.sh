#!/usr/bin/env bash
# One-step release: test, build, commit the public repo, then push both repos together.
# Run from private/: npm run release
set -euo pipefail

cd "$(dirname "$0")/.."
PUBLIC=../public

if [ -n "$(git status --porcelain)" ]; then
  echo "private/ has uncommitted changes. Commit them first." >&2
  exit 1
fi
git remote get-url origin >/dev/null 2>&1 || { echo "private/ has no origin remote." >&2; exit 1; }

npm test
node build.mjs

version=$(sed -n "s/.*VERSION = '\(.*\)'.*/\1/p" "$PUBLIC/js/version.js")
git -C "$PUBLIC" add -A
if git -C "$PUBLIC" diff --cached --quiet; then
  echo "public/ is unchanged (version $version)."
else
  git -C "$PUBLIC" commit -q -m "Release $version"
fi

# Source first, so the site never points at code that exists only on this laptop.
git push origin HEAD
git -C "$PUBLIC" push
echo "Released $version."
