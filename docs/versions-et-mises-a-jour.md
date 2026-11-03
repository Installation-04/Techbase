# Versions et mises à jour

## Numéros de version

TechIBase est en **bêta** : ses versions sont de la forme `0.0.x`, sous le `1.0.0`. Le numéro de la version installée est visible :

- au bas de la barre latérale (`v0.0.9 · bêta`) ;
- dans `GET /api/health`, qui répond `{"status":"ok","version":"0.0.9"}`.

Chaque version est publiée sur la [page des releases](https://github.com/Installation-04/Techbase/releases) avec ses notes (reprises du [CHANGELOG](../CHANGELOG.md)). Tant que le projet est en `0.x`, les releases sont marquées « pre-release ».

## Les images Docker

Chaque version publie deux images sur le GitHub Container Registry, pour processeurs **amd64** et **arm64** (serveurs classiques, Raspberry Pi, Mac Apple Silicon) :

- `ghcr.io/installation-04/techbase-backend`
- `ghcr.io/installation-04/techbase-frontend`

| Étiquette | Sens |
|---|---|
| `0.0.9` | Cette version exacte. **Jamais réécrite** une fois publiée |
| `0.0` | La dernière version de la série `0.0.x` |
| `latest` | La dernière version stable |
| `sha-abc1234` | Le commit exact dont l'image est issue |

**En production, épinglez une version exacte** (`TECHIBASE_VERSION=0.0.9` dans le `.env`) : vous décidez du moment de la mise à jour. `latest` suit les nouvelles versions à chaque `docker compose pull`.

## Mettre à jour

Avant de commencer : [faites une sauvegarde](installation.md#sauvegarde-et-restauration) et lisez les notes de la nouvelle version dans le [CHANGELOG](../CHANGELOG.md) (section « À savoir en mettant à jour »).

**Installé par la commande rapide ou le paquet de release** : relancez la commande d'installation, elle détecte l'installation existante.

```bash
curl -fsSL https://raw.githubusercontent.com/Installation-04/Techbase/main/get-techibase.sh \
  | bash -s -- --dir /chemin/vers/techibase
```

Le `.env` et les données sont conservés ; seuls les fichiers Compose et `TECHIBASE_VERSION` changent. À la main : modifiez `TECHIBASE_VERSION` dans le `.env`, puis `docker compose pull && docker compose up -d --wait`.

**Installé depuis le code source** :

```bash
git pull
docker compose up -d --build --wait
```

Dans tous les cas, les volumes `db_data` et `uploads` sont conservés. `scripts/docker-smoke.sh` vérifie ensuite que tout fonctionne de bout en bout.

## Revenir à une version précédente

Remettez l'ancienne valeur dans `TECHIBASE_VERSION`, puis `docker compose pull && docker compose up -d --wait`. C'est **sans risque pour les données tant qu'aucune version n'a modifié le schéma de la base** ; si les notes d'une version mentionnent un changement de schéma, restaurez plutôt la sauvegarde faite avant la mise à jour.

## Pour les mainteneurs : publier une version

Le workflow **Release** (`.github/workflows/release.yml`) publie les images, crée le tag et la release GitHub.

1. Préparer : `node scripts/bump-version.js 0.0.x` (met à jour les trois `package.json` **et** leurs fichiers de verrouillage), puis déplacer les entrées « Non publié » du [CHANGELOG](../CHANGELOG.md) sous `## [0.0.x] - résumé`. Faire fusionner par pull request. La CI échoue si les numéros divergent ou si la section du CHANGELOG manque.
2. **Répétition** : GitHub → **Actions → Release → Run workflow** sur `main`, version `0.0.x`, **publish désactivé**. Le workflow construit les images, démarre la pile complète à partir d'elles et exécute le test de bout en bout, sans rien publier.
3. **Publication** : relancer avec **publish activé**. Il pousse les images (amd64 et arm64), puis crée le tag `v0.0.x` et la release avec son paquet d'installation.
4. **Première publication seulement** : GitHub crée les deux paquets en privé ; passez chacun en **Public** (Packages → le paquet → Package settings) pour que `docker pull` fonctionne sans connexion.

Garde-fous : seuls les commits de `main` sont publiés ; une version déjà publiée (tag ou image) est refusée.
