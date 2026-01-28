# Notes Techniques - La Forge v1.2.1

## Derniere mise a jour: 2026-01-28

---

## Resume de l'Application

La Forge est une application Tauri (Rust + React) pour la gestion de projets web. Elle permet de:
- Gerer des projets clients avec FTP/SFTP
- Scraper des sites existants pour recuperer contenus et assets
- Synchroniser des fichiers vers des serveurs distants
- Generer de la documentation automatique

---

## Architecture

### Stack Technique

| Composant | Technologie |
|-----------|-------------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Rust + Tauri 1.x |
| State Management | Zustand |
| Drag & Drop | @dnd-kit/core |
| Styles | CSS custom (pas de framework) |

### Structure des Dossiers

```
src/
├── components/              # Composants UI principaux (28 fichiers)
│   ├── ui/                  # Composants reutilisables (12 fichiers)
│   │   ├── Badge.tsx        # Badges de statut
│   │   ├── Button.tsx       # Bouton generique
│   │   ├── Card.tsx         # Conteneur carte
│   │   ├── ContextMenu.tsx  # Menu contextuel clic-droit
│   │   ├── Input.tsx        # Champ de saisie
│   │   ├── Modal.tsx        # Fenetre modale
│   │   ├── Switch.tsx       # Toggle switch
│   │   ├── Tabs.tsx         # Navigation par onglets
│   │   └── TreeView.tsx     # Arborescence fichiers
│   ├── AboutModal.tsx       # A propos de l'app
│   ├── CreateProject.tsx    # Formulaire creation projet
│   ├── ImportProjectModal.tsx # Import projet existant
│   ├── DeltaSyncStats.tsx   # Stats sync incrementale
│   ├── FilterBar.tsx        # Barre filtres expansible
│   ├── FTPLogWindow.tsx     # Console logs FTP
│   ├── FullSiteScraper.tsx  # Scraping complet de site
│   ├── Header.tsx           # En-tete application
│   ├── MiniSidebar.tsx      # Navigation compacte
│   ├── Notifications.tsx    # Systeme de toast
│   ├── PostSyncHooks.tsx    # Webhooks post-sync
│   ├── PreviewLinkGenerator.tsx # Liens de preview client
│   ├── ProjectCard.tsx      # Carte projet (vue grille)
│   ├── ProjectDashboard.tsx # Dashboard avec stats
│   ├── ProjectDetail.tsx    # Detail projet (1572 lignes)
│   ├── ProjectForm.tsx      # Formulaire edition
│   ├── ProjectList.tsx      # Liste des projets
│   ├── ProjectListRow.tsx   # Ligne projet (vue liste)
│   ├── ReorganizeProjectModal.tsx # Reorganisation dossiers
│   ├── ScrapingPage.tsx     # Page scraping dediee (885 lignes)
│   ├── Settings.tsx         # Formulaire settings
│   ├── SettingsPage.tsx     # Page settings complete
│   ├── SmartPaste.tsx       # Import credentials auto
│   ├── SyncRulesPanel.tsx   # Regles d'exclusion sync
│   ├── SyncScheduler.tsx    # Planification sync
│   ├── SyncStatusBadge.tsx  # Badge statut sync
│   ├── TimeTracker.tsx      # Timer et facturation
│   └── VersionHistory.tsx   # Historique versions
├── features/
│   ├── projects/
│   │   ├── components/      # 9 composants FTP et fichiers
│   │   │   ├── FTPConnectionCard.tsx  # Connexion FTP
│   │   │   ├── FTPSection.tsx         # Section principale
│   │   │   ├── FTPSmartPaste.tsx      # Import auto credentials
│   │   │   ├── FTPSyncCard.tsx        # Parametres sync
│   │   │   ├── GeneralSection.tsx     # Infos generales
│   │   │   ├── ProjectDetailHeader.tsx # En-tete projet
│   │   │   ├── ProjectFileTree.tsx    # Arborescence (427 lignes)
│   │   │   └── SyncProgress.tsx       # Progression temps reel
│   │   ├── tabs/
│   │   │   └── GeneralTab/  # Onglet general
│   │   │       ├── ClientProfileCard.tsx
│   │   │       ├── DesignAnalysisCard.tsx
│   │   │       └── ProjectInfoCard.tsx
│   │   ├── modals/
│   │   │   └── DeleteProjectModal.tsx
│   │   ├── hooks/           # 5 hooks extraits
│   │   │   ├── useFTPConnection.ts
│   │   │   ├── useFileTree.ts
│   │   │   ├── useFileTreeContextMenu.ts
│   │   │   ├── useFileTreeDragAndDrop.ts
│   │   │   └── useFileTreeModals.ts
│   │   └── utils/
│   │       └── ftpCredentialsParser.ts
│   ├── scraping/
│   │   └── components/
│   │       ├── ScrapingPanel.tsx    # Panneau scraping
│   │       └── ScrapingProgress.tsx # Stepper progression
│   └── settings/
│       └── components/      # 8 sections settings
│           ├── AutoOrganizeSection.tsx
│           ├── BackupSection.tsx
│           ├── BillingSection.tsx    # Onglet Facturation (v1.2.0)
│           ├── FolderStructureSection.tsx
│           ├── GeminiSection.tsx
│           ├── IDEMonitoringSection.tsx
│           ├── MacOSSettingsSection.tsx
│           └── WorkspaceSection.tsx
├── services/                # 20 services metier
│   ├── backupService.ts     # Sauvegarde projets
│   ├── briefGenerator.ts    # Generation briefs Markdown
│   ├── configStore.ts       # Wrapper Tauri Store
│   ├── deltaService.ts      # Calcul delta sync
│   ├── documentationService.ts # Generation docs
│   ├── fileSystemService.ts # Operations fichiers
│   ├── fileWatcherService.ts # Surveillance fichiers
│   ├── fullSiteScraperService.ts # Scraping complet
│   ├── geminiService.ts     # Coordination Gemini
│   ├── previewService.ts    # Liens preview
│   ├── projectReorganizeService.ts # Reorganisation
│   ├── projectService.ts    # CRUD projets
│   ├── scrapeCacheService.ts # Cache scraping
│   ├── scrapingExportService.ts # Export JSON/CSV/CSS
│   ├── scrapingService.ts   # Orchestration scraping
│   ├── settingsService.ts   # Gestion settings
│   ├── sftpService.ts       # Operations SFTP/FTP
│   ├── syncService.ts       # Orchestration sync
│   ├── templateService.ts   # Gestion templates
│   ├── transferResumeService.ts # Reprise transferts
│   ├── gemini/              # Module Gemini AI
│   │   ├── contentAnalyzer.ts
│   │   ├── ftpCredentialParser.ts
│   │   ├── geminiApiClient.ts
│   │   └── textProcessor.ts
│   └── documentation/       # Module documentation
│       ├── fileOrganizer.ts
│       ├── markdownGenerator.ts
│       └── webScraper.ts
├── stores/                  # 10 Zustand stores
│   ├── hooksStore.ts        # Gestion webhooks
│   ├── projectStore.ts      # Etat projets
│   ├── scheduleStore.ts     # Planification
│   ├── scrapingStore.ts     # Etat scraping (15.8KB)
│   ├── settingsStore.ts     # Preferences
│   ├── syncStore.ts         # Etat sync (22.8KB - plus gros)
│   ├── timeStore.ts         # Sessions temps
│   ├── uiStore.ts           # Etat UI
│   └── versionStore.ts      # Historique versions
├── hooks/                   # 12 hooks React
│   ├── useAsync.ts          # Operations async
│   ├── useClientProfile.ts  # Profil client
│   ├── useColorMerge.ts     # Fusion couleurs
│   ├── useFileWatcher.ts    # Surveillance fichiers
│   ├── useFilterPreferences.ts # Persistance filtres
│   ├── useMenuEvents.ts     # Events menu macOS
│   ├── useNotification.ts   # Notifications toast
│   ├── useProjectFiltering.ts # Filtrage projets
│   ├── useProjectForm.ts    # Formulaire projet
│   ├── useRetryCountdown.ts # Retry avec compte a rebours
│   ├── useScraping.ts       # Orchestration scraping
│   ├── useSyncEvents.ts     # Events sync
│   └── useSystemTray.ts     # Integration tray
└── types/                   # Types TypeScript
    └── index.ts             # Tous les types (SyncRules, TimeSession, etc.)
```

