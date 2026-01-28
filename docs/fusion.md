# Guide de Fusion Forge → Nexus

## Objectif

Ce document détaille le plan technique pour intégrer les fonctionnalités de **La Forge** dans **Nexus**, créant une application unifiée de gestion de projets web.

---

## 1. Analyse Comparative

### Stack Technique

| Aspect | Forge | Nexus | Cible Fusion |
|--------|-------|-------|--------------|
| Framework | Tauri 1.x | Tauri 2.x | Tauri 2.x |
| Frontend | React 18 + TypeScript | React 18 + TypeScript | React 18 + TypeScript |
| State | Zustand | Zustand | Zustand |
| Styles | CSS custom | CSS custom / Tailwind | À déterminer |
| Build | Vite | Vite | Vite |

### Différences Tauri 1.x → 2.x

| Tauri 1.x (Forge) | Tauri 2.x (Nexus) |
|-------------------|-------------------|
| `@tauri-apps/api` | `@tauri-apps/api` (v2) |
| `invoke()` | `invoke()` (même API) |
| `@tauri-apps/plugin-store` | `@tauri-apps/plugin-store` (v2) |
| Crates tauri 1.x | Crates tauri 2.x |
| `tauri::command` | `tauri::command` (compatible) |

**Migration simplifiée**: Les API JavaScript sont largement compatibles. Les changements principaux sont côté Rust (crates et lifecycle).

---

## 2. Fonctionnalités Forge à Intégrer

### 2.1 FTP/SFTP Sync

**Priorité**: Haute

**Fichiers sources**:
```
src-tauri/src/
├── main.rs              # Commandes sync
├── delta_sync.rs        # Sync incrémentale
├── parallel_sync.rs     # Multi-connexions
├── transfer_resume.rs   # Reprise transferts

src/
├── services/
│   ├── sftpService.ts   # API FTP
│   ├── syncService.ts   # Orchestration
│   └── deltaService.ts  # Calcul delta
├── stores/
│   └── syncStore.ts     # État sync (22.8KB)
├── components/
│   ├── FTPLogWindow.tsx
│   └── SyncStatusBadge.tsx
└── features/projects/components/
    ├── FTPSection.tsx
    ├── FTPConnectionCard.tsx
    ├── FTPSyncCard.tsx
    ├── FTPSmartPaste.tsx
    └── SyncProgress.tsx
```

**Fonctionnalités**:
- Protocoles SFTP, FTP, FTPS
- Synchronisation delta (par chunks)
- Transferts parallèles (multi-connexions)
- Reprise des transferts interrompus
- Import automatique credentials (Smart Paste)
- Sauvegarde mot de passe (Keychain/AES-256)
- Logs détaillés en temps réel

### 2.2 Web Scraping

**Priorité**: Haute

**Fichiers sources**:
```
src-tauri/src/
├── scraper.rs           # Scraping basique
├── full_site_scraper.rs # Crawl récursif
└── scrape_cache.rs      # Cache SHA-256

src/
├── services/
│   ├── scrapingService.ts
│   ├── fullSiteScraperService.ts
│   ├── scrapeCacheService.ts
│   └── scrapingExportService.ts
├── stores/
│   └── scrapingStore.ts  # État scraping (15.8KB)
├── components/
│   ├── ScrapingPage.tsx  # 885 lignes
│   └── FullSiteScraper.tsx
└── features/scraping/components/
    ├── ScrapingPanel.tsx
    └── ScrapingProgress.tsx
```

**Fonctionnalités**:
- Scraping de page unique
- Crawl récursif de site entier
- Extraction assets (images, CSS, JS, fonts)
- Détection couleurs et polices
- Cache avec TTL configurable (7 jours)
- Export JSON, CSV, variables CSS
- Historique des 10 derniers runs

### 2.3 Time Tracking & Facturation (refait v1.2.0, multi-timers v1.2.2)

**Priorité**: Moyenne

**Fichiers sources**:
```
src/
├── stores/
│   ├── timeStore.ts         # Persistance sessions + calcul (multi-timers)
│   └── settingsStore.ts     # billing: GlobalBillingSettings
├── components/
│   ├── TimeTracker.tsx      # Timer + stats + panels (pause/stop)
│   └── ProjectList.tsx      # Dashboard stats (temps/facturation)
├── features/settings/components/
│   └── BillingSection.tsx   # Onglet Facturation avec gros boutons
└── types/
    └── index.ts             # TimeSession, ActiveSession, ProjectBilling, GlobalBillingSettings
```

