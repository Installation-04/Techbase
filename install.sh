#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# Nouvelle installation : un seul conteneur (application, API, planificateur et base
# de données) par défaut ; --multi garde les quatre conteneurs séparés.
MODE=single
for arg in "$@"; do
  case "$arg" in
    --multi) MODE=multi ;;
    --single) MODE=single ;;
    -h|--help)
      echo "Usage : ./install.sh [--single | --multi]"
      echo "  --single  un seul conteneur (par défaut pour une nouvelle installation)"
      echo "  --multi   quatre conteneurs séparés : db, backend, scheduler, frontend"
      echo "Une installation existante (fichier .env présent) garde son mode."
      exit 0 ;;
    *) echo "Option inconnue : $arg (voir --help)" >&2; exit 2 ;;
  esac
done

echo "=== Installation de TechIBase ==="

# 1. Vérifier que Docker et Docker Compose sont disponibles
if ! command -v docker &> /dev/null; then
  echo "Erreur : Docker n'est pas installé. Voir https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo "Erreur : Docker Compose n'est pas disponible. Mettez à jour Docker Desktop ou installez le plugin docker-compose."
  exit 1
fi

# 2. Créer le fichier .env si absent
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Fichier .env créé à partir de .env.example."

  # Générer un JWT_SECRET aléatoire et un mot de passe DB aléatoire
  if command -v openssl &> /dev/null; then
    JWT_SECRET=$(openssl rand -hex 32)
    DB_PASSWORD=$(openssl rand -hex 16)
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
      sed -i '' "s/^DB_PASSWORD=.*/DB_PASSWORD=${DB_PASSWORD}/" .env
    else
      sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
      sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=${DB_PASSWORD}/" .env
    fi
    echo "JWT_SECRET et DB_PASSWORD générés aléatoirement."
  else
    echo "Avertissement : openssl introuvable, les valeurs par défaut de .env.example sont conservées. Pensez à les modifier avant un déploiement en production."
  fi

  # Choix du mode (seulement ici : un .env existant n'est jamais modifié).
  if [ "$MODE" = single ]; then
    if grep -qE '^COMPOSE_FILE=.*docker-compose\.release\.yml' .env; then
      COMPOSE_VALUE="docker-compose.single.yml:docker-compose.single.release.yml"
    else
      COMPOSE_VALUE="docker-compose.single.yml"
    fi
    if grep -qE '^COMPOSE_FILE=' .env; then
      sed -i.bak "s#^COMPOSE_FILE=.*#COMPOSE_FILE=${COMPOSE_VALUE}#" .env && rm -f .env.bak
    else
      printf '\nCOMPOSE_FILE=%s\n' "$COMPOSE_VALUE" >> .env
    fi
    echo "Mode : un seul conteneur (COMPOSE_FILE=${COMPOSE_VALUE})."
  fi
else
  echo "Fichier .env déjà présent, conservé tel quel."
fi

# Le mode effectif est celui que décrit le .env (un .env existant d'avant les
# images tout-en-un reste en quatre conteneurs).
if grep -qE '^COMPOSE_FILE=.*docker-compose\.single\.yml' .env; then
  MODE=single
else
  MODE=multi
fi

# 3. Construire (ou télécharger, avec le paquet de release) et démarrer les conteneurs (db, backend, scheduler, frontend).
# --wait attend que chaque service soit « healthy » et échoue sinon : on
# n'annonce donc « prêt » que si l'application répond réellement.
if [ "$MODE" = single ]; then
  echo "Démarrage de TechIBase (un seul conteneur) ; l'image est construite ou téléchargée au besoin..."
else
  echo "Démarrage des conteneurs (db, backend, scheduler, frontend) ; les images sont construites ou téléchargées au besoin..."
fi
if ! docker compose up --build -d --wait --wait-timeout 240; then
  echo ""
  echo "Erreur : un service n'a pas démarré correctement. État et derniers journaux :" >&2
  docker compose ps >&2 || true
  docker compose logs --tail 30 >&2 || true
  exit 1
fi

echo ""
echo "=== TechIBase est prêt ! ==="
PORT="$(grep -E '^HTTP_PORT=' .env 2>/dev/null | cut -d= -f2 || true)"
PORT="${PORT:-26591}"
if [ "$PORT" = "80" ]; then URL="http://localhost"; else URL="http://localhost:$PORT"; fi
echo "Application accessible sur : $URL"
echo "(port $PORT ; pour le changer, modifiez HTTP_PORT dans .env puis lancez « docker compose up -d »)"
echo ""
echo "Premier accès : aucun compte n'est préconfiguré. Ouvrez l'application et"
echo "créez un compte via « Créer un compte » — le tout premier compte créé"
echo "devient automatiquement administrateur."
echo ""
echo "Commandes utiles :"
echo "  docker compose logs -f      # voir les logs en direct"
echo "  docker compose down         # arrêter l'application"
echo "  docker compose up -d        # redémarrer l'application"
echo "  scripts/docker-smoke.sh     # vérifier que tout fonctionne de bout en bout"
echo ""
echo "Pour exposer l'application sur Internet en HTTPS : voir « HTTPS » dans le README."
