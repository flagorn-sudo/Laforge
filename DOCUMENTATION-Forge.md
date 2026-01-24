# Forge - Spécification Technique Complète

> Application macOS native avec Tauri + React pour la gestion de projets web.
> Ce document sert de référence pour générer l'application.

---

## Stack Technique

| Composant | Technologie |
|-----------|-------------|
| Framework | Tauri 1.5 |
| Frontend | React 18 + TypeScript |
| Build | Vite 5 |
| Icons | Lucide React |
| Backend | Rust (Tauri core) |
| Style | CSS custom (dark theme) |

---

## Installation et prérequis

```bash
# Prérequis macOS
xcode-select --install
brew install node
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Installation du projet
cd /Dropbox/Applications/Forge
npm install
npm run tauri dev
```

---

## Structure du projet

```
Forge/
├── src/                          # Frontend React
│   ├── main.tsx                  # Point d'entrée React
│   ├── App.tsx                   # Composant racine + orchestration
│   │
│   ├── components/               # Composants globaux
│   │   ├── Sidebar.tsx           # Navigation latérale + recherche/tri
│   │   ├── ProjectList.tsx       # Grille des projets + filtres
│   │   ├── ProjectCard.tsx       # Carte projet
│   │   ├── ProjectDetail.tsx     # Vue détaillée (onglets)
│   │   ├── CreateProject.tsx     # Modal création
│   │   ├── Settings.tsx          # Paramètres
│   │   ├── SmartPaste.tsx        # Smart Paste FTP
│   │   ├── Notifications.tsx     # Système de notifications
│   │   ├── AboutModal.tsx        # Modal À propos
│   │   │
│   │   │  # Nouveaux composants v1.0.1
│   │   ├── ProjectDashboard.tsx  # Tableau de bord projet
│   │   ├── VersionHistory.tsx    # Historique des versions
│   │   ├── SyncScheduler.tsx     # Planification sync
│   │   ├── DeltaSyncStats.tsx    # Stats delta sync
│   │   ├── FTPLogWindow.tsx      # Journal FTP temps réel
│   │   ├── FullSiteScraper.tsx   # Scraping site complet
│   │   ├── PostSyncHooks.tsx     # Hooks post-sync
│   │   ├── PreviewLinkGenerator.tsx # Générateur liens preview
│   │   ├── SyncStatusBadge.tsx   # Badge statut sync
│   │   │
│   │   └── ui/                   # Composants réutilisables
│   │       ├── Button.tsx, Input.tsx, Modal.tsx
│   │       ├── Badge.tsx, Card.tsx, Switch.tsx
│   │       ├── TreeView.tsx      # Arbre DnD (dnd-kit)
│   │       ├── ContextMenu.tsx   # Menu contextuel
│   │       ├── Tabs.tsx          # Onglets
│   │       └── ExternalLink.tsx
│   │
│   ├── features/                 # Fonctionnalités par domaine
│   │   ├── projects/
│   │   │   ├── components/
│   │   │   │   ├── FTPSection.tsx
│   │   │   │   ├── ProjectFileTree.tsx
│   │   │   │   ├── SyncProgress.tsx
│   │   │   │   └── tabs/GeneralTab/
│   │   │   └── hooks/
│   │   │       └── useFTPConnection.ts
│   │   ├── scraping/
│   │   │   └── components/
│   │   │       ├── ScrapingPanel.tsx
│   │   │       └── ScrapingProgress.tsx
│   │   └── settings/
│   │       ├── components/
│   │       │   ├── FolderStructureSection.tsx
│   │       │   ├── BackupSection.tsx
│   │       │   └── GeminiSection.tsx
│   │       └── hooks/
│   │           └── useFolderTree.ts
│   │
│   ├── services/                 # Logique métier
│   │   ├── projectService.ts     # CRUD projets
│   │   ├── sftpService.ts        # FTP/SFTP
│   │   ├── syncService.ts        # Synchronisation
│   │   ├── configStore.ts        # Tauri Store wrapper
│   │   ├── backupService.ts      # Sauvegarde/restauration
│   │   ├── briefGenerator.ts     # Génération brief projet
│   │   │
│   │   │  # Nouveaux services v1.0.1
│   │   ├── deltaService.ts       # Service delta sync
│   │   ├── fullSiteScraperService.ts # Service scraping complet
│   │   ├── previewService.ts     # Service liens preview
│   │   ├── transferResumeService.ts  # Service reprise transfert
│   │   │
│   │   ├── gemini/               # Services Gemini (modulaires)
│   │   │   ├── geminiApiClient.ts
│   │   │   ├── textProcessor.ts
│   │   │   ├── contentAnalyzer.ts
│   │   │   └── ftpCredentialParser.ts
│   │   └── documentation/
│   │       ├── markdownGenerator.ts
│   │       └── webScraper.ts
│   │
│   ├── stores/                   # État global (Zustand)
│   │   ├── projectStore.ts       # Projets
│   │   ├── settingsStore.ts      # Paramètres
│   │   ├── uiStore.ts            # UI (modals, notifications)
│   │   ├── scrapingStore.ts      # État scraping
│   │   ├── syncStore.ts          # Progression sync
│   │   │
│   │   │  # Nouveaux stores v1.0.1
│   │   ├── versionStore.ts       # Historique versions
│   │   ├── scheduleStore.ts      # Planification sync
│   │   └── hooksStore.ts         # Hooks post-sync
│   │
│   ├── hooks/                    # Hooks personnalisés
│   │   ├── index.ts              # Exports
│   │   ├── useAsync.ts           # Gestion états async
│   │   ├── useProjectFiltering.ts # Filtrage/tri projets
│   │   ├── useProjectForm.ts     # Formulaire projet
│   │   ├── useScraping.ts        # Scraping
│   │   ├── useColorMerge.ts      # Fusion couleurs
│   │   ├── useClientProfile.ts   # Profil client IA
│   │   ├── useMenuEvents.ts      # Événements menu macOS
│   │   ├── useSystemTray.ts      # System tray macOS
│   │   ├── useFileWatcher.ts     # Surveillance fichiers
│   │   │
│   │   │  # Nouveaux hooks v1.0.1
│   │   ├── useSyncEvents.ts      # Événements sync temps réel
│   │   └── useRetryCountdown.ts  # Countdown retry
│   │
│   ├── types/
│   │   └── index.ts              # Types TypeScript (enrichi)
│   │
│   └── styles/
│       └── globals.css           # Styles globaux
│
├── src-tauri/                    # Backend Rust/Tauri
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Config Tauri + System Tray
│   ├── src/
│   │   ├── main.rs               # Commands Tauri + menu
│   │   ├── scraper.rs            # Scraping Rust
│   │   ├── watcher.rs            # File watcher
│   │   ├── tray.rs               # System Tray macOS
│   │   │
│   │   │  # Nouveaux modules v1.0.1
│   │   ├── delta_sync.rs         # Sync incrémentale chunks
│   │   ├── version_history.rs    # Snapshots & restauration
│   │   ├── scheduler.rs          # Planification cron
│   │   ├── parallel_sync.rs      # Transfert multi-connexions
│   │   ├── transfer_resume.rs    # Reprise transferts
│   │   └── full_site_scraper.rs  # Scraping site complet
│   │
│   └── icons/
│       ├── icon.icns, icon.ico   # Icônes app
│       ├── tray-icon.png         # Icône tray normale
│       ├── tray-icon-syncing.png # Icône tray sync en cours
│       └── tray-icon-success.png # Icône tray sync OK
│
├── docs/
│   └── TECHNICAL_NOTES.md        # Notes techniques
├── DOCUMENTATION-Forge.md        # Ce fichier
├── TODO.md                       # Tâches à faire
├── package.json                  # v1.0.1
└── tsconfig.json
```

