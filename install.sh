#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

echo "=== Installation de TechBase ==="

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

# 3. Construire et démarrer les conteneurs
echo "Construction et démarrage des conteneurs (db, backend, frontend)..."
docker compose up --build -d

# 4. Attendre que le backend soit prêt
echo "Attente du démarrage du backend..."
for i in $(seq 1 30); do
  if docker compose exec -T backend node -e "process.exit(0)" &> /dev/null; then
    break
  fi
  sleep 1
done

echo ""
echo "=== TechBase est prêt ! ==="
echo "Application accessible sur : http://localhost"
echo ""
echo "Compte administrateur par défaut :"
echo "  Email        : admin@techbase.local"
echo "  Mot de passe : Admin1234!"
echo ""
echo "Pensez à changer ce mot de passe après votre première connexion."
echo ""
echo "Commandes utiles :"
echo "  docker compose logs -f      # voir les logs en direct"
echo "  docker compose down         # arrêter l'application"
echo "  docker compose up -d        # redémarrer l'application"