### Modules Rust (src-tauri/src/)

| Module | Description |
|--------|-------------|
| `main.rs` | Point d'entree, commandes Tauri, menu macOS |
| `scraper.rs` | Scraping basique de pages web |
| `tray.rs` | Menu du system tray |
| `watcher.rs` | Surveillance des fichiers (_Inbox) |
| `delta_sync.rs` | Synchronisation incrementale par chunks |
| `version_history.rs` | Snapshots et restauration |
| `scheduler.rs` | Planification des syncs (cron) |
| `parallel_sync.rs` | Transfert multi-connexions |
| `transfer_resume.rs` | Reprise des transferts interrompus |
| `full_site_scraper.rs` | Scraping complet de sites (crawl recursif) |
| `scrape_cache.rs` | Cache SHA-256 avec TTL configurable |

#### Details Modules Rust

**delta_sync.rs**
- Comparaison par chunks de fichiers
- Detection des modifications incrementales
- Hash MD5 pour verification integrite

**scrape_cache.rs**
- Hash SHA-256 des URLs et contenus
- TTL configurable (defaut: 7 jours)
- Stockage: `_Inbox/.scrape_cache.json`
- Evite les requetes repetees

**full_site_scraper.rs**
- Crawl recursif d'un site entier
- Extraction assets (images, CSS, JS)
- Limite de profondeur configurable
- Detection des liens internes vs externes

