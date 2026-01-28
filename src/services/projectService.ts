import { invoke } from '@tauri-apps/api/tauri';
import { readDir, readTextFile, writeTextFile, createDir, removeDir, exists } from '@tauri-apps/api/fs';
import { join, basename } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/api/shell';
import { Project, DEFAULT_FOLDER_STRUCTURE, migrateProjectStatus, ImportAnalysis, ProjectHealth } from '../types';
import { ProjectFormData } from '../components/ProjectForm';
import { configStore } from './configStore';

export const projectService = {
  /**
   * @deprecated Use loadRegisteredProjects instead
   * Kept for backwards compatibility during migration
   */
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

  /**
   * Load projects from a list of registered paths
   * Returns both successfully loaded projects and errors for missing/inaccessible paths
   */
  async loadRegisteredProjects(registeredPaths: string[]): Promise<{
    projects: Project[];
    errors: ProjectHealth[];
  }> {
    const projects: Project[] = [];
    const errors: ProjectHealth[] = [];

    for (const path of registeredPaths) {
      try {
        // Check if the folder exists
        const folderExists = await this.checkFolderExists(path);

        if (!folderExists) {
          errors.push({
            path,
            exists: false,
            accessible: false,
            lastChecked: new Date().toISOString(),
            error: 'Dossier introuvable',
          });
          continue;
        }

        // Get the project name from path
        const name = await basename(path);

        // Load the project
        const project = await this.loadProject(path, name);
        if (project) {
          projects.push(project);
        }
      } catch (e) {
        // Handle permission or other errors
        const errorMessage = e instanceof Error ? e.message : String(e);
        const isPermissionError = errorMessage.toLowerCase().includes('permission')
          || errorMessage.toLowerCase().includes('access');

        errors.push({
          path,
          exists: true, // Might exist but not accessible
          accessible: false,
          lastChecked: new Date().toISOString(),
          error: isPermissionError
            ? 'Accès refusé - vérifiez les permissions dans Préférences Système > Confidentialité'
            : errorMessage,
        });
      }
    }

    return {
      projects: projects.sort((a, b) => a.name.localeCompare(b.name)),
      errors,
    };
  },

  /**
   * Check if a folder exists and is accessible
   */
  async checkFolderExists(path: string): Promise<boolean> {
    try {
      return await exists(path);
    } catch {
      return false;
    }
  },

  /**
   * Register a project path (for use by settingsStore)
   * Returns true if the path is valid and was registered
   */
  async validateProjectPath(path: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const folderExists = await this.checkFolderExists(path);
      if (!folderExists) {
        return { valid: false, error: 'Le dossier n\'existe pas' };
      }

      // Check if it's a directory by trying to read it
      try {
        await readDir(path);
        return { valid: true };
      } catch {
        return { valid: false, error: 'Le chemin n\'est pas un dossier valide' };
      }
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : 'Erreur de validation',
      };
    }
  },

  async loadProject(path: string, name: string): Promise<Project | null> {
    // 1. Try loading from the new store (atomic storage)
    try {
      const storedConfig = await configStore.getProjectConfig<Omit<Project, 'path' | 'id'>>(path);
      if (storedConfig) {
        // Check if we have an encrypted password inline
        const hasInlinePassword = storedConfig.sftp?.encryptedPassword;

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
          sftp: {
            ...storedConfig.sftp,
            // Mark password as available if we have an encrypted password inline
            passwordAvailable: hasInlinePassword ? true : storedConfig.sftp?.passwordAvailable,
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
        `# ${project.name}\n\n*Projet créé avec La Forge*`
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

  /**
   * Save project with atomic operation
   * Includes backup creation, verification, and optional password encryption
   */
  async saveProject(project: Project, password?: string): Promise<void> {
    const { path: _, id: __, ...config } = project;

    // If a password is provided, encrypt it and store inline
    if (password && project.sftp.configured) {
      config.sftp = {
        ...config.sftp,
        encryptedPassword: configStore.encrypt(password),
        passwordAvailable: true,
      };
    }

    // configStore.saveProjectConfig already handles:
    // 1. Backup creation
    // 2. Atomic save
    // 3. Verification
    // 4. Rollback on failure
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
      `# ${project.name}\n\n*Projet créé avec La Forge*`
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
    if (!url || !url.trim()) {
      console.error('[projectService] openInBrowser: URL is empty');
      return;
    }

    // Normalize URL: add https:// if protocol is missing
    let normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    try {
      await open(normalizedUrl);
      console.log('[projectService] URL opened successfully:', normalizedUrl);
    } catch (err) {
      console.error('[projectService] Failed to open URL:', err);
    }
  },

  /**
   * Open a project folder in PyCharm
   * Uses the 'pycharm' CLI command (requires PyCharm to have CLI tools installed)
   */
  async openInPyCharm(projectPath: string, sourcePath?: string): Promise<void> {
    // Open sourcePath subfolder if specified, otherwise project root
    const pathToOpen = sourcePath
      ? await join(projectPath, sourcePath)
      : projectPath;

    try {
      // Try opening with PyCharm CLI
      await invoke('open_in_editor', { path: pathToOpen, editor: 'pycharm' });
    } catch (err) {
      console.error('[projectService] Failed to open in PyCharm:', err);
      // Fallback: try opening with generic 'open' command
      try {
        await open(`pycharm://${pathToOpen}`);
      } catch (fallbackErr) {
        console.error('[projectService] Fallback also failed:', fallbackErr);
      }
    }
  },

  /**
   * Analyze an existing folder to determine what Forge structure exists
   */
  async analyzeExistingFolder(folderPath: string): Promise<ImportAnalysis> {
    // Get folder name from path
    const name = await basename(folderPath);

    // Read directory contents
    let entries;
    try {
      entries = await readDir(folderPath);
    } catch (error) {
      throw new Error(`Impossible de lire le dossier: ${error}`);
    }

    // Get list of existing folders (first level only)
    const existingFolderNames = new Set<string>();
    for (const entry of entries) {
      if (entry.children !== undefined && entry.name) {
        existingFolderNames.add(entry.name);
      }
    }

    // Compare with DEFAULT_FOLDER_STRUCTURE
    const existingFolders: string[] = [];
    const missingFolders: string[] = [];

    // Get unique top-level folders from DEFAULT_FOLDER_STRUCTURE
    const topLevelFolders = new Set(
      DEFAULT_FOLDER_STRUCTURE.map(f => f.split('/')[0])
    );

    for (const folder of topLevelFolders) {
      if (existingFolderNames.has(folder)) {
        existingFolders.push(folder);
      } else {
        missingFolders.push(folder);
      }
    }

    // Check if config already exists in store
    let hasExistingConfig = false;
    try {
      const storedConfig = await configStore.getProjectConfig(folderPath);
      hasExistingConfig = !!storedConfig;
    } catch {
      hasExistingConfig = false;
    }

    // Detect local path (deployment folder)
    let suggestedLocalPath = 'www';
    if (existingFolderNames.has('www')) {
      suggestedLocalPath = 'www';
    } else if (existingFolderNames.has('public')) {
      suggestedLocalPath = 'public';
    } else if (existingFolderNames.has('dist')) {
      suggestedLocalPath = 'dist';
    } else if (existingFolderNames.has('build')) {
      suggestedLocalPath = 'build';
    }

    return {
      name,
      path: folderPath,
      existingFolders,
      missingFolders,
      hasExistingConfig,
      suggestedLocalPath,
    };
  },

  /**
   * Import an existing project folder into Forge
   */
  async importProject(
    folderPath: string,
    data: ProjectFormData,
    createMissingFolders: boolean,
    existingProjects: Project[]
  ): Promise<Project> {
    // Check if project already exists
    const alreadyExists = existingProjects.some(p => p.path === folderPath);
    if (alreadyExists) {
      throw new Error('Ce projet existe déjà dans La Forge');
    }

    // Analyze the folder
    const analysis = await this.analyzeExistingFolder(folderPath);

    // Create missing folders if requested
    if (createMissingFolders && analysis.missingFolders.length > 0) {
      console.log('[projectService] Creating missing folders:', analysis.missingFolders);
      for (const folder of DEFAULT_FOLDER_STRUCTURE) {
        const topLevel = folder.split('/')[0];
        if (analysis.missingFolders.includes(topLevel)) {
          await createDir(await join(folderPath, folder), { recursive: true });
        }
      }
    }

    const hasSftp = data.sftp.host && data.sftp.username;

    // Create project object
    const project: Project = {
      id: folderPath,
      name: data.name || analysis.name,
      path: folderPath,
      client: data.client || undefined,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      status: 'prospect',
      urls: {
        currentSite: data.currentSiteUrl || undefined,
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
      localPath: data.localPath || analysis.suggestedLocalPath || 'www',
      referenceWebsites: [],
    };

    // Save project config (don't create template files for imported projects)
    await this.saveProject(project);

    return project;
  },
};
