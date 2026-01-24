/**
 * Custom hooks for Forge application
 */

// Async state management
export { useAsync, useAsyncStates } from './useAsync';
export type { AsyncState, UseAsyncResult } from './useAsync';

// Notifications
export { useNotification, useAsyncNotification } from './useNotification';
export type { NotificationType, UseNotificationResult } from './useNotification';

// Project form management
export { useProjectForm } from './useProjectForm';
export type {
  FTPFormData,
  ProjectFormState,
  UseProjectFormResult,
} from './useProjectForm';

// Scraping
export { useScraping, DEFAULT_SCRAPING_OPTIONS } from './useScraping';
export type { ScrapingOptions, UseScrapingResult } from './useScraping';

// Color utilities
export { useColorMerge, hexToRgb, rgbToHex, colorDistance, mergeSimilarColors } from './useColorMerge';
export type { RGB, HSL, UseColorMergeResult } from './useColorMerge';

// Client profile
export { useClientProfile } from './useClientProfile';
export type { ClientProfileResult, UseClientProfileResult } from './useClientProfile';

// System tray
export { useSystemTray } from './useSystemTray';
export type { TrayIconState, UseSystemTrayResult } from './useSystemTray';

// Native menu events
export { useMenuEvents } from './useMenuEvents';
export type { MenuEventHandlers } from './useMenuEvents';

// File watcher
export { useFileWatcher } from './useFileWatcher';
export type { UseFileWatcherOptions, UseFileWatcherResult } from './useFileWatcher';

// Project filtering and sorting
export { useProjectFiltering } from './useProjectFiltering';
export type { SortBy, UseProjectFilteringOptions, UseProjectFilteringResult } from './useProjectFiltering';

// Filter preferences with persistence
export { useFilterPreferences } from './useFilterPreferences';
export type { FilterPreferences, UseFilterPreferencesResult } from './useFilterPreferences';

// Retry countdown for sync
export { useRetryCountdown } from './useRetryCountdown';

// Sync events from Tauri backend
export { useSyncEvents } from './useSyncEvents';
export type { UseSyncEventsOptions, UseSyncEventsResult } from './useSyncEvents';
