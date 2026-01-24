/**
 * Sync Store
 * Manages synchronization state with progress tracking, retry mechanism,
 * and real-time event handling from Rust backend
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { Project, FileDiff, SyncProgressEvent, SyncLogEntry, SyncFailedFile } from '../types';
import { syncService } from '../services/syncService';
import { projectService } from '../services/projectService';

export type SyncStage = 'idle' | 'connecting' | 'retrying' | 'analyzing' | 'uploading' | 'complete' | 'error' | 'cancelled';

export interface SyncFileProgress {
  path: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  size?: number;
  error?: string;
}

export interface RetryState {
  currentAttempt: number;
  maxAttempts: number;
  nextRetryAt: number | null;  // Timestamp for countdown
  lastError: string | null;
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
  retry: RetryState;
  abortController: AbortController | null;
  // New: logs and failed files for FTPLogWindow
  logs: SyncLogEntry[];
  failedFiles: SyncFailedFile[];
  startTime: number | null;
  // Connection state tracking
  lastConnectionAttempt: number | null;
  lastConnectionFailed: boolean;
}

interface SyncStore {
  // State per project (keyed by project id)
  syncStates: Record<string, SyncState>;

  // Actions
  getSyncState: (projectId: string) => SyncState;
  canStartSync: (projectId: string) => { allowed: boolean; reason?: string };
  startSync: (project: Project, onComplete?: (success: boolean, filesUploaded: number) => void) => Promise<void>;
  previewSync: (project: Project) => Promise<FileDiff[]>;
  resetSync: (projectId: string) => void;
  cancelSync: (projectId: string) => Promise<void>;
  clearConnectionError: (projectId: string) => void;
  // New: handle events from Rust backend
  updateFromEvent: (event: SyncProgressEvent) => void;
  addLog: (projectId: string, entry: Omit<SyncLogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: (projectId: string) => void;
  retryFailedFile: (projectId: string, filePath: string) => void;
}

// Retry configuration
const RETRY_CONFIG = {
  maxAttempts: 4,
  baseDelayMs: 1000,      // 1s
  maxDelayMs: 16000,      // 16s max
  backoffMultiplier: 2,   // Exponential: 1s, 2s, 4s, 8s
};

const defaultRetryState: RetryState = {
  currentAttempt: 0,
  maxAttempts: RETRY_CONFIG.maxAttempts,
  nextRetryAt: null,
  lastError: null,
};

const defaultState: SyncState = {
  stage: 'idle',
  progress: 0,
  currentFile: null,
  filesTotal: 0,
  filesCompleted: 0,
  files: [],
  error: null,
  diff: [],
  retry: defaultRetryState,
  abortController: null,
  logs: [],
  failedFiles: [],
  startTime: null,
  lastConnectionAttempt: null,
  lastConnectionFailed: false,
};

// Cooldown period after a failed connection before allowing retry (in ms)
const CONNECTION_COOLDOWN_MS = 5000; // 5 seconds

// Generate unique ID for log entries
let logIdCounter = 0;
function generateLogId(): string {
  return `log_${Date.now()}_${++logIdCounter}`;
}

// Tray icon states
type TrayIconState = 'normal' | 'syncing' | 'success';

// Timer for auto-hiding success indicator
let successTimer: ReturnType<typeof setTimeout> | null = null;

// Helper to set tray sync indicator
async function setTrayIndicator(state: TrayIconState): Promise<void> {
  try {
    // Clear any existing success timer
    if (successTimer) {
      clearTimeout(successTimer);
      successTimer = null;
    }

    await invoke('tray_set_sync_indicator', { state });

    // If showing success, auto-reset to normal after 10 seconds
    if (state === 'success') {
      successTimer = setTimeout(async () => {
        try {
          await invoke('tray_set_sync_indicator', { state: 'normal' });
        } catch {
          // Ignore errors
        }
        successTimer = null;
      }, 10000);
    }
  } catch (e) {
    // Tray indicator not critical, ignore errors
    console.debug('[SyncStore] Failed to set tray indicator:', e);
  }
}

// Helper to calculate delay with exponential backoff
function getRetryDelay(attempt: number): number {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1);
  return Math.min(delay, RETRY_CONFIG.maxDelayMs);
}

// Helper for async sleep that respects abort signal
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timeout = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  syncStates: {},

  getSyncState: (projectId: string) => {
    return get().syncStates[projectId] || defaultState;
  },

  canStartSync: (projectId: string) => {
    const state = get().syncStates[projectId] || defaultState;

    // Check if a sync is already in progress
    if (state.stage !== 'idle' && state.stage !== 'complete' && state.stage !== 'error' && state.stage !== 'cancelled') {
      return {
        allowed: false,
        reason: 'Une synchronisation est deja en cours',
      };
    }

    // Check if we're in cooldown after a failed connection
    if (state.lastConnectionFailed && state.lastConnectionAttempt) {
      const elapsed = Date.now() - state.lastConnectionAttempt;
      if (elapsed < CONNECTION_COOLDOWN_MS) {
        const remaining = Math.ceil((CONNECTION_COOLDOWN_MS - elapsed) / 1000);
        return {
          allowed: false,
          reason: `Attendre ${remaining}s apres l'echec de connexion`,
        };
      }
    }

    return { allowed: true };
  },

  clearConnectionError: (projectId: string) => {
    set((state) => ({
      syncStates: {
        ...state.syncStates,
        [projectId]: {
          ...(state.syncStates[projectId] || defaultState),
          lastConnectionFailed: false,
          lastConnectionAttempt: null,
          error: null,
        },
      },
    }));
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

    // Check if we can start a sync
    const canSync = get().canStartSync(projectId);
    if (!canSync.allowed) {
      console.warn('[SyncStore] Cannot start sync:', canSync.reason);
      onComplete?.(false, 0);
      return;
    }

    // Create abort controller for this sync
    const abortController = new AbortController();

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

    const addLogEntry = (level: SyncLogEntry['level'], message: string, file?: string, details?: string) => {
      const entry: SyncLogEntry = {
        id: generateLogId(),
        timestamp: Date.now(),
        level,
        message,
        file,
        details,
      };
      set((state) => {
        const current = state.syncStates[projectId] || defaultState;
        return {
          syncStates: {
            ...state.syncStates,
            [projectId]: {
              ...current,
              logs: [...current.logs, entry],
            },
          },
        };
      });
    };

    // Set tray indicator to syncing
    await setTrayIndicator('syncing');

    // Clear previous logs and start fresh
    updateState({
      stage: 'connecting',
      progress: 5,
      currentFile: null,
      error: null,
      filesCompleted: 0,
      retry: defaultRetryState,
      abortController,
      logs: [],
      failedFiles: [],
      startTime: Date.now(),
      lastConnectionAttempt: Date.now(),
      lastConnectionFailed: false,
    });

    addLogEntry('info', 'Démarrage de la synchronisation...');

    // Connection with retry logic
    const connectWithRetry = async (): Promise<boolean> => {
      for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
        // Check if aborted
        if (abortController.signal.aborted) {
          throw new DOMException('Sync cancelled', 'AbortError');
        }

        addLogEntry('info', `Tentative de connexion ${attempt}/${RETRY_CONFIG.maxAttempts}...`);

        try {
          const connected = await syncService.testConnection(project);
          if (connected) {
            addLogEntry('success', 'Connexion établie');
            return true;
          }
          throw new Error('Impossible de se connecter au serveur FTP');
        } catch (error) {
          // If aborted, propagate
          if (error instanceof DOMException && error.name === 'AbortError') {
            throw error;
          }

          const errorMessage = error instanceof Error ? error.message : 'Erreur de connexion';
          addLogEntry('warning', `Échec connexion: ${errorMessage}`);

          // If this was the last attempt, fail
          if (attempt >= RETRY_CONFIG.maxAttempts) {
            addLogEntry('error', `Abandon après ${RETRY_CONFIG.maxAttempts} tentatives`);
            throw new Error(errorMessage);
          }

          // Update state for retry
          const delay = getRetryDelay(attempt);
          const nextRetryAt = Date.now() + delay;

          updateState({
            stage: 'retrying',
            progress: 5,
            retry: {
              currentAttempt: attempt,
              maxAttempts: RETRY_CONFIG.maxAttempts,
              nextRetryAt,
              lastError: errorMessage,
            },
          });

          // Wait before next retry
          try {
            await sleep(delay, abortController.signal);
          } catch (sleepError) {
            // If aborted during sleep, propagate
            if (sleepError instanceof DOMException && sleepError.name === 'AbortError') {
              throw sleepError;
            }
          }
        }
      }

      return false;
    };

    try {
      // Connect with retry
      const connected = await connectWithRetry();
      if (!connected) {
        throw new Error('Impossible de se connecter au serveur FTP');
      }

      // Reset retry state after successful connection
      updateState({
        stage: 'analyzing',
        progress: 10,
        retry: defaultRetryState,
      });

      addLogEntry('info', 'Analyse des fichiers...');

      // Get diff - always refresh for accurate sync
      const diff = await syncService.preview(project);
      const filesToSync = diff.filter(f => f.status === 'added' || f.status === 'modified');
      const files: SyncFileProgress[] = filesToSync.map(f => ({
        path: f.path,
        status: 'pending' as const,
        size: f.localSize,
      }));

      updateState({
        diff,
        files,
        filesTotal: filesToSync.length,
        progress: 15,
      });

      addLogEntry('info', `${filesToSync.length} fichier(s) à synchroniser`);

      if (filesToSync.length === 0) {
        addLogEntry('success', 'Aucun fichier à synchroniser');
        await setTrayIndicator('success');
        updateState({
          stage: 'complete',
          progress: 100,
          currentFile: null,
          abortController: null,
        });
        onComplete?.(true, 0);
        return;
      }

      // Check abort before upload
      if (abortController.signal.aborted) {
        throw new DOMException('Sync cancelled', 'AbortError');
      }

      // Start uploading - the Rust backend will emit real-time events
      updateState({ stage: 'uploading', progress: 20 });
      addLogEntry('info', 'Début de l\'envoi des fichiers...');

      // Call the sync service - it now passes project_id to Rust which emits events
      // The updateFromEvent method will handle progress updates
      const result = await syncService.syncWithEvents(project);

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

        await setTrayIndicator('success');

        const duration = Math.round((Date.now() - (get().syncStates[projectId]?.startTime || Date.now())) / 1000);
        addLogEntry('success', `Synchronisation terminée en ${duration}s`);

        updateState({
          stage: 'complete',
          progress: 100,
          currentFile: null,
          files: completedFiles,
          filesCompleted: filesToSync.length,
          abortController: null,
        });

        onComplete?.(true, result.filesUploaded);
      } else {
        throw new Error(result.errors.join(', ') || 'Erreur de synchronisation');
      }
    } catch (error) {
      await setTrayIndicator('normal');

      // Check if this was a user cancellation
      if (error instanceof DOMException && error.name === 'AbortError') {
        addLogEntry('warning', 'Synchronisation annulée par l\'utilisateur');
        updateState({
          stage: 'cancelled',
          progress: 0,
          currentFile: null,
          error: null,
          retry: defaultRetryState,
          abortController: null,
        });
        onComplete?.(false, 0);
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Erreur de synchronisation';
      addLogEntry('error', errorMessage);

      // Check if this was a connection error (timeout or connection failure)
      const isConnectionError = errorMessage.toLowerCase().includes('timeout') ||
                                errorMessage.toLowerCase().includes('connexion') ||
                                errorMessage.toLowerCase().includes('connection');

      updateState({
        stage: 'error',
        error: errorMessage,
        currentFile: null,
        abortController: null,
        lastConnectionFailed: isConnectionError,
        lastConnectionAttempt: isConnectionError ? Date.now() : null,
      });
      onComplete?.(false, 0);
    }
  },

  cancelSync: async (projectId: string) => {
    const state = get().syncStates[projectId];

    // First, tell Rust to cancel the sync operation
    try {
      await invoke('sftp_cancel_sync', { projectId });
      console.log('[SyncStore] Sent cancel request to Rust for project:', projectId);
    } catch (e) {
      console.error('[SyncStore] Failed to send cancel to Rust:', e);
    }

    // Then abort the JS-side controller
    if (state?.abortController) {
      state.abortController.abort();
    }

    // Also reset tray indicator
    setTrayIndicator('normal');
  },

  resetSync: (projectId: string) => {
    const state = get().syncStates[projectId];
    if (state?.abortController) {
      state.abortController.abort();
    }

    // Reset tray indicator
    setTrayIndicator('normal');

    set((state) => ({
      syncStates: {
        ...state.syncStates,
        [projectId]: defaultState,
      },
    }));
  },

  // Handle real-time events from Rust backend
  updateFromEvent: (event: SyncProgressEvent) => {
    const projectId = event.project_id;

    set((state) => {
      const current = state.syncStates[projectId] || defaultState;

      // Create log entry based on event type
      let newLog: SyncLogEntry | null = null;
      let newFailedFile: SyncFailedFile | null = null;
      let updatedFiles = current.files;
      let newStage = current.stage;
      let newCurrentFile = current.currentFile;
      let newFilesCompleted = current.filesCompleted;
      let newError = current.error;

      switch (event.event) {
        case 'connecting':
          newStage = 'connecting';
          newLog = {
            id: generateLogId(),
            timestamp: event.timestamp,
            level: 'info',
            message: event.message || 'Connexion au serveur...',
          };
          break;

        case 'analyzing':
          newStage = 'analyzing';
          newLog = {
            id: generateLogId(),
            timestamp: event.timestamp,
            level: 'info',
            message: event.message || 'Analyse des fichiers...',
          };
          break;

        case 'file_start':
          newStage = 'uploading';
          newCurrentFile = event.file;
          if (event.file) {
            updatedFiles = current.files.map(f =>
              f.path === event.file ? { ...f, status: 'uploading' as const } : f
            );
            newLog = {
              id: generateLogId(),
              timestamp: event.timestamp,
              level: 'info',
              message: `Envoi: ${event.file}`,
              file: event.file,
            };
          }
          break;

        case 'file_complete':
          if (event.file) {
            updatedFiles = current.files.map(f =>
              f.path === event.file ? { ...f, status: 'uploaded' as const } : f
            );
            newFilesCompleted = current.filesCompleted + 1;
            newLog = {
              id: generateLogId(),
              timestamp: event.timestamp,
              level: 'success',
              message: `Envoyé: ${event.file}`,
              file: event.file,
            };
          }
          break;

        case 'file_error':
          if (event.file) {
            updatedFiles = current.files.map(f =>
              f.path === event.file ? { ...f, status: 'error' as const, error: event.message || 'Erreur' } : f
            );
            newFailedFile = {
              path: event.file,
              error: event.message || 'Erreur inconnue',
              timestamp: event.timestamp,
              retryCount: 0,
            };
            newLog = {
              id: generateLogId(),
              timestamp: event.timestamp,
              level: 'error',
              message: `Erreur: ${event.file}`,
              file: event.file,
              details: event.message || undefined,
            };
          }
          break;

        case 'complete':
          newStage = 'complete';
          newCurrentFile = null;
          newLog = {
            id: generateLogId(),
            timestamp: event.timestamp,
            level: 'success',
            message: event.message || 'Synchronisation terminée',
          };
          break;

        case 'error':
          newStage = 'error';
          newError = event.message || 'Erreur de synchronisation';
          newLog = {
            id: generateLogId(),
            timestamp: event.timestamp,
            level: 'error',
            message: event.message || 'Erreur de synchronisation',
          };
          break;

        case 'cancelled':
          newStage = 'cancelled';
          newCurrentFile = null;
          newLog = {
            id: generateLogId(),
            timestamp: event.timestamp,
            level: 'warning',
            message: 'Synchronisation annulée',
          };
          break;
      }

      const newLogs = newLog ? [...current.logs, newLog] : current.logs;
      const newFailedFiles = newFailedFile
        ? [...current.failedFiles.filter(f => f.path !== newFailedFile!.path), newFailedFile]
        : current.failedFiles;

      return {
        syncStates: {
          ...state.syncStates,
          [projectId]: {
            ...current,
            stage: newStage,
            progress: event.progress,
            currentFile: newCurrentFile,
            files: updatedFiles,
            filesCompleted: newFilesCompleted,
            error: newError,
            logs: newLogs,
            failedFiles: newFailedFiles,
          },
        },
      };
    });
  },

  addLog: (projectId: string, entry: Omit<SyncLogEntry, 'id' | 'timestamp'>) => {
    set((state) => {
      const current = state.syncStates[projectId] || defaultState;
      const newEntry: SyncLogEntry = {
        ...entry,
        id: generateLogId(),
        timestamp: Date.now(),
      };
      return {
        syncStates: {
          ...state.syncStates,
          [projectId]: {
            ...current,
            logs: [...current.logs, newEntry],
          },
        },
      };
    });
  },

  clearLogs: (projectId: string) => {
    set((state) => {
      const current = state.syncStates[projectId] || defaultState;
      return {
        syncStates: {
          ...state.syncStates,
          [projectId]: {
            ...current,
            logs: [],
            failedFiles: [],
          },
        },
      };
    });
  },

  retryFailedFile: (projectId: string, filePath: string) => {
    set((state) => {
      const current = state.syncStates[projectId] || defaultState;
      // Mark file as pending again for retry
      const updatedFiles = current.files.map(f =>
        f.path === filePath ? { ...f, status: 'pending' as const, error: undefined } : f
      );
      // Update retry count in failed files
      const updatedFailedFiles = current.failedFiles.map(f =>
        f.path === filePath ? { ...f, retryCount: f.retryCount + 1 } : f
      );
      return {
        syncStates: {
          ...state.syncStates,
          [projectId]: {
            ...current,
            files: updatedFiles,
            failedFiles: updatedFailedFiles,
          },
        },
      };
    });
  },
}));
