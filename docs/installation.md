# Installation

TechIBase s'installe avec **Docker** (Docker Engine ou Docker Desktop, avec le plugin Compose). Il n'y a rien d'autre à installer sur le serveur : ni Node.js, ni PostgreSQL. Une nouvelle installation tient dans **un seul conteneur** et un seul volume de données.

## 1. La méthode rapide : une commande

```bash
curl -fsSL https://raw.githubusercontent.com/Installation-04/Techbase/main/get-techibase.sh | bash
```

Le script :

1. vérifie que Docker et Docker Compose répondent ;
2. trouve la **version la plus récente** (ou celle que vous demandez) et télécharge le paquet Docker de la release GitHub ;
3. le déploie dans le dossier `./techibase` ;
4. lance `install.sh`, qui crée le fichier `.env` avec un `JWT_SECRET` et un `DB_PASSWORD` **aléatoires**, télécharge l'image et démarre TechIBase dans **un seul conteneur** (application web, API, planificateur et base de données PostgreSQL ensemble ; voir [Un seul conteneur ou quatre](#un-seul-conteneur-ou-quatre)).

Quand il affiche « TechIBase est prêt ! », ouvrez l'adresse qu'il affiche, par défaut **http://localhost:26591** (ou `http://<adresse-du-serveur>:26591` depuis un autre poste : ouvrez ce port dans le pare-feu du serveur), et suivez [Premiers pas](premiers-pas.md).

> **Pourquoi le port 26591 ?** C'est un port volontairement peu courant : presque aucun autre logiciel ne l'utilise, donc pas de conflit avec le 80 ou le 8080. Il est fixe, le même pour toutes les installations. Pour en choisir un autre, mettez `HTTP_PORT` dans le `.env` (par exemple `80` pour une adresse sans port) puis `docker compose up -d`.

