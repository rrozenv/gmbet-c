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
# Old hashed bundles stay published: the CDN can serve a cached index.html for minutes after a deploy.
rsync -a --delete --exclude .git --exclude assets/ dist/ "$WT"/
mkdir -p "$WT/assets"
rsync -a dist/assets/ "$WT/assets/"
for rev in $(git rev-list -n 6 origin/gh-pages 2>/dev/null); do
  git -C "$WT" checkout "$rev" -- assets 2>/dev/null || true
done
rsync -a dist/assets/ "$WT/assets/"
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