**Fonctionnalités**:
- **Timers multiples simultanés (v1.2.2)**:
  - Possibilité de lancer un timer sur plusieurs projets en parallèle
  - Chaque projet peut avoir son propre timer actif
  - Pas de limite au nombre de timers simultanés
- **Pause et Stop séparés (v1.2.2)**:
  - Bouton Pause: met le timer en pause (temps accumulé conservé)
  - Bouton Stop: arrête le timer et enregistre la session
  - Le temps en pause est conservé et repris au Resume
- Statistiques: aujourd'hui, semaine, total
- **Système de facturation refait (v1.2.0)**:
  - Onglet dédié "Facturation" dans les paramètres
  - Taux global avec unité (Heure / Demi-journée / Journée)
  - **Sélection de la devise**: EUR, USD, GBP, CHF, CAD
  - Le taux est le **montant PAR UNITÉ** (450€/jour = 450€ pour 8h)
  - Calcul proportionnel du temps travaillé
  - Affichage des équivalences en temps réel
  - Bouton "Réappliquer à tous les projets" (inclut la devise)
  - Override par projet possible
- Cascade des taux: projet > global > fallback (75€/h)
- Dashboard stats compact sur la page d'accueil (icônes à gauche):
  - Temps total travaillé
  - Montant facturable total
  - Projets actifs et projets travaillés ce mois
- Historique des sessions
- Persistance localStorage

**Types importants (v1.2.2)**:
```typescript
// Session active avec support pause
interface ActiveSession {
  id: string;
  projectId: string;
  startTime: string;
  isPaused: boolean;
  pausedAt?: string;        // Quand la pause a commencé
  accumulatedTime: number;  // Temps accumulé avant pause (secondes)
}

// État du store
interface TimeState {
  activeSessions: ActiveSession[];  // Plusieurs timers simultanés
  sessions: TimeSession[];          // Historique des sessions terminées
  // ...
}
```

**Logique de calcul importante**:
```typescript
// Le taux est le montant PAR UNITÉ, pas un taux horaire à multiplier
// Formule: montant = (temps_secondes / secondes_par_unite) * taux_par_unite
const UNIT_SECONDS = {
  hour: 3600,      // 1h
  half_day: 14400, // 4h
  day: 28800,      // 8h
};
// Exemple: 4h sur 450€/jour = (14400/28800) * 450 = 225€
```

### 2.4 Snapshots & Versions

**Priorité**: Moyenne

**Fichiers sources**:
```
src-tauri/src/
└── version_history.rs   # Snapshots Rust

src/
├── stores/
│   └── versionStore.ts
└── components/
    └── VersionHistory.tsx
```

**Fonctionnalités**:
- Snapshots avant sync
- Comparaison entre versions
- Restauration de fichiers
- Historique avec messages

### 2.5 Gemini AI Integration

**Priorité**: Moyenne

**Fichiers sources**:
```
src/
├── services/
│   ├── geminiService.ts
│   └── gemini/
│       ├── contentAnalyzer.ts
│       ├── ftpCredentialParser.ts
│       ├── geminiApiClient.ts
│       └── textProcessor.ts
```

**Fonctionnalités**:
- Amélioration des textes scrapés
- Catégorisation automatique des fichiers
- Génération de profil client
- Parsing intelligent des credentials FTP

### 2.6 IDE Monitoring (Auto-Timer)

**Priorité**: Moyenne

**Fichiers sources**:
```
src-tauri/src/
└── ide_monitor.rs           # Détection processus IDE (Rust)

src/
├── services/
│   └── ideMonitorService.ts # API de surveillance IDE
├── hooks/
│   └── useIDEMonitor.ts     # Hook React pour auto-timer
├── features/settings/components/
│   └── IDEMonitoringSection.tsx # Paramètres UI
└── types/
    └── index.ts             # IDEMonitoringSettings, SupportedIDE
```

**Fonctionnalités**:
- Surveillance automatique de l'IDE (PyCharm, VS Code, Cursor)
- Détection d'ouverture/fermeture de projet dans l'IDE
- Démarrage automatique du timer quand l'IDE ouvre un projet
- Arrêt automatique avec délai configurable (5s, 10s, 30s, 1min)
- Intervalle de vérification configurable (3s, 5s, 10s, 30s)
- Note automatique "IDE fermé" sur les sessions auto-stoppées

**Types**:
```typescript
export type SupportedIDE = 'pycharm' | 'vscode' | 'cursor';

export interface IDEMonitoringSettings {
  enabled: boolean;
  checkIntervalMs: number;    // 3000-30000
  autoStopDelayMs: number;    // 5000-60000
  preferredIDE: SupportedIDE;
}
```

