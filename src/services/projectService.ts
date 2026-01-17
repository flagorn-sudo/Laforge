import { invoke } from '@tauri-apps/api/tauri';
import { readDir, readTextFile, writeTextFile, createDir } from '@tauri-apps/api/fs';
import { join } from '@tauri-apps/api/path';
import { Project } from '../types';
import { ProjectFormData } from '../components/ProjectForm';

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
    const configPath = await join(path, '.project-config.json');

    // Charger la config si elle existe
    try {
      const content = await readTextFile(configPath);
      const config = JSON.parse(content);
      // Ensure referenceWebsites is always an array (backward compatibility)
      return {
        ...config,
        path,
        id: path,
        referenceWebsites: config.referenceWebsites || [],
        // Migrate production to currentSite if not present
        urls: {
          ...config.urls,
          currentSite: config.urls?.currentSite || config.urls?.production,
        },
      };
    } catch {
      // Pas de config, créer un projet basique
      // Tout dossier est considéré comme un projet potentiel
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

    // Utiliser la structure personnalisée ou la structure par défaut
    const folders = folderStructure || [
      '01-sources',
      'psd',
      'ai',
      'figma',
      'fonts',
      '02-docs',
      '03-assets',
      'images',
      'videos',
      'icons',
      'logos',
      '04-references',
      'screenshots',
      'competitors',
      'scraped',
      'www/css',
      'www/js',
      'www/assets',
      'www/pages',
    ];

    for (const folder of folders) {
      await createDir(await join(projectPath, folder), { recursive: true });
    }

    const project: Project = {
      id: projectPath,
      name,
      path: projectPath,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      status: 'active',
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
    const folders = folderStructure || [
      '01-sources',
      'psd',
      'ai',
      'figma',
      'fonts',
      '02-docs',
      '03-assets',
      'images',
      'videos',
      'icons',
      'logos',
      '04-references',
      'screenshots',
      'competitors',
      'scraped',
      `${data.localPath || 'www'}/css`,
      `${data.localPath || 'www'}/js`,
      `${data.localPath || 'www'}/assets`,
      `${data.localPath || 'www'}/pages`,
    ];

    for (const folder of folders) {
      await createDir(await join(projectPath, folder), { recursive: true });
    }

    const hasSftp = data.sftp.host && data.sftp.username;

    const project: Project = {
      id: projectPath,
      name: data.name,
      path: projectPath,
      client: data.client || undefined,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      status: 'active',
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

    await this.saveProject(project);
    await this.createTemplateFilesWithPath(project, data.localPath || 'www');

    return project;
  },

  async createTemplateFilesWithPath(project: Project, localPath: string): Promise<void> {
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
  },

  async saveProject(project: Project): Promise<void> {
    const configPath = await join(project.path, '.project-config.json');
    const { path: _, id: __, ...config } = project;
    await writeTextFile(configPath, JSON.stringify(config, null, 2));
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

  async openInFinder(path: string): Promise<void> {
    await invoke('open_in_finder', { path });
  },

  openInBrowser(url: string): void {
    window.open(url, '_blank');
  },
};
