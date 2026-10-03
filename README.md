# TransportFlow — Web Administration des missions de transport

Plateforme d'administration pour piloter le cycle de vie complet des missions de transport :
**référence → mission → affectation → prise en charge → en cours → terminée**, avec documents,
historique, audit et notifications. Elle sert aussi de backend à la future **application Mobile Chauffeur**.

> « L'administrateur pilote. Le chauffeur exécute. La plateforme trace. »

```
              ┌─────────────────────────┐
              │       WEB ADMIN         │   React 18 + TypeScript + Tailwind
              └────────────┬────────────┘
                     HTTPS / REST / JSON          (aucun accès SQL côté navigateur)
              ┌────────────▼────────────┐
              │   ASP.NET Core 8 API    │   JWT · rôles · validation · audit · Swagger · /health
              └───────┬─────────┬───────┘
               EF Core│         │IFileStorageService
              ┌───────▼───┐ ┌───▼──────────────┐
              │ SQL Server│ │ Stockage fichiers │   (local aujourd'hui, Azure Blob / S3 demain)
              └───────────┘ └──────────────────┘
```

---

## Version de démonstration en ligne (gratuite)

Une version **autonome** du site est publiée automatiquement sur GitHub Pages à chaque envoi sur `main` :
**https://yassineelhif5-pixel.github.io/TransportFlow/** (identifiants préremplis : `admin` / `admin`).

- Elle présente le design et toutes les fonctionnalités (missions, affectation, statuts, documents, import, historique…).
- L'API y est **simulée dans le navigateur** avec des données fictives (`frontend/src/demo/`) : aucun serveur,
  aucune base de données. Les modifications restent dans le navigateur du visiteur (bouton « Réinitialiser »).
- Activation (une seule fois) : **Settings › Pages › Source : GitHub Actions**. Workflow : `.github/workflows/deploy-demo.yml`.
- Build local : `cd frontend && npm run build:demo && npm run preview:demo` → http://localhost:3000/TransportFlow/

La vraie application (API ASP.NET Core + SQL Server) fonctionne comme décrit ci-dessous.

---

## 1. Prérequis

| Outil | Version |
|---|---|
| .NET SDK | 8.0 |
| Node.js | 20 ou 22 (npm 10) |
| SQL Server | 2019 / 2022 (Developer ou Express), ou Docker |
| Outil EF Core | `dotnet tool install --global dotnet-ef --version 8.*` |
| Docker (optionnel) | Docker Desktop / Engine + Compose v2 |

## 2. Structure du projet

```
TransportFlow/
├── backend/
│   ├── TransportFlow.sln
│   ├── src/
│   │   ├── Transport.Domain/          Entités, codes métier (statuts, rôles, actions d'audit)
│   │   ├── Transport.Application/     DTO, services métier, validateurs FluentValidation, interfaces
│   │   ├── Transport.Infrastructure/  DbContext EF Core, configurations Fluent API, seed,
│   │   │                              JWT, hachage, stockage documentaire, CSV/XLSX
│   │   └── Transport.Api/             Contrôleurs REST, middleware, Swagger, health checks
│   └── tests/Transport.Tests/         Tests unitaires, d'intégration (EF InMemory) et API (WebApplicationFactory)
├── frontend/                          React + TypeScript (Vite, Tailwind, Recharts, Lucide)
│   └── src/ api · auth · components · features · hooks · layouts · pages · routes · types · utils
├── scripts/                           Génération de la migration EF Core (bash / PowerShell)
├── docker-compose.yml                 SQL Server + API + Web + volume documents
└── .env.example
```

## 3. Démarrage rapide avec Docker (recommandé)

```bash
cp .env.example .env            # puis personnalisez JWT_SECRET et SQL_SA_PASSWORD
docker compose up --build
```

- Application : **http://localhost:3000**
- API + Swagger : http://localhost:5000/swagger
- Santé : http://localhost:5000/health

Au premier démarrage l'API attend SQL Server, crée la base, les tables, les rôles, les statuts,
les types de documents, le compte administrateur et (en Development) un jeu de démonstration.

## 4. Installation manuelle (sans Docker)

