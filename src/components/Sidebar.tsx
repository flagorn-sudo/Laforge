import { Folder, Plus, RefreshCw, Hammer } from 'lucide-react';
import { Project, PROJECT_STATUS_CONFIG } from '../types';

interface SidebarProps {
  projects: Project[];
  onProjectSelect: (project: Project) => void;
  onNewProject: () => void;
  onRefresh: () => void;
}

export function Sidebar({
  projects,
  onProjectSelect,
  onNewProject,
  onRefresh,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Hammer className="sidebar-logo" />
        <span className="sidebar-title">Forge</span>
      </div>

      <nav className="sidebar-nav">
        <button className="nav-item active">
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
              className="recent-project"
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
        <button className="sidebar-action" onClick={onNewProject}>
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