---

## Fonctionnalites Implementees

### 1. Interface Utilisateur

#### MiniSidebar
Navigation compacte avec:
- Logo La Forge
- Bouton Projets
- Bouton Scraping (page dediee)
- Bouton Settings

#### FilterBar
Barre de filtres expansible:
- Multi-selection des statuts (Prospect, En dev, Recette, Valide, Live, Archive)
- Tri par nom ou date
- Mode vue grille/liste
- Persistance des preferences via `useFilterPreferences`
- Animation d'expansion/reduction
- Compteur de projets filtres

#### FTPLogWindow
Console de logs FTP detaillee:
- Affichage temps reel des operations
- Niveaux de logs (info, warning, error)
- Filtrage par type d'operation
- Export des logs
- Auto-scroll avec option de pause

#### DeltaSyncStats
Statistiques de synchronisation incrementale:
- Nombre de fichiers modifies/ajoutes/supprimes
- Taille totale transferee
- Temps economise vs sync complete
- Visualisation graphique des changements

#### FullSiteScraper
Interface de scraping complet de site:
- URL de depart avec detection automatique du domaine
- Configuration de la profondeur de crawl
- Selection des types d'assets (images, CSS, JS, fonts)
- Progression en temps reel avec estimation
- Arborescence des fichiers recuperes

#### ReorganizeProjectModal
Modal de reorganisation des dossiers projet:
- Glisser-deposer pour reorganiser
- Detection des fichiers orphelins
- Suggestions de categorisation IA
- Preview avant application

#### ProjectCard (vue grille)
Carte projet compacte avec:
- Titre client/projet avec badge statut cliquable
- Boutons d'action: Finder, Site web, Sync
- Indicateur FTP compact (icone + "FTP"):
  - Vert: FTP configure avec mot de passe
  - Orange: mot de passe manquant
  - Gris: non configure
- Badge de progression sync en temps reel

#### Menu macOS
Menu natif en francais avec raccourcis:
- Forge: A propos, Preferences (⌘,)
- Fichier: Nouveau projet (⌘N)
- Edition: Couper, Copier, Coller
- Affichage: Actualiser (⌘R), Plein ecran
- Projet: Ouvrir Finder (⌘⇧O), Synchroniser (⌘⇧S)

