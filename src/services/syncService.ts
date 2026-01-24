import { Project, SFTPConfig, FileDiff, SyncOptions, SyncConfig } from '../types';
import { sftpService } from './sftpService';
import { projectService } from './projectService';
import { invoke } from '@tauri-apps/api/tauri';

export interface SyncResult {
  success: boolean;
  filesUploaded: number;
  filesDeleted: number;
  errors: string[];
  diff: FileDiff[];
}

// Default sync options
const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  parallel_enabled: true,
  parallel_connections: 4,
  create_snapshot: false,
};

export const syncService = {
  /**
   * Get the SFTP config for a project, including password from keychain
   */
  async getSFTPConfig(project: Project): Promise<SFTPConfig | null> {
    if (!project.sftp.configured) {
      return null;
    }

    const password = await sftpService.getCredentials(project.id);
    if (!password) {
      return null;
    }

    return {
      host: project.sftp.host || '',
      port: project.sftp.port || 21,
      username: project.sftp.username || '',
      password,
      remotePath: project.sftp.remotePath || '/public_html',
      passive: project.sftp.passive,
      protocol: project.sftp.protocol || 'ftp',
      acceptInvalidCerts: project.sftp.acceptInvalidCerts,
    };
  },

  /**
   * Get the local path for sync
   */
  getLocalSyncPath(project: Project): string {
    const localFolder = project.localPath || 'www';
    return `${project.path}/${localFolder}`;
  },

  /**
   * Preview changes without uploading (dry run)
   */
  async preview(project: Project): Promise<FileDiff[]> {
    const config = await this.getSFTPConfig(project);
    if (!config) {
      throw new Error('Configuration FTP manquante ou mot de passe non trouvé');
    }

    const localPath = this.getLocalSyncPath(project);
    return await sftpService.getDiff(localPath, config);
  },

  /**
   * Synchronize project files to remote server
   */
  async sync(project: Project, dryRun = false): Promise<SyncResult> {
    const config = await this.getSFTPConfig(project);
    if (!config) {
      return {
        success: false,
        filesUploaded: 0,
        filesDeleted: 0,
        errors: ['Configuration FTP manquante ou mot de passe non trouvé'],
        diff: [],
      };
    }

    const localPath = this.getLocalSyncPath(project);

    try {
      const diff = await sftpService.sync(localPath, config, dryRun);

      // Count operations
      const filesUploaded = diff.filter(f => f.status === 'added' || f.status === 'modified').length;
      const filesDeleted = diff.filter(f => f.status === 'deleted').length;

      // Update project's lastSync timestamp if not a dry run
      if (!dryRun) {
        const updated: Project = {
          ...project,
          sftp: {
            ...project.sftp,
            lastSync: new Date().toISOString(),
          },
          updated: new Date().toISOString(),
        };
        await projectService.saveProject(updated);
      }

      return {
        success: true,
        filesUploaded,
        filesDeleted,
        errors: [],
        diff,
      };
    } catch (error) {
      return {
        success: false,
        filesUploaded: 0,
        filesDeleted: 0,
        errors: [error instanceof Error ? error.message : 'Erreur de synchronisation'],
        diff: [],
      };
    }
  },

  /**
   * Test connection for a project
   */
  async testConnection(project: Project): Promise<boolean> {
    const config = await this.getSFTPConfig(project);
    if (!config) {
      return false;
    }
    return await sftpService.testConnection(config);
  },

  /**
   * Synchronize project files with real-time event emission
   * The Rust backend will emit sync-progress events that can be listened to
   */
  async syncWithEvents(project: Project, options?: Partial<SyncOptions>): Promise<SyncResult> {
    const config = await this.getSFTPConfig(project);
    if (!config) {
      return {
        success: false,
        filesUploaded: 0,
        filesDeleted: 0,
        errors: ['Configuration FTP manquante ou mot de passe non trouvé'],
        diff: [],
      };
    }

    const localPath = this.getLocalSyncPath(project);
    const syncOptions: SyncOptions = {
      ...DEFAULT_SYNC_OPTIONS,
      ...options,
    };

    try {
      // Use syncWithEvents which passes projectId and options to Rust for event emission
      const diff = await sftpService.syncWithEvents(localPath, config, project.id, false, syncOptions);

      // Count operations
      const filesUploaded = diff.filter(f => f.status === 'added' || f.status === 'modified').length;
      const filesDeleted = diff.filter(f => f.status === 'deleted').length;

      return {
        success: true,
        filesUploaded,
        filesDeleted,
        errors: [],
        diff,
      };
    } catch (error) {
      return {
        success: false,
        filesUploaded: 0,
        filesDeleted: 0,
        errors: [error instanceof Error ? error.message : 'Erreur de synchronisation'],
        diff: [],
      };
    }
  },

  /**
   * Get sync configuration
   */
  async getSyncConfig(): Promise<SyncConfig> {
    try {
      return await invoke<SyncConfig>('get_sync_config');
    } catch {
      return {
        parallel_enabled: true,
        parallel_connections: 4,
        auto_snapshot: false,
      };
    }
  },

  /**
   * Set sync configuration
   */
  async setSyncConfig(config: SyncConfig): Promise<void> {
    await invoke('set_sync_config', { config });
  },
};
