import { invoke } from '@tauri-apps/api/tauri';
import { SFTPConfig, FileDiff } from '../types';

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
    await invoke('save_password', { key: `sftp_${projectId}`, password });
  },

  async getCredentials(projectId: string): Promise<string | null> {
    try {
      return await invoke('get_password', { key: `sftp_${projectId}` });
    } catch {
      return null;
    }
  },
};
