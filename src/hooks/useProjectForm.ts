/**
 * Hook for managing project form state
 * Extracts form logic from ProjectDetail component
 */

import { useState, useEffect, useCallback } from 'react';
import { Project, FTPProtocol, ReferenceWebsite, SFTPConfig } from '../types';
import { sftpService } from '../services/sftpService';
import { projectService } from '../services/projectService';
import { useNotification } from './useNotification';

export interface FTPFormData {
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

export interface ProjectFormState {
  // FTP Form
  sftpForm: FTPFormData;
  localPath: string;
  savePassword: boolean;

  // URLs
  testUrl: string;
  currentSiteUrl: string;

  // Client Profile
  clientDescription: string;
  themeTags: string[];
  referenceWebsites: ReferenceWebsite[];

  // UI State
  hasChanges: boolean;
  credentialsLoading: boolean;
}

export interface UseProjectFormResult extends ProjectFormState {
  // Setters
  setSftpForm: (form: FTPFormData) => void;
  updateSftpForm: (updates: Partial<FTPFormData>) => void;
  setLocalPath: (path: string) => void;
  setTestUrl: (url: string) => void;
  setCurrentSiteUrl: (url: string) => void;
  setClientDescription: (description: string) => void;
  setThemeTags: (tags: string[]) => void;
  addThemeTag: (tag: string) => void;
  removeThemeTag: (tag: string) => void;
  setReferenceWebsites: (websites: ReferenceWebsite[]) => void;
  addReferenceWebsite: (url: string, name?: string) => void;
  removeReferenceWebsite: (url: string) => void;
  setSavePassword: (save: boolean) => void;

  // Actions
  saveSettings: (project: Project) => Promise<Project | null>;
  resetForm: (project: Project) => void;
  getSftpConfig: () => SFTPConfig;

  // Status
  isFormValid: () => boolean;
  canSave: () => boolean;
}

/**
 * Hook for managing project detail form state
 *
 * @param project - Current project
 * @param onUpdate - Callback when project is updated
 */
export function useProjectForm(
  project: Project,
  onUpdate?: (project: Project) => void
): UseProjectFormResult {
  const { success, error, warning } = useNotification();

  // Form state
  const [sftpForm, setSftpFormState] = useState<FTPFormData>({
    configured: false,
    host: '',
    username: '',
    password: '',
    port: 21,
    remotePath: '/public_html',
    passive: true,
    protocol: 'ftp',
    acceptInvalidCerts: false,
  });

  const [localPath, setLocalPath] = useState('www');
  const [testUrl, setTestUrl] = useState('');
  const [currentSiteUrl, setCurrentSiteUrl] = useState('');
  const [clientDescription, setClientDescription] = useState('');
  const [themeTags, setThemeTags] = useState<string[]>([]);
  const [referenceWebsites, setReferenceWebsites] = useState<ReferenceWebsite[]>([]);
  const [savePassword, setSavePassword] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [credentialsLoading, setCredentialsLoading] = useState(false);

  // Initialize form from project
  useEffect(() => {
    resetForm(project);

    // Load password from keychain if FTP is configured
    if (project.sftp.configured) {
      setCredentialsLoading(true);
      sftpService
        .getCredentials(project.id)
        .then((password) => {
          if (password) {
            setSftpFormState((prev) => ({ ...prev, password }));
          }
        })
        .finally(() => setCredentialsLoading(false));
    }
  }, [project.id]);

  const resetForm = useCallback((proj: Project) => {
    setSftpFormState({
      configured: proj.sftp.configured || false,
      host: proj.sftp.host || '',
      username: proj.sftp.username || '',
      password: '',
      port: proj.sftp.port || 21,
      remotePath: proj.sftp.remotePath || '/public_html',
      passive: proj.sftp.passive ?? true,
      protocol: proj.sftp.protocol || 'ftp',
      acceptInvalidCerts: proj.sftp.acceptInvalidCerts ?? false,
    });
    setLocalPath(proj.localPath || 'www');
    setTestUrl(proj.urls.testUrl || '');
    setCurrentSiteUrl(proj.urls.currentSite || proj.urls.production || '');
    setClientDescription(proj.clientDescription || '');
    setThemeTags(proj.themeTags || []);
    setReferenceWebsites(proj.referenceWebsites || []);
    setHasChanges(false);
  }, []);

  const setSftpForm = useCallback((form: FTPFormData) => {
    setSftpFormState(form);
    setHasChanges(true);
  }, []);

  const updateSftpForm = useCallback((updates: Partial<FTPFormData>) => {
    setSftpFormState((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  }, []);

  // URL setters with change tracking
  const setTestUrlWithChange = useCallback((url: string) => {
    setTestUrl(url);
    setHasChanges(true);
  }, []);

  const setCurrentSiteUrlWithChange = useCallback((url: string) => {
    setCurrentSiteUrl(url);
    setHasChanges(true);
  }, []);

  const setClientDescriptionWithChange = useCallback((description: string) => {
    setClientDescription(description);
    setHasChanges(true);
  }, []);

  const setThemeTagsWithChange = useCallback((tags: string[]) => {
    setThemeTags(tags);
    setHasChanges(true);
  }, []);

  const addThemeTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !themeTags.includes(trimmed)) {
      setThemeTags((prev) => [...prev, trimmed]);
      setHasChanges(true);
    }
  }, [themeTags]);

