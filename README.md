# TechBase

Application de gestion pour techniciens de terrain. Centralise toutes les informations critiques pour réduire le temps de réponse lors des interventions.

## Version

Le projet est actuellement en **bêta** (versions `0.0.x`, sous le `1.0.0`). Le numéro de version est synchronisé dans `package.json` (racine), `backend/package.json` et `frontend/package.json` — les trois doivent rester identiques à chaque déploiement.

À chaque déploiement en production, incrémenter le numéro de version (`0.0.1` → `0.0.2`, etc.) dans les trois fichiers avant de merger/déployer. Le numéro est visible :
- Dans l'application (pied de la barre latérale)
- Via l'API : `GET /api/health` retourne `{ "status": "ok", "version": "0.0.x" }`

Le premier `1.0.0` marquera la sortie de bêta.

## Stack

- **Frontend:** React + Vite, Tailwind CSS, React Router
- **Backend:** Node.js + Express, API REST, authentification JWT
- **Base de données:** PostgreSQL
- **Déploiement:** Docker Compose (3 conteneurs : frontend, backend, db)

## Démarrage rapide

### Installation automatique (recommandé)

```bash
./install.sh
```

Ce script vérifie la présence de Docker, génère un fichier `.env` avec des secrets aléatoires (JWT_SECRET, DB_PASSWORD), puis construit et démarre les conteneurs.

### Installation manuelle

```bash
cp .env.example .env
docker compose up --build -d
```

L'application est accessible sur http://localhost

**Premier accès :** il n'y a plus de compte admin préconfiguré. Ouvrez l'application et créez un compte via « Créer un compte » sur l'écran de connexion — **le tout premier compte créé (local ou via SSO) devient automatiquement administrateur.** Tous les comptes suivants ont le rôle « Utilisateur » par défaut (modifiable ensuite par un admin dans Utilisateurs).

## Authentification

Trois façons de se connecter, configurables indépendamment :

- **Compte local** (email + mot de passe) — toujours disponible, aucune configuration requise.
- **Auto-inscription** — n'importe qui peut créer un compte via « Créer un compte ». Le premier compte créé devient admin ; les suivants sont créés avec le rôle « Utilisateur ». ⚠️ Vu que l'application stocke des identifiants clients sensibles, envisagez de restreindre l'inscription (voir note ci-dessous) une fois l'admin initial créé.
- **SSO Google / Microsoft 365** — optionnel, désactivé par défaut. Les boutons SSO n'apparaissent sur l'écran de connexion que si les variables d'environnement correspondantes sont définies.

