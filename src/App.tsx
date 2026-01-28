import { useEffect, useCallback, useState } from 'react';
import { MiniSidebar } from './components/MiniSidebar';
import { ProjectList } from './components/ProjectList';
import { ProjectDetail } from './components/ProjectDetail';
import { SettingsPage } from './components/SettingsPage';
import { CreateProject } from './components/CreateProject';
import { ImportProjectModal } from './components/ImportProjectModal';
import { Notifications } from './components/Notifications';
import { AboutModal } from './components/AboutModal';
import { ProjectFormData } from './components/ProjectForm';
import { useProjectStore, useSettingsStore, useUIStore, useScheduleStore, useTimeStore } from './stores';
import { useMenuEvents, useFileWatcher, useSystemTray } from './hooks';
import { syncService } from './services/syncService';
import { projectService } from './services/projectService';
import { scrapingService } from './services/scrapingService';
import { geminiService } from './services/geminiService';
import { configStore } from './services/configStore';
import { migrationService } from './services/migrationService';
import { Project } from './types';
// TODO: Réactiver quand les mises à jour seront configurées
// import { checkUpdate, installUpdate } from '@tauri-apps/api/updater';
// import { relaunch } from '@tauri-apps/api/process';
// import { ask } from '@tauri-apps/api/dialog';
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

type AppView = 'projects' | 'settings';

