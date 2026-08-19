# Journal des versions (Changelog)

Toutes les versions notables de TechIBase sont documentées ici. Le projet est en **bêta** (`0.0.x`), voir [README.md#version](README.md#version) pour la convention de version.

## [0.0.5] - Intégration ERP Acumatica par utilisateur

- L'intégration Acumatica est désormais **par utilisateur** : chaque utilisateur connecte et synchronise son propre compte/tenant Acumatica depuis l'onglet Intégrations d'une fiche client, au lieu de partager un seul jeu d'identifiants au niveau du déploiement.
- Les identifiants restent disponibles en repli optionnel (variables d'environnement `ACUMATICA_*`) pour un déploiement mono-tenant.
- PR: #10

## [0.0.4] - Intégration ERP Acumatica (aperçu)

- Première intégration ERP : synchronisation manuelle Clients ↔ Customers avec Acumatica (API REST contract-based, authentification par session).
- PR: #9

## [0.0.3] - Phase 2 : tableau de bord, analytique et notifications

- Tableau de bord avec indicateurs clés (interventions, équipements, bons de service).
- Système de notifications in-app et par courriel.
- PR: #8

## [0.0.2] - Bons de service, robustesse et terminologie

- Ajout des bons de service (BS) : création, assignation, suivi de statut, planification préventive automatique.
- Renommage de « ordre de travail » vers « bon de service (BS) / service order » dans toute l'interface, pour refléter l'usage envers les clients des entrepreneurs.
- Durcissement de la plateforme (validation des entrées, limites de débit, etc.).
- PRs: #6, #7

## [0.0.1] - Déploiement Netlify et authentification

- TechIBase déployé entièrement sur Netlify (Functions, Netlify DB, Netlify Blobs).
- Correction de la connexion cassée en production (`trust proxy` avec le limiteur de débit).
- Auto-inscription (le premier compte créé devient administrateur) et authentification SSO Google / Microsoft 365, en plus des comptes locaux.
- Numérotation de version bêta (`0.0.x`) ajoutée à l'application et à `GET /api/health`.
- PRs: #3, #4, #5