#### System Tray
Icone dans la barre de menu macOS:
- 7 projets recents avec sous-menu contextuel:
  - **Controles Timer** (v1.2.1):
    - ▶️ Demarrer le timer (si pas de timer actif)
    - ⏸️ Mettre en pause (si timer actif et en cours)
    - ▶️ Reprendre le timer (si timer en pause)
    - ⏹️ Arreter le timer (si timer actif)
  - 📁 Ouvrir le dossier
  - 🔄 Synchroniser FTP (si FTP configure)
- Indicateur de sync en cours

### 2. Gestion des Projets

#### Import de Projet Existant (v1.1.0)

Permet d'importer un dossier existant comme projet Forge:

**Composants**:
- `ImportProjectModal.tsx`: Modal en 2 etapes
- `ImportAnalysis` type dans `types/index.ts`
- `analyzeExistingFolder()` et `importProject()` dans `projectService.ts`

**Fonctionnement**:
1. **Etape 1 - Selection**: Choix du dossier via dialog natif
2. **Analyse automatique**:
   - Detection des dossiers Forge existants vs manquants
   - Detection du dossier local (www, public, dist, build)
   - Verification si le projet existe deja
3. **Etape 2 - Configuration**:
   - Resume: X dossiers existants, Y manquants
   - Option "Creer les dossiers manquants" (cochee par defaut)
   - Champs optionnels: nom client, URL site actuel

**Cas geres**:
| Cas | Comportement |
|-----|--------------|
| Projet deja importe | Erreur: "Ce projet existe deja" |
| Dossier vide | OK - cree toute la structure |
| Structure complete | OK - ne cree rien |
| Structure partielle | OK - cree uniquement les manquants |

**Interface**:
- Bouton "Importer" a cote de "Nouveau" dans la liste des projets
- Icone: `FolderInput` de lucide-react

#### Structure de dossiers
```
MonProjet/
├── _Inbox/           # Fichiers entrants (surveille)
├── Assets/           # Fichiers fournis par le client
├── Documentation/    # Brief, specs
├── References/       # Contenus scrapes
└── www/              # Fichiers de production
    ├── css/
    └── js/
```

#### FTP/SFTP
- Protocoles: SFTP, FTP, FTPS
- Import automatique des credentials (Smart Paste)
- Test de connexion
- Selection des dossiers distants
- Sauvegarde mot de passe (Keychain)

### 3. Scraping

#### Fonctionnalites
- Stepper visuel (Scraping → Organisation → Amelioration → Documentation)
- Historique des 10 derniers runs
- Statistiques: pages, images, textes, couleurs, polices
- Export JSON, CSV, CSS (variables couleurs)

#### Integration Gemini AI
- Amelioration des textes scrapes
- Categorisation des fichiers (_Inbox)
- Profil client automatique

#### Cache
- Hash SHA-256 des URLs et contenus
- TTL configurable (defaut: 7 jours)
- Stockage: `_Inbox/.scrape_cache.json`

### 4. Synchronisation FTP

#### Fonctionnalites
- Progression en temps reel
- Liste des fichiers en cours
- Protection timeout (15s connect, 5min sync)
- Annulation possible
- Delta sync (synchronisation incrementale)
- Parallel sync (multi-connexions)
- Reprise des transferts interrompus

#### Version History
- Snapshots avant synchronisation
- Comparaison entre versions
- Restauration possible

#### Scheduler
- Planification cron des syncs
- Frequences: quotidien, hebdomadaire, mensuel
- Activation/desactivation par projet

### 5. FileWatcher (_Inbox)

#### Fonctionnalites
- Surveillance automatique des nouveaux fichiers
- Categorisation avec Gemini AI
- Tri automatique si confiance >= seuil
- Configuration globale dans Settings

### 6. Time Tracking & Billing (v1.2.0)

