import { invoke } from '@tauri-apps/api/tauri';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { geminiService } from './geminiService';

export interface FileWatcherEvent {
  event_type: string;
  path: string;
  file_name: string;
  extension: string | null;
  project_id: string;
}

export interface FileCategorization {
  targetFolder: string;
  confidence: number;
  reason: string;
}

export interface FileWatcherCallbacks {
  onFileDetected?: (event: FileWatcherEvent) => void;
  onFileCategorized?: (event: FileWatcherEvent, categorization: FileCategorization) => void;
  onFileMoved?: (event: FileWatcherEvent, destination: string) => void;
  onError?: (error: string) => void;
}

class FileWatcherService {
  private listeners: Map<string, UnlistenFn> = new Map();
  private callbacks: FileWatcherCallbacks = {};

  async startWatching(
    projectId: string,
    projectPath: string,
    folderStructure: string[],
    apiKey: string,
    model: string,
    autoMove: boolean,
    confidenceThreshold: number,
    callbacks?: FileWatcherCallbacks
  ): Promise<void> {
    if (callbacks) {
      this.callbacks = callbacks;
    }

    // Create inbox folder
    const inboxPath = await invoke<string>('create_inbox_folder', {
      projectPath,
    });

    // Start listening for events
    const unlisten = await listen<FileWatcherEvent>(
      'file-watcher-event',
      async (event) => {
        const fileEvent = event.payload;

        // Only process events for this project
        if (fileEvent.project_id !== projectId) {
          return;
        }

        this.callbacks.onFileDetected?.(fileEvent);

        try {
          // Categorize the file using Gemini
          const categorization = await geminiService.categorizeFile(
            fileEvent.file_name,
            fileEvent.extension,
            folderStructure,
            apiKey,
            model
          );

          this.callbacks.onFileCategorized?.(fileEvent, categorization);

          // Auto-move if enabled and confidence is high enough
          if (autoMove && categorization.confidence >= confidenceThreshold) {
            const destination = `${projectPath}/${categorization.targetFolder}/${fileEvent.file_name}`;

            await invoke('move_file', {
              source: fileEvent.path,
              destination,
            });

            this.callbacks.onFileMoved?.(fileEvent, destination);
          }
        } catch (error) {
          this.callbacks.onError?.(
            error instanceof Error ? error.message : 'Erreur de catégorisation'
          );
        }
      }
    );

    this.listeners.set(projectId, unlisten);

    // Start the Rust watcher
    await invoke('start_file_watcher', {
      projectId,
      inboxPath,
    });
  }

  async stopWatching(projectId: string): Promise<void> {
    // Stop the Rust watcher
    await invoke('stop_file_watcher', { projectId });

    // Remove the event listener
    const unlisten = this.listeners.get(projectId);
    if (unlisten) {
      unlisten();
      this.listeners.delete(projectId);
    }
  }

  async stopAll(): Promise<void> {
    for (const [projectId] of this.listeners) {
      await this.stopWatching(projectId);
    }
  }

  async moveFile(source: string, destination: string): Promise<void> {
    await invoke('move_file', { source, destination });
  }

  async createInboxFolder(projectPath: string): Promise<string> {
    return await invoke<string>('create_inbox_folder', { projectPath });
  }
}

export const fileWatcherService = new FileWatcherService();