### Configurer le SSO Google

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create Credentials → OAuth client ID → type **Web application**.
2. Ajouter comme URI de redirection autorisée : `https://<votre-domaine>/api/auth/google/callback`
3. Définir `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` (variables d'environnement du site Netlify, ou `.env` en local).

### Configurer le SSO Microsoft 365

1. [Portail Azure](https://portal.azure.com/) → Microsoft Entra ID → App registrations → New registration (type **Web**).
2. Ajouter comme URI de redirection : `https://<votre-domaine>/api/auth/microsoft/callback`
3. Certificates & secrets → générer un nouveau client secret.
4. Définir `MICROSOFT_CLIENT_ID` et `MICROSOFT_CLIENT_SECRET`. Par défaut (`MICROSOFT_TENANT_ID` non défini), les comptes personnels Microsoft et tout compte Microsoft 365 professionnel/scolaire sont acceptés — définir `MICROSOFT_TENANT_ID` pour restreindre à une seule organisation.

### Note sur l'auto-inscription

L'inscription ouverte est pratique pour démarrer, mais TechBase stocke des mots de passe/identifiants clients — une fois l'admin initial créé, il est recommandé de retirer l'inscription publique (ou de la limiter par domaine d'email) pour un usage en production. Ce n'est pas encore implémenté ; à faire évoluer selon les besoins (ex. liste blanche de domaines, invitation par un admin).

## Modules

| Module | Description |
|--------|-------------|
| **Clients** | Liste des clients avec recherche, fiche détail par client |
| **Équipements** | Inventaire par client (serveurs, automates, HMI, réseau…) |
| **Bons de service (BS)** | Planification et suivi des interventions : statut (ouvert/assigné/en cours/terminé/annulé), priorité, assignation à un technicien, échéance. Vue globale en tableau par statut + onglet par client. Génération automatique préventive à partir de la date de prochaine maintenance des équipements. |
| **Procédures** | Procédures de connexion à distance et d'intervention sur site |
| **Mots de passe** | Coffre-fort de credentials par client/équipement, chiffré AES-256 |
| **Contacts** | Contacts techniques par client (nom, rôle, téléphone, email) |
| **EPI** | Liste des équipements de protection individuelle requis par site |
| **Journal** | Historique des interventions par client |
| **Documents** | Bibliothèque de fichiers (PDF, photos, manuels) par client |
| **Utilisateurs** | Gestion des comptes (Admin / Technicien), accès réservé aux admins |

## Recherche globale

La page d'accueil propose une recherche globale sur l'ensemble des clients, équipements et contacts.

## Tableau de bord

La page d'accueil affiche des indicateurs en temps réel (`GET /api/dashboard/summary`) : nombre de clients, bons de service actifs, maintenance en retard, EPI en stock faible, répartition des bons de service par statut, et un graphique des interventions des 6 derniers mois. La page Bons de service propose un export CSV de la liste affichée (filtrée par technicien le cas échéant).

## Notifications

- **En application** : une cloche dans la barre supérieure affiche le nombre de notifications non lues (rafraîchi toutes les 60s) et un menu déroulant avec l'historique. Un technicien est notifié dès qu'un bon de service lui est assigné.
- **Par courriel** (optionnel) : si `RESEND_API_KEY` est défini, les mêmes assignations déclenchent un courriel, et un résumé quotidien (maintenance en retard + EPI en stock faible, seuil ≤ 2) est envoyé à tous les admins par la Netlify Function planifiée. Sans cette variable, tout continue de fonctionner — seules les notifications en application sont actives. Obtenir une clé sur [resend.com](https://resend.com) (aucune autre configuration requise).

## Génération automatique des bons de service

Une Netlify Function planifiée (`netlify/functions/maintenance-scheduler.js`, exécutée quotidiennement) crée automatiquement un bon de service préventif pour tout équipement dont la date de prochaine maintenance (`next_maintenance`) tombe dans les 7 prochains jours — sans doublon (contrainte unique en base tant qu'un bon de service auto-généré est actif pour cet équipement). La même fonction envoie le résumé quotidien par courriel (voir Notifications ci-dessus).

## Fiabilité de la plateforme

- **Tests automatisés** : suite de tests backend (`node --test backend/test`) couvrant l'émission de tokens JWT, le middleware de validation, et le flux d'inscription/connexion (premier compte = admin, doublons, mots de passe invalides…).
- **CI** (`.github/workflows/ci.yml`) : à chaque push/PR — tests backend, build frontend, et vérification que les Netlify Functions se bundlent correctement (la classe de bug la plus coûteuse rencontrée en déploiement : des dépendances backend absentes du `package.json` racine que Netlify seul peut voir).
- **Validation des entrées** : middleware de validation partagé (`backend/src/middleware/validate.js`) appliqué aux routes d'authentification et aux bons de service.
- **Limitation de débit** : limite générale sur toutes les routes `/api` (600 req/15 min), plus une limite stricte sur login/register (20 req/15 min).
- **Gestion d'erreurs centralisée** : les erreurs serveur ne renvoient jamais de détails internes (requêtes SQL, stack traces) en production.

## Rôles

- **Admin** — accès complet, gestion des utilisateurs, suppression de clients
- **Technicien** — accès en lecture/écriture sur tous les modules métier

## Structure du projet

```
techbase/
├── docker-compose.yml
├── .env.example
├── package.json              # Deps miroir pour le bundler des Netlify Functions
├── netlify.toml
├── netlify/
│   ├── functions/            # api.js (backend Express), maintenance-scheduler.js (cron quotidien)
│   └── database/migrations/  # Schéma appliqué automatiquement par Netlify DB
├── backend/
│   ├── Dockerfile
│   ├── db/init.sql          # Schéma PostgreSQL (auto-exécuté au premier démarrage, Docker)
│   ├── test/                 # node --test — token, validation, inscription/connexion
│   └── src/
│       ├── app.js            # Setup Express (routes, middlewares) — réutilisé par index.js et les Functions
│       ├── index.js           # Point d'entrée standalone (Docker)
│       ├── db.js              # Pool Postgres (Netlify DB ou DB_* selon l'environnement)
│       ├── middleware/       # auth, validate
│       ├── lib/               # token, respond, email, notify
│       └── routes/          # auth, users, clients, equipment, work-orders, dashboard,
│                            # notifications, procedures, passwords, contacts, epi,
│                            # logbook, documents, search
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    └── src/
        ├── App.jsx
        ├── contexts/AuthContext.jsx
        ├── components/      # Layout, Sidebar, ProtectedRoute, GlobalSearch, NotificationBell
        └── pages/           # Login, AuthCallback, Home, Clients, ClientDetail,
                             # WorkOrders, Procedures, Users
```

## Variables d'environnement

Copier `.env.example` en `.env` et adapter les valeurs :

| Variable | Description |
|----------|-------------|
| `DB_HOST` | Hôte PostgreSQL (default: `db`) |
| `DB_PORT` | Port PostgreSQL (default: `5432`) |
| `DB_NAME` | Nom de la base de données |
| `DB_USER` | Utilisateur PostgreSQL |
| `DB_PASSWORD` | Mot de passe PostgreSQL |
| `JWT_SECRET` | Clé secrète pour les tokens JWT |

## Ports

| Service | Port |
|---------|------|
| Frontend (nginx) | `80` |
| Backend (Express) | `3001` |
| PostgreSQL | `5432` (interne) |

## Déploiement complet sur Netlify

L'application peut être déployée entièrement sur Netlify :

- **Frontend** : build statique React (`netlify.toml`, publié depuis `frontend/dist`)
- **Backend** : l'API Express est packagée en une Netlify Function (`netlify/functions/api.js`, servie sur `/api/*`, même domaine que le frontend — pas de CORS à configurer)
- **Base de données** : [Netlify DB](https://docs.netlify.com/build/data-and-storage/netlify-db/) (PostgreSQL managé, propulsé par Neon) — provisionnée automatiquement, aucune chaîne de connexion à gérer manuellement
- **Documents** : stockés dans [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/) au lieu du disque local

### Étapes

1. Installer les dépendances du module `@netlify/database` (déjà dans `backend/package.json`) — Netlify provisionne la base automatiquement au premier déploiement.
2. Le schéma de base de données est appliqué automatiquement via les migrations dans `netlify/database/migrations/`.
3. Sur Netlify, créer un nouveau site à partir de ce dépôt (la configuration `netlify.toml` gère le build du frontend et le dossier des fonctions).
4. Définir `JWT_SECRET` dans les variables d'environnement du site Netlify (obligatoire en production — le démarrage échoue si absent).
5. Déployer. Le frontend appelle l'API relativement (`/api/...`), qui est automatiquement routée vers la fonction serverless sur le même domaine.

### Développement local (Docker Compose)

Le flux Docker Compose (`docker-compose.yml`) reste disponible pour le développement local : backend Express autonome + PostgreSQL + stockage des documents sur disque (`/app/uploads`). Le code détecte automatiquement l'environnement (variable `NETLIFY`) et bascule entre les deux modes de stockage sans changement de code applicatif.

### Déploiement alternatif : frontend Netlify + backend hébergé séparément

Si vous préférez héberger le backend ailleurs (Render, Railway, Fly.io…) plutôt que via les Netlify Functions :

1. Déployer `backend/` + PostgreSQL sur cet hébergeur avec les variables de `.env.example`, en définissant `CORS_ORIGIN` avec l'URL Netlify du frontend.
2. Dans les paramètres du site Netlify, définir `VITE_API_URL` avec l'URL publique du backend (sans `/api` à la fin).
3. Retirer ou adapter `[functions]` dans `netlify.toml` si les Netlify Functions ne sont pas utilisées.
