/**
 * Version History Store
 * Manages file version snapshots for rollback functionality
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { SyncSnapshot, SnapshotSummary, SnapshotDiff } from '../types';

interface VersionState {
  snapshots: Record<string, SnapshotSummary[]>; // keyed by project id
  selectedSnapshot: SyncSnapshot | null;
  loading: boolean;
  error: string | null;
}

interface VersionStore extends VersionState {
  // Actions
  loadSnapshots: (projectId: string) => Promise<void>;
  createSnapshot: (projectId: string, localPath: string, message?: string) => Promise<SyncSnapshot>;
  getSnapshotDetails: (projectId: string, snapshotId: string) => Promise<SyncSnapshot | null>;
  restoreVersion: (projectId: string, snapshotId: string, targetPath: string, files?: string[]) => Promise<string[]>;
  compareSnapshots: (projectId: string, oldSnapshotId: string, newSnapshotId: string) => Promise<SnapshotDiff>;
  clearError: () => void;
}

export const useVersionStore = create<VersionStore>((set, get) => ({
  snapshots: {},
  selectedSnapshot: null,
  loading: false,
  error: null,

  loadSnapshots: async (projectId: string) => {
    set({ loading: true, error: null });
    try {
      const snapshots = await invoke<SnapshotSummary[]>('get_version_history', { projectId });
      set((state) => ({
        snapshots: {
          ...state.snapshots,
          [projectId]: snapshots,
        },
        loading: false,
      }));
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load version history',
      });
    }
  },

  createSnapshot: async (projectId: string, localPath: string, message?: string) => {
    set({ loading: true, error: null });
    try {
      const snapshot = await invoke<SyncSnapshot>('create_version_snapshot', {
        projectId,
        localPath,
        message,
      });

      // Refresh snapshots list
      await get().loadSnapshots(projectId);

      set({ loading: false });
      return snapshot;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create snapshot';
      set({ loading: false, error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  getSnapshotDetails: async (projectId: string, snapshotId: string) => {
    set({ loading: true, error: null });
    try {
      const snapshot = await invoke<SyncSnapshot | null>('get_snapshot_details', {
        projectId,
        snapshotId,
      });
      set({ selectedSnapshot: snapshot, loading: false });
      return snapshot;
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load snapshot details',
      });
      return null;
    }
  },

  restoreVersion: async (projectId: string, snapshotId: string, targetPath: string, files?: string[]) => {
    set({ loading: true, error: null });
    try {
      const restored = await invoke<string[]>('restore_version', {
        projectId,
        snapshotId,
        targetPath,
        files,
      });
      set({ loading: false });
      return restored;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to restore version';
      set({ loading: false, error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  compareSnapshots: async (projectId: string, oldSnapshotId: string, newSnapshotId: string) => {
    set({ loading: true, error: null });
    try {
      const diff = await invoke<SnapshotDiff>('compare_snapshots', {
        projectId,
        oldSnapshotId,
        newSnapshotId,
      });
      set({ loading: false });
      return diff;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to compare snapshots';
      set({ loading: false, error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  clearError: () => set({ error: null }),
}));

// Helper to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper to format relative time
export function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'À l\'instant';
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  return date.toLocaleDateString('fr-FR');
}
