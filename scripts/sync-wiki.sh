#!/usr/bin/env bash
# Publishes docs/ to the GitHub Wiki checked out in <wiki-dir>: regenerates every
# page from docs/ (pages that no longer exist in docs/ disappear), commits and
# pushes only if something changed. Used by .github/workflows/wiki.yml.
#
#   scripts/sync-wiki.sh <wiki-dir> [owner/repo] [ref]
set -euo pipefail

wiki="${1:?usage: sync-wiki.sh <wiki-dir> [owner/repo] [ref]}"
repo="${2:-Installation-04/Techbase}"
ref="${3:-main}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[ -d "$wiki/.git" ] || { echo "Erreur : $wiki n'est pas un dépôt git (le wiki est-il activé et initialisé ?)" >&2; exit 1; }

# Everything generated is a .md file at the root of the wiki: start from a clean slate.
find "$wiki" -maxdepth 1 -type f -name '*.md' -delete
node "$root/scripts/build-wiki.js" "$root/docs" "$wiki" "$repo" "$ref"

cd "$wiki"
git add -A
if git diff --cached --quiet; then
  echo "Le wiki est déjà à jour."
  exit 0
fi

source_commit="$(git -C "$root" rev-parse --short HEAD 2>/dev/null || echo unknown)"
git -c user.name="${GIT_USER_NAME:-github-actions[bot]}" \
    -c user.email="${GIT_USER_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}" \
    commit -q -m "Synchronise le wiki avec docs/ (${repo}@${source_commit})"
git push -q
echo "Wiki mis à jour."
