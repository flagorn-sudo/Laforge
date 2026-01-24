/**
 * Transfer Resume Service
 * Manages resumable file transfers for interrupted syncs
 */

import { invoke } from '@tauri-apps/api/tauri';

export type TransferStatus = 'pending' | 'inprogress' | 'paused' | 'completed' | 'failed';

export interface FileTransferState {
  path: string;
  local_path: string;
  remote_path: string;
  total_size: number;
  transferred_bytes: number;
  checksum?: string;
  started_at: string;
  updated_at: string;
  status: TransferStatus;
}

export interface TransferSession {
  id: string;
  project_id: string;
  started_at: string;
  files: Record<string, FileTransferState>;
  completed: boolean;
}

export const transferResumeService = {
  /**
   * Get the current transfer session for a project
   */
  async getSession(projectId: string): Promise<TransferSession | null> {
    return await invoke<TransferSession | null>('get_transfer_session', { projectId });
  },

  /**
   * Create a new transfer session
   */
  async createSession(
    projectId: string,
    files: Array<{ path: string; localPath: string; remotePath: string; size: number }>
  ): Promise<string> {
    const filesArray = files.map(f => [f.path, f.localPath, f.remotePath, f.size] as [string, string, string, number]);
    return await invoke<string>('create_transfer_session', {
      projectId,
      files: filesArray,
    });
  },

  /**
   * Update transfer progress for a file
   */
  async updateProgress(sessionId: string, filePath: string, transferred: number): Promise<void> {
    await invoke('update_transfer_progress', {
      sessionId,
      filePath,
      transferred,
    });
  },

  /**
   * Mark a file as completed
   */
  async completeFile(sessionId: string, filePath: string): Promise<void> {
    await invoke('complete_transfer_file', {
      sessionId,
      filePath,
    });
  },

  /**
   * Complete the entire transfer session
   */
  async completeSession(sessionId: string): Promise<void> {
    await invoke('complete_transfer_session', { sessionId });
  },

  /**
   * Get files that can be resumed
   */
  async getResumableFiles(projectId: string): Promise<FileTransferState[]> {
    return await invoke<FileTransferState[]>('get_resumable_files', { projectId });
  },

  /**
   * Check if a project has a resumable session
   */
  async hasResumableSession(projectId: string): Promise<boolean> {
    const session = await this.getSession(projectId);
    if (!session || session.completed) return false;

    const resumable = Object.values(session.files).some(
      f => f.status !== 'completed' && f.transferred_bytes > 0 && f.transferred_bytes < f.total_size
    );
    return resumable;
  },

  /**
   * Get resume progress summary
   */
  async getResumeSummary(projectId: string): Promise<{
    hasResumable: boolean;
    totalFiles: number;
    completedFiles: number;
    totalBytes: number;
    transferredBytes: number;
  }> {
    const session = await this.getSession(projectId);

    if (!session || session.completed) {
      return {
        hasResumable: false,
        totalFiles: 0,
        completedFiles: 0,
        totalBytes: 0,
        transferredBytes: 0,
      };
    }

    const files = Object.values(session.files);
    const completedFiles = files.filter(f => f.status === 'completed').length;
    const totalBytes = files.reduce((sum, f) => sum + f.total_size, 0);
    const transferredBytes = files.reduce((sum, f) => sum + f.transferred_bytes, 0);

    return {
      hasResumable: transferredBytes > 0 && transferredBytes < totalBytes,
      totalFiles: files.length,
      completedFiles,
      totalBytes,
      transferredBytes,
    };
  },

  /**
   * Format bytes for display
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  /**
   * Calculate percentage
   */
  calculateProgress(transferred: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((transferred / total) * 100);
  },
};
