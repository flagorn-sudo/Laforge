import { useEffect, useRef, useCallback } from 'react';
import { useSettingsStore, useProjectStore, useUIStore } from '../stores';
import { fileWatcherService, FileWatcherEvent, FileCategorization } from '../services/fileWatcherService';
import { Project } from '../types';

export interface UseFileWatcherOptions {
  enabled?: boolean;
}

// Default values matching settingsStore defaults
const DEFAULT_AUTO_ORGANIZE = {
  enabled: false,
  autoMove: false,
  confidenceThreshold: 70,
};

/**
 * Hook to manage automatic file watching for project _Inbox folders.
 * Listens to autoOrganize settings and starts/stops watchers accordingly.
 */
export function useFileWatcher(options: UseFileWatcherOptions = {}) {
  const { enabled = true } = options;

  // Settings
  const {
    autoOrganize: autoOrganizeRaw,
    geminiApiKey,
    geminiModel,
    folderStructure,
  } = useSettingsStore();

  // Ensure autoOrganize has default values
  const autoOrganize = autoOrganizeRaw ?? DEFAULT_AUTO_ORGANIZE;

  // Projects
  const { projects } = useProjectStore();

  // UI notifications
  const { addNotification } = useUIStore();

  // Track active watchers
  const activeWatchersRef = useRef<Set<string>>(new Set());

  // Callbacks for file events
  const handleFileDetected = useCallback((event: FileWatcherEvent) => {
    addNotification('info', `Nouveau fichier détecté: ${event.file_name}`);
  }, [addNotification]);

  const handleFileCategorized = useCallback(
    (event: FileWatcherEvent, categorization: FileCategorization) => {
      if (categorization.confidence >= (autoOrganize.confidenceThreshold || 70)) {
        addNotification(
          'info',
          `${event.file_name} → ${categorization.targetFolder} (${categorization.reason})`
        );
      }
    },
    [addNotification, autoOrganize.confidenceThreshold]
  );

  const handleFileMoved = useCallback(
    (event: FileWatcherEvent, destination: string) => {
      const destFolder = destination.split('/').slice(-2, -1)[0];
      addNotification('success', `${event.file_name} déplacé vers ${destFolder}`);
    },
    [addNotification]
  );

  const handleError = useCallback(
    (error: string) => {
      addNotification('error', `Erreur surveillance: ${error}`);
    },
    [addNotification]
  );

  // Start watching a project
  const startWatchingProject = useCallback(
    async (project: Project) => {
      if (!geminiApiKey || !autoOrganize.enabled) return;
      if (activeWatchersRef.current.has(project.id)) return;

      try {
        await fileWatcherService.startWatching(
          project.id,
          project.path,
          folderStructure,
          geminiApiKey,
          geminiModel || 'gemini-1.5-flash',
          autoOrganize.autoMove || false,
          autoOrganize.confidenceThreshold || 70,
          {
            onFileDetected: handleFileDetected,
            onFileCategorized: handleFileCategorized,
            onFileMoved: handleFileMoved,
            onError: handleError,
          }
        );
        activeWatchersRef.current.add(project.id);
        console.log(`[FileWatcher] Started watching: ${project.name}`);
      } catch (error) {
        console.error(`[FileWatcher] Failed to start watching ${project.name}:`, error);
      }
    },
    [
      geminiApiKey,
      geminiModel,
      folderStructure,
      autoOrganize.enabled,
      autoOrganize.autoMove,
      autoOrganize.confidenceThreshold,
      handleFileDetected,
      handleFileCategorized,
      handleFileMoved,
      handleError,
    ]
  );

  // Stop watching a project
  const stopWatchingProject = useCallback(async (projectId: string) => {
    if (!activeWatchersRef.current.has(projectId)) return;

    try {
      await fileWatcherService.stopWatching(projectId);
      activeWatchersRef.current.delete(projectId);
      console.log(`[FileWatcher] Stopped watching project: ${projectId}`);
    } catch (error) {
      console.error(`[FileWatcher] Failed to stop watching ${projectId}:`, error);
    }
  }, []);

  // Effect to manage watchers based on settings
  useEffect(() => {
    if (!enabled) return;

    const manageWatchers = async () => {
      if (autoOrganize.enabled && geminiApiKey) {
        // Start watchers for all projects
        for (const project of projects) {
          await startWatchingProject(project);
        }
      } else {
        // Stop all watchers
        for (const projectId of activeWatchersRef.current) {
          await stopWatchingProject(projectId);
        }
      }
    };

    manageWatchers();

    // Cleanup on unmount
    return () => {
      fileWatcherService.stopAll().catch(console.error);
    };
  }, [
    enabled,
    autoOrganize.enabled,
    geminiApiKey,
    projects,
    startWatchingProject,
    stopWatchingProject,
  ]);

  return {
    isActive: autoOrganize.enabled && !!geminiApiKey,
    activeWatchersCount: activeWatchersRef.current.size,
    startWatchingProject,
    stopWatchingProject,
  };
}

export type UseFileWatcherResult = ReturnType<typeof useFileWatcher>;
