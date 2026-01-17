import { useState, useCallback, useEffect } from 'react';
import { Settings, DEFAULT_FOLDER_STRUCTURE } from '../types';
import { storageService } from '../services/storageService';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => {
    const stored = storageService.getSettings();
    return {
      ...stored,
      folderStructure: stored.folderStructure || DEFAULT_FOLDER_STRUCTURE,
    };
  });
  const [hasChanges, setHasChanges] = useState(false);

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
    setHasChanges(true);
  }, []);

  const saveSettings = useCallback(() => {
    storageService.saveSettings(settings);
    setHasChanges(false);
  }, [settings]);

  // Auto-save on unmount if there are changes
  useEffect(() => {
    return () => {
      if (hasChanges) {
        storageService.saveSettings(settings);
      }
    };
  }, [hasChanges, settings]);

  return {
    settings,
    hasChanges,
    updateSettings,
    saveSettings,
  };
}
