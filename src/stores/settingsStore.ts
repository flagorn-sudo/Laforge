import { create } from 'zustand';
import { Settings, DEFAULT_FOLDER_STRUCTURE, AutoOrganizeSettings } from '../types';
import { settingsService } from '../services/settingsService';

interface SettingsState extends Settings {
  hasChanges: boolean;
  isHydrated: boolean;

  // Actions
  updateSettings: (partial: Partial<Settings>) => void;
  setWorkspacePath: (path: string) => void;
  setGeminiApiKey: (key: string) => void;
  setGeminiModel: (model: string) => void;
  setFolderStructure: (structure: string[]) => void;
  setAutoOrganize: (settings: Partial<AutoOrganizeSettings>) => void;
  resetToDefaults: () => void;
  markSaved: () => void;

  // Hydration
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
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

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  ...DEFAULT_SETTINGS,
  hasChanges: false,
  isHydrated: false,

  updateSettings: (partial) => {
    set((state) => ({
      ...state,
      ...partial,
      hasChanges: true,
    }));
    // Auto-save to Tauri store
    get().saveSettings();
  },

  setWorkspacePath: (path) => {
    set({ workspacePath: path, hasChanges: true });
    get().saveSettings();
  },

  setGeminiApiKey: (key) => {
    set({ geminiApiKey: key, hasChanges: true });
    get().saveSettings();
  },

  setGeminiModel: (model) => {
    set({ geminiModel: model, hasChanges: true });
    get().saveSettings();
  },

  setFolderStructure: (structure) => {
    set({ folderStructure: structure, hasChanges: true });
    get().saveSettings();
  },

  setAutoOrganize: (settings) => {
    set((state) => ({
      autoOrganize: {
        ...DEFAULT_AUTO_ORGANIZE,
        ...state.autoOrganize,
        ...settings,
      },
      hasChanges: true,
    }));
    get().saveSettings();
  },

  resetToDefaults: () => {
    set({ ...DEFAULT_SETTINGS, hasChanges: true });
    get().saveSettings();
  },

  markSaved: () => set({ hasChanges: false }),

  loadSettings: async () => {
    try {
      const settings = await settingsService.loadSettings();
      set({
        ...settings,
        hasChanges: false,
        isHydrated: true,
      });
      console.log('[settingsStore] Settings hydrated from Tauri store');
    } catch (error) {
      console.error('[settingsStore] Failed to load settings:', error);
      set({ isHydrated: true }); // Mark as hydrated even on error to prevent infinite loading
    }
  },

  saveSettings: async () => {
    const state = get();
    const settings: Settings = {
      workspacePath: state.workspacePath,
      geminiApiKey: state.geminiApiKey,
      geminiModel: state.geminiModel,
      folderStructure: state.folderStructure,
      autoOrganize: state.autoOrganize,
      showMenuBarIcon: state.showMenuBarIcon,
    };
    try {
      await settingsService.saveSettings(settings);
    } catch (error) {
      console.error('[settingsStore] Failed to save settings:', error);
    }
  },
}));