#### Composants
- `TimeTracker.tsx`: Widget complet avec timer, stats, controles
- `TimeTrackerMini`: Version compacte pour le header
- `TimeSessionsPanel`: Historique des sessions
- `timeStore.ts`: Store Zustand avec persistance
- `BillingSection.tsx`: Onglet Facturation dans les parametres

#### Fonctionnalites
- Timer start/stop par projet
- Affichage en temps reel dans le header
- Stats: aujourd'hui, cette semaine, total projet
- **Systeme de facturation refait (v1.2.0)**:
  - Taux global configurable dans Parametres > Facturation
  - 3 unites de facturation: Heure, Demi-journee (4h), Journee (8h)
  - Le taux est le **montant par unite** (ex: 450€/jour = 450€ pour 8h)
  - Calcul proportionnel (4h sur 450€/jour = 225€)
  - Override possible par projet
  - Bouton "Reappliquer a tous les projets"
- Historique complet des sessions
- Persistance locale (localStorage via Zustand)

#### Logique de calcul

```typescript
// Formule: montant = (temps / duree_unite) * taux_par_unite
const UNIT_SECONDS = {
  hour: 3600,      // 1 heure
  half_day: 14400, // 4 heures
  day: 28800,      // 8 heures
};

// Exemples:
// - 4h travaillees, taux 450€/jour → (14400/28800) * 450 = 225€
// - 30min travaillees, taux 60€/h → (1800/3600) * 60 = 30€
```

#### Cascade des taux
```typescript
const effectiveRate = project.billing?.hourlyRate
  ?? settings.billing?.defaultRate
  ?? 75; // Fallback

const effectiveUnit = project.billing?.billingUnit
  ?? settings.billing?.defaultUnit
  ?? 'hour';
```

#### Interface Parametres > Facturation
```
┌─────────────────────────────────────────────┐
│  PARAMETRES DE FACTURATION                  │
├─────────────────────────────────────────────┤
│  Taux par defaut: [450] €                   │
│                                             │
│  Devise:                                    │
│  [€] [$] [£] [CHF] [CA$]                    │
│  EUR  USD  GBP  CHF  CAD                    │
│                                             │
│  Unite de facturation:                      │
│  ┌─────────┐ ┌───────────┐ ┌──────────┐    │
│  │  Heure  │ │ Demi-jour │ │ Journee  │    │
│  │  (1h)   │ │   (4h)    │ │   (8h)   │    │
│  └─────────┘ └───────────┘ └──────────┘    │
│                                             │
│  Equivalences: 56.25€/h • 225€/½j           │
│                                             │
│  [Reappliquer a tous les projets (12)]      │
└─────────────────────────────────────────────┘
```

#### Devises supportees
| Code | Symbole | Libelle |
|------|---------|---------|
| EUR | € | Euro |
| USD | $ | Dollar US |
| GBP | £ | Livre Sterling |
| CHF | CHF | Franc Suisse |
| CAD | CA$ | Dollar Canadien |

#### Dashboard Stats (v1.2.0)
Statistiques globales compactes sur la page d'accueil (icones a gauche):
```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ ⏱  45h 20m     │ │ 💰 3 400€      │ │ 📁 12          │ │ 📈 5           │
│    Temps total  │ │    Facturable   │ │    Actifs       │ │    Ce mois      │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```
- Layout compact: icone a gauche, donnees a droite
- Hauteur reduite pour economiser l'espace vertical
- 4 stats: temps total, montant facturable, projets actifs, projets ce mois

### 7. Sync Selective (v1.1.0)

#### Composants
- `SyncRulesPanel.tsx`: Configuration des regles
- `SyncRules` type dans `types/index.ts`

#### Fonctionnalites
- Patterns d'exclusion style .gitignore
- Patterns par defaut: `.DS_Store`, `node_modules/`, `*.log`, `*.map`, `.git/`
- Activation/desactivation du filtrage
- Interface de gestion des patterns
- Aide contextuelle avec exemples

