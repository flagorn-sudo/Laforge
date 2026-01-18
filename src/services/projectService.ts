import { invoke } from '@tauri-apps/api/tauri';
import { readDir, readTextFile, writeTextFile, createDir, removeDir } from '@tauri-apps/api/fs';
import { join } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/api/shell';
import { Project, DEFAULT_FOLDER_STRUCTURE, migrateProjectStatus } from '../types';
import { ProjectFormData } from '../components/ProjectForm';
import { configStore } from './configStore';

export const projectService = {
  async scanProjects(workspacePath: string): Promise<Project[]> {
    if (!workspacePath) return [];

    try {
      const entries = await readDir(workspacePath);
      const projects: Project[] = [];

      for (const entry of entries) {
        if (!entry.name || entry.name.startsWith('_') || entry.name.startsWith('.')) {
          continue;
        }
        if (!entry.children) continue;

        const project = await this.loadProject(entry.path!, entry.name);
        if (project) projects.push(project);
      }

      return projects.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Error scanning projects:', error);
      return [];
    }
  },

  async loadProject(path: string, name: string): Promise<Project | null> {
    // 1. Try loading from the new store (atomic storage)
    try {
      const storedConfig = await configStore.getProjectConfig<Omit<Project, 'path' | 'id'>>(path);
      if (storedConfig) {
        return {
          ...storedConfig,
          path,
          id: path,
          status: migrateProjectStatus(storedConfig.status),
          referenceWebsites: storedConfig.referenceWebsites || [],
          urls: {
            ...storedConfig.urls,
            currentSite: storedConfig.urls?.currentSite || storedConfig.urls?.production,
          },
        };
      }
    } catch (e) {
      console.warn('Failed to load from store, trying legacy file:', e);
    }

    // 2. Migration: try loading from legacy .project-config.json file
    try {
      const configPath = await join(path, '.project-config.json');
      const content = await readTextFile(configPath);
      const legacyConfig = JSON.parse(content);

      // Migrate to new store
      const { path: _, id: __, ...configToStore } = { ...legacyConfig, path, id: path };
      await configStore.saveProjectConfig(path, configToStore);
      console.log('Migrated project config to store:', name);

      return {
        ...legacyConfig,
        path,
        id: path,
        status: migrateProjectStatus(legacyConfig.status),
        referenceWebsites: legacyConfig.referenceWebsites || [],
        urls: {
          ...legacyConfig.urls,
          currentSite: legacyConfig.urls?.currentSite || legacyConfig.urls?.production,
        },
      };
    } catch {
      // 3. No config found - create a new default project
      return {
        id: path,
        name,
        path,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        status: 'prospect',
        urls: {},
        sftp: { configured: false },
        scraping: { completed: false },
        colors: [],
        fonts: [],
        referenceWebsites: [],
      };
    }
  },

  async createProject(
    name: string,
    workspacePath: string,
    sourceURL?: string,
    folderStructure?: string[]
  ): Promise<Project> {
    const projectPath = await join(workspacePath, name);

    // Utiliser la structure personnalisee ou la structure par defaut
    const folders = folderStructure || DEFAULT_FOLDER_STRUCTURE;

    for (const folder of folders) {
      await createDir(await join(projectPath, folder), { recursive: true });
    }

    const project: Project = {
      id: projectPath,
      name,
      path: projectPath,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      status: 'prospect',
      urls: sourceURL ? { production: sourceURL, currentSite: sourceURL } : {},
      sftp: { configured: false },
      scraping: sourceURL ? { completed: false, sourceUrl: sourceURL } : { completed: false },
      colors: [],
      fonts: [],
      referenceWebsites: [],
    };

    await this.saveProject(project);
    await this.createTemplateFiles(project);

    return project;
  },

  async createProjectWithData(
    data: ProjectFormData,
    workspacePath: string,
    folderStructure?: string[]
  ): Promise<Project> {
    const projectPath = await join(workspacePath, data.name);

    // Use custom structure or default
    const folders = folderStructure || DEFAULT_FOLDER_STRUCTURE;

    // Step 1: Create folder structure
    console.log('[projectService] Creating folder structure for:', data.name);
    for (const folder of folders) {
      await createDir(await join(projectPath, folder), { recursive: true });
    }
    console.log('[projectService] Folders created successfully');

    const hasSftp = data.sftp.host && data.sftp.username;

    const project: Project = {
      id: projectPath,
      name: data.name,
      path: projectPath,
      client: data.client || undefined,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      status: 'prospect',
      urls: {
        currentSite: data.currentSiteUrl || undefined,
        testUrl: data.testUrl || undefined,
        // Keep production for backward compatibility
        production: data.currentSiteUrl || undefined,
      },
      sftp: hasSftp
        ? {
            configured: true,
            host: data.sftp.host,
            username: data.sftp.username,
            port: data.sftp.port || 21,
            remotePath: data.sftp.remotePath || '/public_html',
            passive: data.sftp.passive ?? true,
            protocol: data.sftp.protocol || 'ftp',
            acceptInvalidCerts: data.sftp.acceptInvalidCerts ?? false,
          }
        : { configured: false },
      scraping: data.currentSiteUrl
        ? { completed: false, sourceUrl: data.currentSiteUrl }
        : { completed: false },
      colors: [],
      fonts: [],
      localPath: data.localPath || 'www',
      referenceWebsites: data.referenceWebsites || [],
    };

    // Step 2: Save project config
    console.log('[projectService] Saving project config...');
    await this.saveProject(project);
    console.log('[projectService] Project config saved');

    // Step 3: Create template files (non-blocking)
    this.createTemplateFilesWithPath(project, data.localPath || 'www')
      .then(() => console.log('[projectService] Template files created'))
      .catch((e) => console.warn('[projectService] Template files failed:', e));

    return project;
  },

  async createTemplateFilesWithPath(project: Project, localPath: string): Promise<void> {
    try {
      // Ensure subdirectories exist before writing files
      await createDir(await join(project.path, localPath, 'css'), { recursive: true });
      await createDir(await join(project.path, localPath, 'js'), { recursive: true });

      await writeTextFile(
        await join(project.path, `${localPath}/index.html`),
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

      await writeTextFile(
        await join(project.path, `${localPath}/css/style.css`),
        `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; line-height: 1.6; }`
      );

      await writeTextFile(
        await join(project.path, `${localPath}/js/main.js`),
        `document.addEventListener('DOMContentLoaded', () => {
  console.log('${project.name} initialized');
});`
      );

      await writeTextFile(
        await join(project.path, 'README.md'),
        `# ${project.name}\n\n*Projet créé avec Forge*`
      );

      await writeTextFile(
        await join(project.path, '.gitignore'),
        `.DS_Store\n.ftp-config.json\ncredentials.md\nnode_modules/\n.env`
      );
    } catch (error) {
      // Template files are not critical - log but don't fail
      console.warn('Could not create some template files:', error);
    }
  },

  async saveProject(project: Project): Promise<void> {
    const { path: _, id: __, ...config } = project;
    await configStore.saveProjectConfig(project.id, config);
  },

  async createTemplateFiles(project: Project): Promise<void> {
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

    await writeTextFile(
      await join(project.path, 'www/css/style.css'),
      `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; line-height: 1.6; }`
    );

    await writeTextFile(
      await join(project.path, 'www/js/main.js'),
      `document.addEventListener('DOMContentLoaded', () => {
  console.log('${project.name} initialized');
});`
    );

    await writeTextFile(
      await join(project.path, 'README.md'),
      `# ${project.name}\n\n*Projet créé avec Forge*`
    );

    await writeTextFile(
      await join(project.path, '.gitignore'),
      `.DS_Store\n.ftp-config.json\ncredentials.md\nnode_modules/\n.env`
    );
  },

  async deleteProject(projectPath: string): Promise<void> {
    await removeDir(projectPath, { recursive: true });
  },

  async openInFinder(path: string): Promise<void> {
    await invoke('open_in_finder', { path });
  },

  async openInBrowser(url: string): Promise<void> {
    console.log('[projectService] Opening URL in browser:', url);
    if (!url) {
      console.error('[projectService] openInBrowser: URL is empty');
      return;
    }
    try {
      await open(url);
      console.log('[projectService] URL opened successfully');
    } catch (err) {
      console.error('[projectService] Failed to open URL:', err);
    }
  },
};
