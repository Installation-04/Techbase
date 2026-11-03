# Dépannage

Commencez toujours par regarder l'état et les journaux, depuis le dossier d'installation :

```bash
docker compose ps                    # chaque service devrait être « healthy »
docker compose logs --tail 50        # derniers messages de tous les services
docker compose logs backend          # un seul service
```

## L'installation échoue ou un service ne démarre pas

| Symptôme | Cause probable et remède |
|---|---|
| `JWT_SECRET is not set in .env` | Le `.env` n'a pas de `JWT_SECRET`. Sur une nouvelle installation, lancez `./install.sh` ; sur une installation existante, **remettez la valeur d'origine** (la changer rend le coffre-fort illisible) |
| `Docker ne répond pas` | Docker n'est pas démarré, ou votre utilisateur n'a pas le droit de l'utiliser : démarrez Docker, ou relancez avec `sudo` |
| `port is already allocated` / le port 80 est pris | Un autre service utilise le port 80. Mettez `HTTP_PORT=8080` dans `.env`, puis `docker compose up -d` |
| `denied` ou `unauthorized` au téléchargement des images | Les images ne sont pas (encore) publiques : `docker login ghcr.io` avec un jeton GitHub ayant le droit `read:packages`, puis relancez |
| `pull access denied` / `manifest unknown` pour une version | Cette version n'existe pas : vérifiez le numéro sur la [page des releases](https://github.com/Installation-04/Techbase/releases) |
| Docker cherche à *construire* des images après un `-f` | Dans une installation par paquet de release, `-f` remplace `COMPOSE_FILE` : voir [Installation → HTTPS](installation.md#https-avec-un-nom-de-domaine) |
| Le `backend` redémarre en boucle | `docker compose logs backend` : le plus souvent un mot de passe de base incohérent (`DB_PASSWORD` modifié après la création du volume) |

## L'application

| Symptôme | Cause probable et remède |
|---|---|
| Je suis ramené à l'écran de connexion | La session dure 8 heures. Reconnectez-vous |
| « Identifiants invalides » | Courriel ou mot de passe incorrect, ou compte créé par SSO (utilisez le bouton SSO). Un administrateur peut réinitialiser votre mot de passe |
| Je n'ai plus de compte administrateur | Un autre administrateur peut changer votre rôle ou votre mot de passe depuis **Utilisateurs**. D'où l'intérêt d'en avoir deux |
| Les boutons Google ou Microsoft n'apparaissent pas | Les variables `GOOGLE_*` ou `MICROSOFT_*` ne sont pas définies, ou le conteneur n'a pas été recréé : `docker compose up -d` |
| Le SSO échoue au retour | `PUBLIC_URL` ne correspond pas à l'adresse de l'application, ou l'URI de redirection déclarée chez Google/Microsoft diffère. Voir [Administration](administration.md) |
| Un fichier téléversé ne s'ouvre pas dans le navigateur | Normal pour les types non sûrs (HTML, SVG, CSV…) : ils se téléchargent. Seuls PDF, images et texte brut s'affichent |
| Impossible de téléverser un gros fichier | La limite est de 50 Mo |
| Pas de courriels | `RESEND_API_KEY` n'est pas défini (ou invalide). Les notifications dans l'application fonctionnent sans |
| Aucun bon préventif n'est créé | `docker compose logs scheduler` : le service tourne-t-il, à quelle heure (`SCHEDULER_TIME`, `TZ`) ? Déclenchez-le : `docker compose exec scheduler node src/scheduler.js --once`. Un équipement n'est pris en compte que si sa **prochaine maintenance** est renseignée et dans les 7 jours |
| Les dates des formulaires s'affichent mois/jour | Le sélecteur de date suit la langue du navigateur. Les dates affichées dans l'application sont toujours JJ/MM/AAAA |

## Vérifier toute l'installation

```bash
scripts/docker-smoke.sh
```

Ce test de bout en bout crée un compte de test, un client, des documents et un équipement, fait générer un bon préventif par le planificateur, puis vérifie chaque couche (nginx, API, base, planificateur, droits). Utilisez `--restart` pour vérifier aussi que les données survivent à un redémarrage.

## Repartir de zéro

⚠️ Cela **efface la base de données et les documents** :

```bash
docker compose down -v
./install.sh
```

Faites d'abord une [sauvegarde](installation.md#sauvegarde-et-restauration) si les données comptent.