### 2.7 Import de Projets Existants

**Priorité**: Haute

**Fichiers sources**:
```
src/
├── components/
│   └── ImportProjectModal.tsx  # Modal d'import en 2 étapes
├── services/
│   └── projectService.ts       # analyzeExistingFolder()
└── types/
    └── index.ts                # ImportAnalysis
```

**Fonctionnalités**:
- Import de dossiers existants (hors workspace)
- Analyse automatique de la structure Forge
- Détection des dossiers existants vs manquants
- Option pour créer les dossiers manquants (_Sources, _Assets, etc.)
- Enregistrement dans le registre de projets

**Flow UI**:
1. Étape 1 "Select": Choix du dossier via dialog natif
2. Analyse automatique (spinner)
3. Étape 2 "Configure": Résumé + options (client, URL, créer dossiers)
4. Import avec création de la config projet

**Types**:
```typescript
export interface ImportAnalysis {
  path: string;
  name: string;
  existingFolders: string[];
  missingFolders: string[];
  suggestedLocalPath: string;
  hasForgeStructure: boolean;
}
```

### 2.8 Gestion des Projets Manquants

**Priorité**: Haute

**Fichiers sources**:
```
src/
├── components/
│   └── MissingProjectsModal.tsx  # Modal de gestion
├── stores/
│   └── projectStore.ts           # projectErrors: ProjectHealth[]
└── types/
    └── index.ts                  # ProjectHealth
```

**Fonctionnalités**:
- Détection automatique des projets dont le dossier n'existe plus
- Bannière d'alerte sur la page d'accueil
- Modal de gestion avec options par projet:
  - **Relocaliser**: Pointer vers un nouveau chemin
  - **Retirer**: Supprimer du registre (config conservée)
- Bouton "Tout retirer" pour nettoyage rapide
- Préservation des données de configuration

**Types**:
```typescript
export interface ProjectHealth {
  path: string;
  valid: boolean;
  error?: string;
}
```

### 2.9 Service de Migration

**Priorité**: Haute (exécuté au démarrage)

**Fichiers sources**:
```
src/
└── services/
    └── migrationService.ts  # Gestion des migrations
```

**Fonctionnalités**:
- Migration v1→v2: Conversion workspace scanning → registre de projets
- Scan automatique du workspace existant
- Merge des projets du configStore
- Déduplication des chemins
- Versioning des migrations

**Migration v2**:
```typescript
// Avant: Scan automatique du workspacePath
// Après: Liste explicite dans settings.registeredProjects

// Le service:
// 1. Scanne le workspace configuré
// 2. Récupère les projets du configStore
// 3. Merge et déduplique
// 4. Sauvegarde dans settings.registeredProjects
```

### 2.10 Outils Additionnels

**Priorité**: Basse

| Composant | Description |
|-----------|-------------|
| `SyncScheduler.tsx` | Planification cron des syncs |
| `PreviewLinkGenerator.tsx` | Liens de preview client |
| `PostSyncHooks.tsx` | Webhooks post-sync |
| `SyncRulesPanel.tsx` | Exclusions gitignore-style |
| `ReorganizeProjectModal.tsx` | Réorganisation drag & drop |
| `FileWatcher` | Surveillance _Inbox |

---

## 3. Mapping des Types

### Project → WorkflowProject

```typescript
// Forge: Project
interface Project {
  id: string;
  name: string;           // Nom du dossier
  displayName?: string;   // Nom d'affichage personnalisé
  path: string;
  client?: string;
  status: ProjectStatus;
  urls: ProjectURLs;
  sftp: SFTPInfo;
  scraping: ScrapingInfo;
  billing?: ProjectBilling;
  syncRules?: SyncRules;
  // ...
}

// Nexus: WorkflowProject (à adapter)
interface WorkflowProject {
  id: string;
  name: string;
  displayName?: string;   // Ajouter
  client?: string;
  status: string;

  // Intégrer depuis Forge
  sftp?: SFTPInfo;
  scraping?: ScrapingInfo;
  billing?: ProjectBilling;
  syncRules?: SyncRules;
}
```

### Types à Importer

