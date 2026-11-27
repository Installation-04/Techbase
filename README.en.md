<p align="center">
  <img src="docs/images/techibase-banner-en.png" alt="TechIBase — Everything a field technician needs before, during and after the job" width="1200">
</p>

<h1 align="center">TechIBase</h1>

<p align="center">
  <strong>Self-hosted management app for field technicians.</strong><br>
  Client files, equipment, procedures, passwords, work orders and signed reports, all in one place.
</p>

<p align="center">
  <a href="https://github.com/Installation-04/Techbase/actions/workflows/ci.yml"><img src="https://github.com/Installation-04/Techbase/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status"></a>
  <a href="https://github.com/Installation-04/Techbase/releases"><img src="https://img.shields.io/github/v/release/Installation-04/Techbase?include_prereleases&amp;label=version&amp;color=2563eb" alt="Latest version, including prereleases"></a>
  <a href="docs/installation.md"><img src="https://img.shields.io/badge/Docker-AMD64%20%7C%20ARM64-2496ed" alt="Docker AMD64 and ARM64"></a>
</p>

<p align="center"><a href="README.md" lang="fr">Français</a> · <strong>English</strong></p>

<p align="center">
  <a href="#install-techibase"><strong>Install TechIBase</strong></a> ·
  <a href="#screenshots">Explore the app</a> ·
  <a href="docs/README.md">Documentation</a> ·
  <a href="https://github.com/Installation-04/Techbase/releases">Downloads</a>
</p>

TechIBase brings together everything a field technician needs to cut response time during interventions: the client, their equipment, remote-access procedures, passwords, contacts, required PPE, history and work orders. The app is in **French**, works on **mobile** as well as on a desktop, and has a **dark mode**.

You host the application and your data yourself, with Docker, in **a single container**. No external service is required.

