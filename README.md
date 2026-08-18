# TechBase

Application de gestion pour techniciens de terrain. Centralise toutes les informations critiques pour réduire le temps de réponse lors des interventions.

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

**Compte administrateur par défaut :**
- Email : `admin@techbase.local`
- Mot de passe : `Admin1234!`

## Modules

| Module | Description |
|--------|-------------|
| **Clients** | Liste des clients avec recherche, fiche détail par client |
| **Équipements** | Inventaire par client (serveurs, automates, HMI, réseau…) |
| **Procédures** | Procédures de connexion à distance et d'intervention sur site |
| **Mots de passe** | Coffre-fort de credentials par client/équipement, chiffré AES-256 |
| **Contacts** | Contacts techniques par client (nom, rôle, téléphone, email) |
| **EPI** | Liste des équipements de protection individuelle requis par site |
| **Journal** | Historique des interventions par client |
| **Documents** | Bibliothèque de fichiers (PDF, photos, manuels) par client |
| **Utilisateurs** | Gestion des comptes (Admin / Technicien), accès réservé aux admins |

## Recherche globale

La page d'accueil propose une recherche globale sur l'ensemble des clients, équipements et contacts.

## Rôles

- **Admin** — accès complet, gestion des utilisateurs, suppression de clients
- **Technicien** — accès en lecture/écriture sur tous les modules métier

## Structure du projet

```
techbase/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── db/init.sql          # Schéma PostgreSQL (auto-exécuté au premier démarrage)
│   └── src/
│       ├── index.js
│       ├── middleware/auth.js
│       └── routes/          # clients, equipment, procedures, passwords, contacts,
│                            # epi, logbook, documents, users, search
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    └── src/
        ├── App.jsx
        ├── contexts/AuthContext.jsx
        ├── components/      # Layout, Sidebar, ProtectedRoute, GlobalSearch
        └── pages/           # Login, Home, Clients, ClientDetail, Procedures, Users
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
