/**
 * Service de sauvegarde et restauration des données de La Forge
 * Permet d'exporter et importer les paramètres et configurations de projets
 * Format: fichier .fg (JSON encodé)
 *
 * Note: Les mots de passe et clés API sont inclus dans l'export.
 * Le fichier .fg doit être conservé en lieu sûr.
 */

import { save, open } from '@tauri-apps/api/dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/api/fs';
import { Settings, Project } from '../types';
import { configStore } from './configStore';

// Version du format de backup pour compatibilité future
const BACKUP_VERSION = '1.0';
const FILE_EXTENSION = 'fg';
const FILE_DESCRIPTION = 'Fichier de sauvegarde La Forge';

export interface BackupData {
  version: string;
  exportedAt: string;
  appName: string;
  settings: Partial<Settings> & { geminiApiKey?: string };
  projects: ProjectBackup[];
}

export interface ProjectBackup {
  path: string;
  name: string;
  client?: string;
  status: string;
  urls: {
    currentSite?: string;
    testUrl?: string;
    staging?: string;
    local?: string;
  };
  sftp: {
    configured: boolean;
    host?: string;
    username?: string;
    password?: string; // Inclus dans l'export
    port?: number;
    remotePath?: string;
    passive?: boolean;
    protocol?: string;
  };
  colors: string[];
  fonts: string[];
  localPath?: string;
  clientDescription?: string;
  themeTags?: string[];
  referenceWebsites?: { url: string; name?: string }[];
}

/**
 * Exporter les données de l'application vers un fichier .fg
 * Inclut les mots de passe et clés API pour une restauration complète
 */
export async function exportBackup(
  settings: Partial<Settings>,
  projects: Project[]
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    // Récupérer les mots de passe FTP pour chaque projet
    const projectsWithPasswords: ProjectBackup[] = await Promise.all(
      projects.map(async (p) => {
        let password: string | undefined;
        if (p.sftp.configured && p.sftp.host) {
          const credKey = `ftp:${p.id}`;
          password = (await configStore.getCredential(credKey)) || undefined;
        }
        return {
          path: p.path,
          name: p.name,
          client: p.client,
          status: p.status,
          urls: {
            currentSite: p.urls.currentSite,
            testUrl: p.urls.testUrl,
            staging: p.urls.staging,
            local: p.urls.local,
          },
          sftp: {
            configured: p.sftp.configured,
            host: p.sftp.host,
            username: p.sftp.username,
            password, // Mot de passe inclus
            port: p.sftp.port,
            remotePath: p.sftp.remotePath,
            passive: p.sftp.passive,
            protocol: p.sftp.protocol,
          },
          colors: p.colors || [],
          fonts: p.fonts || [],
          localPath: p.localPath,
          clientDescription: p.clientDescription,
          themeTags: p.themeTags,
          referenceWebsites: p.referenceWebsites?.map((r) => ({
            url: r.url,
            name: r.name,
          })),
        };
      })
    );

    // Préparer les données de backup
    const backupData: BackupData = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      appName: 'La Forge',
      settings: {
        workspacePath: settings.workspacePath,
        geminiApiKey: settings.geminiApiKey, // Clé API incluse
        geminiModel: settings.geminiModel,
        folderStructure: settings.folderStructure,
        autoOrganize: settings.autoOrganize,
        showMenuBarIcon: settings.showMenuBarIcon,
      },
      projects: projectsWithPasswords,
    };

    // Demander à l'utilisateur où sauvegarder
    const filePath = await save({
      defaultPath: `la-forge-backup-${new Date().toISOString().split('T')[0]}.${FILE_EXTENSION}`,
      filters: [
        {
          name: FILE_DESCRIPTION,
          extensions: [FILE_EXTENSION],
        },
      ],
    });

    if (!filePath) {
      return { success: false, error: 'Export annulé' };
    }

    // Écrire le fichier
    const content = JSON.stringify(backupData, null, 2);
    await writeTextFile(filePath, content);

    return { success: true, filePath };
  } catch (error) {
    console.error('[backupService] Export failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

/**
 * Importer les données depuis un fichier .fg
 */
export async function importBackup(): Promise<{
  success: boolean;
  data?: BackupData;
  error?: string;
}> {
  try {
    // Demander à l'utilisateur de sélectionner un fichier
    const filePath = await open({
      filters: [
        {
          name: FILE_DESCRIPTION,
          extensions: [FILE_EXTENSION],
        },
      ],
      multiple: false,
    });

    if (!filePath || Array.isArray(filePath)) {
      return { success: false, error: 'Import annulé' };
    }

    // Lire le fichier
    const content = await readTextFile(filePath);
    const data = JSON.parse(content) as BackupData;

    // Valider le format
    if (!data.version || !data.appName || data.appName !== 'La Forge') {
      return {
        success: false,
        error: 'Format de fichier invalide ou incompatible',
      };
    }

    return { success: true, data };
  } catch (error) {
    console.error('[backupService] Import failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur de lecture du fichier',
    };
  }
}

/**
 * Appliquer les données importées (inclut mots de passe et clé API)
 */
export async function applyBackupData(
  data: BackupData,
  updateSettings: (settings: Partial<Settings>) => void,
  onProjectImported?: (project: ProjectBackup) => void
): Promise<{ settingsRestored: boolean; projectsRestored: number; errors: string[] }> {
  const errors: string[] = [];
  let projectsRestored = 0;

  // Restaurer les paramètres (y compris la clé API Gemini)
  try {
    if (data.settings) {
      updateSettings({
        workspacePath: data.settings.workspacePath,
        geminiApiKey: data.settings.geminiApiKey, // Clé API restaurée
        geminiModel: data.settings.geminiModel,
        folderStructure: data.settings.folderStructure,
        autoOrganize: data.settings.autoOrganize,
        showMenuBarIcon: data.settings.showMenuBarIcon,
      });
    }
  } catch (e) {
    errors.push(`Erreur restauration paramètres: ${e}`);
  }

  // Restaurer les projets
  for (const project of data.projects) {
    try {
      // Générer un ID pour le projet basé sur le path
      const projectId = project.path.replace(/[^a-zA-Z0-9]/g, '-');

      // Sauvegarder le mot de passe FTP si présent
      if (project.sftp.password) {
        const credKey = `ftp:${projectId}`;
        await configStore.saveCredential(credKey, project.sftp.password);
        console.log(`[backupService] Password restored for project ${project.name}`);
      }

      // Sauvegarder la config du projet
      await configStore.saveProjectConfig(project.path, {
        name: project.name,
        client: project.client,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        status: project.status,
        urls: project.urls,
        sftp: {
          configured: project.sftp.configured,
          host: project.sftp.host,
          username: project.sftp.username,
          port: project.sftp.port,
          remotePath: project.sftp.remotePath,
          passive: project.sftp.passive,
          protocol: project.sftp.protocol,
          passwordAvailable: !!project.sftp.password, // Indique si le mot de passe est disponible
        },
        scraping: { completed: false },
        colors: project.colors,
        fonts: project.fonts,
        localPath: project.localPath,
        clientDescription: project.clientDescription,
        themeTags: project.themeTags,
        referenceWebsites: project.referenceWebsites?.map((r) => ({
          ...r,
          addedAt: new Date().toISOString(),
        })),
      });

      projectsRestored++;
      onProjectImported?.(project);
    } catch (e) {
      errors.push(`Erreur projet "${project.name}": ${e}`);
    }
  }

  return {
    settingsRestored: errors.filter((e) => e.includes('paramètres')).length === 0,
    projectsRestored,
    errors,
  };
}