```typescript
// Depuis Forge types/index.ts
export interface SFTPInfo { ... }
export interface SFTPConfig { ... }
export interface ScrapingInfo { ... }
export interface ScrapingRun { ... }
export interface ScrapingStats { ... }
export interface ProjectBilling { ... }
export interface GlobalBillingSettings {   // v1.2.0
  defaultRate: number;
  defaultUnit: BillingUnit;
  defaultCurrency: Currency;
}
export type BillingUnit = 'minute' | 'hour' | 'half_day' | 'day';
export type Currency = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'CAD';
export const CURRENCY_CONFIG: Record<Currency, { symbol: string; label: string }>;
export interface SyncRules { ... }
export interface SyncProgressEvent { ... }
export interface TimeSession { ... }
export interface ProjectTimeStats { ... }
export interface SyncSnapshot { ... }
export interface FileVersion { ... }
```

---

## 4. Migration Tauri 1.5 → 2.x

### Cargo.toml

```toml
# Forge (Tauri 1.x)
[dependencies]
tauri = { version = "1.5", features = [...] }

# Nexus (Tauri 2.x)
[dependencies]
tauri = { version = "2.0", features = [...] }
```

### Commandes Rust

```rust
// Compatible: signature identique
#[tauri::command]
fn my_command(param: String) -> Result<String, String> {
    // ...
}
```

### Plugins Store

```typescript
// Forge (v1)
import { Store } from '@tauri-apps/plugin-store';

// Nexus (v2) - même API
import { Store } from '@tauri-apps/plugin-store';
```

### Changements Breaking

| Aspect | Tauri 1.x | Tauri 2.x |
|--------|-----------|-----------|
| Window API | `getCurrent()` | `getCurrentWindow()` |
| Event API | `emit()/listen()` | `emit()/listen()` (compatible) |
| Config | `tauri.conf.json` | Structure modifiée |

---

## 5. Plan de Migration

### Phase 1: Préparation (1-2 jours)

1. Créer branche `feature/forge-integration`
2. Copier les types Forge dans Nexus
3. Adapter les interfaces si nécessaire
4. Configurer les plugins Tauri 2.x manquants

### Phase 2: FTP/Sync (3-5 jours)

1. Migrer les modules Rust:
   - `delta_sync.rs`
   - `parallel_sync.rs`
   - `transfer_resume.rs`
2. Adapter les crates pour Tauri 2.x
3. Importer les services TypeScript:
   - `sftpService.ts`
   - `syncService.ts`
4. Importer le store:
   - `syncStore.ts`
5. Importer les composants:
   - `FTPSection.tsx` et sous-composants
   - `SyncProgress.tsx`
   - `FTPLogWindow.tsx`

### Phase 3: Scraping (2-3 jours)

1. Migrer les modules Rust:
   - `scraper.rs`
   - `full_site_scraper.rs`
   - `scrape_cache.rs`
2. Importer les services:
   - `scrapingService.ts`
   - `fullSiteScraperService.ts`
3. Importer les composants:
   - `ScrapingPage.tsx`
   - `FullSiteScraper.tsx`

### Phase 4: Time Tracking & Facturation (1-2 jours)

1. Importer les stores:
   - `timeStore.ts` (sessions, calcul billable)
   - Ajouter `billing` dans `settingsStore.ts`
2. Importer les types:
   - `GlobalBillingSettings`, `ProjectBilling`, `BillingUnit`
3. Importer les composants:
   - `TimeTracker.tsx` (widget complet)
   - `BillingSection.tsx` (onglet Facturation)
   - Dashboard stats dans `ProjectList.tsx`
4. Adapter au contexte Nexus
5. Tester la logique de calcul (taux = montant par unité)

### Phase 5: Fonctionnalités Secondaires (2-3 jours)

1. Version History
2. Gemini AI
3. Scheduler
4. Outils avancés

### Phase 6: Tests & Polish (2-3 jours)

1. Tests d'intégration
2. Correction des bugs
3. Optimisation des performances
4. Documentation mise à jour

**Durée totale estimée**: 12-18 jours

---

## 6. Composants UI Portables

### Composants Prêts à l'Import

Ces composants sont autonomes et peuvent être importés directement:

| Composant | Lignes | Dépendances |
|-----------|--------|-------------|
| `TimeTracker.tsx` | ~450 | timeStore, settingsStore, lucide-react |
| `TimeTrackerMini` | (inclus) | timeStore |
| `TimeSessionsPanel` | (inclus) | timeStore |
| `BillingSection.tsx` | ~220 | settingsStore, types, lucide-react |
| `SyncStatusBadge.tsx` | ~80 | syncStore |
| `FilterBar.tsx` | ~150 | projectStore, lucide-react |
| `SyncRulesPanel.tsx` | ~200 | types |
| `DeltaSyncStats.tsx` | ~100 | types |

**Note v1.2.0**: `BillingSection.tsx` a été refait avec de gros boutons clairs pour la sélection de l'unité de facturation et inclut le bouton "Réappliquer à tous les projets".

