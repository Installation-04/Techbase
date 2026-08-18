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

## Déploiement du frontend sur Netlify

Netlify héberge uniquement des sites statiques : il peut servir le frontend React, mais **pas** le backend Express ni PostgreSQL. Le backend doit être déployé ailleurs (Render, Railway, Fly.io, VPS…) et exposer une URL HTTPS publique.

1. Déployer le backend + PostgreSQL sur un hébergeur compatible (Docker/Node), avec les variables d'environnement de `.env.example`, en définissant `CORS_ORIGIN` avec l'URL Netlify du frontend (ex. `https://techbase.netlify.app`).
2. Sur Netlify, créer un nouveau site à partir de ce dépôt. La configuration (`netlify.toml`) définit déjà :
   - Base : `frontend`
   - Commande de build : `npm run build`
   - Dossier de publication : `dist`
3. Dans les paramètres du site Netlify (Environment variables), définir `VITE_API_URL` avec l'URL publique du backend (ex. `https://techbase-api.onrender.com`, sans `/api` à la fin).
4. Déployer. Le frontend appellera l'API sur `VITE_API_URL` au lieu du proxy Vite local.
