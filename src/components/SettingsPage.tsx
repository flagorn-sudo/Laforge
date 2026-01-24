import { useState, useCallback, useEffect } from 'react';
import { ArrowLeft, Save, Check } from 'lucide-react';
import { Settings as SettingsType, AutoOrganizeSettings, Project } from '../types';
import { Button, Tabs, treeToFlat } from './ui';
import type { Tab } from './ui';
import {
  WorkspaceSection,
  GeminiSection,
  FolderStructureSection,
  AutoOrganizeSection,
  MacOSSettingsSection,
  BackupSection,
} from '../features/settings/components';
import { useSettingsStore } from '../stores';
import { useFolderTree } from '../features/settings/hooks/useFolderTree';
import './SettingsPage.css';

const DEFAULT_AUTO_ORGANIZE: AutoOrganizeSettings = {
  enabled: false,
  autoMove: false,
  confidenceThreshold: 70,
};

interface SettingsPageProps {
  settings: SettingsType;
  projects?: Project[];
  onUpdate: (partial: Partial<SettingsType>) => void;
  onSave: () => void;
  onBack: () => void;
  onProjectsRefresh?: () => void;
  onNotification?: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void;
}

export function SettingsPage({
  settings,
  projects = [],
  onUpdate,
  onSave,
  onBack,
  onProjectsRefresh,
  onNotification,
}: SettingsPageProps) {
  const [workspacePath, setWorkspacePath] = useState(settings.workspacePath);
  const [geminiApiKey, setGeminiApiKey] = useState(settings.geminiApiKey || '');
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel || '');
  const [autoOrganize, setAutoOrganize] = useState<AutoOrganizeSettings>(
    settings.autoOrganize || DEFAULT_AUTO_ORGANIZE
  );
  const [showMenuBarIcon, setShowMenuBarIcon] = useState(settings.showMenuBarIcon ?? true);
  const [saved, setSaved] = useState(false);

  // Sync local state with store state when it changes (e.g., after backup import)
  useEffect(() => {
    setWorkspacePath(settings.workspacePath);
    setGeminiApiKey(settings.geminiApiKey || '');
    setGeminiModel(settings.geminiModel || '');
    setAutoOrganize(settings.autoOrganize || DEFAULT_AUTO_ORGANIZE);
    setShowMenuBarIcon(settings.showMenuBarIcon ?? true);
  }, [settings.workspacePath, settings.geminiApiKey, settings.geminiModel, settings.autoOrganize, settings.showMenuBarIcon]);

  // Auto-save callback for folder structure changes
  const handleFolderAutoSave = useCallback((flatStructure: string[]) => {
    onUpdate({ folderStructure: flatStructure });
  }, [onUpdate]);

  const {
    treeNodes,
    setTreeNodes,
    addRootFolder,
    addSubfolder,
    deleteFolder,
    renameFolder,
    resetToDefault,
  } = useFolderTree(settings.folderStructure, {
    onAutoSave: handleFolderAutoSave,
  });

  const handleAutoOrganizeChange = (partial: Partial<AutoOrganizeSettings>) => {
    setAutoOrganize((prev) => ({ ...prev, ...partial }));
  };

  const handleSave = async () => {
    const folderStructure = treeToFlat(treeNodes);
    onUpdate({
      workspacePath,
      geminiApiKey: geminiApiKey || undefined,
      geminiModel: geminiModel || undefined,
      folderStructure,
      autoOrganize,
      showMenuBarIcon,
    });

    // Force immediate save to disk (bypass debounce for critical settings)
    await useSettingsStore.getState().saveSettingsImmediate();

    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs: Tab[] = [
    {
      id: 'general',
      label: 'General',
      content: (
        <div className="settings-tab-content">
          <WorkspaceSection
            workspacePath={workspacePath}
            onWorkspacePathChange={setWorkspacePath}
          />
          <GeminiSection
            apiKey={geminiApiKey}
            model={geminiModel}
            onApiKeyChange={setGeminiApiKey}
            onModelChange={setGeminiModel}
          />
          <AutoOrganizeSection
            settings={autoOrganize}
            hasGeminiKey={!!geminiApiKey}
            onChange={handleAutoOrganizeChange}
          />
          <MacOSSettingsSection
            showMenuBarIcon={showMenuBarIcon}
            onShowMenuBarIconChange={setShowMenuBarIcon}
          />
        </div>
      ),
    },
    {
      id: 'folders',
      label: 'Structure des dossiers',
      content: (
        <div className="settings-tab-content">
          <FolderStructureSection
            treeNodes={treeNodes}
            onTreeChange={setTreeNodes}
            onAddRootFolder={addRootFolder}
            onAddSubfolder={addSubfolder}
            onDeleteFolder={deleteFolder}
            onRenameFolder={renameFolder}
            onReset={resetToDefault}
          />
        </div>
      ),
    },
    {
      id: 'backup',
      label: 'Sauvegarde',
      content: (
        <div className="settings-tab-content">
          <BackupSection
            settings={settings}
            projects={projects}
            onSettingsUpdate={onUpdate}
            onProjectsRefresh={onProjectsRefresh || (() => {})}
            onNotification={onNotification || (() => {})}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <h1>Parametres</h1>
        <Button onClick={handleSave} className="save-button">
          {saved ? <Check size={16} /> : <Save size={16} />}
          {saved ? 'Enregistre !' : 'Sauvegarder'}
        </Button>
      </div>

      <div className="settings-page-content">
        <Tabs tabs={tabs} defaultTab="general" />
      </div>
    </div>
  );
}
