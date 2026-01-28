import { useState, useEffect } from 'react';
import { Folder, Globe, CheckCircle, XCircle, AlertCircle, RefreshCw, Loader, ChevronDown, Code2, Clock, Play, Pause, Square } from 'lucide-react';
import { Project, PROJECT_STATUS_CONFIG, ProjectStatus } from '../types';
import { projectService } from '../services/projectService';
import { SyncStatusBadge } from './SyncStatusBadge';
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

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onSync?: (project: Project) => Promise<void>;
  onStatusChange?: (project: Project, status: ProjectStatus) => Promise<void>;
  syncState?: SyncState;
  onCancelSync?: () => void;
  onRetrySync?: () => void;
}

export function ProjectCard({
  project,
  onClick,
  onSync,
  onStatusChange,
  syncState,
  onCancelSync,
  onRetrySync,
}: ProjectCardProps) {
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

  // Update elapsed time
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

  // Use currentSite if available, fallback to production for legacy support
  const siteUrl = project.urls.currentSite || project.urls.production;

  // Check if sync is active from syncState
  const isSyncActive = syncState && syncState.stage !== 'idle' && syncState.stage !== 'complete' && syncState.stage !== 'error';
  const showSyncBadge = syncState && syncState.stage !== 'idle';

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
    <div className={`project-card ${isTimerActive ? 'timer-active' : ''}`} onClick={onClick}>
      {/* Timer active indicator */}
      {isTimerActive && (
        <div className="timer-active-badge">
          <div className="pulse-dot" />
          <Clock size={12} />
          <span>{formatDuration(elapsed)}</span>
        </div>
      )}
      <div className="card-header">
        <div className="card-title">
          <h3>{getProjectDisplayName(project)}</h3>
          {getProjectSubtitle(project) && (
            <span className="card-subtitle">{getProjectSubtitle(project)}</span>
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

      <div className="card-actions">
        <div className="card-actions-left">
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
          <button
            className="card-action"
            onClick={(e) => {
              e.stopPropagation();
              projectService.openInPyCharm(project.path, project.sourcePath);
            }}
            title="Ouvrir dans PyCharm"
          >
            <Code2 size={16} />
          </button>
        </div>

        <div className="timer-controls">
          {isTimerActive ? (
            <>
              <button
                className={`timer-btn-sm active ${isPaused ? 'paused' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isPaused) {
                    resumeSession(project.id);
                  } else {
                    pauseSession(project.id);
                  }
                }}
                title={isPaused ? 'Reprendre le timer' : 'Mettre en pause'}
              >
                {isPaused ? <Play size={12} /> : <Pause size={12} />}
              </button>
              <button
                className="timer-btn-sm stop"
                onClick={(e) => {
                  e.stopPropagation();
                  stopSession(project.id);
                }}
                title="Arrêter le timer"
              >
                <Square size={12} />
              </button>
            </>
          ) : (
            <button
              className="timer-btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                startSession(project.id);
              }}
              title="Démarrer le timer"
            >
              <Play size={12} />
            </button>
          )}
        </div>

        <div className="card-actions-right">
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
          <span
            className="ftp-indicator"
            title={
              project.sftp.configured
                ? project.sftp.passwordAvailable
                  ? 'FTP configuré'
                  : 'Mot de passe FTP manquant'
                : 'FTP non configuré'
            }
          >
            {project.sftp.configured ? (
              project.sftp.passwordAvailable ? (
                <CheckCircle size={14} className="ftp-status-configured" />
              ) : (
                <AlertCircle size={14} className="ftp-status-missing-password" />
              )
            ) : (
              <XCircle size={14} className="ftp-status-not-configured" />
            )}
          </span>
          {project.sftp.configured && project.sftp.passwordAvailable && onSync && (
            <button
              className="card-action sync-btn"
              onClick={handleSync}
              disabled={syncing || isSyncActive}
              title="Synchroniser avec le serveur"
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

      {/* Sync status badge */}
      {showSyncBadge && syncState && (
        <div className="card-sync-status">
          <SyncStatusBadge
            stage={syncState.stage}
            progress={syncState.progress}
            filesTotal={syncState.filesTotal}
            filesCompleted={syncState.filesCompleted}
            retry={syncState.retry}
            onCancel={onCancelSync}
            onRetry={onRetrySync}
          />
        </div>
      )}
    </div>
  );
}
