/**
 * SyncStatusBadge Component
 * Compact sync status indicator for ProjectCard
 */

import { Loader, AlertCircle, CheckCircle, RefreshCw, X } from 'lucide-react';
import { SyncStage, RetryState } from '../stores/syncStore';
import { useRetryCountdown } from '../hooks';

interface SyncStatusBadgeProps {
  stage: SyncStage;
  progress: number;
  filesTotal: number;
  filesCompleted: number;
  retry?: RetryState;
  onCancel?: () => void;
  onRetry?: () => void;
}

export function SyncStatusBadge({
  stage,
  progress,
  filesTotal: _filesTotal,
  filesCompleted,
  retry,
  onCancel,
  onRetry,
}: SyncStatusBadgeProps) {
  const secondsRemaining = useRetryCountdown(retry?.nextRetryAt ?? null);

  // Don't show anything for idle or complete states
  if (stage === 'idle') {
    return null;
  }

  const isRetrying = stage === 'retrying';
  const isError = stage === 'error';
  const isComplete = stage === 'complete';
  const isRunning = stage === 'connecting' || stage === 'analyzing' || stage === 'uploading';

  // Determine the badge content based on state
  const getBadgeContent = () => {
    if (isRetrying) {
      const attemptText = `${retry?.currentAttempt ?? 0 + 1}/${retry?.maxAttempts ?? 4}`;
      if (secondsRemaining > 0) {
        return (
          <>
            <RefreshCw size={12} className="sync-badge-spinner" />
            <span>{attemptText} - {secondsRemaining}s</span>
          </>
        );
      }
      return (
        <>
          <Loader size={12} className="sync-badge-spinner" />
          <span>{attemptText}</span>
        </>
      );
    }

    if (isError) {
      return (
        <>
          <AlertCircle size={12} />
          <span>Erreur</span>
          {onRetry && (
            <button className="sync-badge-action" onClick={(e) => { e.stopPropagation(); onRetry(); }}>
              <RefreshCw size={10} />
            </button>
          )}
        </>
      );
    }

    if (isComplete) {
      return (
        <>
          <CheckCircle size={12} />
          <span>{filesCompleted} fichier{filesCompleted > 1 ? 's' : ''}</span>
        </>
      );
    }

    if (isRunning) {
      if (stage === 'uploading') {
        return (
          <>
            <Loader size={12} className="sync-badge-spinner" />
            <span>{progress}%</span>
            <div className="sync-badge-progress-bar">
              <div className="sync-badge-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </>
        );
      }
      return (
        <>
          <Loader size={12} className="sync-badge-spinner" />
          <span>{stage === 'connecting' ? 'Connexion...' : 'Analyse...'}</span>
        </>
      );
    }

    return null;
  };

  const getVariantClass = () => {
    if (isRetrying) return 'warning';
    if (isError) return 'error';
    if (isComplete) return 'success';
    return 'active';
  };

  return (
    <div className={`sync-status-badge sync-status-badge-${getVariantClass()}`} onClick={(e) => e.stopPropagation()}>
      {getBadgeContent()}
      {(isRunning || isRetrying) && onCancel && (
        <button className="sync-badge-cancel" onClick={(e) => { e.stopPropagation(); onCancel(); }}>
          <X size={10} />
        </button>
      )}
    </div>
  );
}
