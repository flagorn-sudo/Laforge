/**
 * SyncProgress Component
 * Shows real-time synchronization progress with file list and retry status
 */

import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader,
  Wifi,
  FolderSync,
  File,
  FileCheck,
  X,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { Button } from '../../../components/ui';
import { SyncStage, SyncFileProgress, RetryState } from '../../../stores/syncStore';
import { useRetryCountdown } from '../../../hooks';
import './SyncProgress.css';

interface SyncProgressProps {
  stage: SyncStage;
  progress: number;
  currentFile: string | null;
  filesTotal: number;
  filesCompleted: number;
  files: SyncFileProgress[];
  error: string | null;
  retry?: RetryState;
  onCancel?: () => void;
  onRetry?: () => void;
  onClose?: () => void;
  onOpenLogs?: () => void;
}

const STAGE_INFO: Record<SyncStage, { label: string; icon: React.ReactNode }> = {
  idle: { label: 'En attente', icon: <FolderSync size={18} /> },
  connecting: { label: 'Connexion au serveur...', icon: <Wifi size={18} /> },
  retrying: { label: 'Reconnexion en cours...', icon: <RefreshCw size={18} /> },
  analyzing: { label: 'Analyse des fichiers...', icon: <FolderSync size={18} /> },
  uploading: { label: 'Envoi des fichiers...', icon: <Upload size={18} /> },
  complete: { label: 'Synchronisation terminee', icon: <CheckCircle size={18} /> },
  error: { label: 'Erreur', icon: <AlertCircle size={18} /> },
  cancelled: { label: 'Annulé', icon: <X size={18} /> },
};

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

export function SyncProgress({
  stage,
  progress,
  currentFile,
  filesTotal,
  filesCompleted,
  files,
  error,
  retry,
  onCancel,
  onRetry,
  onClose,
  onOpenLogs,
}: SyncProgressProps) {
  const stageInfo = STAGE_INFO[stage];
  const isRunning = stage === 'connecting' || stage === 'analyzing' || stage === 'uploading';
  const isRetrying = stage === 'retrying';
  const isComplete = stage === 'complete';
  const isError = stage === 'error';

  // Use retry countdown hook
  const secondsRemaining = useRetryCountdown(retry?.nextRetryAt ?? null);

  // Only show files that need to be uploaded
  const filesToShow = files.slice(0, 50); // Limit display to 50 files

  // Build retry info display
  const getRetryLabel = (): string => {
    if (!isRetrying || !retry) return stageInfo.label;
    return `Tentative ${retry.currentAttempt + 1}/${retry.maxAttempts}`;
  };

  const getRetrySubtext = (): string | null => {
    if (!isRetrying || !retry) return null;
    if (secondsRemaining > 0) {
      return `Nouvelle tentative dans ${secondsRemaining}s...`;
    }
    return 'Connexion en cours...';
  };

  return (
    <div className={`sync-progress ${stage}`}>
      {/* Header */}
      <div className="sync-progress-header">
        <div className={`sync-progress-icon ${stage}`}>
          {(isRunning || isRetrying) ? <Loader size={20} className="spinner" /> : stageInfo.icon}
        </div>
        <div className="sync-progress-title">
          <h4>{isRetrying ? getRetryLabel() : stageInfo.label}</h4>
          {isRetrying && (
            <span className="sync-retry-info">
              {getRetrySubtext()}
            </span>
          )}
          {isRunning && currentFile && (
            <span className="sync-current-file" title={currentFile}>
              {getFileName(currentFile)}
            </span>
          )}
          {isComplete && (
            <span className="sync-complete-message">
              {filesCompleted} fichier{filesCompleted > 1 ? 's' : ''} synchronise{filesCompleted > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {(isComplete || isError) && onClose && (
          <button className="sync-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Retry error message (shown during retrying) */}
      {isRetrying && retry?.lastError && (
        <div className="sync-retry-error">
          <AlertCircle size={14} />
          <span>{retry.lastError}</span>
        </div>
      )}

      {/* Progress bar */}
      {(isRunning || isComplete) && (
        <div className="sync-progress-bar-container">
          <div className="sync-progress-bar">
            <div
              className={`sync-progress-bar-fill ${isComplete ? 'complete' : ''}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="sync-progress-stats">
            <span>{progress}%</span>
            <span>{filesCompleted} / {filesTotal} fichiers</span>
          </div>
        </div>
      )}

      {/* Error message */}
      {isError && error && (
        <div className="sync-error-message">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (isRunning || isComplete) && (
        <div className="sync-files-container">
          <div className="sync-files-header">
            <span>Fichiers ({filesTotal})</span>
          </div>
          <div className="sync-files-list">
            {filesToShow.map((file) => (
              <div key={file.path} className={`sync-file-item ${file.status}`}>
                <div className="sync-file-icon">
                  {file.status === 'uploaded' && <FileCheck size={14} />}
                  {file.status === 'uploading' && <Loader size={14} className="spinner" />}
                  {file.status === 'pending' && <File size={14} />}
                  {file.status === 'error' && <AlertCircle size={14} />}
                </div>
                <span className="sync-file-name" title={file.path}>
                  {file.path}
                </span>
                {file.size && (
                  <span className="sync-file-size">{formatFileSize(file.size)}</span>
                )}
              </div>
            ))}
            {files.length > 50 && (
              <div className="sync-files-more">
                +{files.length - 50} autres fichiers...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="sync-progress-actions">
        {onOpenLogs && (
          <Button variant="ghost" onClick={onOpenLogs} title="Voir les logs détaillés">
            <FileText size={14} />
            Logs
          </Button>
        )}
        {(isRunning || isRetrying) && onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        )}
        {isError && onRetry && (
          <Button variant="primary" onClick={onRetry}>
            Reessayer
          </Button>
        )}
        {isComplete && onClose && (
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        )}
      </div>
    </div>
  );
}
