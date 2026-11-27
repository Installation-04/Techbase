# Versions et releases

TechIBase suit le [versionnage sémantique](https://semver.org/lang/fr/) : `MAJEUR.MINEUR.CORRECTIF`.

| Changement | Exemple | Quand |
|---|---|---|
| CORRECTIF | 0.0.15 → 0.0.16 | Corrections de bogues, sans changement de comportement voulu |
| MINEUR | 0.0.16 → 0.1.0 | Nouvelles fonctions, compatibles |
| MAJEUR | 0.9 → 1.0.0 | Changement incompatible ou migration délicate |
| Préversion | 0.1.0-rc.1 | Test avant la version finale |

Tant que la version est `0.x`, le projet est en **bêta** : les releases GitHub sont marquées « préversion » et un changement incompatible peut arriver entre deux versions. La `1.0.0` marquera la première version recommandée sans réserve.

## Où voir la version

- **Releases GitHub** (onglet *Releases*), avec les notes tirées du [CHANGELOG](../CHANGELOG.md).
- `GET /api/health` → `{"status":"ok","version":"0.0.15"}`.
- **Dans l'application** : pied de la barre latérale et onglet **Administration → Système**.
- **Image Docker** : `ghcr.io/installation-04/techbase:0.0.15` (et `:0.0`, `:latest` pour les versions stables).

## Publier une version (mainteneurs)

1. Vérifiez que la CI est verte sur `main` et que [CHANGELOG.md](../CHANGELOG.md) contient du texte sous **[Non publié]**.
2. Lancez, depuis `main` :
   ```bash
   ./scripts/release.sh 0.0.16
   git push origin main && git push origin v0.0.16
   ```
   Le script date la section du CHANGELOG (ou y met le titre passé en second argument), écrit la version dans les trois `package.json` **et** leurs lockfiles, crée le commit `chore(release): v0.0.16` et le tag annoté `v0.0.16`. Il ne pousse rien lui-même et refuse de travailler si l'arbre n'est pas propre, si vous n'êtes pas sur `main`, si le tag existe déjà ou si **[Non publié]** est vide.
3. Le push du tag lance le workflow **Release** : il rejoue toute la CI, construit les images, démarre la pile complète à partir d'elles pour le test de fumée, pousse les quatre images (amd64 et arm64) puis **vérifie** que chacune contient bien les deux architectures, et enfin crée la release GitHub avec le paquet d'installation et `SHA256SUMS.txt`.
4. **Première publication seulement** : GitHub crée les paquets en privé ; passez chacun en **Public** (Packages → le paquet → Package settings) pour que `docker pull` fonctionne sans connexion.

**Répétition sans rien publier** : *Actions → Release → Run workflow* sur `main`, avec la version et **publish désactivé**. Le workflow construit et teste tout, et ne pousse ni image ni tag.

Garde-fous : seuls les commits de `main` sont publiés ; la version doit être la même dans les six fichiers et avoir une section dans le CHANGELOG ; une version dont le tag **ou** une image existe déjà est refusée.

> **On ne modifie jamais une version publiée.** Si une publication échoue après avoir poussé une image, ce numéro est « brûlé » : corrigez, puis publiez le numéro suivant (le CHANGELOG indique alors que le précédent n'a pas été publié).

## Installer une version précise

Dans votre fichier `.env`, fixez `TECHIBASE_VERSION` (par exemple `0.0.15`) puis :

```bash
docker compose pull && docker compose up -d --wait
```

Pour la production, utilisez toujours une version numérotée, jamais `latest`. La marche à suivre complète (sauvegarde, retour en arrière, mise à jour en un clic) est dans [Versions et mises à jour](versions-et-mises-a-jour.md).

## Règles pour les contributeurs

- Chaque PR utile ajoute une ligne sous **[Non publié]** dans `CHANGELOG.md`.
- Une migration de base de données risquée ou un changement de variable d'environnement se signale en gras dans le CHANGELOG.
- Ne changez pas la version dans une PR ordinaire : c'est `scripts/release.sh` qui le fait, au moment de publier.

## Contenu d'une release

- Le paquet `techibase-vX.Y.Z-docker.tar.gz` : fichiers Compose, `install.sh`, `.env.example` déjà réglé sur la version, `init.sql`.
- `SHA256SUMS.txt` pour vérifier le téléchargement.
- Les images `techbase` (tout-en-un), `techbase-backend`, `techbase-frontend` et `techbase-updater`, pour `linux/amd64` et `linux/arm64`.
