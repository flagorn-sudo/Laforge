import { create } from 'zustand';
import { Settings, DEFAULT_FOLDER_STRUCTURE, AutoOrganizeSettings, FilterPreferences, IDEMonitoringSettings, GlobalBillingSettings, BillingUnit, Currency } from '../types';
import { settingsService } from '../services/settingsService';

// Debounce utility to prevent race conditions on rapid settings changes
function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Debounced save function - 500ms delay to batch rapid changes
const debouncedSave = debounce(() => {
  useSettingsStore.getState().saveSettings();
}, 500);

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
  setIDEMonitoring: (settings: Partial<IDEMonitoringSettings>) => void;
  setBilling: (settings: Partial<GlobalBillingSettings>) => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  resetToDefaults: () => void;
  markSaved: () => void;

  // Project Registry Actions
  registerProject: (path: string) => void;
  unregisterProject: (path: string) => void;
  setRegisteredProjects: (paths: string[]) => void;

  // Hydration
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  saveSettingsImmediate: () => Promise<void>; // Force save without debounce
}

const DEFAULT_AUTO_ORGANIZE: AutoOrganizeSettings = {
  enabled: false,
  autoMove: false,
  confidenceThreshold: 70,
};

const DEFAULT_FILTER_PREFERENCES: FilterPreferences = {
  filterBarOpen: false,
  statusFilters: [],
  sortBy: 'name',
};

const DEFAULT_IDE_MONITORING: IDEMonitoringSettings = {
  enabled: false,
  checkIntervalMs: 5000,
  autoStopDelayMs: 10000,
  preferredIDE: 'pycharm',
};

const DEFAULT_BILLING: GlobalBillingSettings = {
  defaultRate: 75,
  defaultUnit: 'hour' as BillingUnit,
  defaultCurrency: 'EUR' as Currency,
};

const DEFAULT_SETTINGS: Settings = {
  workspacePath: '',
  registeredProjects: [],
  geminiApiKey: '',
  geminiModel: '',
  folderStructure: DEFAULT_FOLDER_STRUCTURE,
  autoOrganize: DEFAULT_AUTO_ORGANIZE,
  showMenuBarIcon: true,
  viewMode: 'grid',
  filterPreferences: DEFAULT_FILTER_PREFERENCES,
  ideMonitoring: DEFAULT_IDE_MONITORING,
  billing: DEFAULT_BILLING,
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
    // Auto-save with debounce to prevent race conditions
    debouncedSave();
  },

  setWorkspacePath: (path) => {
    set({ workspacePath: path, hasChanges: true });
    debouncedSave();
  },

  setGeminiApiKey: (key) => {
    set({ geminiApiKey: key, hasChanges: true });
    debouncedSave();
  },

  setGeminiModel: (model) => {
    set({ geminiModel: model, hasChanges: true });
    debouncedSave();
  },

  setFolderStructure: (structure) => {
    set({ folderStructure: structure, hasChanges: true });
    debouncedSave();
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
    debouncedSave();
  },

  setIDEMonitoring: (settings) => {
    set((state) => ({
      ideMonitoring: {
        ...DEFAULT_IDE_MONITORING,
        ...state.ideMonitoring,
        ...settings,
      },
      hasChanges: true,
    }));
    debouncedSave();
  },

  setBilling: (settings) => {
    set((state) => ({
      billing: {
        ...DEFAULT_BILLING,
        ...state.billing,
        ...settings,
      },
      hasChanges: true,
    }));
    debouncedSave();
  },

  setViewMode: (mode) => {
    set({ viewMode: mode, hasChanges: true });
    debouncedSave();
  },

  // Project Registry Actions
  registerProject: (path: string) => {
    set((state) => {
      const currentPaths = state.registeredProjects || [];
      // Avoid duplicates
      if (currentPaths.includes(path)) {
        return state;
      }
      return {
        registeredProjects: [...currentPaths, path].sort(),
        hasChanges: true,
      };
    });
    debouncedSave();
  },

  unregisterProject: (path: string) => {
    set((state) => {
      const currentPaths = state.registeredProjects || [];
      return {
        registeredProjects: currentPaths.filter((p) => p !== path),
        hasChanges: true,
      };
    });
    debouncedSave();
  },

  setRegisteredProjects: (paths: string[]) => {
    set({ registeredProjects: paths, hasChanges: true });
    debouncedSave();
  },

  resetToDefaults: () => {
    set({ ...DEFAULT_SETTINGS, hasChanges: true });
    debouncedSave();
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
      registeredProjects: state.registeredProjects,
      geminiApiKey: state.geminiApiKey,
      geminiModel: state.geminiModel,
      folderStructure: state.folderStructure,
      autoOrganize: state.autoOrganize,
      showMenuBarIcon: state.showMenuBarIcon,
      viewMode: state.viewMode,
      filterPreferences: state.filterPreferences,
      ideMonitoring: state.ideMonitoring,
      billing: state.billing,
    };
    try {
      await settingsService.saveSettings(settings);
    } catch (error) {
      console.error('[settingsStore] Failed to save settings:', error);
    }
  },

  // Force immediate save (bypasses debounce) - use for critical operations like backup restore
  saveSettingsImmediate: async () => {
    const state = get();
    const settings: Settings = {
      workspacePath: state.workspacePath,
      registeredProjects: state.registeredProjects,
      geminiApiKey: state.geminiApiKey,
      geminiModel: state.geminiModel,
      folderStructure: state.folderStructure,
      autoOrganize: state.autoOrganize,
      showMenuBarIcon: state.showMenuBarIcon,
      viewMode: state.viewMode,
      filterPreferences: state.filterPreferences,
      ideMonitoring: state.ideMonitoring,
      billing: state.billing,
    };
    try {
      console.log('[settingsStore] Force saving settings immediately...');
      await settingsService.saveSettings(settings);
      console.log('[settingsStore] Settings saved immediately, workspacePath:', state.workspacePath);
    } catch (error) {
      console.error('[settingsStore] Failed to save settings immediately:', error);
      throw error;
    }
  },
}));
