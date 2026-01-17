import { useState } from 'react';
import { Folder, Globe, CheckCircle, XCircle, RefreshCw, Loader } from 'lucide-react';
import { Project, PROJECT_STATUS_CONFIG } from '../types';
import { projectService } from '../services/projectService';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onSync?: (project: Project) => Promise<void>;
}

export function ProjectCard({ project, onClick, onSync }: ProjectCardProps) {
  const [syncing, setSyncing] = useState(false);
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
        <span
          className="status-badge"
          style={{
            background: `${statusConfig.color}20`,
            color: statusConfig.color,
          }}
        >
          {statusConfig.label}
        </span>
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
            <>
              <CheckCircle size={14} className="success" />
              <span>FTP configuré</span>
            </>
          ) : (
            <>
              <XCircle size={14} className="muted" />
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
        {project.sftp.configured && onSync && (
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
