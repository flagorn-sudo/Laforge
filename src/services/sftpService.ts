import { invoke } from '@tauri-apps/api/tauri';
import { SFTPConfig, FileDiff } from '../types';
import { configStore } from './configStore';

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
  async testConnection(config: SFTPConfig): Promise<boolean> {
    try {
      return await invoke('sftp_test_connection', { config });
    } catch (error) {
      console.error('SFTP connection test failed:', error);
      return false;
    }
  },

  async listRemoteFiles(config: SFTPConfig, path: string): Promise<string[]> {
    return await invoke('sftp_list_files', { config, path });
  },

  async getDiff(localPath: string, config: SFTPConfig): Promise<FileDiff[]> {
    return await invoke('sftp_get_diff', { localPath, config });
  },

  async sync(localPath: string, config: SFTPConfig, dryRun = false): Promise<FileDiff[]> {
    return await invoke('sftp_sync', { localPath, config, dryRun });
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