### 4.1 SQL Server
Utilisez une instance locale, ou lancez seulement le conteneur SQL :
```bash
docker compose up -d sqlserver
```
Chaîne de connexion de développement (déjà présente dans `appsettings.Development.json`) :
```
Server=localhost,1433;Database=TransportFlow;User Id=sa;Password=TransportFlow_Dev2026!;TrustServerCertificate=True;Encrypt=False
```
Pour une autre instance, surchargez-la sans modifier les fichiers versionnés :
```bash
cd backend/src/Transport.Api
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Server=...;Database=TransportFlow;..."
```

### 4.2 Backend
```bash
cd backend
dotnet restore
dotnet build
```

### 4.3 Migration de la base (à faire une fois, avant le premier lancement)
```bash
./scripts/add-migration.sh            # Linux / macOS
.\scripts\add-migration.ps1           # Windows
```
La migration est générée dans `Transport.Infrastructure/Data/Migrations` (à versionner) et
**appliquée automatiquement au démarrage** de l'API (`Database.Migrate()`).
Commande manuelle équivalente : `dotnet ef database update -p src/Transport.Infrastructure -s src/Transport.Api`.

> Si aucune migration n'existe, l'API crée le schéma avec `EnsureCreated()` pour ne pas bloquer
> un premier essai. Dans ce cas, avant d'introduire les migrations, supprimez la base de développement.

### 4.4 Seed
Exécuté automatiquement à chaque démarrage (idempotent) :
1. vérification de SQL Server (12 tentatives, pratique avec Docker) ;
2. migrations ;
3. rôles `ADMIN`, `DRIVER` ;
4. statuts `CREATED … ANOMALY` (libellés français) ;
5. types de documents (bon de transport, CMR, photos, preuve de livraison…) ;
6. paramètres système ;
7. compte administrateur (mot de passe **haché PBKDF2**, jamais en clair) ;
8. **Development uniquement** : clients, véhicules, chauffeurs (avec accès mobile), ~35 missions dans tous
   les statuts, historiques, affectations, audit et notifications (désactivable : `Seed:DemoData=false`).

### 4.5 Lancer l'API
```bash
cd backend/src/Transport.Api
dotnet run --launch-profile http        # http://localhost:5000  (profil https : https://localhost:5001)
```
Swagger : http://localhost:5000/swagger — cliquez **Authorize** et collez l'`accessToken` obtenu via `POST /api/auth/login`.

### 4.6 Lancer le frontend
```bash
cd frontend
npm install
npm run dev                              # http://localhost:3000
```
Vite relaie `/api` et `/health` vers `http://localhost:5000` (`VITE_API_PROXY_TARGET`, voir `frontend/.env.example`).

## 5. Identifiants de développement

| | |
|---|---|
| **Username** | `admin` |
| **Password** | `admin` |
| Comptes chauffeurs de démo | `mohamed.benali` (etc.) / `Chauffeur2026!` — API mobile uniquement |

> ⚠️ **Ces identifiants sont uniquement destinés au développement local.**
> En environnement **Production**, aucun mot de passe par défaut n'est utilisé : l'API refuse de démarrer
> tant que `SEED_ADMIN_PASSWORD` (12 caractères minimum, différent de « admin ») n'est pas fourni, et le
> changement de mot de passe est imposé à la première connexion.

## 6. Configuration & variables d'environnement

| Variable | Rôle |
|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Development`, `Test` ou `Production` |
| `ConnectionStrings__DefaultConnection` | Chaîne SQL Server (**backend uniquement**) |
| `Jwt__Secret` | Clé de signature JWT, ≥ 32 caractères — obligatoire |
| `Jwt__AccessTokenMinutes` / `Jwt__RefreshTokenDays` | Durées de vie (60 min / 30 j par défaut) |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_EMAIL` | Compte administrateur initial |
| `Cors__AllowedOrigins__0` | Origine autorisée (ex. `https://admin.mondomaine.fr`) |
| `Storage__RootPath` / `Storage__MaxFileSizeMb` | Dossier du stockage documentaire / taille max (10 Mo) |
| `Swagger__Enabled` | Active Swagger hors Development |
| `RateLimit__AuthPermitLimit` | Tentatives de connexion par minute et par IP (10) |
| `VITE_API_URL` (frontend) | URL de l'API si elle n'est pas servie sur la même origine |