export function App() {
  // Current view state
  const [currentView, setCurrentView] = useState<AppView>('projects');

  // Stores
  const {
    projects,
    projectErrors,
    loading,
    selectedProjectId,
    fetchProjects,
    selectProject,
    createProject,
    importProject,
    deleteProject,
    updateProjectLocally,
  } = useProjectStore();

  const {
    workspacePath,
    registeredProjects,
    geminiApiKey,
    geminiModel,
    folderStructure,
    autoOrganize,
    showMenuBarIcon,
    viewMode = 'grid',
    updateSettings,
    setViewMode,
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

  const { startScheduler, loadSchedules } = useScheduleStore();

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

  // Run data migrations and fetch projects on startup
  useEffect(() => {
    if (isHydrated) {
      // Run migrations (v1 -> v2: project registry)
      migrationService.runMigrations().then((result) => {
        if (result.migrationsRun > 0) {
          console.log(`[App] Ran ${result.migrationsRun} migration(s)`);
          // Reload settings after migration to get updated registeredProjects
          loadSettings();
        }
      }).catch((err) => {
        console.error('[App] Migration failed:', err);
      });
    }
  }, [isHydrated, loadSettings]);

  // Fetch projects whenever registeredProjects changes (after migration or after settings load)
  // Using JSON.stringify to avoid re-renders on array reference changes
  const registeredProjectsKey = JSON.stringify(registeredProjects || []);
  useEffect(() => {
    if (isHydrated) {
      fetchProjects();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, registeredProjectsKey]);

  // Initialize scheduler on mount
  useEffect(() => {
    loadSchedules().then(() => {
      startScheduler();
      console.log('[App] Sync scheduler initialized');
    }).catch(err => {
      console.error('[App] Failed to initialize scheduler:', err);
    });
  }, [loadSchedules, startScheduler]);

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
          setCurrentView('settings');
          break;
        case 'r':
          e.preventDefault();
          fetchProjects();
          break;
      }
    }
  }, [openModal, fetchProjects]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Get selected project from store
  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  // Activate file watcher based on settings
  useFileWatcher();

  // System tray integration - show recent projects with Finder/Sync/Timer options
  const {
    updateRecentProjects,
    onOpenFinder,
    onSyncProject,
    onTimerStart,
    onTimerPause,
    onTimerResume,
    onTimerStop,
  } = useSystemTray();

  // Timer store for tray integration
  const {
    activeSessions,
    startSession,
    stopSession,
    pauseSession,
    resumeSession,
  } = useTimeStore();

  // Update tray menu when projects or timer states change
  useEffect(() => {
    const timerStates = projects.map((p) => {
      const session = activeSessions.find((s) => s.projectId === p.id);
      return {
        projectId: p.id,
        isActive: session !== undefined,
        isPaused: session?.isPaused ?? false,
      };
    });
    updateRecentProjects(projects, timerStates);
  }, [projects, activeSessions, updateRecentProjects]);

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
        // Navigate to the project view first
        setCurrentView('projects');
        selectProject(projectId);
        // Then start the sync
        handleSync(project);
      }
    });
  }, [projects, onSyncProject, selectProject]);

  // Handle timer controls from tray menu
  useEffect(() => {
    onTimerStart((projectId) => {
      startSession(projectId);
    });
  }, [onTimerStart, startSession]);

  useEffect(() => {
    onTimerPause((projectId) => {
      pauseSession(projectId);
    });
  }, [onTimerPause, pauseSession]);

  useEffect(() => {
    onTimerResume((projectId) => {
      resumeSession(projectId);
    });
  }, [onTimerResume, resumeSession]);

  useEffect(() => {
    onTimerStop((projectId) => {
      stopSession(projectId);
    });
  }, [onTimerStop, stopSession]);

  // Handle native macOS menu events
  useMenuEvents({
    onAbout: useCallback(() => {
      openModal('about');
    }, [openModal]),
    onCheckUpdates: useCallback(async () => {
      // TODO: Configurer les mises à jour automatiques avec signature Tauri
      // Voir docs/TODO.md pour les étapes de configuration
      addNotification('info', 'Mises à jour automatiques non configurées. Vérifiez GitHub pour les nouvelles versions.');
    }, [addNotification]),
    onPreferences: useCallback(() => {
      setCurrentView('settings');
    }, []),
    onNewProject: useCallback(() => {
      openModal('createProject');
    }, [openModal]),
    onRefresh: useCallback(() => {
      if (workspacePath) {
        fetchProjects();
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
            await fetchProjects();
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

  const handleImportProject = async (folderPath: string, data: ProjectFormData, createMissingFolders: boolean) => {
    try {
      const project = await importProject(folderPath, data, createMissingFolders);
      selectProject(project.id);
      closeModal();
      addNotification('success', `Projet "${project.name}" importé avec succès`);

      // Auto-generate client profile if URL provided and Gemini API key available
      if (data.currentSiteUrl && geminiApiKey) {
        (async () => {
          try {
            addNotification('info', 'Génération du profil client en cours...');

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

            const updatedProject: Project = {
              ...project,
              clientDescription: result.description,
              themeTags: result.themeTags,
              themeTagsGeneratedAt: new Date().toISOString(),
              updated: new Date().toISOString(),
            };
            await projectService.saveProject(updatedProject);

            await fetchProjects();
            addNotification('success', 'Profil client généré automatiquement');
          } catch (profileError) {
            console.error('Auto profile generation failed:', profileError);
          }
        })();
      }
    } catch (error) {
      addNotification('error', error instanceof Error ? error.message : 'Erreur lors de l\'import');
    }
  };

  const handleSync = async (project: Project): Promise<void> => {
    try {
      const result = await syncService.sync(project);
      if (result.success) {
        await fetchProjects();
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
    addNotification('success', 'Parametres enregistres');
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
      <MiniSidebar
        onHome={() => { selectProject(null); setCurrentView('projects'); }}
        onNewProject={() => openModal('createProject')}
        onSettings={() => setCurrentView('settings')}
        onRefresh={() => fetchProjects()}
        isHome={!selectedProjectId && currentView === 'projects'}
      />

      <div className="main-wrapper">
        <main className="main-content">
          {currentView === 'settings' ? (
            <SettingsPage
              settings={{
                workspacePath,
                geminiApiKey,
                geminiModel,
                folderStructure,
                autoOrganize,
                showMenuBarIcon,
              }}
              projects={projects}
              onUpdate={updateSettings}
              onSave={handleSaveSettings}
              onBack={() => setCurrentView('projects')}
              onProjectsRefresh={() => fetchProjects()}
              onNotification={addNotification}
            />
          ) : selectedProject ? (
            <ProjectDetail
              project={selectedProject}
              workspacePath={workspacePath}
              geminiApiKey={geminiApiKey}
              geminiModel={geminiModel}
              onBack={() => selectProject(null)}
              onUpdate={(updatedProject: Project) => {
                // Optimistic local update - no full reload needed
                updateProjectLocally(updatedProject);
              }}
              onSync={handleSync}
              onDelete={handleDelete}
            />
          ) : (
            <ProjectList
              projects={projects}
              projectErrors={projectErrors}
              loading={loading}
              onSelect={(p) => selectProject(p.id)}
              onNewProject={() => openModal('createProject')}
              onImportProject={() => openModal('importProject')}
              onSync={handleSync}
              onRefresh={fetchProjects}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          )}
        </main>
      </div>

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

      {activeModal === 'importProject' && (
        <ImportProjectModal
          onImport={handleImportProject}
          onClose={closeModal}
        />
      )}

      <Notifications />
    </div>
  );
}