### Composants avec Refactoring Nécessaire

| Composant | Raison |
|-----------|--------|
| `FTPSection.tsx` | Dépend de 4 sous-composants |
| `SyncProgress.tsx` | Dépend de syncStore |
| `ScrapingPage.tsx` | 885 lignes, complexe |
| `ProjectDetail.tsx` | 1600+ lignes, monolithique |

### Composants UI Réutilisables (src/components/ui/)

| Composant | Description |
|-----------|-------------|
| `Badge.tsx` | Badges de statut |
| `Button.tsx` | Bouton générique |
| `Card.tsx` | Conteneur carte |
| `ContextMenu.tsx` | Menu contextuel |
| `Input.tsx` | Champ de saisie |
| `Modal.tsx` | Fenêtre modale |
| `Switch.tsx` | Toggle switch |
| `Tabs.tsx` | Navigation onglets |
| `TreeView.tsx` | Arborescence fichiers |

---

## 7. Recommandations

### Architecture

1. **Garder les stores séparés**: `syncStore`, `timeStore`, `scrapingStore` restent indépendants
2. **Services découplés**: Chaque service (ftp, scraping, time) est autonome
3. **Types partagés**: Créer un fichier `forge-types.ts` pour tous les types importés

### Priorités

1. **Must-have**: FTP/Sync + Scraping
2. **Should-have**: Time Tracking + Versions
3. **Nice-to-have**: Scheduler + Hooks + AI

### Pièges à Éviter

1. **Ne pas fusionner les stores**: Garder la séparation des responsabilités
2. **Tester les crates Rust**: Vérifier la compatibilité Tauri 2.x
3. **Styles CSS**: Attention aux conflits de noms de classes
4. **Persistance**: Adapter les clés localStorage si nécessaire

---

## 8. Checklist Migration

- [ ] Types importés et adaptés
- [ ] Modules Rust migrés vers Tauri 2.x
- [ ] Services TypeScript importés
- [ ] Stores Zustand intégrés
- [ ] Composants UI portés
- [ ] Styles CSS fusionnés
- [ ] Tests fonctionnels validés
- [ ] Documentation mise à jour

---

## 9. Interface Utilisateur & Agencement des Données

Cette section détaille la structure visuelle de La Forge pour assurer une mise en forme cohérente dans Nexus.

### 9.1 Architecture des Vues

```
┌─────────────────────────────────────────────────────────────┐
│                        App Container                         │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                   │
│  Mini    │              Main Content                         │
│ Sidebar  │                                                   │
│  (56px)  │   ┌─────────────────────────────────────────┐   │
│          │   │  Header (titre + contrôles)              │   │
│  [Home]  │   ├─────────────────────────────────────────┤   │
│  [New]   │   │  Content Zone                            │   │
│  [Set]   │   │                                          │   │
│  [Ref]   │   │  - ProjectList (accueil)                │   │
│          │   │  - ProjectDetail (détail)               │   │
│          │   │  - SettingsPage (paramètres)            │   │
│          │   │                                          │   │
│          │   └─────────────────────────────────────────┘   │
│          │                                                   │
└──────────┴──────────────────────────────────────────────────┘
```

**MiniSidebar** (56px fixe, gauche):
- Icônes verticales: Home, New Project, Settings, Refresh
- État actif visuellement distinct
- Tooltip au survol

### 9.2 Page d'Accueil (ProjectList)

