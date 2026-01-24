/**
 * Delta Sync Stats Component
 * Displays delta sync analysis results and savings
 */

import React from 'react';
import {
  FileDelta,
  DeltaTransferStats,
  DeltaStatus,
} from '../types';
import './DeltaSyncStats.css';

interface DeltaSyncStatsProps {
  deltas: FileDelta[];
  stats: DeltaTransferStats;
  isLoading?: boolean;
  onClearCache?: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

// Status icon helper - exported for use in other components
export const getStatusIcon = (status: DeltaStatus): string => {
  const icons: Record<DeltaStatus, string> = {
    new: '+',
    modified: '~',
    unchanged: '=',
    smallfile: '*',
    deleted: '-',
  };
  return icons[status] || '?';
};

// Status label helper - exported for use in other components
export const getStatusLabel = (status: DeltaStatus): string => {
  const labels: Record<DeltaStatus, string> = {
    new: 'Nouveau',
    modified: 'Modifie',
    unchanged: 'Inchange',
    smallfile: 'Petit',
    deleted: 'Supprime',
  };
  return labels[status] || status;
};

export const DeltaSyncStats: React.FC<DeltaSyncStatsProps> = ({
  deltas,
  stats,
  isLoading,
  onClearCache,
}) => {
  if (isLoading) {
    return (
      <div className="delta-sync-stats loading">
        <div className="loading-spinner"></div>
        <span>Analyse des modifications...</span>
      </div>
    );
  }

  const savingsPercent = stats.savings_percent.toFixed(1);
  const hasSavings = stats.savings_bytes > 0;

  // Group deltas by status
  const groupedDeltas: Record<DeltaStatus, FileDelta[]> = {
    new: [],
    modified: [],
    unchanged: [],
    smallfile: [],
    deleted: [],
  };

  deltas.forEach((delta) => {
    if (groupedDeltas[delta.status]) {
      groupedDeltas[delta.status].push(delta);
    }
  });

  const filesToTransfer = deltas.filter(
    (d) => d.status === 'new' || d.status === 'modified' || d.status === 'smallfile'
  );

  return (
    <div className="delta-sync-stats">
      <div className="stats-header">
        <h4>Analyse Delta Sync</h4>
        {onClearCache && (
          <button className="btn-clear-cache" onClick={onClearCache} title="Vider le cache">
            Reinitialiser
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="stats-summary">
        <div className={`stat-card ${hasSavings ? 'savings' : ''}`}>
          <span className="stat-value">{savingsPercent}%</span>
          <span className="stat-label">Economise</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{formatBytes(stats.transfer_size)}</span>
          <span className="stat-label">A transferer</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{formatBytes(stats.total_size)}</span>
          <span className="stat-label">Taille totale</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{filesToTransfer.length}</span>
          <span className="stat-label">Fichiers</span>
        </div>
      </div>

      {/* File Breakdown */}
      <div className="file-breakdown">
        <div className="breakdown-row">
          <span className="breakdown-icon new">+</span>
          <span className="breakdown-label">Nouveaux</span>
          <span className="breakdown-count">{stats.new_files}</span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-icon modified">~</span>
          <span className="breakdown-label">Modifies</span>
          <span className="breakdown-count">{stats.modified_files}</span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-icon unchanged">=</span>
          <span className="breakdown-label">Inchanges</span>
          <span className="breakdown-count">{stats.unchanged_files}</span>
        </div>
        {stats.deleted_files > 0 && (
          <div className="breakdown-row">
            <span className="breakdown-icon deleted">-</span>
            <span className="breakdown-label">Supprimes</span>
            <span className="breakdown-count">{stats.deleted_files}</span>
          </div>
        )}
      </div>

      {/* Savings Banner */}
      {hasSavings && (
        <div className="savings-banner">
          <span className="savings-icon">Lightning</span>
          <span className="savings-text">
            Delta sync economise <strong>{formatBytes(stats.savings_bytes)}</strong> de transfert
          </span>
        </div>
      )}

      {/* Modified Files with Chunk Info */}
      {groupedDeltas.modified.length > 0 && (
        <div className="modified-files-section">
          <h5>Fichiers modifies ({groupedDeltas.modified.length})</h5>
          <div className="modified-files-list">
            {groupedDeltas.modified.slice(0, 10).map((delta) => (
              <div key={delta.path} className="modified-file">
                <span className="file-path">{delta.path}</span>
                <span className="file-savings">
                  {delta.savings_percent.toFixed(0)}% economise
                  ({delta.changed_chunks.length} chunk{delta.changed_chunks.length > 1 ? 's' : ''})
                </span>
              </div>
            ))}
            {groupedDeltas.modified.length > 10 && (
              <div className="more-files">
                + {groupedDeltas.modified.length - 10} autres fichiers modifies
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Files */}
      {groupedDeltas.new.length > 0 && (
        <div className="new-files-section">
          <h5>Nouveaux fichiers ({groupedDeltas.new.length})</h5>
          <div className="new-files-list">
            {groupedDeltas.new.slice(0, 5).map((delta) => (
              <div key={delta.path} className="new-file">
                <span className="file-icon">+</span>
                <span className="file-path">{delta.path}</span>
                <span className="file-size">{formatBytes(delta.total_size)}</span>
              </div>
            ))}
            {groupedDeltas.new.length > 5 && (
              <div className="more-files">
                + {groupedDeltas.new.length - 5} autres nouveaux fichiers
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Compact version for sync dialog
export const DeltaSyncCompact: React.FC<{ stats: DeltaTransferStats }> = ({ stats }) => {
  const savingsPercent = stats.savings_percent.toFixed(0);
  const hasSavings = stats.savings_bytes > 0;

  return (
    <div className="delta-sync-compact">
      {hasSavings ? (
        <span className="compact-savings">
          Delta: {savingsPercent}% economise ({formatBytes(stats.savings_bytes)})
        </span>
      ) : (
        <span className="compact-full">
          Transfert complet: {formatBytes(stats.transfer_size)}
        </span>
      )}
    </div>
  );
};

export default DeltaSyncStats;
