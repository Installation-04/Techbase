#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

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
else
  echo "Fichier .env déjà présent, conservé tel quel."
fi

# 3. Construire et démarrer les conteneurs (db, backend, scheduler, frontend).
# --wait attend que chaque service soit « healthy » et échoue sinon : on
# n'annonce donc « prêt » que si l'application répond réellement.
echo "Construction et démarrage des conteneurs (db, backend, scheduler, frontend)..."
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
if [ -n "${PORT:-}" ] && [ "$PORT" != "80" ]; then URL="http://localhost:$PORT"; else URL="http://localhost"; fi
echo "Application accessible sur : $URL"
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