Pour activer aussi les [mises à jour en un clic](administration.md#mise-à-jour-en-un-clic-facultatif) depuis le panneau d'administration, ajoutez `--with-updater` (voir la mise en garde sur le socket Docker). Pour choisir la version ou le dossier :

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

## Un seul conteneur ou quatre

**Par défaut (nouvelle installation) : un seul conteneur, `techibase`.** Il contient l'application web (nginx), l'API, le planificateur quotidien et PostgreSQL 15, supervisés ensemble : si l'un d'eux s'arrête, le conteneur s'arrête et Docker le redémarre en entier. Tout ce qui doit survivre (la base de données et les documents téléversés) est dans **un seul volume**, `techibase_data`, monté sur `/data`. Le mot de passe interne de la base est généré au premier démarrage (la base n'écoute que dans le conteneur).

Commandes utiles, depuis le dossier d'installation :

```bash
docker compose ps             # état du conteneur
docker compose logs -f        # journaux en direct (base, API, planificateur, nginx)
docker compose down           # arrêter (les données sont conservées)
docker compose up -d          # redémarrer
docker compose exec -T techibase techibase-run node src/scheduler.js --once   # lancer les tâches quotidiennes maintenant
scripts/docker-smoke.sh       # test de bout en bout de l'installation
```

**Base de données externe** : si vous avez déjà un PostgreSQL (hébergé ou maison), renseignez `DATABASE_URL=postgres://utilisateur:motdepasse@hôte:5432/techibase` dans `.env`. PostgreSQL n'est alors pas démarré dans le conteneur, et il ne reste que l'application, l'API et le planificateur.

**La pile à quatre conteneurs** (`./install.sh --multi`, ou une installation faite avant l'arrivée du conteneur unique, qui garde son mode) reste prise en charge pour qui veut séparer la base de données ou la faire évoluer à part :

| Conteneur | Rôle |
|---|---|
| `db` | PostgreSQL 15 (volume `db_data`) |
| `backend` | L'API. Non exposée à l'hôte : on n'y accède que par l'application web |
| `scheduler` | Les tâches quotidiennes : bons de service préventifs et résumé par courriel aux administrateurs |
| `frontend` | L'application web (nginx), seul point d'entrée, publié sur le port `HTTP_PORT` (26591 par défaut) |

Les commandes sont les mêmes, avec ces services : `docker compose exec scheduler node src/scheduler.js --once`, etc.

> ⚠️ `docker compose down -v` **supprime aussi les volumes**, donc la base de données et les documents. Ne l'utilisez que pour tout effacer volontairement.

## Réglages (`.env`)

| Variable | Rôle |
|---|---|
| `JWT_SECRET` | **Obligatoire.** Secret de signature des sessions. ⚠️ Ne la changez jamais sur une installation existante : elle sert aussi à chiffrer le coffre-fort de mots de passe |
| `DB_PASSWORD`, `DB_NAME`, `DB_USER` | Accès à la base. Avec le conteneur unique, `DB_PASSWORD` est facultatif (généré et conservé dans le volume s'il est absent) |
| `DATABASE_URL` | Conteneur unique seulement : utiliser un PostgreSQL externe plutôt que celui du conteneur |
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

   - **Conteneur unique** (installation par défaut) : dans `.env`, ajoutez `docker-compose.single.https.yml` à la fin de `COMPOSE_FILE`, puis `docker compose up -d --wait`.
     ```
     COMPOSE_FILE=docker-compose.single.yml:docker-compose.single.release.yml:docker-compose.single.https.yml
     ```
     (depuis le code source : `COMPOSE_FILE=docker-compose.single.yml:docker-compose.single.https.yml`)
   - **Pile à quatre conteneurs, par la commande rapide ou le paquet de release** : dans `.env`, ajoutez `docker-compose.https.yml` à la fin de `COMPOSE_FILE`, puis `docker compose up -d --wait`.
     ```
     COMPOSE_FILE=docker-compose.yml:docker-compose.release.yml:docker-compose.https.yml
     ```
   - **Pile à quatre conteneurs, depuis le code source** :
     ```bash
     docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build --wait
     ```

   > Piège à éviter sur une installation par paquet de release : si vous passez des options `-f` en ligne de commande, elles **remplacent** `COMPOSE_FILE`. Docker chercherait alors à construire les images depuis des sources absentes. Passez par `COMPOSE_FILE` dans le `.env`, ou ajoutez `-f docker-compose.release.yml` aux options.

Caddy devient alors l'unique point d'entrée public. Pour l'essayer en local, mettez `DOMAIN=localhost` (le navigateur demandera d'accepter le certificat local).

## Sauvegarde et restauration

Il y a **deux choses à sauvegarder** : la base de données et le dossier des documents, au même moment.

**Conteneur unique** : une commande produit une seule archive (`.tar.gz`) qui contient les deux.

```bash
# Sauvegarde
docker compose exec -T techibase techibase-backup > techibase-$(date +%F).tar.gz

# Restauration (le contenu actuel de la base et des documents est remplacé)
docker compose exec -T techibase techibase-restore < techibase-2026-01-01.tar.gz
docker compose restart
```

**Pile à quatre conteneurs** :

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

## Passer de quatre conteneurs à un seul

Rien n'oblige à migrer : une installation à quatre conteneurs continue de fonctionner et de se mettre à jour. Pour passer au conteneur unique, on déplace les données par une sauvegarde :

1. **Sauvegardez l'ancienne installation** avec les commandes « pile à quatre conteneurs » ci-dessus (base de données et documents), puis arrêtez-la : `docker compose down` (sans `-v`, pour garder l'ancienne copie des données au cas où).
2. **Installez la nouvelle** dans un autre dossier : `./install.sh` (ou la commande rapide). Avant le premier démarrage, ou en le relançant ensuite, mettez dans le nouveau `.env` le **même `JWT_SECRET`** que l'ancien (sinon les mots de passe du coffre-fort restent illisibles) et les mêmes `DB_NAME` et `DB_USER` s'ils n'étaient pas ceux par défaut.
3. **Convertissez la sauvegarde et restaurez-la** :

   ```bash
   mkdir migration
   gunzip -c techibase-db-2026-01-01.sql.gz > migration/db.sql
   cp -r techibase-uploads-2026-01-01 migration/uploads
   echo "techibase-backup v1 migration" > migration/MANIFEST
   tar -czf - -C migration MANIFEST db.sql uploads | docker compose exec -T techibase techibase-restore
   docker compose restart
   ```
4. Connectez-vous et vérifiez vos clients et vos documents. Gardez l'ancien dossier et ses volumes quelques jours avant de les supprimer.
