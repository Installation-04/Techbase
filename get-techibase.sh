#!/usr/bin/env bash
# Installe (ou met à jour) TechIBase à partir d'une release GitHub : télécharge
# le paquet Docker de la release, le déploie dans un dossier, puis lance
# install.sh (qui crée le .env avec des secrets aléatoires et démarre les
# conteneurs avec les images publiées).
#
#   curl -fsSL https://raw.githubusercontent.com/Installation-04/Techbase/main/get-techibase.sh | bash
#
# Options (après « bash -s -- ») ou variables d'environnement :
#   --version X.Y.Z   TECHIBASE_VERSION   version à installer (défaut : la plus récente)
#   --dir DOSSIER     TECHIBASE_DIR       dossier d'installation (défaut : ./techibase)
#
#   curl -fsSL .../get-techibase.sh | bash -s -- --version 0.0.9 --dir /opt/techibase
#
# Relancer la commande sur un dossier déjà installé le met à jour : le .env
# (secrets, réglages) et les volumes de données sont conservés, seuls les
# fichiers Compose et la version des images changent.
#
# Tout le script est dans main(), appelée à la toute fin : si le téléchargement
# est interrompu, rien n'est exécuté.
set -euo pipefail

REPO="${TECHIBASE_REPO:-Installation-04/Techbase}"
API_URL="${TECHIBASE_API_URL:-https://api.github.com/repos/${REPO}}"
DOWNLOAD_URL="${TECHIBASE_DOWNLOAD_URL:-https://github.com/${REPO}/releases/download}"

# Fichiers du paquet que ce script (re)déploie. Le .env n'en fait jamais partie.
MANAGED_FILES=(
  docker-compose.yml docker-compose.release.yml docker-compose.https.yml Caddyfile
  install.sh .env.example backend/db/init.sql scripts/docker-smoke.sh
)

fail() {
  echo "Erreur : $*" >&2
  exit 1
}

usage() {
  cat <<'TEXT'
Installe ou met à jour TechIBase à partir d'une release GitHub.

  curl -fsSL https://raw.githubusercontent.com/Installation-04/Techbase/main/get-techibase.sh | bash

Options (après « bash -s -- ») ou variables d'environnement :
  --version X.Y.Z   TECHIBASE_VERSION   version à installer (défaut : la plus récente)
  --dir DOSSIER     TECHIBASE_DIR       dossier d'installation (défaut : ./techibase)
TEXT
}

# set_env FICHIER CLE VALEUR : remplace (ou ajoute) CLE=VALEUR sans toucher aux autres lignes.
set_env() {
  local file="$1" key="$2" value="$3"
  { grep -v "^${key}=" "$file" || true; echo "${key}=${value}"; } > "${file}.tmp"
  mv "${file}.tmp" "$file"
}

latest_version() {
  # /releases (et non /releases/latest) : « latest » ignore les pré-releases, et
  # tant que le projet est en 0.x, toutes les releases sont des pré-releases.
  local json tag
  json="$(curl -fsSL "${API_URL}/releases?per_page=1")" \
    || fail "impossible de lire la liste des releases (${API_URL}). Réessayez, ou indiquez la version : --version X.Y.Z"
  tag="$(printf '%s' "$json" | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -n 1)"
  [ -n "$tag" ] || fail "aucune release trouvée sur ${REPO}. Indiquez la version : --version X.Y.Z"
  printf '%s' "$tag"
}

main() {
  local version="${TECHIBASE_VERSION:-}" dir="${TECHIBASE_DIR:-techibase}"

  while [ $# -gt 0 ]; do
    case "$1" in
      --version) [ $# -ge 2 ] || fail "--version demande une valeur"; version="$2"; shift 2 ;;
      --dir) [ $# -ge 2 ] || fail "--dir demande une valeur"; dir="$2"; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) fail "option inconnue : $1 (voir --help)" ;;
    esac
  done

  echo "=== TechIBase : installation depuis GitHub ==="

  # 1. Prérequis
  local tool
  for tool in curl tar; do
    command -v "$tool" > /dev/null 2>&1 || fail "« $tool » est requis mais introuvable."
  done
  command -v docker > /dev/null 2>&1 || fail "Docker n'est pas installé. Voir https://docs.docker.com/get-docker/"
  docker compose version > /dev/null 2>&1 || fail "Docker Compose n'est pas disponible. Mettez Docker à jour ou installez le plugin docker-compose."
  docker info > /dev/null 2>&1 || fail "Docker ne répond pas. Est-il démarré ? Votre utilisateur a-t-il le droit de l'utiliser (sinon relancez avec sudo) ?"

  # 2. Version
  if [ -z "$version" ]; then
    version="$(latest_version)"
    echo "Version la plus récente : ${version}"
  fi
  version="${version#v}"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] \
    || fail "« ${version} » n'est pas un numéro de version valide (attendu : 0.0.9, par exemple)."

  # 3. Téléchargement du paquet de la release
  local tmp bundle_url
  tmp="$(mktemp -d)"
  # Double quotes on purpose: $tmp is local to main(), which has returned by the
  # time the EXIT trap runs, so it must be expanded now.
  trap "rm -rf '${tmp}'" EXIT
  bundle_url="${DOWNLOAD_URL}/v${version}/techibase-v${version}-docker.tar.gz"
  echo "Téléchargement de ${bundle_url}"
  curl -fsSL -o "${tmp}/bundle.tar.gz" "$bundle_url" \
    || fail "téléchargement impossible. La version ${version} existe-t-elle ? Voir https://github.com/${REPO}/releases"
  mkdir "${tmp}/bundle"
  tar xzf "${tmp}/bundle.tar.gz" -C "${tmp}/bundle" --strip-components=1 \
    || fail "le paquet téléchargé est illisible."
  local file
  for file in "${MANAGED_FILES[@]}"; do
    [ -f "${tmp}/bundle/${file}" ] || fail "le paquet est incomplet (${file} manque)."
  done

  # 4. Déploiement dans le dossier d'installation
  local upgrade=false
  [ -f "${dir}/.env" ] && upgrade=true
  mkdir -p "${dir}/backend/db" "${dir}/scripts"
  for file in "${MANAGED_FILES[@]}"; do
    cp "${tmp}/bundle/${file}" "${dir}/${file}"
  done
  chmod +x "${dir}/install.sh" "${dir}/scripts/docker-smoke.sh"

  if [ "$upgrade" = true ]; then
    echo "Installation existante détectée dans ${dir} : mise à jour vers ${version} (le .env est conservé)."
    set_env "${dir}/.env" TECHIBASE_VERSION "$version"
    grep -q '^COMPOSE_FILE=' "${dir}/.env" || set_env "${dir}/.env" COMPOSE_FILE "docker-compose.yml:docker-compose.release.yml"
  else
    echo "Nouvelle installation dans ${dir}."
  fi

  # 5. Démarrage : install.sh crée le .env (nouvelle installation) et lance les conteneurs
  cd "$dir"
  if ! ./install.sh; then
    echo "" >&2
    echo "L'installation a échoué. Si Docker indique « denied » ou « unauthorized » en téléchargeant" >&2
    echo "les images, elles ne sont peut-être pas encore publiques : « docker login ghcr.io » avec un" >&2
    echo "jeton GitHub (droit read:packages), puis relancez cette commande." >&2
    exit 1
  fi

  echo ""
  echo "Dossier d'installation : $(pwd)"
  echo "Version installée : ${version}"
  echo "Pour mettre à jour plus tard, relancez la même commande (avec --dir si besoin)."
}

main "$@"