`appsettings.json` ne contient **aucun secret**. `appsettings.Development.json` contient uniquement des
valeurs de développement local clairement identifiées. En production : variables d'environnement,
`dotnet user-secrets`, Azure Key Vault ou équivalent.

## 7. Sécurité

- **Mots de passe** hachés (PBKDF2-HMAC-SHA512, sel aléatoire, ASP.NET Core Identity), politique de complexité.
- **JWT** signé HS256, durée limitée, validé à chaque requête : signature, émetteur, audience, expiration,
  **compte actif**, **rôle** et **security stamp** (déconnexion / changement de mot de passe = révocation immédiate).
- **Refresh token** aléatoire (384 bits), stocké **haché** (SHA-256), rotation à chaque usage.
- **Verrouillage** du compte après 5 échecs (15 min) + **limitation de débit** sur `/api/auth/*`.
- **Autorisation par rôle** : toute l'administration exige `ADMIN` ; politique par défaut = authentifié ;
  l'API chauffeur (`/api/driver/*`) ne voit que les missions du chauffeur connecté.
- **Uploads** : extension autorisée, type MIME, **signature binaire (magic bytes)**, taille, nom nettoyé,
  nom physique = GUID, anti path-traversal, empreinte SHA-256, fichier jamais servi directement.
- **Exports** protégés contre l'injection de formules CSV.
- **En-têtes** : CSP, X-Frame-Options, nosniff, Referrer-Policy, HSTS + redirection HTTPS en production.
- **Erreurs** : format unique `{ success:false, message, code, errors }`, jamais d'exception SQL exposée.
- **Journaux** : logs techniques (requêtes, erreurs) séparés de l'**audit métier** (table `AuditLog`) ;
  ni mot de passe ni jeton ne sont journalisés.

## 8. API REST (extrait)

Réponses de succès : `{ "success": true, "data": … , "message": … }` — erreurs : `{ "success": false, "message", "code", "errors" }`.

| Domaine | Endpoints |
|---|---|
| Auth | `POST /api/auth/login` · `POST /api/auth/refresh` · `POST /api/auth/logout` · `POST /api/auth/change-password` · `GET/PUT /api/auth/me` |
| Dashboard | `GET /api/dashboard` · `/kpis` · `/missions-by-status` · `/missions-by-driver` · `/missions-by-client` · `/recent-activity` |
| Missions | `GET/POST /api/missions` · `GET/PUT/DELETE /api/missions/{id}` · `POST /{id}/assign` · `POST /{id}/status` · `GET /{id}/history` · `GET/POST /{id}/documents` · `GET /statuses` · `GET /export?format=csv\|xlsx` |
| Références | `GET/POST /api/references` · `GET/PUT/DELETE /{id}` · `POST /import?commit=false\|true` · `GET /import-template` · `GET /export` |
| Chauffeurs | `GET/POST /api/drivers` · `GET/PUT /{id}` · `PATCH /{id}/status` · `GET /export` |
| Clients | `GET/POST /api/clients` · `GET/PUT /{id}` · `PATCH /{id}/status` |
| Véhicules | `GET/POST /api/vehicles` · `GET/PUT /{id}` · `PATCH /{id}/status` |
| Documents | `GET /api/documents` · `GET /types` · `GET /{id}/download` · `DELETE /{id}` (suppression logique) |
| Historique | `GET /api/history` · `GET /filters` · `GET /export` |
| Notifications | `GET /api/notifications` · `GET /unread-count` · `POST /{id}/read` · `POST /read-all` |
| Utilisateurs | `GET/POST /api/users` · `GET/PUT /{id}` · `PATCH /{id}/status` · `POST /{id}/reset-password` |
| Divers | `GET /api/search?q=` · `GET/PUT /api/settings` · `GET /health` |
| **Mobile chauffeur** | `GET /api/driver/missions` · `GET /missions/by-reference/{ref}` · `GET /missions/{id}` · `POST /missions/{id}/status` (commentaire + GPS) · `GET/POST /missions/{id}/documents` |