---

## Thème et Design System

### Variables CSS

```css
:root {
  /* Couleurs */
  --bg-primary: #1a1f2c;
  --bg-secondary: #242936;
  --bg-tertiary: #2d3344;
  --border: #3a4055;

  --accent: #e84c4c;
  --accent-blue: #4fc3f7;
  --accent-yellow: #ffd54f;

  --text-primary: #ffffff;
  --text-secondary: #90a4ae;

  --success: #81c784;
  --warning: #ffb74d;
  --error: #e84c4c;

  /* Espacements */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* Rayons */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Ombres */
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.15);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.2);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
}
```

### Style global

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* Scrollbar personnalisée */
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: var(--bg-primary);
}
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}
```

---

## Types TypeScript

```typescript
// types/index.ts

export interface Project {
  id: string;                    // = path
  name: string;
  path: string;
  client?: string;
  created: string;               // ISO8601
  updated: string;
  status: ProjectStatus;
  urls: ProjectURLs;
  sftp: SFTPInfo;
  scraping: ScrapingInfo;
  colors: string[];
  fonts: string[];
  notes?: string;
}

export type ProjectStatus = 'active' | 'paused' | 'archived' | 'completed';

export interface ProjectURLs {
  production?: string;
  staging?: string;
  local?: string;
}

export interface SFTPInfo {
  configured: boolean;
  host?: string;
  username?: string;
  port?: number;
  remotePath?: string;
  lastSync?: string;
}

export interface ScrapingInfo {
  completed: boolean;
  sourceUrl?: string;
  scrapedAt?: string;
}

export interface SFTPConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath: string;
}

export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'unchanged';
  localSize?: number;
  remoteSize?: number;
}

export interface Settings {
  workspacePath: string;
  geminiApiKey?: string;
  defaultSFTPPort: number;
}

export interface ParsedFTPCredentials {
  host?: string;
  username?: string;
  password?: string;
  port?: number;
  path?: string;
}

// Helpers
export const PROJECT_STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string }> = {
  active: { label: 'Actif', color: '#4fc3f7' },
  paused: { label: 'En pause', color: '#ffb74d' },
  archived: { label: 'Archivé', color: '#90a4ae' },
  completed: { label: 'Terminé', color: '#81c784' },
};
```

---

## Services

### projectService.ts

```typescript
import { invoke } from '@tauri-apps/api/tauri';
import { readDir, readTextFile, writeTextFile, createDir } from '@tauri-apps/api/fs';
import { join } from '@tauri-apps/api/path';
import { Project } from '../types';

