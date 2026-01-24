/**
 * Delta Sync Service
 * Frontend service for managing delta/incremental synchronization
 */

import { invoke } from '@tauri-apps/api/tauri';

// Types matching Rust structures
export interface ChunkHash {
  index: number;
  offset: number;
  size: number;
  hash: string;
}

export interface FileSignature {
  path: string;
  total_size: number;
  full_hash: string;
  chunk_size: number;
  chunk_hashes: ChunkHash[];
  modified_at: string;
  created_at: string;
}

export interface SignatureCache {
  project_id: string;
  signatures: Record<string, FileSignature>;
  updated_at: string;
}

export type DeltaStatus = 'new' | 'unchanged' | 'modified' | 'smallfile' | 'deleted';

export interface FileDelta {
  path: string;
  status: DeltaStatus;
  total_size: number;
  transfer_size: number;
  changed_chunks: number[];
  savings_percent: number;
}

export interface DeltaTransferStats {
  total_files: number;
  new_files: number;
  modified_files: number;
  unchanged_files: number;
  deleted_files: number;
  total_size: number;
  transfer_size: number;
  savings_bytes: number;
  savings_percent: number;
}

/**
 * Analyze files for delta sync - compares local files against cached signatures
 */
export async function analyzeDeltaSync(
  projectId: string,
  localPath: string
): Promise<FileDelta[]> {
  return invoke('analyze_delta_sync', {
    projectId,
    localPath,
  });
}

/**
 * Calculate transfer statistics from delta analysis
 */
export async function getDeltaTransferStats(
  deltas: FileDelta[]
): Promise<DeltaTransferStats> {
  return invoke('get_delta_transfer_stats', { deltas });
}

/**
 * Update the delta cache after a successful sync
 */
export async function updateDeltaCacheAfterSync(
  projectId: string,
  localPath: string,
  syncedFiles: string[]
): Promise<void> {
  return invoke('update_delta_cache_after_sync', {
    projectId,
    localPath,
    syncedFiles,
  });
}

/**
 * Generate file signature for a single file
 */
export async function generateFileSignature(
  filePath: string,
  relativePath: string
): Promise<FileSignature> {
  return invoke('generate_file_signature', {
    filePath,
    relativePath,
  });
}

/**
 * Get cache info for a project
 */
export async function getDeltaCacheInfo(
  projectId: string
): Promise<SignatureCache> {
  return invoke('get_delta_cache_info', { projectId });
}

/**
 * Clear the delta cache for a project
 */
export async function clearDeltaCache(projectId: string): Promise<void> {
  return invoke('clear_delta_cache', { projectId });
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Calculate and format savings summary
 */
export function formatSavingsSummary(stats: DeltaTransferStats): string {
  if (stats.total_size === 0) return 'Aucun fichier';

  const savingsPercent = stats.savings_percent.toFixed(1);
  const savedBytes = formatBytes(stats.savings_bytes);
  const transferBytes = formatBytes(stats.transfer_size);
  const totalBytes = formatBytes(stats.total_size);

  return `${savingsPercent}% economisé (${savedBytes}) - Transfert: ${transferBytes} / ${totalBytes}`;
}

/**
 * Get a summary of file changes
 */
export function getChangesSummary(stats: DeltaTransferStats): string {
  const parts: string[] = [];

  if (stats.new_files > 0) {
    parts.push(`${stats.new_files} nouveau${stats.new_files > 1 ? 'x' : ''}`);
  }
  if (stats.modified_files > 0) {
    parts.push(`${stats.modified_files} modifié${stats.modified_files > 1 ? 's' : ''}`);
  }
  if (stats.unchanged_files > 0) {
    parts.push(`${stats.unchanged_files} inchangé${stats.unchanged_files > 1 ? 's' : ''}`);
  }
  if (stats.deleted_files > 0) {
    parts.push(`${stats.deleted_files} supprimé${stats.deleted_files > 1 ? 's' : ''}`);
  }

  return parts.join(', ') || 'Aucun fichier';
}

/**
 * Filter deltas to get only files that need transfer
 */
export function getFilesToTransfer(deltas: FileDelta[]): FileDelta[] {
  return deltas.filter(
    (d) => d.status === 'new' || d.status === 'modified' || d.status === 'smallfile'
  );
}

/**
 * Get status label in French
 */
export function getDeltaStatusLabel(status: DeltaStatus): string {
  const labels: Record<DeltaStatus, string> = {
    new: 'Nouveau',
    unchanged: 'Inchangé',
    modified: 'Modifié',
    smallfile: 'Petit fichier',
    deleted: 'Supprimé',
  };
  return labels[status] || status;
}

/**
 * Get status color class
 */
export function getDeltaStatusColor(status: DeltaStatus): string {
  const colors: Record<DeltaStatus, string> = {
    new: 'status-new',
    unchanged: 'status-unchanged',
    modified: 'status-modified',
    smallfile: 'status-small',
    deleted: 'status-deleted',
  };
  return colors[status] || '';
}

export const deltaService = {
  analyzeDeltaSync,
  getDeltaTransferStats,
  updateDeltaCacheAfterSync,
  generateFileSignature,
  getDeltaCacheInfo,
  clearDeltaCache,
  formatBytes,
  formatSavingsSummary,
  getChangesSummary,
  getFilesToTransfer,
  getDeltaStatusLabel,
  getDeltaStatusColor,
};

export default deltaService;