```
┌─────────────────────────────────────────────────────────────┐
│ [!] Bannière projets manquants (si erreurs)    [Voir détails]│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ ⏱ 24h30 │ │ 💰 2450€ │ │ 📁 12    │ │ 📈 5     │       │
│  │ Temps    │ │ Facturable│ │ Actifs  │ │ Ce mois  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
│  Dashboard Stats (4 cartes compactes, icône à gauche)       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Projets          [🔍 Recherche...] [Filtres ▼] [Import][+] │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  FilterBar (collapsible)                                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Statuts: [Actif] [En cours] [En pause] [Terminé] ...   ││
│  │ Trier par: [Nom ▼]  Vue: [Grid][List]  [Réinitialiser] ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Mode Grid (défaut):                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ Project │ │ Project │ │ Project │ │ Project │           │
│  │  Card   │ │  Card   │ │  Card   │ │  Card   │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│                                                              │
│  Mode List:                                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ProjectListRow                                          ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ ProjectListRow                                          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Dashboard Stats** (4 cartes en ligne):
| Icône | Valeur | Label | Style |
|-------|--------|-------|-------|
| Clock | `24h30` | "Temps total" | Normal |
| DollarSign | `2450€` | "Facturable" | **Highlight** (fond accent) |
| Briefcase | `12` | "Projets actifs" | Normal |
| TrendingUp | `5` | "Ce mois" | Normal |

**Calcul des stats**:
```typescript
// Temps total = somme de toutes les sessions de tous les projets
// Facturable = somme des montants calculés par projet
// Projets actifs = count(status !== 'archived' && status !== 'prospect')
// Ce mois = count(projets avec sessions depuis le 1er du mois)
```

### 9.3 Carte Projet (ProjectCard)

```
┌─────────────────────────────────────────────────┐
│  Nom du Projet                    [Status ▼]   │
│  Client                                         │
├─────────────────────────────────────────────────┤
│  [📁][💻]    [▶ ou ⏸⏹]    [🌐][✓][🔄]        │
│   gauche      centre 68px     droite           │
└─────────────────────────────────────────────────┘
```

**Layout card-actions (v1.2.3)** - 3 zones fixes pour éviter les décalages:
- **card-actions-left**: Finder (📁) + IDE (💻)
- **timer-controls** (68px fixe): Bouton Play seul OU Pause + Stop côte à côte
- **card-actions-right**: Globe (🌐) + FTP (✓/✗) + Sync (🔄)

**Boutons timer compacts** (.timer-btn-sm):
- 28x28px avec icônes 12px
- Zone de largeur fixe → pas de saut visuel au démarrage/arrêt

**Indicateurs icônes seules** (v1.2.3):
- FTP: Icône seule (✓ vert, ⚠ orange, ✗ gris) avec tooltip
- Sync: Icône seule (🔄) avec tooltip

**Éléments du header**:
- **Nom**: Titre principal (displayName ou name)
- **Client**: Sous-titre gris
- **Status Badge**: Dropdown cliquable (coin droit)

### 9.4 Page Détail Projet (ProjectDetail)

```
┌─────────────────────────────────────────────────────────────┐
│ [← Retour]   Nom du Projet                      [⋮ Actions] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    Time Tracker                         │ │
│  │  ┌─────────────────────────────────────────────────┐   │ │
│  │  │    00:45:30          [▶ Démarrer / ⬛ Arrêter]  │   │ │
│  │  └─────────────────────────────────────────────────┘   │ │
│  │                                                         │ │
│  │  Aujourd'hui: 2h15    Semaine: 8h30    Total: 24h30   │ │
│  │  Facturable: 225€ (450€/jour)                          │ │
│  │                                                         │ │
│  │  [▼ Voir les sessions]                                 │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  [Général] [FTP/Sync] [Scraping] [Historique] [Facturation] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   Contenu de l'onglet actif                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Onglets du détail projet**:

| Onglet | Contenu |
|--------|---------|
| Général | Infos projet, URLs, description client, tags |
| FTP/Sync | Configuration SFTP, sync, règles d'exclusion |
| Scraping | Scraping page unique + site complet |
| Historique | Snapshots et versions de fichiers |
| Facturation | Override taux/unité/devise pour ce projet |

### 9.5 Time Tracker (Widget) - v1.2.2

**Mode Normal** (dans ProjectDetail):
```
┌──────────────────────────────────────────────────────┐
│              ⏱ Time Tracker    [En pause]            │
├──────────────────────────────────────────────────────┤
│                                                       │
│         ┌─────────────────────────────────┐          │
│         │        00:45:30                 │          │
│         │   ┌───────────┐ ┌───────────┐   │          │
│         │   │ ⏸ Pause  │ │ ⬛ Stopper│   │          │
│         │   └───────────┘ └───────────┘   │          │
│         └─────────────────────────────────┘          │
│                                                       │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│  │ Aujourd'hui│ │  Semaine   │ │   Total    │       │
│  │   2h 15m   │ │   8h 30m   │ │  24h 30m   │       │
│  └────────────┘ └────────────┘ └────────────┘       │
│                                                       │
│  💰 Facturable: 225,00€                              │
│     (450€/jour - 4h = 0.5 jour)                      │
│                                                       │
│  [▼ Voir les sessions]          [📋 Historique]     │
└──────────────────────────────────────────────────────┘
```

**Contrôles du timer (v1.2.2)**:
- **Démarrer** (vert): Lance le timer pour ce projet
- **Pause** (gris/jaune): Met le timer en pause, conserve le temps accumulé
- **Reprendre** (vert): Reprend un timer en pause
- **Stopper** (rouge): Arrête le timer et enregistre la session