export const projectService = {
  // Scanner le dossier de travail
  async scanProjects(workspacePath: string): Promise<Project[]> {
    const entries = await readDir(workspacePath);
    const projects: Project[] = [];

    for (const entry of entries) {
      // Ignorer les dossiers système (_ ou .)
      if (!entry.name || entry.name.startsWith('_') || entry.name.startsWith('.')) {
        continue;
      }
      if (!entry.children) continue; // Pas un dossier

      const project = await this.loadProject(entry.path, entry.name);
      if (project) projects.push(project);
    }

    return projects.sort((a, b) => a.name.localeCompare(b.name));
  },

  // Charger un projet
  async loadProject(path: string, name: string): Promise<Project | null> {
    const configPath = await join(path, '.project-config.json');
    const wwwPath = await join(path, 'www');

    // Vérifier si c'est un projet valide
    let hasConfig = false;
    let hasWWW = false;

    try {
      await readTextFile(configPath);
      hasConfig = true;
    } catch {}

    try {
      await readDir(wwwPath);
      hasWWW = true;
    } catch {}

    if (!hasConfig && !hasWWW) return null;

    // Charger la config si elle existe
    if (hasConfig) {
      try {
        const content = await readTextFile(configPath);
        const config = JSON.parse(content);
        return { ...config, path, id: path };
      } catch {}
    }

    // Créer un projet basique
    return {
      id: path,
      name,
      path,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      status: 'active',
      urls: {},
      sftp: { configured: false },
      scraping: { completed: false },
      colors: [],
      fonts: [],
    };
  },

  // Créer un nouveau projet
  async createProject(name: string, workspacePath: string, sourceURL?: string): Promise<Project> {
    const projectPath = await join(workspacePath, name);

    // Créer l'arborescence
    const folders = [
      '01-sources/psd',
      '01-sources/ai',
      '01-sources/figma',
      '01-sources/fonts',
      '02-docs',
      '03-assets/images',
      '03-assets/videos',
      '03-assets/icons',
      '03-assets/logos',
      '04-references/screenshots',
      '04-references/competitors',
      '04-references/scraped',
      'www/css',
      'www/js',
      'www/assets',
      'www/pages',
    ];

    for (const folder of folders) {
      await createDir(await join(projectPath, folder), { recursive: true });
    }

    // Créer le projet
    const project: Project = {
      id: projectPath,
      name,
      path: projectPath,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      status: 'active',
      urls: sourceURL ? { production: sourceURL } : {},
      sftp: { configured: false },
      scraping: sourceURL ? { completed: false, sourceUrl: sourceURL } : { completed: false },
      colors: [],
      fonts: [],
    };

    // Sauvegarder la config
    await this.saveProject(project);

    // Créer les fichiers template
    await this.createTemplateFiles(project);

    return project;
  },

  // Sauvegarder le projet
  async saveProject(project: Project): Promise<void> {
    const configPath = await join(project.path, '.project-config.json');
    const { path: _, id: __, ...config } = project; // Exclure path et id
    await writeTextFile(configPath, JSON.stringify(config, null, 2));
  },

  // Créer les fichiers template
  async createTemplateFiles(project: Project): Promise<void> {
    // index.html
    await writeTextFile(
      await join(project.path, 'www/index.html'),
      `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project.name}</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <h1>${project.name}</h1>
  <script src="js/main.js"></script>
</body>
</html>`
    );

    // style.css
    await writeTextFile(
      await join(project.path, 'www/css/style.css'),
      `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; line-height: 1.6; }`
    );

    // main.js
    await writeTextFile(
      await join(project.path, 'www/js/main.js'),
      `document.addEventListener('DOMContentLoaded', () => {
  console.log('${project.name} initialized');
});`
    );

    // README.md
    await writeTextFile(
      await join(project.path, 'README.md'),
      `# ${project.name}\n\n*Projet créé avec Forge*`
    );

    // .gitignore
    await writeTextFile(
      await join(project.path, '.gitignore'),
      `.DS_Store\n.ftp-config.json\ncredentials.md\nnode_modules/\n.env`
    );
  },

  // Ouvrir dans Finder
  async openInFinder(path: string): Promise<void> {
    await invoke('open_in_finder', { path });
  },

  // Ouvrir dans navigateur
  openInBrowser(url: string): void {
    window.open(url, '_blank');
  },
};
```

### sftpService.ts

**Timeouts par opération** (pour éviter le blocage UI) :
| Opération | Timeout |
|-----------|---------|
| Connection test | 15s |
| List files | 20s |
| Diff analysis | 30s |
| Full sync | 5min |

**Protection contre les opérations multiples** :
- Map `ongoingOperations` pour tracker les opérations en cours
- Empêche de lancer une sync si une est déjà en cours
- `isSyncInProgress(projectId)` pour vérifier l'état
- `clearOperationLock(projectId)` pour réinitialiser en cas de blocage

```typescript
import { invoke } from '@tauri-apps/api/tauri';
import { SFTPConfig, FileDiff, SyncOptions } from '../types';

export const sftpService = {
  // Tester la connexion (avec timeout 15s)
  async testConnection(config: SFTPConfig): Promise<boolean>,

  // Lister les fichiers distants (avec timeout 20s)
  async listRemoteFiles(config: SFTPConfig, path: string): Promise<string[]>,

  // Calculer les différences (avec timeout 30s)
  async getDiff(localPath: string, config: SFTPConfig): Promise<FileDiff[]>,

  // Synchroniser basique (avec timeout 5min)
  async sync(localPath: string, config: SFTPConfig, dryRun = false): Promise<FileDiff[]>,

  // Synchroniser avec événements temps réel (avec timeout 5min + protection duplicata)
  async syncWithEvents(localPath, config, projectId, dryRun, options?): Promise<FileDiff[]>,

  // Vérifier si une sync est en cours pour un projet
  isSyncInProgress(projectId: string): boolean,

  // Forcer la réinitialisation d'un lock d'opération
  clearOperationLock(projectId: string): void,

  // Credentials
  async saveCredentials(projectId: string, password: string): Promise<void>,
  async getCredentials(projectId: string): Promise<string | null>,
  async hasCredentials(projectId: string): Promise<boolean>,
};
```

### scrapingService.ts

**Protection contre le blocage UI** :
- Timeout de 5 minutes max pour le scraping complet
- Protection contre les scrapings multiples simultanés
- Transformation automatique snake_case -> camelCase

```typescript
export const scrapingService = {
  // Vérifier si un scraping est en cours
  isScrapingInProgress(): boolean,

  // Obtenir l'ID du projet en cours de scraping
  getCurrentScrapingProjectId(): string | null,

  // Scraping avec événements temps réel (timeout 5 min)
  async scrapeWebsiteWithEvents(config: {
    url: string;
    outputPath: string;
    maxPages: number;
    downloadImages: boolean;
    downloadCss: boolean;
    extractText: boolean;
  }, projectId: string): Promise<TransformedScrapeResult>,

  // Annuler le scraping en cours
  cancelScraping(): void,

  // Analyser un site web (couleurs, polices, etc.)
  async analyzeWebsite(url, apiKey, model?): Promise<WebsiteAnalysis>,
};
```

### geminiService.ts

```typescript
import { ParsedFTPCredentials } from '../types';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

