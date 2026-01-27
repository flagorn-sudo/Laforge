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

### 2.3 Time Tracking & Facturation (refait v1.2.0)

**Priorité**: Moyenne

**Fichiers sources**:
```
src/
├── stores/
│   ├── timeStore.ts         # Persistance sessions + calcul
│   └── settingsStore.ts     # billing: GlobalBillingSettings
├── components/
│   ├── TimeTracker.tsx      # Timer + stats + panels
│   └── ProjectList.tsx      # Dashboard stats (temps/facturation)
├── features/settings/components/
│   └── BillingSection.tsx   # Onglet Facturation avec gros boutons
└── types/
    └── index.ts             # TimeSession, ProjectBilling, GlobalBillingSettings
```

**Fonctionnalités**:
- Timer start/stop par projet
- Statistiques: aujourd'hui, semaine, total
- **Système de facturation refait (v1.2.0)**:
  - Onglet dédié "Facturation" dans les paramètres
  - Taux global avec unité (Heure / Demi-journée / Journée)
  - Le taux est le **montant PAR UNITÉ** (450€/jour = 450€ pour 8h)
  - Calcul proportionnel du temps travaillé
  - Affichage des équivalences en temps réel
  - Bouton "Réappliquer à tous les projets"
  - Override par projet possible
- Cascade des taux: projet > global > fallback (75€/h)
- Dashboard stats sur la page d'accueil:
  - Temps total travaillé
  - Montant facturable total
  - Projets actifs et projets travaillés ce mois
- Historique des sessions
- Persistance localStorage

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

### 2.6 Outils Additionnels

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
}
export type BillingUnit = 'minute' | 'hour' | 'half_day' | 'day';
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

*Document mis à jour le 2026-01-27 pour La Forge v1.2.0*
*Inclut les modifications du système de facturation et dashboard stats*