## 9. Stockage documentaire

```
POST /api/missions/{id}/documents   (multipart/form-data : file, documentTypeId, comment)
  → JWT + rôle → mission existante → taille / extension / MIME / signature
  → IFileStorageService.UploadAsync (nom GUID, dossier année/mois, SHA-256)
  → ligne Document (métadonnées) → AuditLog DOCUMENT_UPLOAD → JSON
```
`LocalFileStorageService` écrit dans `Storage:RootPath` (volume Docker `documents`). Pour Azure Blob ou un
Object Storage, implémentez `IFileStorageService` et changez l'enregistrement dans
`Transport.Infrastructure/DependencyInjection.cs` : ni l'API ni le frontend ne changent.

## 10. Règles métier implémentées

- Une référence est unique ; une mission est toujours liée à une référence (créée à la volée si besoin).
- Affectation refusée si le chauffeur est désactivé, sans compte utilisateur actif ou si son permis a expiré ;
  véhicule en maintenance / hors service refusé.
- Les affectations successives sont conservées (`ACTIVE` → `REPLACED` / `ENDED`).
- Machine à états des statuts (ex. impossible de passer de « Créée » à « Terminée ») ; une anomalie exige un commentaire.
- Chaque changement de statut : mise à jour de la mission + `MissionStatusHistory` + `AuditLog` + notification.
- Mission terminée ou annulée : verrouillée. Suppression d'une mission uniquement si créée/annulée (logique).
- Documents toujours liés à une mission ; suppression logique ; historiques jamais supprimés (aucune cascade).

## 11. Tests

```bash
cd backend && dotnet test          # unitaires, intégration (EF InMemory), API (WebApplicationFactory)
cd frontend && npm test            # Vitest + Testing Library
```
Couverture fonctionnelle : login / JWT / refresh / logout, verrouillage, permissions ADMIN vs DRIVER,
création / modification de mission, affectation et réaffectation, changements de statut, import CSV
(prévisualisation puis confirmation), upload / téléchargement / suppression de document, audit, parsing CSV/XLSX,
sécurité des fichiers, client HTTP (refresh automatique, fin de session).

## 12. Scénario de recette (bout en bout)

1. `docker compose up --build` (ou SQL Server + `dotnet run` + `npm run dev`).
2. Ouvrir http://localhost:3000 → page de connexion.
3. Saisir `admin` / `admin` → `POST /api/auth/login` → JWT → redirection vers `/dashboard` (KPI calculés par SQL Server).
4. **Références › Nouvelle référence** (ou **Importer** un CSV/XLSX : analyse → prévisualisation → confirmation).
5. **Missions › Nouvelle mission** → Enregistrer et affecter → choisir un chauffeur et un véhicule.
6. Sur la fiche mission : **Changer le statut** (À prendre en charge → Prise en charge…).
7. **Ajouter document** (PDF/JPG/PNG/DOCX) → fichier présent dans `storage/documents/AAAA/MM/` (ou volume Docker),
   métadonnées dans la table `Document`, entrée `DOCUMENT_UPLOAD` dans `AuditLog`.
8. Télécharger le document (`GET /api/documents/{id}/download`).
9. **Historique** : toutes les actions avec utilisateur, date, IP, anciennes/nouvelles valeurs.

## 13. Préparation du déploiement

- Générer et versionner la migration (`scripts/add-migration.*`), ou produire un script SQL idempotent :
  `dotnet ef migrations script --idempotent -p src/Transport.Infrastructure -s src/Transport.Api -o deploy.sql`.
- Définir `ASPNETCORE_ENVIRONMENT=Production`, `Jwt__Secret`, la chaîne SQL, `SEED_ADMIN_PASSWORD`,
  `Cors__AllowedOrigins__0` (domaine officiel uniquement).
- Servir le frontend (`npm run build` → `dist/`) derrière Nginx (voir `frontend/nginx.conf`) en HTTPS.
- Monter un volume persistant (ou un stockage objet) pour les documents et le sauvegarder avec la base.
