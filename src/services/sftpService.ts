import { invoke } from '@tauri-apps/api/tauri';
import { SFTPConfig, FileDiff, Project, SyncOptions } from '../types';
import { configStore } from './configStore';

// Timeout configuration
const TIMEOUTS = {
  connection: 15000,    // 15s for connection test
  diff: 30000,          // 30s for file diff
  sync: 300000,         // 5min for full sync (can be long with many files)
  list: 20000,          // 20s for listing files
};

/**
 * Wrapper to add timeout to any Promise
 * Prevents UI from hanging if Rust backend doesn't respond
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout: ${operation} a depassé ${timeoutMs / 1000}s`));
      }, timeoutMs);
    }),
  ]);
}

// Track ongoing operations to prevent duplicates
const ongoingOperations = new Map<string, boolean>();

/**
 * Check if an operation is already in progress
 */
function isOperationInProgress(key: string): boolean {
  return ongoingOperations.get(key) === true;
}

/**
 * Mark operation as started/finished
 */
function setOperationState(key: string, inProgress: boolean): void {
  if (inProgress) {
    ongoingOperations.set(key, true);
  } else {
    ongoingOperations.delete(key);
  }
}

// Create a safe key for credential storage
function sanitizeKeyForStorage(projectId: string): string {
  // Use a simple hash-like approach: take the project name + a hash of the full path
  const parts = projectId.split('/').filter(Boolean);
  const projectName = parts[parts.length - 1] || 'unknown';

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    const char = projectId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const hashStr = Math.abs(hash).toString(36);

  // Return sanitized key: sftp_projectName_hash
  return `sftp_${projectName.replace(/[^a-zA-Z0-9-_]/g, '_')}_${hashStr}`;
}

export const sftpService = {
  /**
   * Test FTP/SFTP connection with timeout protection
   */
  async testConnection(config: SFTPConfig): Promise<boolean> {
    const opKey = `test_${config.host}`;

    // Prevent duplicate connection tests
    if (isOperationInProgress(opKey)) {
      console.warn('[sftpService] Connection test already in progress');
      return false;
    }

    setOperationState(opKey, true);

    try {
      const result = await withTimeout(
        invoke('sftp_test_connection', { config }),
        TIMEOUTS.connection,
        'Test de connexion FTP'
      );
      return result as boolean;
    } catch (error) {
      console.error('SFTP connection test failed:', error);
      return false;
    } finally {
      setOperationState(opKey, false);
    }
  },

  /**
   * List remote files with timeout protection
   */
  async listRemoteFiles(config: SFTPConfig, path: string): Promise<string[]> {
    return await withTimeout(
      invoke('sftp_list_files', { config, path }),
      TIMEOUTS.list,
      'Listing des fichiers distants'
    );
  },

  /**
   * Get diff between local and remote with timeout protection
   */
  async getDiff(localPath: string, config: SFTPConfig): Promise<FileDiff[]> {
    return await withTimeout(
      invoke('sftp_get_diff', { localPath, config }),
      TIMEOUTS.diff,
      'Analyse des différences'
    );
  },

  /**
   * Basic sync without events
   */
  async sync(localPath: string, config: SFTPConfig, dryRun = false): Promise<FileDiff[]> {
    return await withTimeout(
      invoke('sftp_sync', { localPath, config, dryRun, projectId: '', appHandle: null }),
      TIMEOUTS.sync,
      'Synchronisation FTP'
    );
  },

  /**
   * Sync with project ID for real-time event emission
   * The Rust backend will emit sync-progress events with this projectId
   * Protected by timeout and duplicate operation check
   */
  async syncWithEvents(
    localPath: string,
    config: SFTPConfig,
    projectId: string,
    dryRun = false,
    options?: SyncOptions
  ): Promise<FileDiff[]> {
    const opKey = `sync_${projectId}`;

    // Prevent duplicate syncs
    if (isOperationInProgress(opKey)) {
      throw new Error('Une synchronisation est deja en cours pour ce projet');
    }

    setOperationState(opKey, true);

    try {
      return await withTimeout(
        invoke('sftp_sync', { localPath, config, dryRun, projectId, options }),
        TIMEOUTS.sync,
        'Synchronisation FTP'
      );
    } finally {
      setOperationState(opKey, false);
    }
  },

  /**
   * Check if a sync is currently in progress for a project
   */
  isSyncInProgress(projectId: string): boolean {
    return isOperationInProgress(`sync_${projectId}`);
  },

  /**
   * Force clear an operation lock (for recovery from stuck states)
   */
  clearOperationLock(projectId: string): void {
    setOperationState(`sync_${projectId}`, false);
    setOperationState(`test_${projectId}`, false);
  },

  async saveCredentials(projectId: string, password: string): Promise<void> {
    const key = sanitizeKeyForStorage(projectId);
    console.log('[sftpService] saveCredentials called:', { projectId, key, passwordLength: password?.length });
    try {
      await configStore.saveCredential(key, password);
      console.log('[sftpService] Password saved successfully');

      // Verify immediately that it was saved
      const verify = await this.hasCredentials(projectId);
      console.log('[sftpService] Verification after save:', verify);

      if (!verify) {
        throw new Error('Password verification failed');
      }
    } catch (error) {
      console.error('[sftpService] saveCredentials failed:', error);
      throw new Error(`Echec sauvegarde: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getCredentials(projectId: string): Promise<string | null> {
    const key = sanitizeKeyForStorage(projectId);
    try {
      const result = await configStore.getCredential(key);
      if (result) {
        console.log('[sftpService] getCredentials: found password for', key);
      }
      return result;
    } catch {
      // Not finding a password is expected for projects without saved credentials
      return null;
    }
  },

  /**
   * Get credentials for a project, checking inline encrypted password first,
   * then falling back to credential store
   */
  async getCredentialsForProject(project: Project): Promise<string | null> {
    // 1. Try inline encrypted password first (new format)
    if (project.sftp.encryptedPassword) {
      try {
        const decrypted = configStore.decrypt(project.sftp.encryptedPassword);
        if (decrypted) {
          console.log('[sftpService] getCredentialsForProject: found inline encrypted password');
          return decrypted;
        }
      } catch (e) {
        console.warn('[sftpService] Failed to decrypt inline password:', e);
      }
    }

    // 2. Fall back to credential store
    return this.getCredentials(project.id);
  },

  async hasCredentials(projectId: string): Promise<boolean> {
    const key = sanitizeKeyForStorage(projectId);
    try {
      return await configStore.hasCredential(key);
    } catch {
      // Not finding a password is expected - don't log as error
      return false;
    }
  },

  async verifyCredentials(projectIds: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    await Promise.all(
      projectIds.map(async (id) => {
        const hasPassword = await sftpService.hasCredentials(id);
        results.set(id, hasPassword);
      })
    );
    return results;
  },
};
