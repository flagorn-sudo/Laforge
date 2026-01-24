# Notes Techniques - La Forge v1.0.1

## Derniere mise a jour: 2026-01-24

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
├── components/           # Composants UI principaux
│   ├── ui/              # Composants reutilisables (Button, Modal, etc.)
│   ├── MiniSidebar.tsx  # Navigation compacte
│   ├── FilterBar.tsx    # Barre de filtres expansible
│   ├── ProjectList.tsx  # Liste des projets
│   └── ProjectDetail.tsx # Detail d'un projet
├── features/
│   ├── projects/
│   │   ├── components/  # FTPSection, ProjectFileTree
│   │   ├── hooks/       # useFileTree, useFTPConnection, etc.
│   │   └── utils/       # ftpCredentialsParser
│   ├── scraping/
│   │   └── components/  # ScrapingPanel
│   └── settings/
│       └── components/  # BackupSection, AutoOrganizeSection
├── services/            # Services metier
│   ├── configStore.ts   # Wrapper Tauri Store
│   ├── projectService.ts
│   ├── sftpService.ts
│   ├── syncService.ts
│   ├── scrapingService.ts
│   ├── scrapingExportService.ts
│   └── gemini/          # Integration Gemini AI
├── stores/              # Zustand stores
│   ├── projectStore.ts
│   ├── settingsStore.ts
│   ├── syncStore.ts
│   ├── scrapingStore.ts
│   ├── versionStore.ts
│   ├── scheduleStore.ts
│   └── hooksStore.ts
├── hooks/               # Hooks React personnalises
│   ├── useMenuEvents.ts
│   ├── useSystemTray.ts
│   ├── useFileWatcher.ts
│   ├── useFilterPreferences.ts
│   └── useProjectFiltering.ts
└── types/               # Types TypeScript
```

### Modules Rust (src-tauri/src/)

| Module | Description |
|--------|-------------|
| `main.rs` | Point d'entree, commandes Tauri, menu macOS |
| `scraper.rs` | Scraping de sites web |
| `tray.rs` | Menu du system tray |
| `watcher.rs` | Surveillance des fichiers (_Inbox) |
| `delta_sync.rs` | Synchronisation incrementale |
| `version_history.rs` | Snapshots et restauration |
| `scheduler.rs` | Planification des syncs |
| `parallel_sync.rs` | Transfert multi-connexions |
| `transfer_resume.rs` | Reprise des transferts |
| `full_site_scraper.rs` | Scraping complet de sites |
| `scrape_cache.rs` | Cache de scraping |

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
- Persistance des preferences

#### Menu macOS
Menu natif en francais avec raccourcis:
- Forge: A propos, Preferences (⌘,)
- Fichier: Nouveau projet (⌘N)
- Edition: Couper, Copier, Coller
- Affichage: Actualiser (⌘R), Plein ecran
- Projet: Ouvrir Finder (⌘⇧O), Synchroniser (⌘⇧S)

#### System Tray
Icone dans la barre de menu macOS:
- 7 projets recents
- Ouvrir dans Finder
- Synchroniser FTP
- Indicateur de sync en cours

### 2. Gestion des Projets

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