#### Interface
```
┌─────────────────────────────────────────────────┐
│  REGLES DE SYNCHRONISATION                      │
├─────────────────────────────────────────────────┤
│  [x] Activer le filtrage                        │
│                                                 │
│  Patterns d'exclusion:                          │
│  ┌───────────────────────────────────────────┐  │
│  │ .DS_Store  *.map  node_modules/  *.log   │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  [+ Ajouter pattern]  [Reinitialiser]           │
└─────────────────────────────────────────────────┘
```

### 8. Outils Avances FTP (v1.1.0)

#### Nouveaux outils integres
| Outil | Composant | Description |
|-------|-----------|-------------|
| Historique versions | `VersionHistory.tsx` | Snapshots et restauration |
| Planification | `SyncScheduler.tsx` | Sync automatique |
| Liens preview | `PreviewLinkGenerator.tsx` | Partage client |
| Actions post-sync | `PostSyncHooks.tsx` | Webhooks et scripts |
| Regles de sync | `SyncRulesPanel.tsx` | Exclusions et filtres |

### 9. Dashboard Projet (v1.1.0)

#### Composants
- `ProjectDashboard.tsx`: Tableau de bord avec statistiques
- Nouvel onglet "Dashboard" dans les details projet

#### Statistiques affichees
- Nombre de fichiers
- Taille totale
- Derniere sync
- Couleurs et polices detectees
- Activite recente

---

## Refactoring Effectue

### FTPSection.tsx (2026-01-24)

Split de 525 lignes en composants modulaires:

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `FTPSection.tsx` | 93 | Composant principal |
| `FTPConnectionCard.tsx` | 180 | Connexion et test |
| `FTPSyncCard.tsx` | 130 | Parametres sync |
| `FTPSmartPaste.tsx` | 90 | Import automatique |
| `ftpCredentialsParser.ts` | 120 | Parsing regex |

### ProjectFileTree.tsx (2026-01-24)

Split de 770 lignes avec extraction des hooks:

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `ProjectFileTree.tsx` | 427 | Composant principal |
| `useFileTree.ts` | 120 | Chargement arborescence |
| `useFileTreeDragAndDrop.ts` | 135 | Logique DnD |
| `useFileTreeModals.ts` | 160 | Modals CRUD |
| `useFileTreeContextMenu.ts` | 95 | Menu contextuel |

---

## Corrections de Bugs

### Sauvegarde FTP (2026-01-18)

**Probleme**: Mot de passe FTP non sauvegarde correctement.

**Cause**: Le keyring crate v3 ne fonctionnait pas sur macOS.

**Solution**: Utilisation du Tauri Store avec chiffrement AES-256.
- Migration automatique des anciens credentials (XOR → AES-256)
- Stockage: `~/Library/Application Support/com.forge.app/credentials.dat`

### Blocage UI Sync FTP (2026-01-20)

**Probleme**: L'app ne repond plus apres timeout FTP.

**Solution**:
- Timeout global frontend avec `Promise.race`
- Protection contre les syncs multiples
- Cooldown de 5s apres echec
- Bouton desactive pendant le cooldown

### Blocage UI Scraping (2026-01-20)

**Probleme**: L'app ne repond plus pendant le scraping.

**Solution**:
- Timeout global de 5 minutes
- Protection contre les scrapings multiples
- Variable `currentScrapingProjectId`

### Tray Sync Navigation (2026-01-24)

**Probleme**: La sync depuis le tray n'ouvre pas le projet.

**Solution**: Ajout de `selectProject(projectId)` et `setCurrentView('projects')` avant `handleSync()`.

### URL de Test sans protocole (2026-01-26)

**Probleme**: Le bouton "Test" dans le header projet ne fonctionnait pas si l'utilisateur n'avait pas saisi `http://` ou `https://` devant l'URL.

**Solution**: Normalisation automatique de l'URL dans `projectService.openInBrowser()`:
- Detection de la presence d'un protocole via regex `/^https?:\/\//i`
- Ajout automatique de `https://` si absent
- Fonctionne pour les boutons "Site" et "Test"

