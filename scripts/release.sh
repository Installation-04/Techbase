#!/usr/bin/env bash
# Prépare une version : date la section du CHANGELOG, met la version dans les six
# fichiers (3 package.json + 3 lockfiles), crée le commit « chore(release): vX.Y.Z »
# et le tag annoté vX.Y.Z. Ne pousse rien.
#
# Usage : ./scripts/release.sh 0.0.16 ["Titre court de la version"]
#         ./scripts/release.sh 0.1.0-rc.1
#
# Ensuite : git push origin main && git push origin v0.0.16
# Le push du tag lance le workflow « Release » (images Docker, tag, release GitHub).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

V="${1:-}"
TITLE="${2:-}"
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || { echo "usage : $0 X.Y.Z[-prerelease] [\"titre\"]" >&2; exit 1; }
TAG="v$V"

[ -z "$(git status --porcelain)" ] || { echo "Arbre de travail non propre. Commit ou stash d'abord." >&2; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "Lance ceci depuis la branche main." >&2; exit 1; }
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Le tag $TAG existe déjà : une version publiée ne change jamais, publie un correctif." >&2
  exit 1
fi
grep -q '^## \[Non publié\]' CHANGELOG.md || { echo "Section [Non publié] absente de CHANGELOG.md." >&2; exit 1; }

# Le contenu de [Non publié] ne doit pas être vide.
BODY="$(awk '/^## \[Non publié\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md | sed '/^[[:space:]]*$/d')"
[ -n "$BODY" ] || { echo "[Non publié] est vide : rien à publier." >&2; exit 1; }

# Les six fichiers de version doivent être d'accord avant de commencer.
node scripts/bump-version.js >/dev/null || { echo "Les fichiers de version ne sont pas d'accord entre eux (node scripts/bump-version.js)." >&2; exit 1; }

LABEL="$(date +%F)"
[ -z "$TITLE" ] || LABEL="$TITLE"
awk -v v="$V" -v l="$LABEL" '/^## \[Non publié\]/ && !done {print; print ""; print "## [" v "] - " l; done=1; next} {print}' CHANGELOG.md > CHANGELOG.md.tmp
mv CHANGELOG.md.tmp CHANGELOG.md

node scripts/bump-version.js "$V" >/dev/null
node scripts/release-notes.js "$V" >/dev/null || { git checkout -- . ; echo "Les notes de la version $V sont vides." >&2; exit 1; }

git add CHANGELOG.md package.json package-lock.json backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json
git commit -q -m "chore(release): $TAG"
git tag -a "$TAG" -m "TechIBase $TAG"

echo "Version $TAG prête localement. Pour publier :"
echo "  git push origin main && git push origin $TAG"
echo "Le workflow « Release » construit et teste les images, puis crée la release GitHub."
echo "(Une répétition sans rien publier : Actions → Release → Run workflow, publish désactivé.)"
