import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Folder,
  Globe,
  ExternalLink as ExternalLinkIcon,
  RefreshCw,
  Loader,
  TestTube,
  Trash2,
  AlertTriangle,
  Sparkles,
  Palette,
  Save,
  Plus,
  X,
  Edit3,
  Check,
  ChevronDown,
  FolderSync,
  FileText,
  BookOpen,
  History,
  Calendar,
} from 'lucide-react';
import { Project, PROJECT_STATUS_CONFIG, FTPProtocol, ReferenceWebsite, ProjectStatus } from '../types';
import { ReorganizeProjectModal } from './ReorganizeProjectModal';
import { projectService } from '../services/projectService';
import { sftpService } from '../services/sftpService';
import { scrapingService } from '../services/scrapingService';
import { geminiService } from '../services/geminiService';
import { briefGenerator } from '../services/briefGenerator';
import { fileSystemService } from '../services/fileSystemService';
import { Button, Card, Modal, Tabs } from './ui';
import { FTPSection, ProjectFileTree, SyncProgress } from '../features/projects/components';
import { ScrapingPage } from './ScrapingPage';
import { FTPLogWindow } from './FTPLogWindow';
import { VersionHistory } from './VersionHistory';
import { SyncScheduler } from './SyncScheduler';
import { useFTPConnection } from '../features/projects/hooks/useFTPConnection';
import { useSyncEvents } from '../hooks';
import { useUIStore, useSyncStore, useProjectStore } from '../stores';

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    // Try short hex format
    const shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
    if (shortResult) {
      return {
        r: parseInt(shortResult[1] + shortResult[1], 16),
        g: parseInt(shortResult[2] + shortResult[2], 16),
        b: parseInt(shortResult[3] + shortResult[3], 16),
      };
    }
    return null;
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Calculate color distance using Euclidean distance in RGB space
 */