export const geminiService = {
  // Parser les credentials FTP
  async parseFTPCredentials(text: string, apiKey: string): Promise<ParsedFTPCredentials> {
    const prompt = `Analyze this text and extract FTP/SFTP credentials.
Return a JSON object with: host, username, password, port (number), path
Use null for missing values. Return ONLY JSON, no explanation.

Text:
${text}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('Empty response from Gemini');
    }

    // Nettoyer le JSON (enlever les backticks markdown)
    const cleanJson = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanJson);
  },

  // Analyser un site web
  async analyzeWebsite(html: string, css: string | null, apiKey: string) {
    const prompt = `Analyze this website HTML/CSS and extract:
- colors: array of hex color codes (primary colors first)
- fonts: array of font names
- structure: brief description
- technologies: detected frameworks/libraries

Return ONLY JSON.

HTML:
${html.substring(0, 8000)}

${css ? `CSS:\n${css.substring(0, 4000)}` : ''}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
    });

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const cleanJson = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanJson);
  },
};
```

### storageService.ts

```typescript
import { Store } from '@tauri-apps/plugin-store';
import { Settings } from '../types';

const SETTINGS_KEY = 'settings';
let store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!store) {
    store = new Store('.settings.json');
  }
  return store;
}

export const storageService = {
  async getSettings(): Promise<Settings> {
    const s = await getStore();
    const settings = await s.get<Settings>(SETTINGS_KEY);
    return settings || {
      workspacePath: '',
      defaultSFTPPort: 22,
    };
  },

  async saveSettings(settings: Settings): Promise<void> {
    const s = await getStore();
    await s.set(SETTINGS_KEY, settings);
    await s.save();
  },

  async updateSettings(partial: Partial<Settings>): Promise<Settings> {
    const current = await this.getSettings();
    const updated = { ...current, ...partial };
    await this.saveSettings(updated);
    return updated;
  },
};
```

---

## Composants React

### App.tsx

```tsx
import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ProjectList } from './components/ProjectList';
import { ProjectDetail } from './components/ProjectDetail';
import { Settings } from './components/Settings';
import { CreateProject } from './components/CreateProject';
import { useProjects } from './hooks/useProjects';
import { useSettings } from './hooks/useSettings';
import { Project } from './types';
import './styles/globals.css';

type View = 'projects' | 'settings';

