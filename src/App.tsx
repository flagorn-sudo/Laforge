import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ProjectList } from './components/ProjectList';
import { ProjectDetail } from './components/ProjectDetail';
import { Settings } from './components/Settings';
import { CreateProject } from './components/CreateProject';
import { useProjects } from './hooks/useProjects';
import { useSettings } from './hooks/useSettings';
import { Project } from './types';
import { syncService } from './services/syncService';
import './styles/globals.css';

export function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { settings, updateSettings, saveSettings } = useSettings();
  const { projects, loading, refresh, createProject } = useProjects(
    settings.workspacePath,
    settings.folderStructure
  );

  const handleCreateProject = async (data: Parameters<typeof createProject>[0]) => {
    const project = await createProject(data);
    setSelectedProject(project);
    setShowCreateModal(false);
  };

  const handleSync = async (project: Project): Promise<void> => {
    const result = await syncService.sync(project);
    if (result.success) {
      // Refresh project list to update lastSync timestamp
      await refresh();
      console.log(`Sync completed: ${result.filesUploaded} uploaded, ${result.filesDeleted} deleted`);
    } else {
      console.error('Sync failed:', result.errors);
      // TODO: Show error toast/notification
    }
  };

  const getTitle = () => {
    if (selectedProject) return selectedProject.client || selectedProject.name;
    return 'Projets';
  };

  return (
    <div className="app">
      <Sidebar
        projects={projects.slice(0, 5)}
        onProjectSelect={setSelectedProject}
        onNewProject={() => setShowCreateModal(true)}
        onRefresh={refresh}
      />

      <div className="main-wrapper">
        <Header
          title={getTitle()}
          onSettingsClick={() => setShowSettings(true)}
        />

        <main className="main-content">
          {selectedProject ? (
            <ProjectDetail
              project={selectedProject}
              workspacePath={settings.workspacePath}
              geminiApiKey={settings.geminiApiKey}
              onBack={() => setSelectedProject(null)}
              onUpdate={(p) => {
                setSelectedProject(p);
                refresh();
              }}
              onSync={handleSync}
            />
          ) : (
            <ProjectList
              projects={projects}
              loading={loading}
              onSelect={setSelectedProject}
              onNewProject={() => setShowCreateModal(true)}
              onSync={handleSync}
            />
          )}
        </main>
      </div>

      {showSettings && (
        <Settings
          settings={settings}
          onUpdate={updateSettings}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showCreateModal && (
        <CreateProject
          workspacePath={settings.workspacePath}
          geminiApiKey={settings.geminiApiKey}
          onCreate={handleCreateProject}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