function colorDistance(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return Infinity;

  const dr = rgb1.r - rgb2.r;
  const dg = rgb1.g - rgb2.g;
  const db = rgb1.b - rgb2.b;

  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Merge similar colors based on distance threshold
 */
function mergeSimilarColors(colors: string[], threshold: number = 30): string[] {
  if (colors.length === 0) return [];

  const merged: string[] = [];
  const used = new Set<number>();

  for (let i = 0; i < colors.length; i++) {
    if (used.has(i)) continue;

    // Keep this color as representative
    merged.push(colors[i]);
    used.add(i);

    // Mark all similar colors as used
    for (let j = i + 1; j < colors.length; j++) {
      if (used.has(j)) continue;
      if (colorDistance(colors[i], colors[j]) < threshold) {
        used.add(j);
      }
    }
  }

  return merged;
}

interface ProjectDetailProps {
  project: Project;
  workspacePath: string;
  geminiApiKey?: string;
  geminiModel?: string;
  onBack: () => void;
  onUpdate: (project: Project) => void;
  onSync?: (project: Project) => Promise<void>;
  onDelete?: (project: Project) => Promise<void>;
}

interface FTPFormData {
  configured: boolean;
  host?: string;
  username?: string;
  password?: string;
  port?: number;
  remotePath?: string;
  passive?: boolean;
  protocol?: FTPProtocol;
  acceptInvalidCerts?: boolean;
}

export function ProjectDetail({
  project,
  workspacePath: _workspacePath,
  geminiApiKey,
  geminiModel,
  onBack,
  onUpdate,
  onSync,
  onDelete,
}: ProjectDetailProps) {
  void _workspacePath; // Silence unused variable warning
  const [activeTab, setActiveTab] = useState('general');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showReorganizeModal, setShowReorganizeModal] = useState(false);
  const [showLogWindow, setShowLogWindow] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [credentialsLoading, setCredentialsLoading] = useState(project.sftp.configured);

  // Form state for FTP
  const [sftpForm, setSftpForm] = useState<FTPFormData>({
    configured: project.sftp.configured || false,
    host: project.sftp.host || '',
    username: project.sftp.username || '',
    password: '',
    port: project.sftp.port || 21,
    remotePath: project.sftp.remotePath || '/public_html',
    passive: project.sftp.passive ?? true,
    protocol: project.sftp.protocol || 'ftp',
    acceptInvalidCerts: project.sftp.acceptInvalidCerts ?? false,
  });
  const [localPath, setLocalPath] = useState(project.localPath || 'www');
  const [testUrl, setTestUrl] = useState(project.urls.testUrl || '');
  const [savePassword, setSavePassword] = useState(true);
  const [currentSiteUrl, setCurrentSiteUrl] = useState(
    project.urls.currentSite || project.urls.production || ''
  );
  const [referenceWebsites, setReferenceWebsites] = useState<ReferenceWebsite[]>(
    project.referenceWebsites || []
  );

  // Client profile state
  const [clientDescription, setClientDescription] = useState(project.clientDescription || '');
  const [themeTags, setThemeTags] = useState<string[]>(project.themeTags || []);
  const [editingDescription, setEditingDescription] = useState(false);
  const [generatingProfile, setGeneratingProfile] = useState(false);
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState('');
  const [showAddReference, setShowAddReference] = useState(false);
  const [newReferenceUrl, setNewReferenceUrl] = useState('');
  const [editingCurrentSiteUrl, setEditingCurrentSiteUrl] = useState(false);
  const [editingTestUrl, setEditingTestUrl] = useState(false);
  const [briefExists, setBriefExists] = useState(false);
  const [briefPath, setBriefPath] = useState('');

  const {
    testing,
    testResult,
    remoteFolders,
    loadingFolders,
    stage: connectionStage,
    elapsedSeconds,
    testConnection,
    resetTestResult,
    cancelConnection,
  } = useFTPConnection();

  const { addNotification } = useUIStore();

  // Project store for editing protection
  const { startEditing, stopEditing } = useProjectStore();

  // Sync store for progress tracking
  const { getSyncState, canStartSync, startSync, resetSync, cancelSync, clearLogs, retryFailedFile, clearConnectionError } = useSyncStore();
  const syncState = getSyncState(project.id);
  const syncing = syncState.stage !== 'idle' && syncState.stage !== 'complete' && syncState.stage !== 'error' && syncState.stage !== 'cancelled';
  const syncAllowed = canStartSync(project.id);

  // Listen for sync events from Rust backend
  useSyncEvents({
    projectId: project.id,
    enabled: syncing,
  });

  // Editing protection: Block fetchProjects while editing this project
  useEffect(() => {
    if (project) {
      startEditing(project.id);
    }
    return () => {
      stopEditing();
    };
  }, [project?.id, startEditing, stopEditing]);

  // Sync form state when project prop changes - single coherent useEffect
  useEffect(() => {
    // 1. Reset the form with project data (password temporarily empty)
    setSftpForm({
      configured: project.sftp.configured || false,
      host: project.sftp.host || '',
      username: project.sftp.username || '',
      password: '', // Password is loaded separately from keychain
      port: project.sftp.port || 21,
      remotePath: project.sftp.remotePath || '/public_html',
      passive: project.sftp.passive ?? true,
      protocol: project.sftp.protocol || 'ftp',
      acceptInvalidCerts: project.sftp.acceptInvalidCerts ?? false,
    });
    setLocalPath(project.localPath || 'www');
    setTestUrl(project.urls.testUrl || '');
    setCurrentSiteUrl(project.urls.currentSite || project.urls.production || '');
    setReferenceWebsites(project.referenceWebsites || []);
    setClientDescription(project.clientDescription || '');
    setThemeTags(project.themeTags || []);
    setHasChanges(false);

    // 2. Load password from keychain if FTP is configured
    if (project.sftp.configured) {
      setCredentialsLoading(true);
      sftpService.getCredentials(project.id)
        .then((password) => {
          if (password) {
            setSftpForm((prev) => ({ ...prev, password }));
          }
        })
        .finally(() => setCredentialsLoading(false));
    } else {
      setCredentialsLoading(false);
    }

    // 3. Check if brief exists
    const checkBrief = async () => {
      const path = fileSystemService.joinPath(project.path, 'Documentation', 'brief-projet.md');
      setBriefPath(path);
      try {
        const exists = await fileSystemService.exists(path);
        setBriefExists(exists);
      } catch {
        setBriefExists(false);
      }
    };
    checkBrief();
  }, [project.id, project.path]);

  const handleSync = async () => {
    // Check if sync is allowed
    const check = canStartSync(project.id);
    if (!check.allowed) {
      addNotification('warning', check.reason || 'Synchronisation non disponible');
      return;
    }

    // Switch to FTP tab to show progress
    setActiveTab('ftp');

    await startSync(project, (success, filesUploaded) => {
      if (success) {
        addNotification('success', `Synchronisation terminee: ${filesUploaded} fichier${filesUploaded > 1 ? 's' : ''} envoye${filesUploaded > 1 ? 's' : ''}`);
        // Refresh project data
        onUpdate(project);
      } else {
        addNotification('error', 'Erreur lors de la synchronisation');
      }
    });
  };

  const handleCloseSyncProgress = () => {
    resetSync(project.id);
  };

  const handleDelete = async () => {
    if (!onDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete(project);
      onBack();
    } catch {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleAnalyze = async () => {
    const urlToAnalyze = currentSiteUrl;
    if (!urlToAnalyze || !geminiApiKey || analyzing) return;

    setAnalyzing(true);
    try {
      const analysis = await scrapingService.analyzeWebsite(
        urlToAnalyze,
        geminiApiKey,
        geminiModel
      );

      const updated: Project = {
        ...project,
        colors: analysis.colors,
        fonts: analysis.fonts,
        updated: new Date().toISOString(),
      };

      await projectService.saveProject(updated);
      onUpdate(updated);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerateBrief = async () => {
    if (generatingBrief) return;

    setGeneratingBrief(true);
    try {
      const generatedPath = await briefGenerator.generateAndSaveBrief(project);
      setBriefPath(generatedPath);
      setBriefExists(true);
      addNotification('success', 'Brief projet généré avec succès');
      // Open the file in Finder
      projectService.openInFinder(generatedPath);
    } catch (error) {
      console.error('Brief generation failed:', error);
      addNotification('error', 'Erreur lors de la génération du brief');
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleOpenBrief = () => {
    if (briefPath) {
      projectService.openInFinder(briefPath);
    }
  };

  const handleSaveSettings = async () => {
    if (credentialsLoading) {
      addNotification('warning', 'Chargement des credentials en cours...');
      return;
    }
    setSaving(true);

    try {
      const hasSftp = sftpForm.host && sftpForm.username;

      const updated: Project = {
        ...project,
        urls: {
          ...project.urls,
          currentSite: currentSiteUrl || undefined,
          testUrl: testUrl || undefined,
          production: currentSiteUrl || undefined,
        },
        sftp: hasSftp
          ? {
              configured: true,
              host: sftpForm.host!,
              username: sftpForm.username!,
              port: sftpForm.port || 21,
              remotePath: sftpForm.remotePath || '/public_html',
              passive: sftpForm.passive ?? true,
              protocol: sftpForm.protocol || 'ftp',
              acceptInvalidCerts: sftpForm.acceptInvalidCerts ?? false,
              lastSync: project.sftp.lastSync,
            }
          : { configured: false },
        localPath: localPath || 'www',
        referenceWebsites: referenceWebsites,
        updated: new Date().toISOString(),
      };

      // Save to file
      console.log('[ProjectDetail] Saving project config...');
      await projectService.saveProject(updated);
      console.log('[ProjectDetail] Project config saved');

      // Save password to keychain if requested
      let passwordSaved = false;
      console.log('[ProjectDetail] Password save check:', {
        savePassword,
        hasPassword: !!sftpForm.password,
        passwordLength: sftpForm.password?.length,
        hasSftp,
        projectId: project.id,
      });

      if (savePassword && sftpForm.password && hasSftp) {
        try {
          console.log('[ProjectDetail] Saving password to keychain for:', project.id);
          await sftpService.saveCredentials(project.id, sftpForm.password);
          passwordSaved = true;
          console.log('[ProjectDetail] Password saved successfully');
        } catch (keychainError) {
          console.error('Keychain save failed:', keychainError);
          addNotification('warning', 'Paramètres enregistrés, mais le mot de passe n\'a pas pu être sauvegardé dans le trousseau.');
          onUpdate(updated);
          setHasChanges(false);
          return;
        }
      } else {
        console.log('[ProjectDetail] Skipping password save - conditions not met');
      }

      // Update project with passwordAvailable flag for immediate UI update
      const hasPassword = passwordSaved || Boolean(hasSftp && sftpForm.password);
      const finalProject: Project = {
        ...updated,
        sftp: {
          ...updated.sftp,
          passwordAvailable: hasPassword,
        },
      };

      onUpdate(finalProject);
      setHasChanges(false);
      addNotification('success', 'Paramètres FTP enregistrés avec succès');
    } catch (error) {
      console.error('Save failed:', error);
      addNotification('error', `Erreur: ${error instanceof Error ? error.message : 'Échec de l\'enregistrement'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = () => {
    testConnection({
      host: sftpForm.host || '',
      port: sftpForm.port || 21,
      username: sftpForm.username || '',
      password: sftpForm.password || '',
      remotePath: sftpForm.remotePath || '/public_html',
      passive: sftpForm.passive,
      protocol: sftpForm.protocol || 'ftp',
      acceptInvalidCerts: sftpForm.acceptInvalidCerts,
    });
  };

  const handleSftpChange = (data: FTPFormData) => {
    setSftpForm(data);
    setHasChanges(true);
  };

  // Client profile handlers
  const handleGenerateProfile = async () => {
    if (!geminiApiKey || !currentSiteUrl || generatingProfile) return;

    setGeneratingProfile(true);
    try {
      // Fetch and extract texts from the client's website
      addNotification('info', 'Analyse du site en cours...');
      const extractedTexts = await scrapingService.fetchAndExtractTexts(currentSiteUrl);

      const result = await geminiService.generateClientProfile(
        project.name,
        project.client,
        currentSiteUrl,
        extractedTexts.allTexts,
        project.colors,
        project.fonts,
        geminiApiKey,
        geminiModel
      );

      setClientDescription(result.description);
      setThemeTags(result.themeTags);

      // Save to project
      const updated: Project = {
        ...project,
        clientDescription: result.description,
        themeTags: result.themeTags,
        themeTagsGeneratedAt: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
      await projectService.saveProject(updated);
      onUpdate(updated);
      addNotification('success', 'Profil client généré avec succès');
    } catch (error) {
      console.error('Profile generation failed:', error);
      addNotification('error', 'Erreur lors de la génération du profil');
    } finally {
      setGeneratingProfile(false);
    }
  };

  const handleSaveDescription = async () => {
    setEditingDescription(false);
    setHasChanges(true);

    const updated: Project = {
      ...project,
      clientDescription,
      updated: new Date().toISOString(),
    };
    await projectService.saveProject(updated);
    onUpdate(updated);
  };

  const handleAddTag = async () => {
    if (!newTagValue.trim()) return;
    const newTags = [...themeTags, newTagValue.trim()];
    setThemeTags(newTags);
    setNewTagValue('');
    setShowAddTag(false);
    setHasChanges(true);

    const updated: Project = {
      ...project,
      themeTags: newTags,
      updated: new Date().toISOString(),
    };
    await projectService.saveProject(updated);
    onUpdate(updated);
  };

  const handleRemoveTag = async (index: number) => {
    const newTags = themeTags.filter((_, i) => i !== index);
    setThemeTags(newTags);
    setHasChanges(true);

    const updated: Project = {
      ...project,
      themeTags: newTags,
      updated: new Date().toISOString(),
    };
    await projectService.saveProject(updated);
    onUpdate(updated);
  };

  const handleAddReference = async () => {
    if (!newReferenceUrl.trim() || referenceWebsites.length >= 5) return;

    try {
      new URL(newReferenceUrl); // Validate URL
    } catch {
      addNotification('error', 'URL invalide');
      return;
    }

    const newRef: ReferenceWebsite = {
      url: newReferenceUrl.trim(),
      addedAt: new Date().toISOString(),
    };
    const newRefs = [...referenceWebsites, newRef];
    setReferenceWebsites(newRefs);
    setNewReferenceUrl('');
    setShowAddReference(false);
    setHasChanges(true);

    const updated: Project = {
      ...project,
      referenceWebsites: newRefs,
      updated: new Date().toISOString(),
    };
    await projectService.saveProject(updated);
    onUpdate(updated);
  };

  const handleRemoveReference = async (index: number) => {
    const newRefs = referenceWebsites.filter((_, i) => i !== index);
    setReferenceWebsites(newRefs);
    setHasChanges(true);

    const updated: Project = {
      ...project,
      referenceWebsites: newRefs,
      updated: new Date().toISOString(),
    };
    await projectService.saveProject(updated);
    onUpdate(updated);
  };

  const handleSaveCurrentSiteUrl = async () => {
    setEditingCurrentSiteUrl(false);

    // Validate URL if not empty
    if (currentSiteUrl) {
      try {
        new URL(currentSiteUrl);
      } catch {
        addNotification('error', 'URL invalide');
        return;
      }
    }

    const updated: Project = {
      ...project,
      urls: {
        ...project.urls,
        currentSite: currentSiteUrl || undefined,
        production: currentSiteUrl || undefined,
      },
      updated: new Date().toISOString(),
    };
    await projectService.saveProject(updated);
    onUpdate(updated);
    addNotification('success', 'URL du site enregistrée');
  };

  const handleSaveTestUrl = async () => {
    setEditingTestUrl(false);

    // Validate URL if not empty
    if (testUrl) {
      try {
        new URL(testUrl);
      } catch {
        addNotification('error', 'URL invalide');
        return;
      }
    }

    const updated: Project = {
      ...project,
      urls: {
        ...project.urls,
        testUrl: testUrl || undefined,
      },
      updated: new Date().toISOString(),
    };
    await projectService.saveProject(updated);
    onUpdate(updated);
    addNotification('success', 'URL de test enregistrée');
  };

  const handleStatusChange = async (newStatus: ProjectStatus) => {
    setShowStatusDropdown(false);
    const updated: Project = {
      ...project,
      status: newStatus,
      updated: new Date().toISOString(),
    };
    await projectService.saveProject(updated);
    onUpdate(updated);
    addNotification('success', `Statut changé en "${PROJECT_STATUS_CONFIG[newStatus].label}"`);
  };

  const statusConfig = PROJECT_STATUS_CONFIG[project.status];
  const canSync = project.sftp.configured || (sftpForm.host && sftpForm.username && sftpForm.password);

  const tabs = [
    { id: 'general', label: 'Général' },
    { id: 'ftp', label: 'FTP & Sync' },
    { id: 'files', label: 'Fichiers' },
    { id: 'scraping', label: 'Scraping' },
  ];

  return (
    <div>
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <div className="detail-title">
          <h1>{project.client || project.name}</h1>
          {project.client && <span className="subtitle">{project.name}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {currentSiteUrl && (
            <Button
              variant="ghost"
              onClick={() => projectService.openInBrowser(currentSiteUrl)}
              title="Ouvrir le site actuel"
            >
              <Globe size={16} />
              Site
            </Button>
          )}
          {testUrl && (
            <Button
              variant="ghost"
              onClick={() => {
                console.log('[ProjectDetail] Test URL button clicked, testUrl:', testUrl);
                projectService.openInBrowser(testUrl);
              }}
              title="Ouvrir l'URL de test"
              style={{ color: 'var(--success)' }}
            >
              <TestTube size={16} />
              Test
            </Button>
          )}
          {(currentSiteUrl || testUrl) && <div style={{ width: 1, height: 24, background: 'var(--border)' }} />}
          {canSync && onSync && (
            <Button
              variant="primary"
              onClick={handleSync}
              disabled={syncing || !syncAllowed.allowed}
              title={!syncAllowed.allowed ? syncAllowed.reason : undefined}
            >
              {syncing ? <Loader size={16} className="spinner" /> : <RefreshCw size={16} />}
              Synchroniser
            </Button>
          )}
          {syncState.lastConnectionFailed && (
            <Button
              variant="ghost"
              onClick={() => clearConnectionError(project.id)}
              title="Reinitialiser l'etat de connexion"
            >
              Reessayer
            </Button>
          )}
          {hasChanges && (
            <Button variant="secondary" onClick={handleSaveSettings} disabled={saving || credentialsLoading}>
              {saving ? <Loader size={16} className="spinner" /> : <Save size={16} />}
              {credentialsLoading ? 'Chargement...' : 'Enregistrer'}
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              onClick={() => setShowDeleteModal(true)}
              style={{ color: 'var(--error)' }}
            >
              <Trash2 size={16} />
            </Button>
          )}
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {/* Tab: Général */}
        {activeTab === 'general' && (
          <div className="detail-grid">
            <div className="detail-main">
              <Card title="Informations">
                <div className="card-info">
                  <div className="info-row">
                    <strong>Dossier:</strong>
                    <span>{project.path}</span>
                  </div>
                  {project.client && (
                    <div className="info-row">
                      <strong>Client:</strong>
                      <span>{project.client}</span>
                    </div>
                  )}
                  <div className="info-row">
                    <strong>Statut:</strong>
                    <div className="status-dropdown-container">
                      <button
                        className="status-badge status-badge-clickable"
                        style={{ background: `${statusConfig.color}20`, color: statusConfig.color }}
                        onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                      >
                        {statusConfig.label}
                        <ChevronDown size={12} />
                      </button>
                      {showStatusDropdown && (
                        <div className="status-dropdown-menu">
                          {(Object.entries(PROJECT_STATUS_CONFIG) as [ProjectStatus, { label: string; color: string }][]).map(
                            ([key, value]) => (
                              <button
                                key={key}
                                className={`status-dropdown-item ${key === project.status ? 'active' : ''}`}
                                onClick={() => handleStatusChange(key)}
                              >
                                <span
                                  className="status-dot"
                                  style={{ background: value.color }}
                                />
                                {value.label}
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="info-row">
                    <strong>Créé le:</strong>
                    <span>{new Date(project.created).toLocaleDateString('fr-FR')}</span>
                  </div>
                </div>
              </Card>

              {/* Client Profile Card */}
              <Card
                title="Profil client"
                action={
                  geminiApiKey && currentSiteUrl && (
                    <Button
                      variant="ghost"
                      onClick={handleGenerateProfile}
                      disabled={generatingProfile}
                      style={{ padding: '4px 8px', fontSize: 12 }}
                    >
                      {generatingProfile ? (
                        <Loader size={14} className="spinner" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      {clientDescription ? 'Régénérer' : 'Générer'}
                    </Button>
                  )
                }
              >
                {/* Description */}
                <div className="client-description">
                  {editingDescription ? (
                    <textarea
                      value={clientDescription}
                      onChange={(e) => setClientDescription(e.target.value)}
                      placeholder="Description de l'activité du client..."
                      rows={3}
                    />
                  ) : (
                    <p>
                      {clientDescription || (
                        <span className="profile-card-empty">
                          {!currentSiteUrl
                            ? "Ajoutez l'URL du site client pour générer le profil."
                            : !geminiApiKey
                            ? 'Configurez une clé API Gemini dans les paramètres.'
                            : 'Cliquez sur Générer pour analyser le site.'}
                        </span>
                      )}
                    </p>
                  )}
                  <button
                    onClick={() => {
                      if (editingDescription) {
                        handleSaveDescription();
                      } else {
                        setEditingDescription(true);
                      }
                    }}
                  >
                    {editingDescription ? <Check size={14} /> : <Edit3 size={14} />}
                  </button>
                </div>

                {/* Theme Tags */}
                <div className="theme-tags">
                  <span className="theme-label">Orientations design:</span>
                  <div className="chips-container">
                    {themeTags.map((tag, i) => (
                      <span key={i} className="chip">
                        {tag}
                        <button onClick={() => handleRemoveTag(i)}>
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    {!showAddTag ? (
                      <button className="chip chip-add" onClick={() => setShowAddTag(true)}>
                        <Plus size={12} /> Ajouter
                      </button>
                    ) : (
                      <div className="add-tag-inline">
                        <input
                          type="text"
                          value={newTagValue}
                          onChange={(e) => setNewTagValue(e.target.value)}
                          placeholder="Nouveau tag..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddTag();
                            if (e.key === 'Escape') {
                              setShowAddTag(false);
                              setNewTagValue('');
                            }
                          }}
                          autoFocus
                        />
                        <button onClick={handleAddTag}>OK</button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {project.notes && (
                <Card title="Notes">
                  <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                    {project.notes}
                  </p>
                </Card>
              )}
            </div>

            <div className="detail-sidebar">
              <Card title="Actions rapides">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Button
                    variant="secondary"
                    onClick={() => projectService.openInFinder(project.path)}
                    className="action-btn-yellow"
                  >
                    <Folder size={16} />
                    Ouvrir dans Finder
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowReorganizeModal(true)}
                    className="action-btn-blue"
                  >
                    <FolderSync size={16} />
                    Réorganiser les dossiers
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleGenerateBrief}
                    disabled={generatingBrief}
                    className="action-btn-green"
                  >
                    {generatingBrief ? <Loader size={16} className="spinner" /> : <FileText size={16} />}
                    {generatingBrief ? 'Génération...' : 'Générer le brief'}
                  </Button>
                  {briefExists && (
                    <Button
                      variant="secondary"
                      onClick={handleOpenBrief}
                      className="action-btn-green"
                    >
                      <BookOpen size={16} />
                      Ouvrir le brief
                    </Button>
                  )}
                  {currentSiteUrl && (
                    <Button
                      variant="secondary"
                      onClick={() => projectService.openInBrowser(currentSiteUrl)}
                      className="action-btn-blue"
                    >
                      <Globe size={16} />
                      Site actuel
                    </Button>
                  )}
                  {testUrl && (
                    <Button
                      variant="secondary"
                      onClick={() => projectService.openInBrowser(testUrl)}
                      className="action-btn-green"
                    >
                      <TestTube size={16} />
                      URL de test
                    </Button>
                  )}
                </div>
              </Card>

              {/* Unified URLs Block */}
              <Card title="URLs du projet">
                <div className="urls-block">
                  {/* Site actuel - éditable */}
                  <div className="url-item">
                    <span className="url-label">Site actuel</span>
                    {editingCurrentSiteUrl ? (
                      <div className="add-tag-inline" style={{ flex: 1 }}>
                        <input
                          type="url"
                          value={currentSiteUrl}
                          onChange={(e) => setCurrentSiteUrl(e.target.value)}
                          placeholder="https://www.example.com"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCurrentSiteUrl();
                            if (e.key === 'Escape') setEditingCurrentSiteUrl(false);
                          }}
                          autoFocus
                        />
                        <button onClick={handleSaveCurrentSiteUrl}>OK</button>
                      </div>
                    ) : currentSiteUrl ? (
                      <>
                        <button
                          className="url-link"
                          onClick={() => projectService.openInBrowser(currentSiteUrl)}
                        >
                          <Globe size={14} />
                          {(() => {
                            try {
                              return new URL(currentSiteUrl).hostname;
                            } catch {
                              return currentSiteUrl;
                            }
                          })()}
                          <ExternalLinkIcon size={12} />
                        </button>
                        <button
                          className="url-remove"
                          onClick={() => setEditingCurrentSiteUrl(true)}
                          title="Modifier"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <Edit3 size={12} />
                        </button>
                      </>
                    ) : (
                      <button
                        className="chip chip-add"
                        onClick={() => setEditingCurrentSiteUrl(true)}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        <Plus size={12} /> Ajouter URL
                      </button>
                    )}
                  </div>

                  {/* URL de test - éditable */}
                  <div className="url-item">
                    <span className="url-label">Preview</span>
                    {editingTestUrl ? (
                      <div className="add-tag-inline" style={{ flex: 1 }}>
                        <input
                          type="url"
                          value={testUrl}
                          onChange={(e) => setTestUrl(e.target.value)}
                          placeholder="https://test.example.com"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveTestUrl();
                            if (e.key === 'Escape') setEditingTestUrl(false);
                          }}
                          autoFocus
                        />
                        <button onClick={handleSaveTestUrl}>OK</button>
                      </div>
                    ) : testUrl ? (
                      <>
                        <button
                          className="url-link url-link-preview"
                          onClick={() => projectService.openInBrowser(testUrl)}
                        >
                          <TestTube size={14} />
                          {(() => {
                            try {
                              return new URL(testUrl).hostname;
                            } catch {
                              return testUrl;
                            }
                          })()}
                          <ExternalLinkIcon size={12} />
                        </button>
                        <button
                          className="url-remove"
                          onClick={() => setEditingTestUrl(true)}
                          title="Modifier"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <Edit3 size={12} />
                        </button>
                      </>
                    ) : (
                      <button
                        className="chip chip-add"
                        onClick={() => setEditingTestUrl(true)}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        <Plus size={12} /> Ajouter URL
                      </button>
                    )}
                  </div>

                  <div className="url-divider" />

                  {/* Inspirations graphiques */}
                  <div className="url-section-header">
                    <span>Inspirations ({referenceWebsites.length}/5)</span>
                    {referenceWebsites.length < 5 && (
                      <button onClick={() => setShowAddReference(true)}>
                        <Plus size={14} />
                      </button>
                    )}
                  </div>

                  {referenceWebsites.map((ref, i) => (
                    <div key={i} className="url-item">
                      <button
                        className="url-link"
                        onClick={() => projectService.openInBrowser(ref.url)}
                        style={{ flex: 1 }}
                      >
                        <Sparkles size={14} />
                        {ref.name ||
                          (() => {
                            try {
                              return new URL(ref.url).hostname;
                            } catch {
                              return ref.url;
                            }
                          })()}
                        <ExternalLinkIcon size={12} />
                      </button>
                      <button className="url-remove" onClick={() => handleRemoveReference(i)}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}

                  {referenceWebsites.length === 0 && !showAddReference && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: 12, fontStyle: 'italic' }}>
                      Aucune inspiration ajoutée
                    </p>
                  )}

                  {/* Add reference form */}
                  {showAddReference && (
                    <div className="add-tag-inline" style={{ marginTop: 8 }}>
                      <input
                        type="url"
                        value={newReferenceUrl}
                        onChange={(e) => setNewReferenceUrl(e.target.value)}
                        placeholder="https://..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddReference();
                          if (e.key === 'Escape') {
                            setShowAddReference(false);
                            setNewReferenceUrl('');
                          }
                        }}
                        autoFocus
                      />
                      <button onClick={handleAddReference}>OK</button>
                    </div>
                  )}
                </div>
              </Card>

              {/* Design Analysis Card */}
              <Card title="Analyse du design">
                {currentSiteUrl && geminiApiKey ? (
                  <Button
                    variant="secondary"
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      marginBottom:
                        project.colors.length > 0 || project.fonts.length > 0 ? 16 : 0,
                    }}
                  >
                    {analyzing ? <Loader size={16} className="spinner" /> : <Sparkles size={16} />}
                    {analyzing ? 'Analyse en cours...' : 'Analyser le site'}
                  </Button>
                ) : (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    {!geminiApiKey
                      ? 'Configurez une clé API Gemini dans les paramètres.'
                      : 'Aucune URL de site configurée.'}
                  </p>
                )}

                {project.colors.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Palette size={14} style={{ color: 'var(--text-secondary)' }} />
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                          }}
                        >
                          Couleurs ({project.colors.length})
                        </span>
                      </div>
                      {project.colors.length > 5 && (
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            // Merge similar colors using color distance
                            const merged = mergeSimilarColors(project.colors, 30);
                            const updated: Project = {
                              ...project,
                              colors: merged,
                              updated: new Date().toISOString(),
                            };
                            await projectService.saveProject(updated);
                            onUpdate(updated);
                            addNotification('success', `Couleurs fusionnees: ${project.colors.length} → ${merged.length}`);
                          }}
                          style={{ padding: '2px 6px', fontSize: 11 }}
                        >
                          <Sparkles size={12} />
                          Fusionner similaires
                        </Button>
                      )}
                    </div>
                    <div className="color-swatches">
                      {project.colors.map((color, i) => (
                        <div
                          key={i}
                          className="color-swatch"
                          style={{ background: color }}
                          title={color}
                          onClick={() => navigator.clipboard.writeText(color)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {project.fonts.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          textTransform: 'uppercase',
                        }}
                      >
                        Polices
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {project.fonts.map((font, i) => (
                        <span
                          key={i}
                          style={{
                            padding: '4px 8px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                        >
                          {font}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* Tab: FTP & Sync */}
        {activeTab === 'ftp' && (
          <>
            <FTPSection
              sftp={sftpForm}
              localPath={localPath}
              testUrl={testUrl}
              savePassword={savePassword}
              geminiApiKey={geminiApiKey}
              geminiModel={geminiModel}
              testing={testing}
              testResult={testResult}
              remoteFolders={remoteFolders}
              loadingFolders={loadingFolders}
              connectionStage={connectionStage}
              elapsedSeconds={elapsedSeconds}
              onSftpChange={handleSftpChange}
              onLocalPathChange={(path) => {
                setLocalPath(path);
                setHasChanges(true);
              }}
              onTestUrlChange={(url) => {
                setTestUrl(url);
                setHasChanges(true);
              }}
              onSavePasswordChange={setSavePassword}
              onTestConnection={handleTestConnection}
              onResetTestResult={resetTestResult}
              onCancelConnection={cancelConnection}
            />

            {/* Sync Progress - visible when syncing or after sync */}
            {(syncState.stage !== 'idle') && (
              <SyncProgress
                stage={syncState.stage}
                progress={syncState.progress}
                currentFile={syncState.currentFile}
                filesTotal={syncState.filesTotal}
                filesCompleted={syncState.filesCompleted}
                files={syncState.files}
                error={syncState.error}
                retry={syncState.retry}
                onCancel={() => cancelSync(project.id)}
                onRetry={handleSync}
                onClose={handleCloseSyncProgress}
                onOpenLogs={() => setShowLogWindow(true)}
              />
            )}

            {/* FTP Log Window Modal */}
            <FTPLogWindow
              isOpen={showLogWindow}
              onClose={() => setShowLogWindow(false)}
              stage={syncState.stage}
              progress={syncState.progress}
              currentFile={syncState.currentFile}
              filesTotal={syncState.filesTotal}
              filesCompleted={syncState.filesCompleted}
              files={syncState.files}
              logs={syncState.logs}
              failedFiles={syncState.failedFiles}
              error={syncState.error}
              startTime={syncState.startTime}
              onCancel={() => cancelSync(project.id)}
              onRetry={handleSync}
              onRetryFile={(filePath) => retryFailedFile(project.id, filePath)}
              onClearLogs={() => clearLogs(project.id)}
            />

            {/* Advanced FTP Features */}
            <Card title="Outils avances" className="mt-4">
              <div className="advanced-ftp-tools">
                <button
                  className="advanced-tool-btn"
                  onClick={() => setShowVersionHistory(true)}
                >
                  <History size={18} />
                  <div className="tool-info">
                    <span className="tool-name">Historique des versions</span>
                    <span className="tool-desc">Snapshots et restauration</span>
                  </div>
                </button>
                <button
                  className="advanced-tool-btn"
                  onClick={() => setShowScheduler(true)}
                >
                  <Calendar size={18} />
                  <div className="tool-info">
                    <span className="tool-name">Planification</span>
                    <span className="tool-desc">Sync automatique</span>
                  </div>
                </button>
              </div>
            </Card>

            {/* Version History Modal */}
            {showVersionHistory && (
              <Modal
                title="Historique des versions"
                onClose={() => setShowVersionHistory(false)}
                className="modal-large"
              >
                <VersionHistory
                  projectId={project.id}
                  localPath={`${project.path}/${localPath}`}
                  onClose={() => setShowVersionHistory(false)}
                />
              </Modal>
            )}

            {/* Sync Scheduler Modal */}
            {showScheduler && (
              <Modal
                title="Planification de synchronisation"
                onClose={() => setShowScheduler(false)}
              >
                <SyncScheduler
                  projectId={project.id}
                  projectName={project.client || project.name}
                  onClose={() => setShowScheduler(false)}
                />
              </Modal>
            )}
          </>
        )}

        {/* Tab: Fichiers */}
        {activeTab === 'files' && (
          <Card
            title="Arborescence du projet"
            action={
              <Button
                variant="ghost"
                onClick={() => projectService.openInFinder(project.path)}
                style={{ padding: '4px 8px', fontSize: 12 }}
              >
                <Folder size={14} />
                Ouvrir dans Finder
              </Button>
            }
          >
            <ProjectFileTree
              projectPath={project.path}
              lockedFolders={['_Inbox']}
              onFileSelect={(path) => projectService.openInFinder(path)}
            />
          </Card>
        )}

        {/* Tab: Scraping */}
        {activeTab === 'scraping' && (
          <ScrapingPage
            project={project}
            projectPath={project.path}
            geminiApiKey={geminiApiKey}
            geminiModel={geminiModel}
            embedded={true}
            onComplete={(_result, updatedProject) => {
              // Le projet mis à jour est retourné avec les stats de scraping
              onUpdate(updatedProject);
            }}
          />
        )}
      </Tabs>

      {showDeleteModal && (
        <Modal title="Supprimer le projet" onClose={() => setShowDeleteModal(false)}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <AlertTriangle size={48} style={{ color: 'var(--error)', marginBottom: 16 }} />
            <p style={{ marginBottom: 8 }}>
              Êtes-vous sûr de vouloir supprimer le projet{' '}
              <strong>{project.client || project.name}</strong> ?
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Cette action supprimera définitivement le dossier et tous ses fichiers.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleDelete}
              disabled={deleting}
              style={{ background: 'var(--error)' }}
            >
              {deleting ? <Loader size={16} className="spinner" /> : <Trash2 size={16} />}
              Supprimer
            </Button>
          </div>
        </Modal>
      )}

      {showReorganizeModal && (
        <ReorganizeProjectModal
          project={project}
          onClose={() => setShowReorganizeModal(false)}
          onComplete={() => {
            setShowReorganizeModal(false);
            onUpdate(project);
          }}
        />
      )}
    </div>
  );
}
