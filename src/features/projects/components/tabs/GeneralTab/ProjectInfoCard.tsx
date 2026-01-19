/**
 * Project Information Card
 * Displays basic project information (path, client, status, created date)
 */

import { ChevronDown } from 'lucide-react';
import { Project, PROJECT_STATUS_CONFIG, ProjectStatus } from '../../../../../types';
import { Card } from '../../../../../components/ui';

interface ProjectInfoCardProps {
  project: Project;
  showStatusDropdown: boolean;
  onToggleStatusDropdown: () => void;
  onStatusChange: (status: ProjectStatus) => void;
}

export function ProjectInfoCard({
  project,
  showStatusDropdown,
  onToggleStatusDropdown,
  onStatusChange,
}: ProjectInfoCardProps) {
  const statusConfig = PROJECT_STATUS_CONFIG[project.status];

  return (
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
              style={{
                background: `${statusConfig.color}20`,
                color: statusConfig.color,
              }}
              onClick={onToggleStatusDropdown}
            >
              {statusConfig.label}
              <ChevronDown size={12} />
            </button>
            {showStatusDropdown && (
              <div className="status-dropdown-menu">
                {(
                  Object.entries(PROJECT_STATUS_CONFIG) as [
                    ProjectStatus,
                    { label: string; color: string }
                  ][]
                ).map(([key, value]) => (
                  <button
                    key={key}
                    className={`status-dropdown-item ${
                      key === project.status ? 'active' : ''
                    }`}
                    onClick={() => onStatusChange(key)}
                  >
                    <span className="status-dot" style={{ background: value.color }} />
                    {value.label}
                  </button>
                ))}
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
  );
}
