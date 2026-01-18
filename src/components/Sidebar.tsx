import { Folder, Plus, RefreshCw, Settings } from 'lucide-react';
import { Project, PROJECT_STATUS_CONFIG } from '../types';
import hephaestusIcon from '../assets/hephaestus.svg';

interface SidebarProps {
  projects: Project[];
  selectedProjectId: string | null;
  onProjectSelect: (project: Project) => void;
  onShowProjectList: () => void;
  onNewProject: () => void;
  onRefresh: () => void;
  onSettings: () => void;
}

export function Sidebar({
  projects,
  selectedProjectId,
  onProjectSelect,
  onShowProjectList,
  onNewProject,
  onRefresh,
  onSettings,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src={hephaestusIcon} alt="La Forge" className="sidebar-logo" />
        <span className="sidebar-title">La Forge</span>
        <button className="sidebar-settings" onClick={onSettings} title="Paramètres">
          <Settings size={18} />
        </button>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${!selectedProjectId ? 'active' : ''}`}
          onClick={onShowProjectList}
        >
          <Folder size={18} />
          <span>Projets</span>
        </button>
      </nav>

      {projects.length > 0 && (
        <div className="sidebar-section">
          <h3 className="sidebar-section-title">Récents</h3>
          {projects.map((project) => (
            <button
              key={project.id}
              className={`recent-project ${selectedProjectId === project.id ? 'active' : ''}`}
              onClick={() => onProjectSelect(project)}
            >
              <span
                className="status-dot"
                style={{ background: PROJECT_STATUS_CONFIG[project.status].color }}
              />
              <span className="project-name">{project.client || project.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sidebar-footer">
        <button className="sidebar-action new-project" onClick={onNewProject}>
          <Plus size={16} />
          <span>Nouveau</span>
        </button>
        <button className="sidebar-action icon-only" onClick={onRefresh} title="Rafraîchir">
          <RefreshCw size={16} />
        </button>
      </div>
    </aside>
  );
}
