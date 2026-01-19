import { useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ProjectList } from './components/ProjectList';
import { ProjectDetail } from './components/ProjectDetail';
import { Settings } from './components/Settings';
import { CreateProject } from './components/CreateProject';
import { Notifications } from './components/Notifications';
import { AboutModal } from './components/AboutModal';
import { ProjectFormData } from './components/ProjectForm';
import { useProjectStore, useSettingsStore, useUIStore } from './stores';
import { useMenuEvents, useFileWatcher, useSystemTray } from './hooks';
import { syncService } from './services/syncService';
import { projectService } from './services/projectService';
import { scrapingService } from './services/scrapingService';
import { geminiService } from './services/geminiService';
import { configStore } from './services/configStore';
import { Project } from './types';
import { checkUpdate, installUpdate } from '@tauri-apps/api/updater';
import { relaunch } from '@tauri-apps/api/process';
import { ask } from '@tauri-apps/api/dialog';
import './styles/globals.css';

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-spinner" />
        <p>Chargement de La Forge...</p>
      </div>
    </div>
  );
}

export function App() {
  // Stores
  const {
    projects,
    loading,
    selectedProjectId,
    fetchProjects,
    selectProject,
    createProject,
    deleteProject,
  } = useProjectStore();

  const {
    workspacePath,
    geminiApiKey,
    geminiModel,
    folderStructure,
    updateSettings,
    markSaved,
    isHydrated,
    loadSettings,
  } = useSettingsStore();

  const {
    activeModal,
    openModal,
    closeModal,
    addNotification,
  } = useUIStore();

  // Load settings from Tauri store on mount and run migrations
  useEffect(() => {
    loadSettings();

    // Run credential migration (legacy XOR -> AES-256)
    configStore.migrateCredentials().then((result) => {
      if (result.migrated > 0) {
        console.log(`[App] Migrated ${result.migrated} credentials to AES-256`);
      }
    });
  }, [loadSettings]);

  // Fetch projects on mount and when workspace changes
  useEffect(() => {
    if (isHydrated && workspacePath) {
      fetchProjects(workspacePath);
    }
  }, [isHydrated, workspacePath, fetchProjects]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Check if Cmd key is pressed (metaKey on Mac)
    if (e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          openModal('createProject');
          break;
        case ',':
          e.preventDefault();
          openModal('settings');
          break;
        case 'r':
          e.preventDefault();
          if (workspacePath) {
            fetchProjects(workspacePath);
          }
          break;
      }
    }
  }, [openModal, fetchProjects, workspacePath]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Get selected project from store
  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  // Activate file watcher based on settings
  useFileWatcher();

  // System tray integration - show recent projects with Finder/Sync options
  const { updateRecentProjects, onOpenFinder, onSyncProject } = useSystemTray();

  // Update tray menu when projects change
  useEffect(() => {
    updateRecentProjects(projects);
  }, [projects, updateRecentProjects]);

  // Handle open finder from tray menu
  useEffect(() => {
    onOpenFinder((projectId) => {
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        projectService.openInFinder(project.path);
      }
    });
  }, [projects, onOpenFinder]);

  // Handle sync from tray menu
  useEffect(() => {
    onSyncProject((projectId) => {
      const project = projects.find((p) => p.id === projectId);
      if (project && project.sftp?.configured) {
        handleSync(project);
      }
    });
  }, [projects, onSyncProject]);

  // Handle native macOS menu events
  useMenuEvents({
    onAbout: useCallback(() => {
      openModal('about');
    }, [openModal]),
    onCheckUpdates: useCallback(async () => {
      try {
        addNotification('info', 'Vérification des mises à jour...');
        const { shouldUpdate, manifest } = await checkUpdate();
        if (shouldUpdate && manifest) {
          const confirmed = await ask(
            `Version ${manifest.version} disponible. Installer maintenant ?`,
            { title: 'Mise à jour disponible', type: 'info' }
          );
          if (confirmed) {
            addNotification('info', 'Installation de la mise à jour...');
            await installUpdate();
            await relaunch();
          }
        } else {
          addNotification('success', 'Vous avez la dernière version.');
        }
      } catch (e) {
        console.error('Update check failed:', e);
        addNotification('error', 'Impossible de vérifier les mises à jour.');
      }
    }, [addNotification]),
    onPreferences: useCallback(() => {
      openModal('settings');
    }, [openModal]),
    onNewProject: useCallback(() => {
      openModal('createProject');
    }, [openModal]),
    onRefresh: useCallback(() => {
      if (workspacePath) {
        fetchProjects(workspacePath);
        addNotification('info', 'Liste des projets actualisée');
      }
    }, [workspacePath, fetchProjects, addNotification]),
    onOpenFinder: useCallback(() => {
      if (selectedProject) {
        projectService.openInFinder(selectedProject.path);
      }
    }, [selectedProject]),
    onOpenBrowser: useCallback(() => {
      if (selectedProject?.urls.currentSite) {
        projectService.openInBrowser(selectedProject.urls.currentSite);
      } else if (selectedProject?.urls.production) {
        projectService.openInBrowser(selectedProject.urls.production);
      }
    }, [selectedProject]),
    onSync: useCallback(() => {
      if (selectedProject && selectedProject.sftp.configured) {
        handleSync(selectedProject);
      }
    }, [selectedProject]),
    onScrape: useCallback(() => {
      // Navigate to scraping tab if a project is selected
      if (selectedProject) {
        addNotification('info', 'Accédez à l\'onglet Scraping du projet pour lancer le scraping');
      }
    }, [selectedProject, addNotification]),
  });

  const handleCreateProject = async (data: ProjectFormData) => {
    try {
      const project = await createProject(data, workspacePath, folderStructure);
      selectProject(project.id);
      closeModal();
      addNotification('success', `Projet "${project.name}" créé avec succès`);

      // Auto-generate client profile if URL provided and Gemini API key available
      if (data.currentSiteUrl && geminiApiKey) {
        // Run in background without blocking
        (async () => {
          try {
            addNotification('info', 'Génération du profil client en cours...');

            // Fetch and extract texts from the client's website
            const extractedTexts = await scrapingService.fetchAndExtractTexts(data.currentSiteUrl!);

            const result = await geminiService.generateClientProfile(
              project.name,
              project.client,
              data.currentSiteUrl!,
              extractedTexts.allTexts,
              [],
              [],
              geminiApiKey,
              geminiModel
            );

            // Save to project
            const updatedProject: Project = {
              ...project,
              clientDescription: result.description,
              themeTags: result.themeTags,
              themeTagsGeneratedAt: new Date().toISOString(),
              updated: new Date().toISOString(),
            };
            await projectService.saveProject(updatedProject);

            // Refresh projects list to show updated data
            await fetchProjects(workspacePath);
            addNotification('success', 'Profil client généré automatiquement');
          } catch (profileError) {
            console.error('Auto profile generation failed:', profileError);
            // Silent fail - user can generate manually later
          }
        })();
      }
    } catch (error) {
      addNotification('error', error instanceof Error ? error.message : 'Erreur lors de la création');
    }
  };

  const handleSync = async (project: Project): Promise<void> => {
    try {
      const result = await syncService.sync(project);
      if (result.success) {
        await fetchProjects(workspacePath);
        addNotification(
          'success',
          `Synchronisation terminée: ${result.filesUploaded} fichiers envoyés`
        );
      } else {
        addNotification('error', `Échec de la synchronisation: ${result.errors?.join(', ')}`);
      }
    } catch (error) {
      addNotification('error', error instanceof Error ? error.message : 'Erreur de synchronisation');
    }
  };

  const handleSaveSettings = () => {
    markSaved();
    closeModal();
    addNotification('success', 'Paramètres enregistrés');
  };

  const handleDelete = async (project: Project): Promise<void> => {
    try {
      await deleteProject(project.id);
      addNotification('success', `Projet "${project.name}" supprimé`);
    } catch (error) {
      addNotification('error', error instanceof Error ? error.message : 'Erreur lors de la suppression');
      throw error;
    }
  };

  // Show loading screen until settings are hydrated
  if (!isHydrated) {
    return <LoadingScreen />;
  }

  return (
    <div className="app">
      <Sidebar
        projects={projects.slice(0, 5)}
        selectedProjectId={selectedProjectId}
        onProjectSelect={(p) => selectProject(p.id)}
        onShowProjectList={() => selectProject(null)}
        onNewProject={() => openModal('createProject')}
        onRefresh={() => fetchProjects(workspacePath)}
        onSettings={() => openModal('settings')}
      />

      <div className="main-wrapper">
        <main className="main-content">
          {selectedProject ? (
            <ProjectDetail
              project={selectedProject}
              workspacePath={workspacePath}
              geminiApiKey={geminiApiKey}
              geminiModel={geminiModel}
              onBack={() => selectProject(null)}
              onUpdate={() => {
                fetchProjects(workspacePath);
              }}
              onSync={handleSync}
              onDelete={handleDelete}
            />
          ) : (
            <ProjectList
              projects={projects}
              loading={loading}
              onSelect={(p) => selectProject(p.id)}
              onNewProject={() => openModal('createProject')}
              onSync={handleSync}
            />
          )}
        </main>
      </div>

      {activeModal === 'settings' && (
        <Settings
          settings={{
            workspacePath,
            geminiApiKey,
            geminiModel,
            folderStructure,
          }}
          projects={projects}
          onUpdate={updateSettings}
          onSave={handleSaveSettings}
          onClose={closeModal}
          onProjectsRefresh={() => fetchProjects(workspacePath)}
          onNotification={addNotification}
        />
      )}

      {activeModal === 'createProject' && (
        <CreateProject
          workspacePath={workspacePath}
          onCreate={handleCreateProject}
          onClose={closeModal}
        />
      )}

      {activeModal === 'about' && (
        <AboutModal onClose={closeModal} />
      )}

      <Notifications />
    </div>
  );
}