**Mode Compact** (option):
```
┌──────────────────────────────────────────────┐
│ ⏱ 00:45:30  [⏸][⬛]   |  Total: 24h30       │
└──────────────────────────────────────────────┘
```

**Multi-timers (v1.2.2)**:
- Possibilité d'avoir plusieurs timers actifs sur différents projets
- Chaque carte projet affiche son propre timer indépendant
- Les totaux du dashboard cumulent tous les timers actifs

**Panneau Sessions** (expansible):
```
┌──────────────────────────────────────────────────────┐
│  Sessions récentes                            [+]   │
├──────────────────────────────────────────────────────┤
│  27/01/2026  14:30 - 16:45   2h 15m                 │
│  26/01/2026  09:00 - 12:30   3h 30m   "IDE fermé"  │
│  25/01/2026  14:00 - 18:30   4h 30m                 │
├──────────────────────────────────────────────────────┤
│  [Voir tout l'historique]                            │
└──────────────────────────────────────────────────────┘
```

### 9.6 Page Paramètres (SettingsPage)

```
┌─────────────────────────────────────────────────────────────┐
│ [← Retour]   Paramètres                                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [Général] [Facturation] [Intégrations] [Avancé]            │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ═══ Onglet Général ═══                                     │
│                                                              │
│  ┌─ Espace de travail ─────────────────────────────────┐   │
│  │  Dossier de travail: [/path/to/workspace]  [Choisir] │   │
│  │  ☑ Organiser automatiquement les projets             │   │
│  │  Structure: [Standard ▼]                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ Interface ─────────────────────────────────────────┐   │
│  │  ☑ Afficher l'icône dans la barre de menus          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ═══ Onglet Facturation ═══                                 │
│                                                              │
│  ┌─ Taux par défaut ───────────────────────────────────┐   │
│  │                                                       │   │
│  │  Unité de facturation:                                │   │
│  │  ┌───────┐ ┌───────────┐ ┌─────────┐ ┌─────────┐    │   │
│  │  │ Heure │ │ Demi-jour │ │ Journée │ │ Minute  │    │   │
│  │  └───────┘ └───────────┘ └─────────┘ └─────────┘    │   │
│  │  (Gros boutons clairs, sélection visible)            │   │
│  │                                                       │   │
│  │  Montant par unité: [450] €                          │   │
│  │                                                       │   │
│  │  Devise: [EUR ▼] (EUR, USD, GBP, CHF, CAD)           │   │
│  │                                                       │   │
│  │  Équivalences:                                        │   │
│  │  • 1 heure = 56,25€                                  │   │
│  │  • 1 demi-journée (4h) = 225,00€                     │   │
│  │  • 1 journée (8h) = 450,00€                          │   │
│  │                                                       │   │
│  │  [🔄 Réappliquer à tous les projets]                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ═══ Onglet Intégrations (nouveau) ═══                      │
│                                                              │
│  ┌─ Surveillance IDE (Auto-Timer) ─────────────────────┐   │
│  │  ☐ Activer la surveillance IDE                       │   │
│  │                                                       │   │
│  │  (Si activé:)                                         │   │
│  │  IDE à surveiller: [PyCharm ▼]                       │   │
│  │  Intervalle de vérification: [5 secondes ▼]          │   │
│  │  Délai avant arrêt automatique: [10 secondes ▼]      │   │
│  │                                                       │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │ Fonctionnement:                                  │ │   │
│  │  │ • Ouvrir un projet dans PyCharm démarre le timer│ │   │
│  │  │ • Fermer l'IDE arrête le timer après le délai   │ │   │
│  │  │ • La session est enregistrée avec "IDE fermé"   │ │   │
│  │  └─────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ API Gemini ────────────────────────────────────────┐   │
│  │  Clé API: [••••••••••••••••]  [Afficher]            │   │
│  │  Modèle: [gemini-1.5-flash ▼]                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9.7 Modales

**ImportProjectModal** (2 étapes):

```
Étape 1: Sélection
┌──────────────────────────────────────────────┐
│ Importer un projet                      [X]  │
├──────────────────────────────────────────────┤
│                                              │
│           ┌─────────┐                        │
│           │  📂     │                        │
│           └─────────┘                        │
│                                              │
│  Sélectionnez un dossier existant pour      │
│  l'importer dans La Forge.                  │
│                                              │
│        [📂 Choisir un dossier]              │
│                                              │
├──────────────────────────────────────────────┤
│                              [Annuler]       │
└──────────────────────────────────────────────┘

