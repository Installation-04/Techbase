# Installation

TechIBase s'installe avec **Docker** (Docker Engine ou Docker Desktop, avec le plugin Compose). Il n'y a rien d'autre à installer sur le serveur : ni Node.js, ni PostgreSQL.

## 1. La méthode rapide : une commande

```bash
curl -fsSL https://raw.githubusercontent.com/Installation-04/Techbase/main/get-techibase.sh | bash
```

Le script :

1. vérifie que Docker et Docker Compose répondent ;
2. trouve la **version la plus récente** (ou celle que vous demandez) et télécharge le paquet Docker de la release GitHub ;
3. le déploie dans le dossier `./techibase` ;
4. lance `install.sh`, qui crée le fichier `.env` avec un `JWT_SECRET` et un `DB_PASSWORD` **aléatoires**, télécharge les images et démarre les quatre conteneurs.

Quand il affiche « TechIBase est prêt ! », ouvrez l'adresse qu'il affiche, par défaut **http://localhost:26591** (ou `http://<adresse-du-serveur>:26591` depuis un autre poste : ouvrez ce port dans le pare-feu du serveur), et suivez [Premiers pas](premiers-pas.md).

> **Pourquoi le port 26591 ?** C'est un port volontairement peu courant : presque aucun autre logiciel ne l'utilise, donc pas de conflit avec le 80 ou le 8080. Il est fixe, le même pour toutes les installations. Pour en choisir un autre, mettez `HTTP_PORT` dans le `.env` (par exemple `80` pour une adresse sans port) puis `docker compose up -d`.

Pour choisir la version ou le dossier :

```bash
curl -fsSL https://raw.githubusercontent.com/Installation-04/Techbase/main/get-techibase.sh \
  | bash -s -- --version 0.0.9 --dir /opt/techibase
```

> **Relancer la même commande met à jour** une installation existante : le `.env` (secrets, réglages) et les données sont conservés, seuls les fichiers Compose et la version des images changent. Voir [Versions et mises à jour](versions-et-mises-a-jour.md).

Vous préférez lire un script avant de l'exécuter ? Téléchargez-le d'abord : `curl -fsSLO https://raw.githubusercontent.com/Installation-04/Techbase/main/get-techibase.sh`, ouvrez-le, puis lancez `bash get-techibase.sh`.

## 2. Installer à la main depuis une release

Chaque [release GitHub](https://github.com/Installation-04/Techbase/releases) joint un paquet `techibase-vX.Y.Z-docker.tar.gz` : les fichiers Compose, la base initiale, `install.sh` et un `.env.example` déjà réglé sur cette version.

```bash
tar xzf techibase-v0.0.9-docker.tar.gz && cd techibase-v0.0.9-docker
./install.sh
```

## 3. Installer depuis le code source

Utile pour développer ou pour construire les images vous-même.

```bash
git clone https://github.com/Installation-04/Techbase.git && cd Techbase
./install.sh
```

Sans passer par `install.sh` : `cp .env.example .env`, modifier `JWT_SECRET` et `DB_PASSWORD`, puis `docker compose up --build -d --wait`.

## Les conteneurs

| Conteneur | Rôle |
|---|---|
| `db` | PostgreSQL 15 (volume `db_data`) |
| `backend` | L'API. Non exposée à l'hôte : on n'y accède que par l'application web |
| `scheduler` | Les tâches quotidiennes : bons de service préventifs et résumé par courriel aux administrateurs |
| `frontend` | L'application web (nginx), seul point d'entrée, publié sur le port `HTTP_PORT` (26591 par défaut) |

Commandes utiles, depuis le dossier d'installation :

```bash
docker compose ps             # état des conteneurs
docker compose logs -f        # journaux en direct
docker compose down           # arrêter (les données sont conservées)
docker compose up -d          # redémarrer
scripts/docker-smoke.sh       # test de bout en bout de l'installation
```

> ⚠️ `docker compose down -v` **supprime aussi les volumes**, donc la base de données et les documents. Ne l'utilisez que pour tout effacer volontairement.

## Réglages (`.env`)

| Variable | Rôle |
|---|---|
| `JWT_SECRET` | **Obligatoire.** Secret de signature des sessions. ⚠️ Ne la changez jamais sur une installation existante : elle sert aussi à chiffrer le coffre-fort de mots de passe |
| `DB_PASSWORD`, `DB_NAME`, `DB_USER` | Accès à la base |
| `HTTP_PORT` | Port publié par l'application (26591 par défaut ; `80` pour une adresse sans port) |
| `TZ` | Fuseau horaire des conteneurs, par exemple `America/Toronto`. Il décide de l'heure du planificateur |
| `SCHEDULER_TIME` | Heure du passage quotidien du planificateur, `HH:MM` (défaut `06:00`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Courriels d'assignation et résumé quotidien (facultatif) |
| `GOOGLE_*`, `MICROSOFT_*`, `PUBLIC_URL` | Connexion SSO (facultatif), voir [Administration](administration.md) |

Après toute modification du `.env` : `docker compose up -d`.

## HTTPS avec un nom de domaine

Pour exposer l'application sur Internet, un conteneur **Caddy** obtient et renouvelle automatiquement le certificat Let's Encrypt, redirige HTTP vers HTTPS et ajoute HSTS.

1. Faites pointer le DNS de votre domaine vers le serveur et ouvrez les ports 80 et 443.
2. Dans `.env` : `DOMAIN=app.exemple.com` et `PUBLIC_URL=https://app.exemple.com`.
3. Ajoutez le fichier HTTPS à la liste des fichiers Compose, puis redémarrez :

   - **Installation par la commande rapide ou par le paquet de release** : dans `.env`, ajoutez `docker-compose.https.yml` à la fin de `COMPOSE_FILE`, puis `docker compose up -d --wait`.
     ```
     COMPOSE_FILE=docker-compose.yml:docker-compose.release.yml:docker-compose.https.yml
     ```
   - **Installation depuis le code source** :
     ```bash
     docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build --wait
     ```

   > Piège à éviter sur une installation par paquet de release : si vous passez des options `-f` en ligne de commande, elles **remplacent** `COMPOSE_FILE`. Docker chercherait alors à construire les images depuis des sources absentes. Passez par `COMPOSE_FILE` dans le `.env`, ou ajoutez `-f docker-compose.release.yml` aux options.

Caddy devient alors l'unique point d'entrée public. Pour l'essayer en local, mettez `DOMAIN=localhost` (le navigateur demandera d'accepter le certificat local).

## Sauvegarde et restauration

Il y a **deux choses à sauvegarder** : la base de données et le dossier des documents, au même moment.

```bash
# Sauvegarde
docker compose exec -T db sh -c 'pg_dump --clean --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > techibase-db-$(date +%F).sql.gz
docker compose cp backend:/app/uploads ./techibase-uploads-$(date +%F)

# Restauration (le contenu actuel de la base est remplacé)
docker compose stop backend scheduler
gunzip -c techibase-db-2026-01-01.sql.gz | docker compose exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose cp ./techibase-uploads-2026-01-01/. backend:/app/uploads
docker compose start backend scheduler && docker compose restart backend
```

Copiez ces fichiers **hors du serveur**. Gardez aussi une copie de votre `.env` : sans le même `JWT_SECRET`, les mots de passe du coffre-fort restaurés seraient illisibles.