```typescript
// projectService.ts
let normalizedUrl = url.trim();
if (!/^https?:\/\//i.test(normalizedUrl)) {
  normalizedUrl = `https://${normalizedUrl}`;
}
```

---

## Configuration

### tauri.conf.json

```json
{
  "package": {
    "productName": "La Forge",
    "version": "1.0.1"
  },
  "tauri": {
    "bundle": {
      "identifier": "com.forge.app",
      "targets": ["app", "dmg"]
    },
    "updater": {
      "active": true,
      "endpoints": ["https://github.com/flagorn-sudo/Laforge/releases/latest/download/latest.json"]
    },
    "systemTray": {
      "iconPath": "icons/tray-icon.png"
    }
  }
}
```

### Mises a jour automatiques

Pour activer les mises a jour:
1. Generer une paire de cles: `npx @tauri-apps/cli signer generate -w ~/.tauri/la-forge.key`
2. Mettre la cle publique dans `tauri.conf.json > updater > pubkey`
3. Compiler avec signature: `TAURI_PRIVATE_KEY=$(cat ~/.tauri/la-forge.key) npm run tauri build`
4. Creer `latest.json` sur GitHub avec les URLs des bundles

---

## Commandes Utiles

```bash
# Developpement
npm run tauri dev

# Build production
npm run tauri build

# Build frontend uniquement
npm run build

# Rebuild Rust
cd src-tauri && cargo build --release

# Verifier les types
npm run typecheck
```

### Installation dans /Applications (IMPORTANT pour Claude)

**Apres chaque modification testable, Claude DOIT reinstaller l'app automatiquement:**

```bash
# 1. Build l'application
npm run tauri build

