# FAQ

**Sur quel port TechIBase répond-il ?**
Sur le **26591**, le même pour toutes les installations : `http://localhost:26591`, ou `http://<adresse-du-serveur>:26591` depuis un autre poste (ouvrez ce port dans le pare-feu). C'est un port volontairement peu courant, pour ne pas entrer en conflit avec le 80 ou le 8080. Pour en changer, mettez `HTTP_PORT` dans le `.env` (par exemple `80` pour une adresse sans port), puis `docker compose up -d`. Voir [Installation](installation.md).

**Où sont mes données ?**
Avec l'installation par défaut (un seul conteneur), tout ce qui doit survivre est dans **un seul volume Docker**, `techibase_data`, monté sur `/data` : la base de données et les documents téléversés. Une installation à quatre conteneurs utilise deux volumes, `db_data` (base de données) et `uploads` (documents). Dans tous les cas, gardez aussi votre fichier **`.env`**, qui contient le `JWT_SECRET`. Voir [Installation](installation.md#un-seul-conteneur-ou-quatre).

**Comment sauvegarder ?**
Avec l'installation en un conteneur, une commande produit une archive qui contient la base et les documents :

```bash
docker compose exec -T techibase techibase-backup > techibase-$(date +%F).tar.gz
```

Copiez l'archive **hors du serveur** avec votre `.env`. La restauration (`techibase-restore`) et la méthode pour la pile à quatre conteneurs sont dans [Installation → Sauvegarde et restauration](installation.md#sauvegarde-et-restauration). Un `docker compose down -v` supprime les volumes : ne l'utilisez que pour tout effacer.

**Comment mettre à jour ?**
Faites une [sauvegarde](installation.md#sauvegarde-et-restauration), puis relancez la commande d'installation : elle détecte l'installation existante et conserve le `.env` et les données.

```bash
curl -fsSL https://raw.githubusercontent.com/Installation-04/Techbase/main/get-techibase.sh \
  | bash -s -- --dir /chemin/vers/techibase
```

Si le **service de mise à jour** est activé, le bouton **Mettre à jour vers vX.Y.Z** de l'onglet Système de l'[Administration](administration.md#mise-à-jour-en-un-clic-facultatif) fait la sauvegarde, la mise à jour et le retour arrière automatique en cas d'échec. Toute la procédure est dans [Versions et mises à jour](versions-et-mises-a-jour.md).

**J'ai oublié mon mot de passe. Que faire ?**
Il n'y a pas de procédure « mot de passe oublié » en libre-service. Un **autre administrateur** ouvre **Administration → Utilisateurs → Modifier** votre compte et saisit un nouveau mot de passe. C'est pourquoi il est recommandé d'avoir **au moins deux administrateurs**. Aucune commande de réinitialisation n'est fournie pour le cas où le seul administrateur perd son mot de passe. Voir [Administration](administration.md#les-comptes).

**Qui est administrateur ?**
Le **tout premier compte créé** (par mot de passe ou par SSO) : créez-le vous-même tout de suite après l'installation. Les suivants reçoivent le rôle « Utilisateur » ; un administrateur peut changer un rôle depuis l'onglet Utilisateurs. Voir [Premiers pas](premiers-pas.md).

**N'importe qui peut-il se créer un compte ?**
Oui : l'auto-inscription reste ouverte, et il n'existe pas encore d'option pour la fermer. Ne mettez pas TechIBase sur Internet sans restreindre l'accès (VPN, pare-feu, liste d'adresses autorisées). Voir [Administration](administration.md#lauto-inscription).

**Les mots de passe des clients sont-ils sûrs ?**
Ils sont **chiffrés** dans la base à l'aide du `JWT_SECRET` et masqués à l'écran jusqu'au clic sur **Afficher**. Si vous changez le `JWT_SECRET`, les mots de passe déjà stockés deviennent illisibles : ne le changez jamais, et sauvegardez le `.env`. Tous les utilisateurs connectés peuvent afficher les mots de passe ; chaque affichage ou copie est inscrit au [journal d'audit](journal-d-audit.md).

**Mon téléphone n'arrive pas sur « Ma journée ».**
Seuls les utilisateurs qui ne sont pas administrateurs y sont conduits à l'ouverture, sur un écran étroit. Les administrateurs arrivent sur l'Accueil et ouvrent **Ma journée** depuis le menu. Un bon assigné sans échéance et non démarré n'y figure pas. Voir [Ma journée](ma-journee.md).

**Le PDF d'un rapport d'intervention ne se génère pas.**
Sur le déploiement Netlify, la génération du PDF n'est pas disponible (la rédaction et la signature fonctionnent). Sur Docker, voir [Dépannage](depannage.md). Voir [Rapports d'intervention](rapports-d-intervention.md).

**Je ne reçois pas de courriels.**
Les courriels (assignation, résumé quotidien) sont facultatifs : sans `RESEND_API_KEY`, seules les notifications dans l'application sont envoyées. Voir [Administration](administration.md#les-courriels).

**TechIBase est-il prêt pour la production ?**
C'est une **bêta** (versions `0.0.x`) : voir [Versions et mises à jour](versions-et-mises-a-jour.md). Testez votre sauvegarde et votre restauration avant de lui confier des données importantes.

**Comment contribuer ou comprendre le code ?**
Le [README du dépôt](../README.md) décrit l'architecture, les tests et le développement local.