> [!NOTE]
> **Beta software.** TechIBase is published as `0.0.x` versions, below `1.0.0`. Features change from one version to the next: read the [changelog](CHANGELOG.md) (in French) before updating, and make a backup before any update. See also [Version](#version).

![TechIBase dashboard](docs/images/03-accueil.png)

*The documentation, the interface and the changelog are in French. Screenshots show the French interface.*

## Install TechIBase

All you need on the server is **Docker** (with the Compose plugin). There is no need to clone the repository. In a terminal, run:

```bash
curl -fsSL https://raw.githubusercontent.com/Installation-04/Techbase/main/get-techibase.sh | bash
```

The script downloads the **latest release**, deploys it into `./techibase`, generates a `.env` with random secrets and starts the app **in a single container** from the published images. **Running the same command again updates** an existing installation: the `.env` and your data are kept.

- **Default port: `26591`.** The app is available at **http://localhost:26591**. This port is deliberately uncommon so it does not clash with another service (such as 80 or 8080). To change it, edit `HTTP_PORT` in `.env` (for example `80` for an address without a port), then run `docker compose up -d`.
- **First sign-in:** there is no preconfigured admin account. Open the app and choose "Créer un compte" (create an account) on the sign-in screen. **The very first account created (local or SSO) automatically becomes administrator.** Later accounts get the "Utilisateur" (user) role by default, which an admin can change afterwards under Administration.

[Full installation guide](docs/installation.md) · [Read the script before running it](get-techibase.sh) · [Getting started](docs/premiers-pas.md) (both guides are in French)

<details>
<summary>Choose a version or folder, install from source, or enable one-click updates</summary>

<br>

**A specific version, in another folder:**

```bash
curl -fsSL https://raw.githubusercontent.com/Installation-04/Techbase/main/get-techibase.sh | bash -s -- --version 0.0.9 --dir /opt/techibase
```

**With one-click updates** from the admin panel (optional; see the warning about the Docker socket in the [administration guide](docs/administration.md#mise-à-jour-en-un-clic-facultatif)): add `--with-updater` to the command above.

**From source:**

```bash
git clone https://github.com/Installation-04/Techbase.git && cd Techbase
./install.sh
```

This script checks that Docker is present, generates a `.env` file with random secrets (`JWT_SECRET`, `DB_PASSWORD`), then builds and starts TechIBase in a single container (`./install.sh --multi` for the four-container stack; an existing installation keeps its mode).

**Manual installation:**

```bash
cp .env.example .env
docker compose up --build -d
```

**From a release package, without cloning the repository:** every GitHub release attaches `techibase-vX.Y.Z-docker.tar.gz`: the Compose files, the initial database, `install.sh` and a `.env.example` already set to that version.

```bash
tar xzf techibase-v0.0.9-docker.tar.gz && cd techibase-v0.0.9-docker
./install.sh        # creates .env with random secrets, pulls the images, starts
```

The `.env` contains `TECHIBASE_VERSION` (the installed version) and `COMPOSE_FILE=docker-compose.yml:docker-compose.release.yml`, so a plain `docker compose up -d` uses the published images instead of building them. From a cloned repository, remove or comment out these two lines to build from source, or add them to use the published images.

</details>

## What you can do

| For your work | In TechIBase |
| --- | --- |
| **Find a client instantly** | **Client files** with search and a detail page; **global search** across clients, equipment and contacts from the home page. |
| **Know the installed base** | **Equipment** per client (servers, PLCs, HMIs, network…), with last and next maintenance dates. |
| **Plan upkeep** | **Maintenance cycles** (monthly, quarterly, every six months, yearly, every 2 years): when a maintenance work order is completed, the next date is recalculated, with **reminders** (0.0.15). Preventive work orders are created automatically for any maintenance due within 7 days. |
| **Manage interventions** | **Work orders**: status (open, assigned, in progress, done, cancelled), priority, assigned technician, due date; global view by status, per-client tab, CSV export. |
| **Work in the field** | **"Ma journée" ("My day", mobile)**: the technician's work orders (in progress, today, overdue, done today), the address that opens the map, one-tap phone call, and Done, Note and Details buttons. |
| **Hand over a signed report** | **Signed service reports**: work done, parts, time spent, observations, the client's on-screen signature, and a **PDF** to download or attach to the client file. |
| **Follow procedures** | **Procedures** for remote connection and on-site intervention. |
| **Keep access details safe** | **Password vault** per client or equipment, encrypted with AES-256; every time a password is revealed, it is logged. |
| **Know who to call** | Technical **contacts** per client (name, role, phone, email). |
| **Stay safe** | **PPE**: personal protective equipment required per site, with low-stock and expiry alerts. |
| **Keep field memory** | Intervention **journal** per client and **documents** (PDFs, photos, manuals) per client. |
| **Stay on top** | Real-time **dashboard** (clients, active work orders, overdue maintenance, PPE, interventions over the last 6 months) and **notifications** in the app (bell) and optionally by email, with a daily digest. |
| **Connect your ERP** | **Acumatica integration**: each user connects their own account and syncs their clients from the "Intégrations" tab of the client file. |
| **Sign in easily** | Local account, optional **Google or Microsoft 365 SSO**, Administrator and User roles, **dark mode** (light, dark or automatic). |
| **Administer and audit** | **Admin panel**: system (version, latest published version, optional **one-click updater**), users, health; **audit log** (administrators) with filters and CSV export. |

Functional details (in French): [client file](docs/fiche-client.md) · [work orders](docs/bons-de-service.md) · [search and notifications](docs/recherche-et-notifications.md) · [administration](docs/administration.md).

## Screenshots

All screenshots show **fictional data**.

### A dashboard that gets to the point

The home page brings together global search, indicators and maintenance alerts.

![Dashboard, light theme](docs/images/03-accueil.png)

![Global search](docs/images/04-recherche-globale.png)

### Everything about the client in one file

Equipment, work orders, procedures, passwords, contacts, PPE, journal, documents and integrations: one tab for each.

![Client file, equipment](docs/images/07-fiche-equipements.png)

![Client file, work orders](docs/images/09-fiche-bons-de-service.png)

![Client file, passwords](docs/images/11-fiche-mots-de-passe.png)

![Client file, PPE](docs/images/13-fiche-epi.png)

### Work orders and signed report

Track each intervention by status, then have the client sign the report right on the screen. The PDF is generated by the server.

![Work orders by status](docs/images/17-bons-de-service.png)

![Service report with the client's signature](docs/images/26-rapport-signe.png)

### In the field, with "Ma journée"

On a phone, the technician first sees what they have to do today.

![Ma journée on a phone](docs/images/29-mobile-ma-journee.png)

![Home on a phone](docs/images/22-mobile-accueil.png)

### Dark mode

Choose the light theme, the dark theme or your system's in the header. The choice is remembered in the browser.

![Dashboard in dark mode](docs/images/28-accueil-mode-sombre.png)

### Administration and audit

Installed version, health status, users and audit log, reserved for administrators.

![Administration, System tab](docs/images/24-admin-systeme.png)

![Administration, audit log](docs/images/27-journal-audit.png)

## Choose how you run it

| Mode | For whom | How |
| --- | --- | --- |
| **Single container** (default) | Most installations | Nginx, API, scheduler and PostgreSQL 15 together in the `ghcr.io/installation-04/techbase` image, one data volume (`techibase_data`). See [Docker](#docker-self-hosted). |
| **Four containers** | Installations that want separate services | `./install.sh --multi`: `db`, `backend`, `scheduler`, `frontend` (`docker-compose.yml`). Still supported. |
| **With HTTPS** | Exposure to the Internet | A Caddy container obtains and renews the certificate. See [HTTPS](#https). |
| **Local development** | Contributing code | `scripts/dev-local.sh`, no Docker. See [Local development](#local-development-without-docker). |

## Version

The project is currently in **beta** (`0.0.x` versions, below `1.0.0`). The version number is kept in sync in `package.json` (root), `backend/package.json` and `frontend/package.json`: all three must stay identical at every deployment. The first `1.0.0` will mark the end of the beta.

The number is visible:
- in the app (bottom of the sidebar);
- through the API: `GET /api/health` returns `{ "status": "ok", "version": "0.0.x" }`;
- in the published Docker images: tag `X.Y.Z`.

See [CHANGELOG.md](CHANGELOG.md) (in French) for the details of each published version, and [versions and updates](docs/versions-et-mises-a-jour.md) (in French) to update, roll back or pin a version.

**Image tags** (`ghcr.io/installation-04/techbase`, for amd64 and arm64): `X.Y.Z` (exact, immutable), `X.Y` (latest fix of that series), `sha-<commit>`, and `latest` (latest stable version; never an `-rc` version). For production, pin `X.Y.Z`. The `techbase-backend` and `techbase-frontend` images serve the four-container stack.

### Publishing a version

For maintainers: the `scripts/release.sh X.Y.Z` script prepares the version, then you push the branch and the tag:

```bash
scripts/release.sh X.Y.Z
git push origin main && git push origin vX.Y.Z
```

Each version is published by the **Release** workflow (`.github/workflows/release.yml`): it checks the version, runs the whole CI on the commit, builds the images, starts the full stack from them and runs the end-to-end test, then publishes the images and creates the GitHub release with its install package.

The full procedure (rehearsal without publishing, safeguards, switching the packages to **Public** the first time, what to do after a failed publish) is in [Versions and releases](docs/versions-et-releases.md) (in French).

## Docker (self-hosted)

The whole platform runs in Docker; Netlify is not needed. A new installation uses **a single container** (`docker-compose.single.yml`: nginx, API, scheduler and PostgreSQL, volume `techibase_data`); backup: `docker compose exec -T techibase techibase-backup > backup.tar.gz`. The sections below describe the **four-container stack** (`docker-compose.yml`), which is still supported; the details of both modes, migration and backup are in [docs/installation.md](docs/installation.md) (in French).

| Container | Role |
|-----------|------|
| `db` | PostgreSQL 15 (volume `db_data`) |
| `backend` | The Express API. Runs as an unprivileged user; documents are stored in the `uploads` volume. Not exposed to the host: reached only through `frontend` |
| `scheduler` | The daily tasks: generating preventive work orders and the email digest to admins (the equivalent of the Netlify scheduled function) |
| `frontend` | The web app served by nginx (gzip, long cache for fingerprinted files, security headers); the only entry point, published on `HTTP_PORT` (26591 by default) |

**Installation**: `./install.sh` (see [Install TechIBase](#install-techibase)). The script only reports "ready" when all services are actually healthy, and shows the status and logs otherwise.

**Configuration**: everything goes through the `.env` file (template: `.env.example`). Useful variables under Docker:

| Variable | Role |
|----------|------|
| `JWT_SECRET` | **Required.** Startup fails if it is missing. ⚠️ Do not change it on an existing installation: it also encrypts the password vault |
| `DB_PASSWORD`, `DB_NAME`, `DB_USER` | Database access |
| `HTTP_PORT` | Port published by the app (26591 by default; `80` for an address without a port) |
| `TZ` | Containers' time zone (e.g. `America/Toronto`), which determines the scheduler's time |
| `SCHEDULER_TIME` | Time of the scheduler's daily run, `HH:MM` (default `06:00`, in the `TZ` time zone) |
| `RUN_ON_START` | `true` to also run the tasks when the container starts |
| `RESEND_API_KEY`, `EMAIL_FROM` | Emails (assignments, daily digest) |
| `GOOGLE_*`, `MICROSOFT_*`, `PUBLIC_URL`, `FRONTEND_URL` | SSO |
| `ACUMATICA_*` | Optional shared Acumatica account |

After editing `.env`: `docker compose up -d` (the affected containers are recreated).

**Scheduler**: `docker compose logs scheduler` shows the next run. To trigger the tasks immediately: `docker compose exec scheduler node src/scheduler.js --once`. They are idempotent: running them again creates no duplicates.

**Ports**

| Service | Port |
|---------|------|
| Web app (nginx) | `26591` by default (`HTTP_PORT`): the only port published by Docker Compose |
| Caddy (HTTPS, optional) | `80` and `443` |
| API (Express) | `3001`, internal only: reached through the web app (`/api`), not published |
| PostgreSQL | `5432`, internal only |

### Updating

**With the quick command or the release package**: run the install command again, or change `TECHIBASE_VERSION` in `.env` (or set `latest`), then `docker compose pull && docker compose up -d`. The volumes (`db_data`, `uploads`) are kept. **Rolling back**: put the old version back and run the same command; this is safe for your data as long as no version changed the database schema (read the CHANGELOG before downgrading).

**From source:**

```bash
git pull
docker compose up -d --build --wait
scripts/docker-smoke.sh   # optional: checks everything end to end
```

The volumes (`db_data`, `uploads`) are kept, along with existing accounts and documents. Things to know if you are coming from an earlier version of `docker-compose.yml`:
- `JWT_SECRET` must now be set in `.env` (previously an insecure default was silently used). Keep your current value, otherwise the vault passwords become unreadable.
- The API's port `3001` is no longer published on the host; everything goes through the web app.
- The API now runs unprivileged; the `uploads` volume permissions are fixed automatically at startup.
- The `scheduler` container is new: the daily tasks now also run under Docker.

### HTTPS

To expose the app on the Internet, use the `docker-compose.https.yml` file: a Caddy container automatically obtains and renews the certificate (Let's Encrypt), redirects HTTP to HTTPS and adds HSTS.

1. Point your domain's DNS at the server and open ports 80 and 443.
2. In `.env`: `DOMAIN=app.example.com` and `PUBLIC_URL=https://app.example.com` (the SSO return address).
3. Start with both files: `docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build --wait`

**Installation by the quick command or the release package**: the `.env` there defines `COMPOSE_FILE` (published images), and `-f` options on the command line **replace** it. Instead, add the HTTPS file to the list in `.env`: `COMPOSE_FILE=docker-compose.yml:docker-compose.release.yml:docker-compose.https.yml`, then `docker compose up -d --wait`.

Caddy then becomes the only public entry point. To try it locally, set `DOMAIN=localhost` (certificate issued by Caddy's local authority; the browser will ask you to accept it).

### Backup and restore

Two things to back up: the database and the documents folder (in single-container mode: `docker compose exec -T techibase techibase-backup > backup.tar.gz`, see [docs/installation.md](docs/installation.md)). For the four-container stack:

```bash
# Backup
docker compose exec -T db sh -c 'pg_dump --clean --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > techibase-db-$(date +%F).sql.gz
docker compose cp backend:/app/uploads ./techibase-uploads-$(date +%F)

# Restore (the current database content is replaced)
docker compose stop backend scheduler
gunzip -c techibase-db-2026-01-01.sql.gz | docker compose exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose cp ./techibase-uploads-2026-01-01/. backend:/app/uploads
docker compose start backend scheduler && docker compose restart backend
```

Remember to copy these files off the server. The database and document backups must come from the same moment.

## How it works

### Roles

- **Administrator**: full access, user management, client deletion, administration and audit log.
- **User** (the technician): read/write access to all business modules.

### Authentication

Three ways to sign in, configurable independently:

- **Local account** (email + password): always available, no configuration required.
- **Self-registration**: anyone can create an account through "Créer un compte". The first account created becomes admin; later ones are created with the "Utilisateur" role. ⚠️ Since the app stores sensitive client credentials, consider restricting registration (see the note below) once the initial admin exists.
- **Google / Microsoft 365 SSO**: optional, off by default. The SSO buttons only appear on the sign-in screen if the matching environment variables are set.

<details>
<summary>Set up Google or Microsoft 365 SSO</summary>

<br>

**Google SSO**

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create Credentials → OAuth client ID → type **Web application**.
2. Add as an authorized redirect URI: `https://<your-domain>/api/auth/google/callback`
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (environment variables of the Netlify site, or `.env` locally and under Docker).

**Microsoft 365 SSO**

1. [Azure portal](https://portal.azure.com/) → Microsoft Entra ID → App registrations → New registration (type **Web**).
2. Add as a redirect URI: `https://<your-domain>/api/auth/microsoft/callback`
3. Certificates & secrets → generate a new client secret.
4. Set `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`. By default (`MICROSOFT_TENANT_ID` not set), personal Microsoft accounts and any work or school Microsoft 365 account are accepted: set `MICROSOFT_TENANT_ID` to restrict to a single organization.

**Note on self-registration.** Open registration is handy to get started, but TechIBase stores client passwords and credentials: once the initial admin is created, it is recommended to remove public registration (or limit it by email domain) for production use. This is not implemented yet; to be developed as needed (e.g. a domain allow-list, invitation by an admin).

</details>

### Modules

| Module | Description |
|--------|-------------|
| **Clients** | Client list with search, detail page per client |
| **Equipment** | Inventory per client (servers, PLCs, HMIs, network…) |
| **Work orders (BS)** | Planning and follow-up of interventions: status (open/assigned/in progress/done/cancelled), priority, assignment to a technician, due date. Global table view by status + a tab per client. Automatic preventive generation from the equipment's next maintenance date. |
| **Procedures** | Remote connection and on-site intervention procedures |
| **Passwords** | Credentials vault per client/equipment, AES-256 encrypted |
| **Contacts** | Technical contacts per client (name, role, phone, email) |
| **PPE** | List of personal protective equipment required per site |
| **Journal** | History of interventions per client |
| **Documents** | File library (PDFs, photos, manuals) per client |
| **Integrations** | Each user connects their own external ERP account (Acumatica) and syncs their clients, a tab per client file (see [ERP integration](#erp-integration)) |
| **Users** | Account management (Administrator / User), restricted to administrators |

### Global search and dashboard

The home page offers a global search across all clients, equipment and contacts, and shows real-time indicators (`GET /api/dashboard/summary`): number of clients, active work orders, overdue maintenance, low-stock PPE, work orders by status, and a chart of interventions over the last 6 months. The Work orders page offers a CSV export of the displayed list (filtered by technician where applicable).

### Notifications

- **In the app**: a bell in the top bar shows the number of unread notifications (refreshed every 60 s) and a dropdown with the history. A technician is notified as soon as a work order is assigned to them.
- **By email** (optional): if `RESEND_API_KEY` is set, the same assignments trigger an email, and a daily digest (overdue maintenance + low-stock PPE, threshold ≤ 2) is sent to all admins by the scheduled task. Without this variable everything keeps working: only in-app notifications are active. Get a key at [resend.com](https://resend.com) (no other configuration required).

### Automatic work order generation

A daily scheduled task automatically creates a preventive work order for any equipment whose next maintenance date (`next_maintenance`) falls within the next 7 days, with no duplicates (a database unique constraint while an auto-generated work order is active for that equipment). The same task sends the daily email digest (see Notifications).

Under Docker it is run by the scheduler (`backend/src/scheduler.js`, time adjustable with `SCHEDULER_TIME`), see [Docker](#docker-self-hosted); on Netlify, by the scheduled function `netlify/functions/maintenance-scheduler.js`. A preventive work order is created only once per maintenance date: completing or cancelling it does not recreate it; you must change the equipment's "next maintenance" to get a new one.

### ERP integration

TechIBase can sync its clients with an external ERP. The first connector implemented is **Acumatica** (contract-based REST API, session authentication).

- **Per user, not per deployment**: each user connects their own Acumatica account (instance URL, credentials, company/tenant) from the "Intégrations" tab of any client file. This is essential as soon as several contractors or companies share the same TechIBase deployment: each syncs their clients to their own Acumatica tenant, never to another user's. Credentials are encrypted (AES-256, same mechanism as the password vault, with a distinct salt) in `user_integration_credentials`.
- **What is synced**: TechIBase Clients ↔ Acumatica Customers (name, email, phone, address). Syncing is **manual**: a "Synchroniser avec Acumatica" button per client file, rather than an automatic sync that could create conflicts without supervision.
- **Idempotent, per user**: the `erp_links` table keeps, for each (user, TechIBase client), the matching Acumatica `CustomerID`. Two users can therefore sync the same TechIBase client to two different Acumatica accounts without collision, and syncing again updates the same record instead of creating a new one.
- **Optional shared account**: if `ACUMATICA_BASE_URL`/`ACUMATICA_USERNAME`/`ACUMATICA_PASSWORD`/`ACUMATICA_COMPANY` (see `.env.example`) are set as deployment environment variables, they serve as a fallback account for any user who has not yet connected their own, useful for a single company that prefers central configuration. A user who connects their own account uses it instead.
- **Testing the connection**: `POST /api/integrations/acumatica/test` (with my credentials) attempts a login/logout without touching any data, useful to validate credentials.
- **Extensibility**: the code is structured to add other ERPs easily: `backend/src/integrations/<provider>.js` for the API client, mounted in `backend/src/routes/integrations.js`, with the `erp_links` and `user_integration_credentials` tables already generic (`provider`, `entity_type`). No other connector (SAP, NetSuite, Dynamics, etc.) is implemented yet.

### Platform reliability

- **Automated tests**: a backend test suite (`npm test`) covering JWT token issuing, the validation middleware, the sign-up/sign-in flow (first account = admin, duplicates, invalid passwords…), uploaded document security, and, against a real PostgreSQL, automatic work order generation and PPE management. Tests that need a database read `TEST_DATABASE_URL` (e.g. `postgresql://techbase:techbase@127.0.0.1:5432/postgres`, the role must be able to create databases); without this variable they are simply skipped. CI provides it through a PostgreSQL container.
- **CI** (`.github/workflows/ci.yml`): on every push/PR, backend tests, frontend build, and a check that the Netlify Functions bundle correctly (the costliest class of bug met in deployment: backend dependencies missing from the root `package.json` that only Netlify can see).
- **Input validation**: shared validation middleware (`backend/src/middleware/validate.js`) applied to the authentication and work order routes.
- **Rate limiting**: a general limit on all `/api` routes (600 req/15 min), plus a strict limit on login/register (20 req/15 min).
- **Centralized error handling**: server errors never return internal details (SQL queries, stack traces) in production.

## For developers

**Stack**

- **Frontend:** React + Vite, Tailwind CSS, React Router
- **Backend:** Node.js + Express, REST API, JWT authentication
- **Database:** PostgreSQL
- **Deployment:** Docker (a single container, or the four-container stack with `./install.sh --multi`), optional HTTPS, or Netlify

### Local development without Docker

`scripts/dev-local.sh` starts everything locally, with no Docker or Netlify (so no build or function credits consumed): your PostgreSQL, the Express API and the Vite dev server.

```bash
scripts/dev-local.sh   # API on :3001, app on http://localhost:5173
```

It assumes a local PostgreSQL and a role able to create databases (by default `techbase` / `techbase` on `127.0.0.1:5432`; overridable through `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`). The database is created on first run and the schema is applied by the API. The Vite server proxies `/api` to `http://localhost:3001` (changeable with `VITE_PROXY_TARGET`).

<details>
<summary>Project structure</summary>

<br>

```
techbase/
├── docker-compose.yml        # db + backend + scheduler + frontend
├── docker-compose.https.yml  # optional HTTPS (Caddy)
├── docker-compose.release.yml # uses the published images (GHCR) instead of building
├── Caddyfile
├── get-techibase.sh          # one-command install from GitHub (curl ... | bash)
├── install.sh                # local install: random .env + start
├── docs/                     # documentation (wiki) with screenshots
├── scripts/                  # dev-local.sh, docker-smoke.sh, bump-version.js, release-notes.js
├── .env.example
├── package.json              # Mirror deps for the Netlify Functions bundler
├── netlify.toml
├── netlify/
│   ├── functions/            # api.js (Express backend), maintenance-scheduler.js (daily cron)
│   └── database/migrations/  # Schema applied automatically by Netlify DB
├── backend/
│   ├── Dockerfile            # used by `backend` and `scheduler`
│   ├── db/init.sql          # PostgreSQL schema (auto-run on first start, Docker)
│   ├── test/                 # node --test: token, validation, sign-up/sign-in, documents, daily tasks
│   └── src/
│       ├── app.js            # Express setup (routes, middlewares), reused by index.js and the Functions
│       ├── index.js           # Standalone entry point (Docker)
│       ├── scheduler.js       # Daily scheduler (`scheduler` container)
│       ├── db.js              # Postgres pool (Netlify DB or DB_* depending on the environment)
│       ├── middleware/       # auth, validate
│       ├── lib/               # token, respond, email, notify, daily tasks (maintenance, digest)
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

</details>

<details>
<summary>Environment variables</summary>

<br>

Copy `.env.example` to `.env` and adjust the values (`./install.sh` does it with random secrets). The Docker-specific variables (`HTTP_PORT`, `TZ`, `SCHEDULER_TIME`, `RUN_ON_START`, `DOMAIN`…) are detailed in [Docker](#docker-self-hosted).

| Variable | Description |
|----------|-------------|
| `DB_HOST` | PostgreSQL host (set to `db` by Docker Compose) |
| `DB_PORT` | PostgreSQL port (default: `5432`) |
| `DB_NAME` | Database name |
| `DB_USER` | PostgreSQL user |
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET` | Secret key for JWT tokens (required in production) |

</details>

<details>
<summary>Netlify deployment</summary>

<br>

> ⚠️ **Netlify no longer builds this project** (see "Netlify no longer builds the project" below): the following steps only apply after removing the `ignore` line from `netlify.toml`. The current delivery method is Docker.

The application can be deployed entirely on Netlify:

- **Frontend**: static React build (`netlify.toml`, published from `frontend/dist`)
- **Backend**: the Express API is packaged as a Netlify Function (`netlify/functions/api.js`, served on `/api/*`, same domain as the frontend: no CORS to configure)
- **Database**: [Netlify DB](https://docs.netlify.com/build/data-and-storage/netlify-db/) (managed PostgreSQL, powered by Neon), provisioned automatically, no connection string to manage by hand
- **Documents**: stored in [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/) instead of local disk

**Steps**

1. Netlify Database (Postgres/Neon) is provisioned automatically on the first deployment and injects the `NETLIFY_DATABASE_URL` variable, read directly by `backend/src/db.js`: no module or manual configuration required.
2. The database schema is applied automatically through the migrations in `netlify/database/migrations/`.
3. On Netlify, create a new site from this repository (the `netlify.toml` configuration handles the frontend build and the functions folder).
4. Set `JWT_SECRET` in the Netlify site's environment variables (required in production: startup fails if it is missing).
5. Deploy. The frontend calls the API relatively (`/api/...`), which is automatically routed to the serverless function on the same domain.

**Netlify no longer builds the project.** `netlify.toml` contains `ignore = "exit 0"` in `[build]`: Netlify skips all builds (production, previews and branch deploys), so no more build credits are consumed. Versions are now delivered as Docker images (see [Publishing a version](#publishing-a-version)). The Netlify site already online keeps serving its last deployment, and its functions (including the daily task) keep running until you suspend the site in the Netlify dashboard. To have Netlify build again, remove the `ignore` line.

**Alternative: Netlify frontend + separately hosted backend.** If you prefer to host the backend elsewhere (Render, Railway, Fly.io…) rather than through Netlify Functions:

1. Deploy `backend/` + PostgreSQL on that host with the variables from `.env.example`, setting `CORS_ORIGIN` to the frontend's Netlify URL.
2. In the Netlify site settings, set `VITE_API_URL` to the backend's public URL (without a trailing `/api`).
3. Remove or adapt `[functions]` in `netlify.toml` if Netlify Functions are not used.

</details>

## Documentation and contributing

- [Full documentation with screenshots](docs/README.md) (in French): [installation](docs/installation.md), [getting started](docs/premiers-pas.md), [client file](docs/fiche-client.md), [work orders](docs/bons-de-service.md), [search and notifications](docs/recherche-et-notifications.md), [administration](docs/administration.md), [versions and updates](docs/versions-et-mises-a-jour.md), [troubleshooting](docs/depannage.md).
- [Changelog](CHANGELOG.md) (in French).
- Contributions go through a pull request to `main`; CI must pass (`npm test`, frontend build, Netlify Functions bundle).

## License

No license file is published in this repository for now.
