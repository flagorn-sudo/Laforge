/**
 * Hook for handling native macOS menu events
 * Listens to events emitted from Rust menu handlers
 */

import { useEffect } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface MenuEventHandlers {
  onAbout?: () => void;
  onPreferences?: () => void;
  onNewProject?: () => void;
  onRefresh?: () => void;
  onOpenFinder?: () => void;
  onOpenBrowser?: () => void;
  onSync?: () => void;
  onScrape?: () => void;
}

/**
 * Hook to listen to native menu events
 * @param handlers - Object containing callback functions for each menu action
 */
export function useMenuEvents(handlers: MenuEventHandlers): void {
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    const setupListeners = async () => {
      if (handlers.onAbout) {
        const unlisten = await listen('menu-about', handlers.onAbout);
        unlisteners.push(unlisten);
      }

      if (handlers.onPreferences) {
        const unlisten = await listen('menu-preferences', handlers.onPreferences);
        unlisteners.push(unlisten);
      }

      if (handlers.onNewProject) {
        const unlisten = await listen('menu-new-project', handlers.onNewProject);
        unlisteners.push(unlisten);
      }

      if (handlers.onRefresh) {
        const unlisten = await listen('menu-refresh', handlers.onRefresh);
        unlisteners.push(unlisten);
      }

      if (handlers.onOpenFinder) {
        const unlisten = await listen('menu-open-finder', handlers.onOpenFinder);
        unlisteners.push(unlisten);
      }

      if (handlers.onOpenBrowser) {
        const unlisten = await listen('menu-open-browser', handlers.onOpenBrowser);
        unlisteners.push(unlisten);
      }

      if (handlers.onSync) {
        const unlisten = await listen('menu-sync', handlers.onSync);
        unlisteners.push(unlisten);
      }

      if (handlers.onScrape) {
        const unlisten = await listen('menu-scrape', handlers.onScrape);
        unlisteners.push(unlisten);
      }
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [
    handlers.onAbout,
    handlers.onPreferences,
    handlers.onNewProject,
    handlers.onRefresh,
    handlers.onOpenFinder,
    handlers.onOpenBrowser,
    handlers.onSync,
    handlers.onScrape,
  ]);
}
