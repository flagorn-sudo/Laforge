import { useState, useCallback } from 'react';
import { Save, Check } from 'lucide-react';
import { Settings as SettingsType, AutoOrganizeSettings, Project } from '../types';
import { Modal, Button, Tabs, treeToFlat } from './ui';
import type { Tab } from './ui';
import {
  WorkspaceSection,
  GeminiSection,
  FolderStructureSection,
  AutoOrganizeSection,
  MacOSSettingsSection,
  BackupSection,
} from '../features/settings/components';
import { useFolderTree } from '../features/settings/hooks/useFolderTree';

const DEFAULT_AUTO_ORGANIZE: AutoOrganizeSettings = {
  enabled: false,
  autoMove: false,
  confidenceThreshold: 70,
};

interface SettingsProps {
  settings: SettingsType;
  projects?: Project[];
  onUpdate: (partial: Partial<SettingsType>) => void;
  onSave: () => void;
  onClose: () => void;
  onProjectsRefresh?: () => void;
  onNotification?: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void;
}

export function Settings({
  settings,
  projects = [],
  onUpdate,
  onSave,
  onClose,
  onProjectsRefresh,
  onNotification,
}: SettingsProps) {
  const [workspacePath, setWorkspacePath] = useState(settings.workspacePath);
  const [geminiApiKey, setGeminiApiKey] = useState(settings.geminiApiKey || '');
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel || '');
  const [autoOrganize, setAutoOrganize] = useState<AutoOrganizeSettings>(
    settings.autoOrganize || DEFAULT_AUTO_ORGANIZE
  );
  const [showMenuBarIcon, setShowMenuBarIcon] = useState(settings.showMenuBarIcon ?? true);
  const [saved, setSaved] = useState(false);

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

  const handleSave = () => {
    const folderStructure = treeToFlat(treeNodes);
    onUpdate({
      workspacePath,
      geminiApiKey: geminiApiKey || undefined,
      geminiModel: geminiModel || undefined,
      folderStructure,
      autoOrganize,
      showMenuBarIcon,
    });
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs: Tab[] = [
    {
      id: 'general',
      label: 'Général',
      content: (
        <div className="settings-content">
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
        <div className="settings-content">
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
        <div className="settings-content">
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
    <Modal
      title="Paramètres"
      onClose={onClose}
      className="settings-modal"
      footer={
        <Button onClick={handleSave}>
          {saved ? <Check size={16} /> : <Save size={16} />}
          {saved ? 'Enregistré !' : 'Sauvegarder'}
        </Button>
      }
    >
      <Tabs tabs={tabs} defaultTab="general" />
    </Modal>
  );
}
