# TechBase

Application de gestion pour techniciens de terrain. Centralise toutes les informations critiques pour réduire le temps de réponse lors des interventions.

## Stack

- **Frontend:** React + Vite, Tailwind CSS, React Router
- **Backend:** Node.js + Express, API REST, authentification JWT
- **Base de données:** PostgreSQL
- **Déploiement:** Docker Compose (3 conteneurs : frontend, backend, db)

## Démarrage rapide

```bash
cp .env.example .env
docker compose up --build
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
