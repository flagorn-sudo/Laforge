import { useState } from 'react';
import { Folder, Globe, CheckCircle, XCircle, AlertCircle, RefreshCw, Loader, ChevronDown } from 'lucide-react';
import { Project, PROJECT_STATUS_CONFIG, ProjectStatus } from '../types';
import { projectService } from '../services/projectService';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onSync?: (project: Project) => Promise<void>;
  onStatusChange?: (project: Project, status: ProjectStatus) => Promise<void>;
}

export function ProjectCard({ project, onClick, onSync, onStatusChange }: ProjectCardProps) {
  const [syncing, setSyncing] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const statusConfig = PROJECT_STATUS_CONFIG[project.status];

  // Use currentSite if available, fallback to production for legacy support
  const siteUrl = project.urls.currentSite || project.urls.production;

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSync || syncing) return;

    setSyncing(true);
    try {
      await onSync(project);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="project-card" onClick={onClick}>
      <div className="card-header">
        <div className="card-title">
          <h3>{project.client || project.name}</h3>
          {project.client && project.client !== project.name && (
            <span className="card-subtitle">{project.name}</span>
          )}
        </div>
        <div className="status-dropdown-container" onClick={(e) => e.stopPropagation()}>
          <button
            className="status-badge status-badge-clickable"
            style={{
              background: `${statusConfig.color}20`,
              color: statusConfig.color,
            }}
            onClick={() => onStatusChange && setShowStatusDropdown(!showStatusDropdown)}
          >
            {statusConfig.label}
            {onStatusChange && <ChevronDown size={10} />}
          </button>
          {showStatusDropdown && onStatusChange && (
            <div className="status-dropdown-menu">
              {(Object.entries(PROJECT_STATUS_CONFIG) as [ProjectStatus, { label: string; color: string }][]).map(
                ([key, value]) => (
                  <button
                    key={key}
                    className={`status-dropdown-item ${key === project.status ? 'active' : ''}`}
                    onClick={async () => {
                      setShowStatusDropdown(false);
                      await onStatusChange(project, key);
                    }}
                  >
                    <span className="status-dot" style={{ background: value.color }} />
                    {value.label}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card-divider" />

      <div className="card-info">
        {siteUrl && (
          <div className="info-row">
            <Globe size={14} />
            <span>{siteUrl}</span>
          </div>
        )}
        <div className="info-row">
          {project.sftp.configured ? (
            project.sftp.passwordAvailable ? (
              <>
                <CheckCircle size={14} className="ftp-status-configured" />
                <span>FTP configuré</span>
              </>
            ) : (
              <>
                <AlertCircle size={14} className="ftp-status-missing-password" />
                <span>Mot de passe manquant</span>
              </>
            )
          ) : (
            <>
              <XCircle size={14} className="ftp-status-not-configured" />
              <span>FTP non configuré</span>
            </>
          )}
        </div>
      </div>

      <div className="card-actions">
        <button
          className="card-action"
          onClick={(e) => {
            e.stopPropagation();
            projectService.openInFinder(project.path);
          }}
          title="Ouvrir dans Finder"
        >
          <Folder size={16} />
        </button>
        {siteUrl && (
          <button
            className="card-action"
            onClick={(e) => {
              e.stopPropagation();
              projectService.openInBrowser(siteUrl);
            }}
            title="Ouvrir le site"
          >
            <Globe size={16} />
          </button>
        )}
        {project.sftp.configured && project.sftp.passwordAvailable && onSync && (
          <button
            className="card-action sync-btn"
            onClick={handleSync}
            disabled={syncing}
            title="Synchroniser avec le serveur"
          >
            {syncing ? (
              <Loader size={16} className="spinner" />
            ) : (
              <RefreshCw size={16} />
            )}
            <span>Sync</span>
          </button>
        )}
      </div>
    </div>
  );
}
