import { Settings, DEFAULT_FOLDER_STRUCTURE } from '../types';

const SETTINGS_KEY = 'forge_settings';

export const storageService = {
  getSettings(): Settings {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          workspacePath: parsed.workspacePath || '',
          geminiApiKey: parsed.geminiApiKey || '',
          folderStructure: parsed.folderStructure || DEFAULT_FOLDER_STRUCTURE,
        };
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
    return {
      workspacePath: '',
      geminiApiKey: '',
      folderStructure: DEFAULT_FOLDER_STRUCTURE,
    };
  },

  saveSettings(settings: Settings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  },

  updateSettings(partial: Partial<Settings>): Settings {
    const current = this.getSettings();
    const updated = { ...current, ...partial };
    this.saveSettings(updated);
    return updated;
  },
};
