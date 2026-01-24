/**
 * FTPLogWindow Component
 * Modal flottante affichant les logs de synchronisation FTP en temps réel
 */

import { useRef, useEffect, useState } from 'react';
import {
  X,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  Wifi,
  WifiOff,
  FileText,
  Loader,
  Trash2,
} from 'lucide-react';
import { SyncLogEntry, SyncFailedFile } from '../types';
import { SyncStage, SyncFileProgress } from '../stores/syncStore';
import { Button } from './ui';
import './FTPLogWindow.css';

interface FTPLogWindowProps {
  isOpen: boolean;
  onClose: () => void;
  stage: SyncStage;
  progress: number;
  currentFile: string | null;
  filesTotal: number;
  filesCompleted: number;
  files: SyncFileProgress[];
  logs: SyncLogEntry[];
  failedFiles: SyncFailedFile[];
  error: string | null;
  startTime: number | null;
  onCancel?: () => void;
  onRetry?: () => void;
  onRetryFile?: (filePath: string) => void;
  onClearLogs?: () => void;
}

const LOG_LEVEL_ICONS: Record<SyncLogEntry['level'], React.ReactNode> = {
  info: <Info size={14} />,
  success: <CheckCircle size={14} />,
  warning: <AlertTriangle size={14} />,
  error: <AlertCircle size={14} />,
};

const LOG_LEVEL_COLORS: Record<SyncLogEntry['level'], string> = {
  info: 'var(--text-secondary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
};

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(startTime: number | null): string {
  if (!startTime) return '0s';
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getConnectionStatus(stage: SyncStage): { icon: React.ReactNode; text: string; color: string } {
  switch (stage) {
    case 'connecting':
    case 'retrying':
      return { icon: <Loader size={14} className="spinner" />, text: 'Connexion...', color: 'var(--warning)' };
    case 'analyzing':
    case 'uploading':
    case 'complete':
      return { icon: <Wifi size={14} />, text: 'Connecté', color: 'var(--success)' };
    case 'error':
    case 'cancelled':
      return { icon: <WifiOff size={14} />, text: 'Déconnecté', color: 'var(--error)' };
    default:
      return { icon: <WifiOff size={14} />, text: 'Non connecté', color: 'var(--text-secondary)' };
  }
}

export function FTPLogWindow({
  isOpen,
  onClose,
  stage,
  progress,
  currentFile,
  filesTotal,
  filesCompleted,
  files,
  logs,
  failedFiles,
  error,
  startTime,
  onCancel,
  onRetry,
  onRetryFile,
  onClearLogs,
}: FTPLogWindowProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Export logs to file
  const handleExportLogs = () => {
    const logText = logs
      .map(log => `[${formatTimestamp(log.timestamp)}] [${log.level.toUpperCase()}] ${log.message}${log.details ? ` - ${log.details}` : ''}`)
      .join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ftp-sync-${new Date().toISOString().split('T')[0]}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const isRunning = stage === 'connecting' || stage === 'analyzing' || stage === 'uploading' || stage === 'retrying';
  const isComplete = stage === 'complete';
  const isError = stage === 'error';
  const connectionStatus = getConnectionStatus(stage);

  // Current file being uploaded
  const currentFileInfo = currentFile ? files.find(f => f.path === currentFile) : null;

  return (
    <div className="ftp-log-overlay" onClick={onClose}>
      <div className="ftp-log-window" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ftp-log-header">
          <div className="ftp-log-title">
            <FileText size={18} />
            <span>Logs de synchronisation</span>
          </div>
          <div className="ftp-log-status">
            <span className="ftp-connection-status" style={{ color: connectionStatus.color }}>
              {connectionStatus.icon}
              {connectionStatus.text}
            </span>
            <button className="ftp-log-close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Current file progress */}
        {isRunning && currentFile && (
          <div className="ftp-current-file">
            <div className="ftp-current-file-header">
              <span className="ftp-current-file-name" title={currentFile}>
                <Loader size={14} className="spinner" />
                {currentFile.split('/').pop()}
              </span>
              {currentFileInfo?.size && (
                <span className="ftp-current-file-size">{formatFileSize(currentFileInfo.size)}</span>
              )}
            </div>
            <div className="ftp-file-progress-bar">
              <div className="ftp-file-progress-fill" style={{ width: '100%' }} />
            </div>
          </div>
        )}

        {/* Overall progress */}
        {(isRunning || isComplete) && (
          <div className="ftp-overall-progress">
            <div className="ftp-progress-stats">
              <span>{filesCompleted} / {filesTotal} fichiers</span>
              <span>{progress}%</span>
              <span>{formatDuration(startTime)}</span>
            </div>
            <div className="ftp-progress-bar">
              <div
                className={`ftp-progress-fill ${isComplete ? 'complete' : ''}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Logs list */}
        <div
          className="ftp-logs-container"
          onScroll={(e) => {
            const target = e.target as HTMLDivElement;
            const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
            setAutoScroll(isAtBottom);
          }}
        >
          {logs.length === 0 ? (
            <div className="ftp-logs-empty">
              <Info size={24} />
              <span>Aucun log pour le moment</span>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className={`ftp-log-entry ${log.level}`}>
                <span className="ftp-log-time">{formatTimestamp(log.timestamp)}</span>
                <span className="ftp-log-icon" style={{ color: LOG_LEVEL_COLORS[log.level] }}>
                  {LOG_LEVEL_ICONS[log.level]}
                </span>
                <span className="ftp-log-message">
                  {log.message}
                  {log.details && <span className="ftp-log-details"> - {log.details}</span>}
                </span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        {/* Failed files section */}
        {failedFiles.length > 0 && (
          <div className="ftp-failed-files">
            <div className="ftp-failed-header">
              <AlertCircle size={14} />
              <span>{failedFiles.length} fichier(s) en erreur</span>
            </div>
            <div className="ftp-failed-list">
              {failedFiles.map((file) => (
                <div key={file.path} className="ftp-failed-item">
                  <span className="ftp-failed-name" title={file.path}>
                    {file.path.split('/').pop()}
                  </span>
                  <span className="ftp-failed-error">{file.error}</span>
                  {onRetryFile && (
                    <button
                      className="ftp-failed-retry"
                      onClick={() => onRetryFile(file.path)}
                      title="Réessayer"
                    >
                      <RefreshCw size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error message */}
        {isError && error && (
          <div className="ftp-error-banner">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Footer actions */}
        <div className="ftp-log-footer">
          <div className="ftp-log-actions-left">
            {logs.length > 0 && (
              <>
                <Button variant="ghost" onClick={handleExportLogs} title="Exporter les logs">
                  <Download size={14} />
                  Exporter
                </Button>
                {onClearLogs && !isRunning && (
                  <Button variant="ghost" onClick={onClearLogs} title="Effacer les logs">
                    <Trash2 size={14} />
                    Effacer
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="ftp-log-actions-right">
            {isRunning && onCancel && (
              <Button variant="ghost" onClick={onCancel}>
                Annuler
              </Button>
            )}
            {isError && onRetry && (
              <Button variant="primary" onClick={onRetry}>
                <RefreshCw size={14} />
                Réessayer
              </Button>
            )}
            {(isComplete || !isRunning) && (
              <Button variant="secondary" onClick={onClose}>
                Fermer
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