Étape 2: Configuration
┌──────────────────────────────────────────────┐
│ Importer "MonProjet"                    [X]  │
├──────────────────────────────────────────────┤
│                                              │
│  Dossier: /Users/.../MonProjet               │
│                                              │
│  ✓ 3 dossiers Forge existants               │
│  ⚠ 2 dossiers manquants                     │
│                                              │
│  Dossiers manquants: [_Sources] [_Assets]   │
│                                              │
│  ☑ Créer les dossiers manquants             │
│                                              │
│  Nom du client: [________________]          │
│  URL du site:   [________________]          │
│                                              │
├──────────────────────────────────────────────┤
│  [Retour]              [📥 Importer le projet]│
└──────────────────────────────────────────────┘
```

**MissingProjectsModal**:

```
┌──────────────────────────────────────────────────────┐
│ Projets introuvables                            [X]  │
├──────────────────────────────────────────────────────┤
│                                                       │
│  ⚠ 2 projets enregistrés ne peuvent pas être        │
│    trouvés. Les dossiers ont peut-être été          │
│    déplacés ou supprimés.                            │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ ClientA                                          │ │
│  │ /Users/.../ClientA                              │ │
│  │ Dossier introuvable                             │ │
│  │                  [📂 Relocaliser] [🗑 Retirer] │ │
│  ├─────────────────────────────────────────────────┤ │
│  │ ClientB                                          │ │
│  │ /Users/.../ClientB                              │ │
│  │ Dossier introuvable                             │ │
│  │                  [📂 Relocaliser] [🗑 Retirer] │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  🔄 Les données de configuration sont conservées    │
│     et seront restaurées si vous relocalisez.       │
│                                                       │
├──────────────────────────────────────────────────────┤
│  [🗑 Tout retirer]                      [Fermer]    │
└──────────────────────────────────────────────────────┘
```

### 9.8 Composants UI de Base

| Composant | Description | Variantes |
|-----------|-------------|-----------|
| `Button` | Bouton générique | primary, secondary, success, danger |
| `Modal` | Fenêtre modale | title, footer, className |
| `Switch` | Toggle on/off | checked, label |
| `Badge` | Étiquette statut | couleur selon type |
| `Card` | Conteneur carte | padding, shadow |
| `Input` | Champ texte | label, hint, error |
| `Select` | Liste déroulante | options, value |
| `Tabs` | Navigation onglets | items, activeTab |

### 9.9 Palette de Couleurs (Variables CSS)

```css
/* Backgrounds */
--bg-primary: #1a1a2e;     /* Fond principal */
--bg-secondary: #16213e;   /* Cartes, sections */
--bg-tertiary: #0f3460;    /* Inputs, hover */

/* Text */
--text-primary: #ffffff;
--text-secondary: #a0a0a0;
--text-muted: #666666;

/* Accents */
--accent-primary: #e94560;  /* Actions principales */
--accent-success: #4ade80;  /* Succès, sync OK */
--accent-warning: #fbbf24;  /* Avertissements */
--accent-danger: #ef4444;   /* Erreurs, suppression */

/* Status badges */
--status-active: #4ade80;
--status-in-progress: #60a5fa;
--status-paused: #fbbf24;
--status-completed: #a78bfa;
--status-archived: #6b7280;
--status-prospect: #f472b6;
```

### 9.10 Responsivité

**Breakpoints**:
- Mobile: < 640px (non prioritaire, app desktop)
- Tablet: 640px - 1024px
- Desktop: > 1024px

**Grille projets**:
```css
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
```

---

## 10. Checklist UI pour Nexus

- [ ] MiniSidebar avec navigation icônes
- [ ] Dashboard stats compact (4 cartes)
- [ ] ProjectList avec grid/list toggle
- [ ] FilterBar collapsible avec badges
- [ ] ProjectCard avec temps/facturation
- [ ] TimeTracker widget (normal + compact)
- [ ] Panneau sessions expansible
- [ ] SettingsPage avec onglets
- [ ] BillingSection avec gros boutons unité
- [ ] IDEMonitoringSection
- [ ] ImportProjectModal (2 étapes)
- [ ] MissingProjectsModal
- [ ] Système de notifications toast
- [ ] Thème sombre cohérent
- [ ] Variables CSS pour personnalisation

---

*Document mis à jour le 2026-01-28 pour La Forge v1.2.3*
*Inclut: IDE monitoring, import/missing projects, guide UI complet, agencement des données*
*v1.2.2: Timers multiples simultanés, fonction pause/stop séparée*
*v1.2.3: Layout fixe ProjectCard (zones gauche/timer/droite), indicateurs icônes seules*
