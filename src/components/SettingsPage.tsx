import { useState, useCallback, useEffect } from 'react';
import { ArrowLeft, Save, Check, DollarSign } from 'lucide-react';
import { Settings as SettingsType, AutoOrganizeSettings, IDEMonitoringSettings, GlobalBillingSettings, Project } from '../types';
import { Button, Tabs, treeToFlat } from './ui';
import type { Tab } from './ui';
import {
  WorkspaceSection,
  GeminiSection,
  FolderStructureSection,
  AutoOrganizeSection,
  MacOSSettingsSection,
  BackupSection,
  IDEMonitoringSection,
  BillingSection,
} from '../features/settings/components';
import { useSettingsStore } from '../stores';
import { useFolderTree } from '../features/settings/hooks/useFolderTree';
import './SettingsPage.css';

const DEFAULT_AUTO_ORGANIZE: AutoOrganizeSettings = {
  enabled: false,
  autoMove: false,
  confidenceThreshold: 70,
};

const DEFAULT_IDE_MONITORING: IDEMonitoringSettings = {
  enabled: false,
  checkIntervalMs: 5000,
  autoStopDelayMs: 10000,
  preferredIDE: 'pycharm',
};

const DEFAULT_BILLING: GlobalBillingSettings = {
  defaultRate: 75,
  defaultUnit: 'hour',
  defaultCurrency: 'EUR',
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
  const [ideMonitoring, setIDEMonitoring] = useState<IDEMonitoringSettings>(
    settings.ideMonitoring || DEFAULT_IDE_MONITORING
  );
  const [billing, setBilling] = useState<GlobalBillingSettings>(
    settings.billing || DEFAULT_BILLING
  );
  const [showMenuBarIcon, setShowMenuBarIcon] = useState(settings.showMenuBarIcon ?? true);
  const [saved, setSaved] = useState(false);

  // Sync local state with store state when it changes (e.g., after backup import)
  useEffect(() => {
    setWorkspacePath(settings.workspacePath);
    setGeminiApiKey(settings.geminiApiKey || '');
    setGeminiModel(settings.geminiModel || '');
    setAutoOrganize(settings.autoOrganize || DEFAULT_AUTO_ORGANIZE);
    setIDEMonitoring(settings.ideMonitoring || DEFAULT_IDE_MONITORING);
    setBilling(settings.billing || DEFAULT_BILLING);
    setShowMenuBarIcon(settings.showMenuBarIcon ?? true);
  }, [settings.workspacePath, settings.geminiApiKey, settings.geminiModel, settings.autoOrganize, settings.ideMonitoring, settings.billing, settings.showMenuBarIcon]);

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

  const handleIDEMonitoringChange = (partial: Partial<IDEMonitoringSettings>) => {
    setIDEMonitoring((prev) => ({ ...prev, ...partial }));
  };

  const handleBillingChange = (partial: Partial<GlobalBillingSettings>) => {
    const newBilling = { ...billing, ...partial };
    setBilling(newBilling);
    // Save directly to store for immediate persistence
    useSettingsStore.getState().setBilling(partial);
  };

  const handleSave = async () => {
    const folderStructure = treeToFlat(treeNodes);
    onUpdate({
      workspacePath,
      geminiApiKey: geminiApiKey || undefined,
      geminiModel: geminiModel || undefined,
      folderStructure,
      autoOrganize,
      ideMonitoring,
      billing,
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
          <IDEMonitoringSection
            settings={ideMonitoring}
            onChange={handleIDEMonitoringChange}
          />
          <MacOSSettingsSection
            showMenuBarIcon={showMenuBarIcon}
            onShowMenuBarIconChange={setShowMenuBarIcon}
          />
        </div>
      ),
    },
    {
      id: 'billing',
      label: 'Facturation',
      content: (
        <div className="settings-tab-content">
          <div className="settings-section">
            <h3 className="settings-section-title">
              <DollarSign size={16} style={{ marginRight: 8 }} />
              Parametres de facturation
            </h3>
            <p className="settings-hint" style={{ marginBottom: 20 }}>
              Definissez le taux et l'unite de facturation par defaut pour tous vos projets.
            </p>
            <BillingSection
              billing={billing}
              onBillingChange={handleBillingChange}
              projects={projects}
              onProjectsRefresh={onProjectsRefresh}
              onNotification={onNotification}
            />
          </div>
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