# 2. Fermer l'ancienne instance + copier dans /Applications
pkill -f "La Forge" 2>/dev/null || true
sleep 1
rm -rf "/Applications/La Forge.app"
cp -R "src-tauri/target/release/bundle/macos/La Forge.app" /Applications/
```

**Commande complete en une ligne:**
```bash
npm run tauri build && pkill -f "La Forge" 2>/dev/null || true && sleep 1 && rm -rf "/Applications/La Forge.app" && cp -R "src-tauri/target/release/bundle/macos/La Forge.app" /Applications/
```

**Note**: Le build DMG peut echouer mais le .app est cree. Ignorer l'erreur DMG.

---

## Dependances Principales

### Frontend
- react, react-dom
- zustand (state management)
- @dnd-kit/core (drag & drop)
- lucide-react (icones)
- @tauri-apps/api (bridge Tauri)
- @tauri-apps/plugin-store

### Backend (Rust)
- tauri
- ssh2 (SFTP)
- suppaftp (FTP/FTPS)
- reqwest (HTTP)
- scraper (HTML parsing)
- keyring (credentials)
- notify (file watching)
- cron (scheduler)
- sha2 (hashing)

---

## Hooks React Personnalises

| Hook | Description |
|------|-------------|
| `useAsync` | Gestion des operations asynchrones avec loading/error |
| `useClientProfile` | Recuperation et mise a jour du profil client |
| `useColorMerge` | Fusion intelligente des couleurs similaires |
| `useFileWatcher` | Orchestration de la surveillance fichiers |
| `useFilterPreferences` | Persistance des preferences de filtrage |
| `useMenuEvents` | Ecoute des events du menu macOS |
| `useNotification` | Affichage de notifications toast |
| `useProjectFiltering` | Logique de filtrage et tri des projets |
| `useProjectForm` | Gestion de l'etat du formulaire projet |
| `useRetryCountdown` | Retry avec compte a rebours visuel |
| `useScraping` | Orchestration du scraping (stepper) |
| `useSyncEvents` | Ecoute des evenements de synchronisation |
| `useSystemTray` | Integration avec le system tray macOS |

---

## Performances

### Taille du bundle
- Frontend: ~518 KB (gzipped: ~160 KB)
- App macOS: ~15 MB
- DMG: ~10 MB

### Optimisations appliquees
- Lazy loading des services Gemini
- Memoisation des listes filtrees
- Debounce sur les sauvegardes
- Cache de scraping avec TTL

---

## Historique des Versions

### v1.2.1 (2026-01-28)
- **Controles Timer dans le System Tray**:
  - Demarrer/Arreter le timer directement depuis le menu tray
  - Mettre en pause / Reprendre le timer
  - Mise a jour dynamique du menu selon l'etat du timer
  - Communication bidirectionnelle tray <-> frontend via events Tauri
  - Fichiers modifies:
    - `src-tauri/src/tray.rs`: ajout des items menu timer et handlers
    - `src/hooks/useSystemTray.ts`: nouveaux events timer (start/pause/resume/stop)
    - `src/App.tsx`: integration avec timeStore

### v1.2.0 (2026-01-27)
- **Refonte complete du systeme de facturation**:
  - Nouvel onglet "Facturation" dedie dans les parametres
  - Taux global avec selection de l'unite (Heure / Demi-journee / Journee)
  - **Selection de la devise**: EUR, USD, GBP, CHF, CAD
  - Correction du calcul: le taux est le montant PAR UNITE (450€/jour = 450€ pour 8h)
  - Calcul proportionnel du temps travaille
  - Affichage des equivalences en temps reel
  - Bouton "Reappliquer a tous les projets" (inclut la devise)
  - Composant: `BillingSection.tsx` refait avec gros boutons clairs
  - Types: `GlobalBillingSettings`, `Currency`, `CURRENCY_CONFIG` dans `types/index.ts`
  - Store: `billing` dans `settingsStore.ts`
- **Dashboard Stats compact sur la page d'accueil**:
  - Layout horizontal avec icone a gauche des donnees
  - Temps total travaille (tous projets)
  - Montant facturable total
  - Nombre de projets actifs
  - Projets travailles ce mois
  - Composant: integration dans `ProjectList.tsx`
- **Cascade des taux**: projet > global > fallback (75€/h)
- **Override par projet**: chaque projet peut definir son propre taux

### v1.1.0 (2026-01-26)
- **Import Projet Existant**: Importer un dossier existant comme projet Forge
  - Modal en 2 etapes: selection + configuration
  - Analyse automatique de la structure (dossiers existants/manquants)
  - Detection du dossier local (www, public, dist, build)
  - Option de creation des dossiers manquants
  - Composant: `ImportProjectModal.tsx`
  - Type: `ImportAnalysis` dans `types/index.ts`
  - Methodes: `analyzeExistingFolder()`, `importProject()` dans `projectService.ts`
- **Time Tracking**: Timer par projet avec historique et facturation
  - Composants: `TimeTracker.tsx`, `TimeTrackerMini`, `TimeSessionsPanel`
  - Store: `timeStore.ts` avec persistance Zustand
- **Sync Selective**: Patterns d'exclusion style gitignore
  - Composant: `SyncRulesPanel.tsx`
  - Type: `SyncRules` dans `types/index.ts`
- **Integration composants existants**:
  - Dashboard projet (nouvel onglet)
  - PreviewLinkGenerator (outils avances)
  - PostSyncHooks (outils avances)
- **UI amélioree**:
  - Bouton "Importer" dans la liste des projets
  - TimeTrackerMini dans le header projet
  - 6 outils avances dans l'onglet FTP
  - Indicateur FTP compact dans les cartes projet (icone + "FTP")
  - Cartes projet plus compactes en hauteur
- **Corrections**:
  - URL de test: ajout automatique du protocole https://
  - Normalisation des URLs dans `projectService.openInBrowser()`
  - Updater desactive temporairement (voir `docs/TODO.md`)

### v1.0.1 (2026-01-24)
- Refactoring FTPSection et ProjectFileTree
- Correction navigation tray sync
- Export scraping JSON/CSV/CSS
- Historique scraping (10 runs)
- Cache scraping avec TTL

### v1.0.0 (2026-01-20)
- Version initiale
- Gestion projets
- FTP/SFTP
- Scraping avec Gemini
- Menu macOS en francais
