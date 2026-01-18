import { useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ProjectList } from './components/ProjectList';
import { ProjectDetail } from './components/ProjectDetail';
import { Settings } from './components/Settings';
import { CreateProject } from './components/CreateProject';
import { Notifications } from './components/Notifications';
import { ProjectFormData } from './components/ProjectForm';
import { useProjectStore, useSettingsStore, useUIStore } from './stores';
import { syncService } from './services/syncService';
import { projectService } from './services/projectService';
import { scrapingService } from './services/scrapingService';
import { geminiService } from './services/geminiService';
import { Project } from './types';
import './styles/globals.css';

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
  } = useSettingsStore();

  const {
    activeModal,
    openModal,
    closeModal,
    addNotification,
  } = useUIStore();

  // Fetch projects on mount and when workspace changes
  useEffect(() => {
    if (workspacePath) {
      fetchProjects(workspacePath);
    }
  }, [workspacePath, fetchProjects]);

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
          onUpdate={updateSettings}
          onSave={handleSaveSettings}
          onClose={closeModal}
        />
      )}

      {activeModal === 'createProject' && (
        <CreateProject
          workspacePath={workspacePath}
          onCreate={handleCreateProject}
          onClose={closeModal}
        />
      )}

      <Notifications />
    </div>
  );
}
