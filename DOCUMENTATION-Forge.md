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
│   ├── App.tsx                   # Composant racine + routing
│   ├── components/
│   │   ├── Sidebar.tsx           # Navigation latérale
│   │   ├── ProjectList.tsx       # Grille des projets
│   │   ├── ProjectCard.tsx       # Carte projet
│   │   ├── ProjectDetail.tsx     # Vue détaillée
│   │   ├── CreateProject.tsx     # Modal création
│   │   ├── Settings.tsx          # Paramètres
│   │   ├── SFTPConfig.tsx        # Configuration SFTP
│   │   ├── SmartPaste.tsx        # Smart Paste FTP
│   │   └── ui/                   # Composants réutilisables
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Modal.tsx
│   │       ├── Badge.tsx
│   │       └── Card.tsx
│   ├── services/
│   │   ├── projectService.ts     # CRUD projets
│   │   ├── sftpService.ts        # Synchronisation SFTP
│   │   ├── geminiService.ts      # API Gemini
│   │   └── storageService.ts     # LocalStorage + fichiers
│   ├── hooks/
│   │   ├── useProjects.ts        # Hook gestion projets
│   │   └── useSettings.ts        # Hook paramètres
│   ├── types/
│   │   └── index.ts              # Types TypeScript
│   └── styles/
│       └── globals.css           # Styles globaux + thème
├── src-tauri/                    # Backend Rust/Tauri
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Config Tauri
│   ├── src/
│   │   └── main.rs               # Commands Tauri
│   └── icons/                    # Icônes app
├── public/
│   └── forge.svg                 # Logo
├── package.json
├── vite.config.ts
├── tsconfig.json
└── index.html
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

```typescript
import { invoke } from '@tauri-apps/api/tauri';
import { SFTPConfig, FileDiff } from '../types';

export const sftpService = {
  // Tester la connexion
  async testConnection(config: SFTPConfig): Promise<boolean> {
    try {
      return await invoke('sftp_test_connection', { config });
    } catch (error) {
      console.error('SFTP connection test failed:', error);
      return false;
    }
  },

  // Lister les fichiers distants
  async listRemoteFiles(config: SFTPConfig, path: string): Promise<string[]> {
    return await invoke('sftp_list_files', { config, path });
  },

  // Calculer les différences
  async getDiff(localPath: string, config: SFTPConfig): Promise<FileDiff[]> {
    return await invoke('sftp_get_diff', { localPath, config });
  },

  // Synchroniser
  async sync(localPath: string, config: SFTPConfig, dryRun = false): Promise<FileDiff[]> {
    return await invoke('sftp_sync', { localPath, config, dryRun });
  },

  // Sauvegarder les credentials (via Tauri secure storage)
  async saveCredentials(projectId: string, password: string): Promise<void> {
    await invoke('save_password', { key: `sftp_${projectId}`, password });
  },

  // Récupérer les credentials
  async getCredentials(projectId: string): Promise<string | null> {
    try {
      return await invoke('get_password', { key: `sftp_${projectId}` });
    } catch {
      return null;
    }
  },
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

## Notes d'implémentation

1. **Tauri vs Electron** : Tauri utilise le WebView natif du système, donc l'app est beaucoup plus légère (~10MB vs ~150MB).

2. **Keychain** : Le crate `keyring` Rust gère le stockage sécurisé des mots de passe dans le Keychain macOS.

3. **SFTP** : Pour une implémentation complète, utiliser le crate `ssh2` en Rust ou exécuter les commandes système `sftp`/`scp`.

4. **Gemini API** : Appelée directement depuis le frontend en JavaScript (pas besoin de passer par Rust).

5. **Filesystem** : Tauri fournit des APIs pour lire/écrire des fichiers avec les permissions appropriées.

6. **Drag region** : La sidebar a `-webkit-app-region: drag` pour permettre de déplacer la fenêtre.
