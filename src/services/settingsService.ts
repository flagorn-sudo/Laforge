/**
 * Service de gestion des paramètres via Tauri Store
 * Remplace le localStorage de Zustand persist pour une persistance fiable dans Tauri
 */

import { Store } from 'tauri-plugin-store-api';
import { Settings, AutoOrganizeSettings, DEFAULT_FOLDER_STRUCTURE } from '../types';

const SETTINGS_STORE = 'app-settings.json';
const SETTINGS_KEY = 'settings';

let storeInstance: Store | null = null;
let storeLoaded = false;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = new Store(SETTINGS_STORE);
  }
  // Toujours charger depuis le disque au premier accès
  if (!storeLoaded) {
    try {
      await storeInstance.load();
      storeLoaded = true;
      console.log('[settingsService] Store loaded from disk');
    } catch (e) {
      console.log('[settingsService] No existing store file, will create new');
      storeLoaded = true;
    }
  }
  return storeInstance;
}

const DEFAULT_AUTO_ORGANIZE: AutoOrganizeSettings = {
  enabled: false,
  autoMove: false,
  confidenceThreshold: 70,
};

const DEFAULT_SETTINGS: Settings = {
  workspacePath: '',
  geminiApiKey: '',
  geminiModel: '',
  folderStructure: DEFAULT_FOLDER_STRUCTURE,
  autoOrganize: DEFAULT_AUTO_ORGANIZE,
  showMenuBarIcon: true,
};

export const settingsService = {
  /**
   * Load settings from Tauri store, with migration from localStorage if needed
   * @returns Settings or default settings if not found
   */
  async loadSettings(): Promise<Settings> {
    try {
      console.log('[settingsService] Loading settings from Tauri store...');
      const store = await getStore();
      let settings = await store.get<Settings>(SETTINGS_KEY);

      // If no settings in Tauri store, try to migrate from localStorage
      if (!settings) {
        console.log('[settingsService] No settings in Tauri store, checking localStorage...');
        const migratedSettings = this.migrateFromLocalStorage();
        if (migratedSettings) {
          console.log('[settingsService] Migrating settings from localStorage');
          settings = migratedSettings;
          // Save migrated settings to Tauri store
          await store.set(SETTINGS_KEY, settings);
          await store.save();
          console.log('[settingsService] Migration complete');
        }
      }

      if (settings) {
        console.log('[settingsService] Settings loaded successfully');
        // Merge with defaults to ensure all fields exist
        return {
          ...DEFAULT_SETTINGS,
          ...settings,
          autoOrganize: {
            ...DEFAULT_AUTO_ORGANIZE,
            ...settings.autoOrganize,
          },
        };
      }

      console.log('[settingsService] No settings found, returning defaults');
      return DEFAULT_SETTINGS;
    } catch (error) {
      console.error('[settingsService] Failed to load settings:', error);
      return DEFAULT_SETTINGS;
    }
  },

  /**
   * Try to migrate settings from old localStorage (Zustand persist)
   */
  migrateFromLocalStorage(): Settings | null {
    try {
      const oldData = localStorage.getItem('forge-settings');
      if (oldData) {
        const parsed = JSON.parse(oldData);
        // Zustand persist stores state in a 'state' property
        const state = parsed.state || parsed;
        if (state.workspacePath) {
          console.log('[settingsService] Found old settings in localStorage:', state.workspacePath);
          return {
            workspacePath: state.workspacePath || '',
            geminiApiKey: state.geminiApiKey || '',
            geminiModel: state.geminiModel || '',
            folderStructure: state.folderStructure || DEFAULT_FOLDER_STRUCTURE,
            autoOrganize: state.autoOrganize || DEFAULT_AUTO_ORGANIZE,
            showMenuBarIcon: state.showMenuBarIcon ?? true,
          };
        }
      }
      return null;
    } catch (error) {
      console.error('[settingsService] Failed to migrate from localStorage:', error);
      return null;
    }
  },

  /**
   * Save settings to Tauri store
   */
  async saveSettings(settings: Settings): Promise<void> {
    try {
      console.log('[settingsService] Saving settings to Tauri store...');
      const store = await getStore();
      await store.set(SETTINGS_KEY, settings);
      await store.save(); // Atomic write to disk
      console.log('[settingsService] Settings saved successfully');
    } catch (error) {
      console.error('[settingsService] Failed to save settings:', error);
      throw error;
    }
  },

  /**
   * Get default settings
   */
  getDefaultSettings(): Settings {
    return { ...DEFAULT_SETTINGS };
  },
};
