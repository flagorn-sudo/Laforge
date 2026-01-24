/**
 * Hook for System Tray integration (macOS)
 * Listens to tray events and manages tray menu updates
 * Shows 7 most recent projects with Finder and FTP sync options
 */

import { useEffect, useCallback, useState } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { Project } from '../types';
import { logger } from '../lib/logger';

const log = logger.scope('SystemTray');

export type TrayIconState = 'normal' | 'syncing' | 'success';

export interface UseSystemTrayResult {
  // State
  isAvailable: boolean;

  // Actions
  updateRecentProjects: (projects: Project[]) => Promise<void>;
  setSyncIndicator: (state: TrayIconState) => Promise<void>;

  // Event handlers
  onOpenFinder: (callback: (projectId: string) => void) => void;
  onSyncProject: (callback: (projectId: string) => void) => void;
}

/**
 * Hook for integrating with macOS System Tray
 * Shows 7 most recent projects with options to open in Finder or sync FTP
 *
 * @example
 * const { updateRecentProjects, onOpenFinder, onSyncProject } = useSystemTray();
 *
 * // Update recent projects in tray menu
 * useEffect(() => {
 *   updateRecentProjects(projects);
 * }, [projects]);
 *
 * // Handle open finder from tray
 * onOpenFinder((projectId) => {
 *   openProjectInFinder(projectId);
 * });
 *
 * // Handle sync from tray
 * onSyncProject((projectId) => {
 *   startFtpSync(projectId);
 * });
 */
export function useSystemTray(): UseSystemTrayResult {
  const [isAvailable, setIsAvailable] = useState(false);
  const [openFinderHandler, setOpenFinderHandler] = useState<((id: string) => void) | null>(null);
  const [syncProjectHandler, setSyncProjectHandler] = useState<((id: string) => void) | null>(null);

  // Check if system tray is available
  useEffect(() => {
    const checkAvailability = async () => {
      try {
        // Try to invoke a tray check command
        await invoke('tray_is_available');
        setIsAvailable(true);
        log.info('System tray is available');
      } catch {
        // Tray not available (possibly not configured or not supported)
        setIsAvailable(false);
        log.debug('System tray not available');
      }
    };

    checkAvailability();
  }, []);

  // Listen to tray events
  useEffect(() => {
    const unlistenFns: UnlistenFn[] = [];

    const setupListeners = async () => {
      try {
        // Listen for open finder event
        const unlistenFinder = await listen<string>('tray:open-finder', (event) => {
          log.debug('Received tray:open-finder event', event.payload);
          openFinderHandler?.(event.payload);
        });
        unlistenFns.push(unlistenFinder);

        // Listen for sync project event
        const unlistenSync = await listen<string>('tray:sync-project', (event) => {
          log.debug('Received tray:sync-project event', event.payload);
          syncProjectHandler?.(event.payload);
        });
        unlistenFns.push(unlistenSync);
      } catch (err) {
        log.error('Failed to setup tray event listeners', err);
      }
    };

    setupListeners();

    return () => {
      unlistenFns.forEach((unlisten) => unlisten());
    };
  }, [openFinderHandler, syncProjectHandler]);

  const updateRecentProjects = useCallback(
    async (projects: Project[]) => {
      if (!isAvailable) return;

      try {
        // Sort by updated date (most recent first) and take 7
        const recentProjects = [...projects]
          .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
          .slice(0, 7)
          .map((p) => ({
            id: p.id,
            name: p.name,
            client: p.client,
            path: p.path,
            hasFtp: p.sftp?.configured === true,
          }));

        await invoke('tray_update_recent_projects', { projects: recentProjects });
        log.debug('Updated tray recent projects', { count: recentProjects.length });
      } catch (err) {
        log.error('Failed to update tray recent projects', err);
      }
    },
    [isAvailable]
  );

  const onOpenFinder = useCallback((callback: (projectId: string) => void) => {
    setOpenFinderHandler(() => callback);
  }, []);

  const onSyncProject = useCallback((callback: (projectId: string) => void) => {
    setSyncProjectHandler(() => callback);
  }, []);

  const setSyncIndicator = useCallback(
    async (state: TrayIconState) => {
      if (!isAvailable) return;

      try {
        await invoke('tray_set_sync_indicator', { state });
        log.debug('Set tray sync indicator', { state });
      } catch (err) {
        log.error('Failed to set tray sync indicator', err);
      }
    },
    [isAvailable]
  );

  return {
    isAvailable,
    updateRecentProjects,
    setSyncIndicator,
    onOpenFinder,
    onSyncProject,
  };
}
