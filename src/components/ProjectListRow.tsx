import { useState } from 'react';
import { Folder, Globe, CheckCircle, XCircle, AlertCircle, RefreshCw, Loader, ChevronDown } from 'lucide-react';
import { Project, PROJECT_STATUS_CONFIG, ProjectStatus } from '../types';
import { projectService } from '../services/projectService';
import { SyncStage, RetryState } from '../stores/syncStore';

interface SyncState {
  stage: SyncStage;
  progress: number;
  filesTotal: number;
  filesCompleted: number;
  retry: RetryState;
}

interface ProjectListRowProps {
  project: Project;
  onClick: () => void;
  onSync?: (project: Project) => Promise<void>;
  onStatusChange?: (project: Project, status: ProjectStatus) => Promise<void>;
  syncState?: SyncState;
}

export function ProjectListRow({
  project,
  onClick,
  onSync,
  onStatusChange,
  syncState,
}: ProjectListRowProps) {
  const [syncing, setSyncing] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const statusConfig = PROJECT_STATUS_CONFIG[project.status];

  const siteUrl = project.urls.currentSite || project.urls.production;

  const isSyncActive = syncState && syncState.stage !== 'idle' && syncState.stage !== 'complete' && syncState.stage !== 'error';

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSync || syncing || isSyncActive) return;

    setSyncing(true);
    try {
      await onSync(project);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="project-list-row" onClick={onClick}>
      <span
        className="status-dot"
        style={{ background: statusConfig.color }}
        title={statusConfig.label}
      />

      <div className="row-title">
        <span className="row-name">{project.client || project.name}</span>
        {project.client && project.client !== project.name && (
          <span className="row-subtitle">{project.name}</span>
        )}
      </div>

      {siteUrl && (
        <span className="row-url">{siteUrl}</span>
      )}

      <div className="row-ftp-status" onClick={(e) => e.stopPropagation()}>
        {project.sftp.configured ? (
          project.sftp.passwordAvailable ? (
            <span title="FTP configuré">
              <CheckCircle size={14} className="ftp-status-configured" />
            </span>
          ) : (
            <span title="Mot de passe manquant">
              <AlertCircle size={14} className="ftp-status-missing-password" />
            </span>
          )
        ) : (
          <span title="FTP non configuré">
            <XCircle size={14} className="ftp-status-not-configured" />
          </span>
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

      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="row-action"
          onClick={() => projectService.openInFinder(project.path)}
          title="Ouvrir dans Finder"
        >
          <Folder size={16} />
        </button>
        {siteUrl && (
          <button
            className="row-action"
            onClick={() => projectService.openInBrowser(siteUrl)}
            title="Ouvrir le site"
          >
            <Globe size={16} />
          </button>
        )}
        {project.sftp.configured && project.sftp.passwordAvailable && onSync && (
          <button
            className="row-action sync-btn"
            onClick={handleSync}
            disabled={syncing || isSyncActive}
            title="Synchroniser"
          >
            {(syncing || isSyncActive) ? (
              <Loader size={16} className="spinner" />
            ) : (
              <RefreshCw size={16} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
