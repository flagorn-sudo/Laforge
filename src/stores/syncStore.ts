/**
 * Sync Store
 * Manages synchronization state with progress tracking
 */

import { create } from 'zustand';
import { Project, FileDiff } from '../types';
import { syncService } from '../services/syncService';
import { projectService } from '../services/projectService';

export type SyncStage = 'idle' | 'connecting' | 'analyzing' | 'uploading' | 'complete' | 'error';

export interface SyncFileProgress {
  path: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  size?: number;
}

interface SyncState {
  stage: SyncStage;
  progress: number;
  currentFile: string | null;
  filesTotal: number;
  filesCompleted: number;
  files: SyncFileProgress[];
  error: string | null;
  diff: FileDiff[];
}

interface SyncStore {
  // State per project (keyed by project id)
  syncStates: Record<string, SyncState>;

  // Actions
  getSyncState: (projectId: string) => SyncState;
  startSync: (project: Project, onComplete?: (success: boolean, filesUploaded: number) => void) => Promise<void>;
  previewSync: (project: Project) => Promise<FileDiff[]>;
  resetSync: (projectId: string) => void;
}

const defaultState: SyncState = {
  stage: 'idle',
  progress: 0,
  currentFile: null,
  filesTotal: 0,
  filesCompleted: 0,
  files: [],
  error: null,
  diff: [],
};

export const useSyncStore = create<SyncStore>((set, get) => ({
  syncStates: {},

  getSyncState: (projectId: string) => {
    return get().syncStates[projectId] || defaultState;
  },

  previewSync: async (project: Project) => {
    const projectId = project.id;

    const updateState = (updates: Partial<SyncState>) => {
      set((state) => ({
        syncStates: {
          ...state.syncStates,
          [projectId]: {
            ...(state.syncStates[projectId] || defaultState),
            ...updates,
          },
        },
      }));
    };

    updateState({ stage: 'analyzing', progress: 10, error: null });

    try {
      const diff = await syncService.preview(project);
      const filesToSync = diff.filter(f => f.status === 'added' || f.status === 'modified');

      updateState({
        stage: 'idle',
        progress: 0,
        diff,
        filesTotal: filesToSync.length,
        files: filesToSync.map(f => ({
          path: f.path,
          status: 'pending' as const,
          size: f.localSize,
        })),
      });

      return diff;
    } catch (error) {
      updateState({
        stage: 'error',
        error: error instanceof Error ? error.message : 'Erreur lors de l\'analyse',
      });
      throw error;
    }
  },

  startSync: async (project: Project, onComplete?) => {
    const projectId = project.id;

    const updateState = (updates: Partial<SyncState>) => {
      set((state) => ({
        syncStates: {
          ...state.syncStates,
          [projectId]: {
            ...(state.syncStates[projectId] || defaultState),
            ...updates,
          },
        },
      }));
    };

    const currentState = get().syncStates[projectId] || defaultState;

    // Start connection
    updateState({
      stage: 'connecting',
      progress: 5,
      currentFile: null,
      error: null,
      filesCompleted: 0,
    });

    try {
      // Test connection first
      const connected = await syncService.testConnection(project);
      if (!connected) {
        throw new Error('Impossible de se connecter au serveur FTP');
      }

      // Get diff if not already done
      let diff = currentState.diff;
      let files = currentState.files;

      if (diff.length === 0) {
        updateState({ stage: 'analyzing', progress: 15 });
        diff = await syncService.preview(project);
        const filesToSync = diff.filter(f => f.status === 'added' || f.status === 'modified');
        files = filesToSync.map(f => ({
          path: f.path,
          status: 'pending' as const,
          size: f.localSize,
        }));
        updateState({
          diff,
          files,
          filesTotal: filesToSync.length,
        });
      }

      const filesToUpload = files.filter(f => f.status === 'pending');

      if (filesToUpload.length === 0) {
        updateState({
          stage: 'complete',
          progress: 100,
          currentFile: null,
        });
        onComplete?.(true, 0);
        return;
      }

      // Start uploading
      updateState({ stage: 'uploading', progress: 20 });

      // Simulate per-file progress (since actual sync is done in batch by Rust)
      // We'll update the UI to show files being processed
      const totalFiles = filesToUpload.length;

      // Mark files as uploading progressively
      for (let i = 0; i < totalFiles; i++) {
        const file = filesToUpload[i];
        const progressPercent = 20 + Math.floor((i / totalFiles) * 70);

        // Update current file
        const updatedFiles = files.map(f =>
          f.path === file.path ? { ...f, status: 'uploading' as const } : f
        );

        updateState({
          currentFile: file.path,
          progress: progressPercent,
          files: updatedFiles,
          filesCompleted: i,
        });

        // Small delay to show progress visually
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Now do the actual sync
      const result = await syncService.sync(project);

      if (result.success) {
        // Mark all as uploaded
        const completedFiles = files.map(f => ({
          ...f,
          status: 'uploaded' as const,
        }));

        // Update project's lastSync
        const updated: Project = {
          ...project,
          sftp: {
            ...project.sftp,
            lastSync: new Date().toISOString(),
          },
          updated: new Date().toISOString(),
        };
        await projectService.saveProject(updated);

        updateState({
          stage: 'complete',
          progress: 100,
          currentFile: null,
          files: completedFiles,
          filesCompleted: totalFiles,
        });

        onComplete?.(true, result.filesUploaded);
      } else {
        throw new Error(result.errors.join(', ') || 'Erreur de synchronisation');
      }
    } catch (error) {
      updateState({
        stage: 'error',
        error: error instanceof Error ? error.message : 'Erreur de synchronisation',
        currentFile: null,
      });
      onComplete?.(false, 0);
    }
  },

  resetSync: (projectId: string) => {
    set((state) => ({
      syncStates: {
        ...state.syncStates,
        [projectId]: defaultState,
      },
    }));
  },
}));
