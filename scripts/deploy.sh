#!/usr/bin/env bash
# Builds the site and publishes dist/ to the gh-pages branch of rrozenv/gmbet-c.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
WT=$(mktemp -d)
if git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  git fetch origin gh-pages
  git worktree add "$WT" origin/gh-pages --detach
else
  git worktree add --detach "$WT"
  (cd "$WT" && git checkout --orphan gh-pages && git rm -rf . >/dev/null)
fi
rsync -a --delete --exclude .git dist/ "$WT"/
touch "$WT/.nojekyll"
(
  cd "$WT"
  git add -A
  if git diff --cached --quiet; then
    echo "Nothing changed"
  else
    git commit -m "Deploy $(git -C "$OLDPWD" rev-parse --short HEAD)"
    git push origin HEAD:gh-pages
  fi
)
git worktree remove --force "$WT"
