import { useState, useEffect } from 'react';
import { Folder, Globe, CheckCircle, XCircle, AlertCircle, RefreshCw, Loader, ChevronDown, Code2, Clock, Play, Pause, Square } from 'lucide-react';
import { Project, PROJECT_STATUS_CONFIG, ProjectStatus } from '../types';
import { projectService } from '../services/projectService';
import { SyncStage, RetryState } from '../stores/syncStore';
import { useTimeStore, formatDuration } from '../stores/timeStore';
import { getProjectDisplayName, getProjectSubtitle } from '../utils/projectDisplay';

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

  // Timer state
  const activeSessions = useTimeStore((state) => state.activeSessions);
  const startSession = useTimeStore((state) => state.startSession);
  const stopSession = useTimeStore((state) => state.stopSession);
  const pauseSession = useTimeStore((state) => state.pauseSession);
  const resumeSession = useTimeStore((state) => state.resumeSession);
  const activeSession = activeSessions.find(s => s.projectId === project.id) || null;
  const isTimerActive = activeSession !== null;
  const isPaused = activeSession?.isPaused ?? false;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isTimerActive || !activeSession) {
      setElapsed(0);
      return;
    }
    const updateElapsed = () => {
      if (activeSession.isPaused) {
        setElapsed(activeSession.accumulatedTime);
      } else {
        const startTime = new Date(activeSession.startTime).getTime();
        const runningTime = Math.floor((Date.now() - startTime) / 1000);
        setElapsed(activeSession.accumulatedTime + runningTime);
      }
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [isTimerActive, activeSession, activeSession?.isPaused, activeSession?.accumulatedTime, activeSession?.startTime]);

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
    <div className={`project-list-row ${isTimerActive ? 'timer-active' : ''}`} onClick={onClick}>
      <span
        className="status-dot"
        style={{ background: statusConfig.color }}
        title={statusConfig.label}
      />

      <div className="row-title">
        <span className="row-name">{getProjectDisplayName(project)}</span>
        {getProjectSubtitle(project) && (
          <span className="row-subtitle">{getProjectSubtitle(project)}</span>
        )}
      </div>

      {/* Timer active indicator */}
      {isTimerActive && (
        <div className="timer-badge">
          <div className="pulse-dot" />
          <Clock size={12} />
          <span>{formatDuration(elapsed)}</span>
        </div>
      )}

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
        <button
          className="row-action"
          onClick={() => projectService.openInPyCharm(project.path, project.sourcePath)}
          title="Ouvrir dans PyCharm"
        >
          <Code2 size={16} />
        </button>
        {isTimerActive ? (
          <>
            <button
              className={`row-action timer-btn active ${isPaused ? 'paused' : ''}`}
              onClick={() => isPaused ? resumeSession(project.id) : pauseSession(project.id)}
              title={isPaused ? 'Reprendre le timer' : 'Mettre en pause'}
            >
              {isPaused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button
              className="row-action timer-btn stop"
              onClick={() => stopSession(project.id)}
              title="Arrêter le timer"
            >
              <Square size={14} />
            </button>
          </>
        ) : (
          <button
            className="row-action timer-btn"
            onClick={() => startSession(project.id)}
            title="Démarrer le timer"
          >
            <Play size={14} />
          </button>
        )}
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