export function App() {
  const [view, setView] = useState<View>('projects');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { settings, updateSettings } = useSettings();
  const { projects, loading, refresh, createProject } = useProjects(settings.workspacePath);

  const handleCreateProject = async (name: string, sourceUrl?: string) => {
    const project = await createProject(name, sourceUrl);
    setSelectedProject(project);
    setShowCreateModal(false);
  };

  return (
    <div className="app">
      <Sidebar
        view={view}
        onViewChange={(v) => { setView(v); setSelectedProject(null); }}
        projects={projects.slice(0, 5)}
        onProjectSelect={setSelectedProject}
        onNewProject={() => setShowCreateModal(true)}
        onRefresh={refresh}
      />

      <main className="main-content">
        {view === 'settings' ? (
          <Settings settings={settings} onUpdate={updateSettings} />
        ) : selectedProject ? (
          <ProjectDetail
            project={selectedProject}
            onBack={() => setSelectedProject(null)}
            onUpdate={(p) => { setSelectedProject(p); refresh(); }}
          />
        ) : (
          <ProjectList
            projects={projects}
            loading={loading}
            onSelect={setSelectedProject}
            onNewProject={() => setShowCreateModal(true)}
          />
        )}
      </main>

      {showCreateModal && (
        <CreateProject
          workspacePath={settings.workspacePath}
          onCreate={handleCreateProject}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
```

### Sidebar.tsx

```tsx
import { Folder, Settings, Plus, RefreshCw, Hammer } from 'lucide-react';
import { Project, PROJECT_STATUS_CONFIG } from '../types';

interface SidebarProps {
  view: 'projects' | 'settings';
  onViewChange: (view: 'projects' | 'settings') => void;
  projects: Project[];
  onProjectSelect: (project: Project) => void;
  onNewProject: () => void;
  onRefresh: () => void;
}

export function Sidebar({ view, onViewChange, projects, onProjectSelect, onNewProject, onRefresh }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Hammer className="sidebar-logo" />
        <span className="sidebar-title">Forge</span>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${view === 'projects' ? 'active' : ''}`}
          onClick={() => onViewChange('projects')}
        >
          <Folder size={18} />
          <span>Projets</span>
        </button>
        <button
          className={`nav-item ${view === 'settings' ? 'active' : ''}`}
          onClick={() => onViewChange('settings')}
        >
          <Settings size={18} />
          <span>Paramètres</span>
        </button>
      </nav>

      {view === 'projects' && projects.length > 0 && (
        <div className="sidebar-section">
          <h3 className="sidebar-section-title">Récents</h3>
          {projects.map((project) => (
            <button
              key={project.id}
              className="recent-project"
              onClick={() => onProjectSelect(project)}
            >
              <span
                className="status-dot"
                style={{ background: PROJECT_STATUS_CONFIG[project.status].color }}
              />
              <span className="project-name">{project.client || project.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sidebar-footer">
        <button className="sidebar-action" onClick={onNewProject}>
          <Plus size={16} />
          <span>Nouveau</span>
        </button>
        <button className="sidebar-action icon-only" onClick={onRefresh}>
          <RefreshCw size={16} />
        </button>
      </div>
    </aside>
  );
}
```

### ProjectCard.tsx

```tsx
import { Folder, Globe, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { Project, PROJECT_STATUS_CONFIG } from '../types';
import { projectService } from '../services/projectService';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const statusConfig = PROJECT_STATUS_CONFIG[project.status];

  return (
    <div className="project-card" onClick={onClick}>
      <div className="card-header">
        <div className="card-title">
          <h3>{project.client || project.name}</h3>
          {project.client && project.client !== project.name && (
            <span className="card-subtitle">{project.name}</span>
          )}
        </div>
        <span className="status-badge" style={{
          background: `${statusConfig.color}20`,
          color: statusConfig.color
        }}>
          {statusConfig.label}
        </span>
      </div>

      <div className="card-divider" />

      <div className="card-info">
        {project.urls.production && (
          <div className="info-row">
            <Globe size={14} />
            <span>{project.urls.production}</span>
          </div>
        )}
        <div className="info-row">
          {project.sftp.configured ? (
            <>
              <CheckCircle size={14} className="success" />
              <span>SFTP configuré</span>
            </>
          ) : (
            <>
              <XCircle size={14} className="muted" />
              <span>SFTP non configuré</span>
            </>
          )}
        </div>
      </div>

      <div className="card-actions">
        <button
          className="card-action"
          onClick={(e) => { e.stopPropagation(); projectService.openInFinder(project.path); }}
          title="Ouvrir dans Finder"
        >
          <Folder size={16} />
        </button>
        {project.urls.production && (
          <button
            className="card-action"
            onClick={(e) => { e.stopPropagation(); projectService.openInBrowser(project.urls.production!); }}
            title="Ouvrir le site"
          >
            <Globe size={16} />
          </button>
        )}
        {project.sftp.configured && (
          <button className="card-action accent" title="Synchroniser">
            <RefreshCw size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
```

---

## Configuration Tauri

### src-tauri/tauri.conf.json

```json
{
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devPath": "http://localhost:1420",
    "distDir": "../dist"
  },
  "package": {
    "productName": "Forge",
    "version": "1.0.0"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "fs": {
        "all": true,
        "scope": ["$HOME/**", "$DOCUMENT/**"]
      },
      "path": { "all": true },
      "shell": {
        "all": false,
        "open": true,
        "execute": true,
        "sidecar": false,
        "scope": [
          { "name": "sftp", "cmd": "sftp", "args": true },
          { "name": "scp", "cmd": "scp", "args": true }
        ]
      },
      "dialog": { "all": true },
      "os": { "all": true }
    },
    "bundle": {
      "active": true,
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "identifier": "com.forge.app",
      "targets": "all",
      "macOS": {
        "minimumSystemVersion": "10.15"
      }
    },
    "security": {
      "csp": null
    },
    "windows": [
      {
        "fullscreen": false,
        "height": 700,
        "width": 1100,
        "minHeight": 600,
        "minWidth": 900,
        "resizable": true,
        "title": "Forge",
        "titleBarStyle": "Overlay",
        "hiddenTitle": true
      }
    ]
  }
}
```

### src-tauri/src/main.rs

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use keyring::Entry;

#[tauri::command]
fn open_in_finder(path: String) -> Result<(), String> {
    Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_password(key: String, password: String) -> Result<(), String> {
    let entry = Entry::new("com.forge.app", &key).map_err(|e| e.to_string())?;
    entry.set_password(&password).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_password(key: String) -> Result<String, String> {
    let entry = Entry::new("com.forge.app", &key).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

#[tauri::command]
async fn sftp_test_connection(
    host: String,
    port: u16,
    username: String,
    password: String,
) -> Result<bool, String> {
    // Utiliser la commande sftp avec expect ou une librairie Rust SSH
    // Pour simplifier, on retourne true si les paramètres sont valides
    Ok(!host.is_empty() && !username.is_empty() && !password.is_empty())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_in_finder,
            save_password,
            get_password,
            sftp_test_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### src-tauri/Cargo.toml

```toml
[package]
name = "forge"
version = "1.0.0"
description = "Application de gestion de projets web"
edition = "2021"

[build-dependencies]
tauri-build = { version = "1.5", features = [] }

[dependencies]
tauri = { version = "1.5", features = ["api-all", "shell-execute", "shell-open", "dialog-all", "fs-all", "path-all"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
keyring = "2.3"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

---

## Styles CSS complets

### globals.css

```css
:root {
  --bg-primary: #1a1f2c;
  --bg-secondary: #242936;
  --bg-tertiary: #2d3344;
  --border: #3a4055;
  --accent: #e84c4c;
  --accent-blue: #4fc3f7;
  --accent-yellow: #ffd54f;
  --text-primary: #ffffff;
  --text-secondary: #90a4ae;
  --success: #81c784;
  --warning: #ffb74d;
  --error: #e84c4c;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
}

.app {
  display: flex;
  height: 100vh;
}

/* Sidebar */
.sidebar {
  width: 220px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  -webkit-app-region: drag;
}

.sidebar-header {
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--border);
}

.sidebar-logo { color: var(--accent); }
.sidebar-title { font-size: 18px; font-weight: 600; }

.sidebar-nav {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 150ms;
}

.nav-item:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.nav-item.active { background: var(--accent-blue); color: white; }

.sidebar-section {
  padding: 12px;
  flex: 1;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.sidebar-section-title {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.recent-project {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: left;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.recent-project:hover { background: var(--bg-tertiary); color: var(--text-primary); }

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.sidebar-action {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--accent-blue);
  font-size: 13px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.sidebar-action:hover { background: var(--bg-tertiary); }
.sidebar-action.icon-only { padding: 8px; color: var(--text-secondary); }

/* Main content */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* Project cards */
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.project-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  cursor: pointer;
  transition: all 150ms;
}

.project-card:hover {
  border-color: var(--accent-blue);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.card-title h3 { font-size: 16px; font-weight: 600; }
.card-subtitle { font-size: 12px; color: var(--text-secondary); }

.status-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.card-divider {
  height: 1px;
  background: var(--border);
  margin: 12px 0;
}

.card-info { display: flex; flex-direction: column; gap: 8px; }

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.info-row .success { color: var(--success); }
.info-row .muted { color: var(--text-secondary); }

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.card-action {
  padding: 8px;
  border: none;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 150ms;
}

.card-action:hover { color: var(--text-primary); }
.card-action.accent { color: var(--accent-blue); }

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 500px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h2 { font-size: 18px; }

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* Forms */
.form-field { margin-bottom: 16px; }
.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 14px;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

/* Buttons */
.btn {
  padding: 10px 16px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms;
}

.btn-primary { background: var(--accent); color: white; }
.btn-primary:hover { filter: brightness(1.1); }

.btn-secondary { background: var(--bg-tertiary); color: var(--text-primary); }
.btn-secondary:hover { background: var(--border); }
```

---

## Installation

```bash
cd /Dropbox/Applications/Forge

# Installer les dépendances
npm install

# Initialiser Tauri (si pas déjà fait)
npm run tauri init

# Lancer en développement
npm run tauri dev

# Compiler l'application
npm run tauri build
```

L'application compilée sera dans `src-tauri/target/release/bundle/`.

---

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| ⌘N | Nouveau projet |
| ⌘, | Paramètres |
| ⌘R | Rafraîchir la liste |

---

## Hooks Personnalisés

### useProjectFiltering

Hook centralisé pour le filtrage et tri des projets. Utilisé par `Sidebar` et `ProjectList`.

```typescript
import { useProjectFiltering } from '../hooks';

const {
  searchQuery,      // string - terme de recherche actuel
  setSearchQuery,   // (query: string) => void
  sortBy,           // 'name' | 'date'
  setSortBy,        // (sort: SortBy) => void
  filteredProjects, // Project[] - projets filtrés et triés
  clearSearch,      // () => void - vide la recherche
  hasActiveFilter,  // boolean - true si recherche active
} = useProjectFiltering(projects, {
  initialSortBy: 'name',      // 'name' | 'date' (défaut: 'name')
  initialSearchQuery: '',     // string (défaut: '')
});
```

### useAsync

Gestion des états asynchrones avec loading/error.

```typescript
const { data, loading, error, execute } = useAsync(asyncFn);
```

### useColorMerge

Fusion de couleurs similaires (distance RGB < seuil).

```typescript
const { mergedColors, merge } = useColorMerge(colors, threshold);
```

### useClientProfile

Génération du profil client via Gemini API.

```typescript
const { generate, profile, loading } = useClientProfile(project, apiKey);
```

---

## État Global (Zustand Stores)

### projectStore

```typescript
const {
  projects,           // Project[]
  loading,            // boolean
  selectedProjectId,  // string | null
  fetchProjects,      // (workspacePath) => Promise<void>
  selectProject,      // (id) => void
  createProject,      // (data, workspacePath, folderStructure) => Promise<Project>
  deleteProject,      // (id) => Promise<void>
  updateProjectLocally, // (project) => void
} = useProjectStore();
```

### settingsStore

```typescript
const {
  workspacePath,    // string
  geminiApiKey,     // string
  geminiModel,      // string
  folderStructure,  // FolderNode[]
  updateSettings,   // (partial) => void
  loadSettings,     // () => Promise<void>
  isHydrated,       // boolean
} = useSettingsStore();
```

### uiStore

```typescript
const {
  activeModal,      // string | null
  openModal,        // (name) => void
  closeModal,       // () => void
  notifications,    // Notification[]
  addNotification,  // (type, message) => void
} = useUIStore();
```

---

## Notes d'implémentation

1. **Tauri vs Electron** : Tauri utilise le WebView natif du système, donc l'app est beaucoup plus légère (~10MB vs ~150MB).

2. **Stockage des credentials** : Les mots de passe FTP sont stockés via `configStore` (Tauri Store) avec obfuscation XOR+Base64. Fichier: `~/Library/Application Support/com.forge.app/credentials.dat`

3. **SFTP** : Utilise le crate `ssh2` en Rust pour les connexions FTP/SFTP.

4. **Gemini API** : Appelée directement depuis le frontend. Services modulaires dans `src/services/gemini/`.

5. **Filesystem** : Tauri fournit des APIs pour lire/écrire des fichiers. Stockage principal via Tauri Plugin Store.

6. **Drag region** : La sidebar a `-webkit-app-region: drag` pour permettre de déplacer la fenêtre.

7. **DnD** : Utilise `@dnd-kit/core` pour le drag & drop (TreeView, ProjectFileTree).

8. **État global** : Zustand pour la gestion d'état (5 stores: project, settings, ui, scraping, sync).

---

## Fonctionnalités v1.0.1

### Fonctionnalités de base
- **Recherche et tri** : Barre de recherche et boutons de tri dans Sidebar et ProjectList
- **Génération de brief** : Bouton pour générer un fichier Markdown complet du projet
- **Menu macOS natif** : Menu en français avec raccourcis clavier
- **Scraping amélioré** : Progression détaillée, fusion de couleurs similaires
- **Backup/Restore** : Sauvegarde et restauration des paramètres et credentials

### System Tray (Menu Bar macOS)
Icône dans la barre de menu macOS avec :
- **7 projets récents** : Liste des projets triés par date de modification
- **Actions rapides** : Ouvrir dans Finder ou Synchroniser FTP
- **Indicateur de sync** : 3 états visuels (normal, syncing, success)

```typescript
// Hook useSystemTray
const {
  isAvailable,           // boolean
  updateRecentProjects,  // (projects) => Promise<void>
  setSyncIndicator,      // ('normal' | 'syncing' | 'success') => Promise<void>
  onOpenFinder,          // (callback) => void
  onSyncProject,         // (callback) => void
} = useSystemTray();
```

### Delta Sync (Synchronisation incrémentale)
Transfert intelligent qui n'envoie que les portions modifiées des fichiers.

**Caractéristiques** :
- Taille de chunk : 64KB
- Seuil minimum : 256KB (fichiers plus petits transférés entièrement)
- Hash SHA-256 par chunk pour détection des changements
- Cache de signatures par projet

**Types** :
```typescript
type DeltaStatus = 'new' | 'unchanged' | 'modified' | 'smallfile' | 'deleted';

interface DeltaTransferStats {
  total_files: number;
  new_files: number;
  modified_files: number;
  unchanged_files: number;
  deleted_files: number;
  total_size: number;       // Taille totale des fichiers
  transfer_size: number;    // Taille réellement transférée
  savings_bytes: number;    // Économie en octets
  savings_percent: number;  // Pourcentage d'économie
}
```

**Module Rust** : `src-tauri/src/delta_sync.rs`
**Service Frontend** : `src/services/deltaService.ts`
**Composant** : `src/components/DeltaSyncStats.tsx`

### Version History (Historique des versions)
Système de snapshots pour sauvegarder et restaurer l'état des fichiers.

**Fonctionnalités** :
- Création de snapshots avant sync (manuel ou automatique)
- Comparaison entre snapshots (diff)
- Restauration complète ou fichier par fichier
- Message descriptif optionnel par snapshot

**Composant** : `src/components/VersionHistory.tsx`
**Store** : `src/stores/versionStore.ts`
**Module Rust** : `src-tauri/src/version_history.rs`

```typescript
interface SyncSnapshot {
  id: string;
  project_id: string;
  timestamp: string;
  files: FileVersion[];
  total_size: number;
  files_count: number;
  message?: string;
}

interface SnapshotDiff {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: string[];
}
```

### Scheduler (Planification automatique)
Planification des synchronisations automatiques avec expressions cron.

**Fréquences disponibles** :
- Horaire (chaque heure à la minute X)
- Quotidien (chaque jour à HH:MM)
- Hebdomadaire (jour de semaine + heure)
- Mensuel (1er du mois + heure)
- Personnalisé (expression cron)

**Composant** : `src/components/SyncScheduler.tsx`
**Store** : `src/stores/scheduleStore.ts`
**Module Rust** : `src-tauri/src/scheduler.rs`

```typescript
type ScheduleType = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

interface SyncSchedule {
  project_id: string;
  enabled: boolean;
  schedule_type: ScheduleType;
  cron_expression?: string;
  next_run?: string;
  last_run?: string;
  last_result?: ScheduleResult;
}
```

### Project Dashboard (Tableau de bord)
Vue métrique d'un projet avec statistiques de synchronisation.

**Métriques affichées** :
- Nombre total de syncs
- Fichiers uploadés
- Volume transféré (formaté)
- Durée moyenne des syncs
- Taux de succès
- Répartition par type de fichier
- Historique des syncs récentes

**Composant** : `src/components/ProjectDashboard.tsx`

### Parallel Sync (Synchronisation parallèle)
Transfert simultané de plusieurs fichiers via connexions FTP multiples.

**Options** :
```typescript
interface SyncOptions {
  parallel_enabled: boolean;     // Activer le parallélisme
  parallel_connections: number;  // Nombre de connexions (2-8)
  create_snapshot: boolean;      // Créer snapshot avant sync
  snapshot_message?: string;     // Message du snapshot
}
```

**Module Rust** : `src-tauri/src/parallel_sync.rs`

### Transfer Resume (Reprise de transfert)
Reprise automatique des transferts interrompus.

**Module Rust** : `src-tauri/src/transfer_resume.rs`
**Service Frontend** : `src/services/transferResumeService.ts`

### FTP Log Window (Journal FTP)
Fenêtre de log en temps réel des opérations FTP.

**Composant** : `src/components/FTPLogWindow.tsx`

```typescript
type SyncLogLevel = 'info' | 'success' | 'warning' | 'error';

interface SyncLogEntry {
  id: string;
  timestamp: number;
  level: SyncLogLevel;
  message: string;
  file?: string;
  details?: string;
}
```

---

## Nouveaux Statuts de Projet

Le workflow de projet a été revu pour mieux refléter le cycle de vie d'un projet de refonte web.

| Ancien statut | Nouveau statut | Couleur |
|---------------|----------------|---------|
| - | prospect | Orange (#ffb74d) |
| active | development | Bleu (#4fc3f7) |
| paused | review | Violet (#ce93d8) |
| - | validated | Vert clair (#aed581) |
| completed | live | Vert (#81c784) |
| archived | archived | Gris (#90a4ae) |

```typescript
type ProjectStatus = 'prospect' | 'development' | 'review' | 'validated' | 'live' | 'archived';
```

---

## Nouvelle Structure de Dossiers Projet

Structure simplifiée pour le workflow de refonte de sites web.

```
MonProjet/
├── _Inbox/                    # Dépôt fichiers à analyser
│   └── scraped/               # Fichiers bruts du scraping
├── Source/                    # Code source du nouveau site
├── Documentation/             # Documentation projet
│   ├── admin/                 # Devis, contrats, factures
│   ├── textes/                # Contenus textuels
│   └── notes/                 # Notes et comptes-rendus
├── Assets/                    # Ressources graphiques
│   ├── images/                # Images du projet
│   └── design/                # Maquettes, wireframes
├── References/                # Ancien site client
│   ├── images/                # Images récupérées
│   └── styles/                # CSS, couleurs, polices
├── www/                       # Dossier déploiement FTP
│   ├── css/                   # Feuilles de style
│   └── js/                    # Scripts JavaScript
└── .project-config.json       # Configuration projet
```

---

## Nouveaux Champs Projet

```typescript
interface Project {
  // ... champs existants

  // URLs révisées
  urls: {
    currentSite?: string;    // URL du site actuel (ancien site client)
    testUrl?: string;        // URL de test/prévisualisation
    staging?: string;
    local?: string;
    production?: string;     // @deprecated
  };

  // Sites de référence graphique (max 5)
  referenceWebsites: ReferenceWebsite[];

  // Profil client IA
  clientDescription?: string;    // Description activité client
  themeTags?: string[];          // Tags de thème/design
  themeTagsGeneratedAt?: string; // Date génération tags
}

interface ReferenceWebsite {
  url: string;
  name?: string;
  addedAt: string;
}
```

---

## Nouveaux Stores Zustand

### syncStore (mis à jour)

```typescript
const {
  // État
  stage,                // SyncStage: 'idle' | 'connecting' | 'retrying' | 'analyzing' | 'uploading' | 'complete' | 'error' | 'cancelled'
  progress,             // number 0-100
  currentFile,          // string | null
  filesTotal,
  filesCompleted,
  files,                // SyncFileProgress[]
  logs,                 // SyncLogEntry[]
  failedFiles,          // SyncFailedFile[]
  error,                // string | null
  retry,                // RetryState
  lastConnectionFailed, // boolean - true si dernière connexion a timeout
  lastConnectionAttempt, // number | null - timestamp de la dernière tentative

  // Actions
  getSyncState,         // (projectId) => SyncState
  canStartSync,         // (projectId) => { allowed: boolean; reason?: string }
  startSync,            // (project, onComplete?) => Promise<void>
  previewSync,          // (project) => Promise<FileDiff[]>
  resetSync,            // (projectId) => void
  cancelSync,           // (projectId) => Promise<void>
  clearConnectionError, // (projectId) => void - réinitialise l'état de connexion
  addLog,               // (projectId, entry) => void
  clearLogs,            // (projectId) => void
  retryFailedFile,      // (projectId, filePath) => void
} = useSyncStore();
```

**Protection contre le blocage UI** :
- `canStartSync()` vérifie si une sync peut démarrer (pas de sync en cours, pas en cooldown)
- Cooldown de 5 secondes après un timeout de connexion
- `clearConnectionError()` permet de réinitialiser manuellement l'état

### versionStore

```typescript
const {
  snapshots,           // Record<string, SnapshotSummary[]>
  selectedSnapshot,    // SyncSnapshot | null
  loading,
  error,

  loadSnapshots,       // (projectId) => Promise<void>
  createSnapshot,      // (projectId, localPath, message?) => Promise<SyncSnapshot>
  getSnapshotDetails,  // (projectId, snapshotId) => Promise<SyncSnapshot>
  restoreVersion,      // (projectId, snapshotId, localPath, files?) => Promise<string[]>
  compareSnapshots,    // (projectId, id1, id2) => Promise<SnapshotDiff>
  deleteSnapshot,      // (projectId, snapshotId) => Promise<void>
  clearError,
} = useVersionStore();
```

### scheduleStore

```typescript
const {
  schedules,           // Record<string, SyncSchedule>
  loading,
  error,

  loadSchedules,       // () => Promise<void>
  setSchedule,         // (schedule) => Promise<SyncSchedule>
  removeSchedule,      // (projectId) => Promise<void>
  setEnabled,          // (projectId, enabled) => Promise<void>
  getSchedule,         // (projectId) => SyncSchedule | undefined
  clearError,
} = useScheduleStore();
```

### hooksStore

```typescript
const {
  hooks,               // PostSyncHook[]
  loading,

  addHook,             // (hook) => void
  removeHook,          // (id) => void
  updateHook,          // (id, updates) => void
  executeHooks,        // (projectId, context) => Promise<void>
} = useHooksStore();
```

---

## Modules Rust Ajoutés

| Module | Fichier | Description |
|--------|---------|-------------|
| Delta Sync | `delta_sync.rs` | Synchronisation incrémentale par chunks |
| Version History | `version_history.rs` | Snapshots et restauration |
| Scheduler | `scheduler.rs` | Planification cron des syncs |
| Parallel Sync | `parallel_sync.rs` | Transfert multi-connexions |
| Transfer Resume | `transfer_resume.rs` | Reprise transferts interrompus |
| Full Site Scraper | `full_site_scraper.rs` | Scraping complet de sites |
| Tray | `tray.rs` | Gestion du System Tray macOS |

---

## Événements Tauri (Sync Progress)

Événements émis pendant la synchronisation FTP :

```typescript
type SyncEventType =
  | 'connecting'      // Connexion au serveur
  | 'analyzing'       // Analyse des fichiers
  | 'file_start'      // Début transfert fichier
  | 'file_progress'   // Progression fichier
  | 'file_complete'   // Fichier terminé
  | 'file_error'      // Erreur sur fichier
  | 'complete'        // Sync terminée
  | 'error'           // Erreur globale
  | 'cancelled';      // Annulation

interface SyncProgressEvent {
  project_id: string;
  event: SyncEventType;
  file: string | null;
  progress: number;           // 0-100 global
  file_progress: number | null; // 0-100 fichier
  bytes_sent: number | null;
  bytes_total: number | null;
  message: string | null;
  timestamp: number;
}

// Écoute des événements
listen<SyncProgressEvent>('sync-progress', (event) => {
  console.log(event.payload);
});
```

---

## Configuration Tauri mise à jour

```json
{
  "package": {
    "productName": "La Forge",
    "version": "1.0.1"
  },
  "tauri": {
    "systemTray": {
      "iconPath": "icons/tray-icon.png",
      "iconAsTemplate": true,
      "menuOnLeftClick": true
    },
    "updater": {
      "active": true,
      "dialog": true,
      "endpoints": ["https://github.com/flagorn-sudo/Laforge/releases/latest/download/latest.json"]
    },
    "bundle": {
      "resources": [
        "icons/tray-icon.png",
        "icons/tray-icon-syncing.png",
        "icons/tray-icon-success.png"
      ]
    }
  }
}
```
