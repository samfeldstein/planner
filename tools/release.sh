#!/usr/bin/env bash
# One-step release: test, build into docs/, commit, push. Run from the repo root: npm run release
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes. Commit them first." >&2
  exit 1
fi
git remote get-url origin >/dev/null 2>&1 || { echo "No origin remote." >&2; exit 1; }

npm test
node build.mjs

version=$(sed -n "s/.*VERSION = '\(.*\)'.*/\1/p" docs/js/version.js)
git add -A docs
if git diff --cached --quiet; then
  echo "docs/ is unchanged (version $version)."
else
  git commit -q -m "Release $version"
fi

git push origin HEAD
echo "Released $version."