  const removeThemeTag = useCallback((tag: string) => {
    setThemeTags((prev) => prev.filter((t) => t !== tag));
    setHasChanges(true);
  }, []);

  const setReferenceWebsitesWithChange = useCallback((websites: ReferenceWebsite[]) => {
    setReferenceWebsites(websites);
    setHasChanges(true);
  }, []);

  const addReferenceWebsite = useCallback(
    (url: string, name?: string) => {
      if (referenceWebsites.length >= 5) {
        warning('Maximum 5 sites de référence');
        return;
      }
      const trimmed = url.trim();
      if (!trimmed) return;

      const exists = referenceWebsites.some((w) => w.url === trimmed);
      if (exists) {
        warning('Ce site est déjà dans la liste');
        return;
      }

      setReferenceWebsites((prev) => [
        ...prev,
        {
          url: trimmed,
          name: name?.trim(),
          addedAt: new Date().toISOString(),
        },
      ]);
      setHasChanges(true);
    },
    [referenceWebsites, warning]
  );

  const removeReferenceWebsite = useCallback((url: string) => {
    setReferenceWebsites((prev) => prev.filter((w) => w.url !== url));
    setHasChanges(true);
  }, []);

  const setLocalPathWithChange = useCallback((path: string) => {
    setLocalPath(path);
    setHasChanges(true);
  }, []);

  const getSftpConfig = useCallback((): SFTPConfig => {
    return {
      host: sftpForm.host || '',
      port: sftpForm.port || 21,
      username: sftpForm.username || '',
      password: sftpForm.password || '',
      remotePath: sftpForm.remotePath || '/public_html',
      passive: sftpForm.passive,
      protocol: sftpForm.protocol || 'ftp',
      acceptInvalidCerts: sftpForm.acceptInvalidCerts,
    };
  }, [sftpForm]);

  const isFormValid = useCallback(() => {
    // Basic validation
    return true; // Add specific validation rules as needed
  }, []);

  const canSave = useCallback(() => {
    return hasChanges && !credentialsLoading && isFormValid();
  }, [hasChanges, credentialsLoading, isFormValid]);

  const saveSettings = useCallback(
    async (proj: Project): Promise<Project | null> => {
      if (credentialsLoading) {
        warning('Chargement des credentials en cours...');
        return null;
      }

      try {
        const hasSftp = sftpForm.host && sftpForm.username;

        const updated: Project = {
          ...proj,
          urls: {
            ...proj.urls,
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
                lastSync: proj.sftp.lastSync,
              }
            : { configured: false },
          localPath: localPath || 'www',
          referenceWebsites: referenceWebsites,
          clientDescription: clientDescription || undefined,
          themeTags: themeTags.length > 0 ? themeTags : undefined,
          updated: new Date().toISOString(),
        };

        // Save to file
        await projectService.saveProject(updated);

        // Save password to keychain if requested
        let passwordSaved = false;
        if (savePassword && sftpForm.password && hasSftp) {
          try {
            await sftpService.saveCredentials(proj.id, sftpForm.password);
            passwordSaved = true;
          } catch (keychainError) {
            console.error('Keychain save failed:', keychainError);
            warning(
              "Paramètres enregistrés, mais le mot de passe n'a pas pu être sauvegardé dans le trousseau."
            );
            setHasChanges(false);
            onUpdate?.(updated);
            return updated;
          }
        }

        // Update project with passwordAvailable flag
        const hasPassword = passwordSaved || Boolean(hasSftp && sftpForm.password);
        const finalProject: Project = {
          ...updated,
          sftp: {
            ...updated.sftp,
            passwordAvailable: hasPassword,
          },
        };

        setHasChanges(false);
        success('Paramètres enregistrés avec succès');
        onUpdate?.(finalProject);
        return finalProject;
      } catch (err) {
        console.error('Save failed:', err);
        error(
          `Erreur: ${err instanceof Error ? err.message : "Échec de l'enregistrement"}`
        );
        return null;
      }
    },
    [
      sftpForm,
      localPath,
      testUrl,
      currentSiteUrl,
      clientDescription,
      themeTags,
      referenceWebsites,
      savePassword,
      credentialsLoading,
      onUpdate,
      success,
      error,
      warning,
    ]
  );

  return {
    // State
    sftpForm,
    localPath,
    testUrl,
    currentSiteUrl,
    clientDescription,
    themeTags,
    referenceWebsites,
    savePassword,
    hasChanges,
    credentialsLoading,

    // Setters
    setSftpForm,
    updateSftpForm,
    setLocalPath: setLocalPathWithChange,
    setTestUrl: setTestUrlWithChange,
    setCurrentSiteUrl: setCurrentSiteUrlWithChange,
    setClientDescription: setClientDescriptionWithChange,
    setThemeTags: setThemeTagsWithChange,
    addThemeTag,
    removeThemeTag,
    setReferenceWebsites: setReferenceWebsitesWithChange,
    addReferenceWebsite,
    removeReferenceWebsite,
    setSavePassword,

    // Actions
    saveSettings,
    resetForm,
    getSftpConfig,

    // Status
    isFormValid,
    canSave,
  };
}
