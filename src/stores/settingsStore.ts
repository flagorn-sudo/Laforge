import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Settings, DEFAULT_FOLDER_STRUCTURE, AutoOrganizeSettings } from '../types';

interface SettingsState extends Settings {
  hasChanges: boolean;

  // Actions
  updateSettings: (partial: Partial<Settings>) => void;
  setWorkspacePath: (path: string) => void;
  setGeminiApiKey: (key: string) => void;
  setGeminiModel: (model: string) => void;
  setFolderStructure: (structure: string[]) => void;
  setAutoOrganize: (settings: Partial<AutoOrganizeSettings>) => void;
  resetToDefaults: () => void;
  markSaved: () => void;
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

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      hasChanges: false,

      updateSettings: (partial) =>
        set((state) => ({
          ...state,
          ...partial,
          hasChanges: true,
        })),

      setWorkspacePath: (path) =>
        set({ workspacePath: path, hasChanges: true }),

      setGeminiApiKey: (key) =>
        set({ geminiApiKey: key, hasChanges: true }),

      setGeminiModel: (model) =>
        set({ geminiModel: model, hasChanges: true }),

      setFolderStructure: (structure) =>
        set({ folderStructure: structure, hasChanges: true }),

      setAutoOrganize: (settings) =>
        set((state) => ({
          autoOrganize: {
            ...DEFAULT_AUTO_ORGANIZE,
            ...state.autoOrganize,
            ...settings,
          },
          hasChanges: true,
        })),

      resetToDefaults: () =>
        set({ ...DEFAULT_SETTINGS, hasChanges: true }),

      markSaved: () => set({ hasChanges: false }),
    }),
    {
      name: 'forge-settings',
      partialize: (state) => ({
        workspacePath: state.workspacePath,
        geminiApiKey: state.geminiApiKey,
        geminiModel: state.geminiModel,
        folderStructure: state.folderStructure,
        autoOrganize: state.autoOrganize,
        showMenuBarIcon: state.showMenuBarIcon,
      }),
    }
  )
);
