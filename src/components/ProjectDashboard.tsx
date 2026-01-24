/**
 * Project Dashboard Component
 * Displays project metrics, sync history, and activity stats
 */

import React, { useMemo } from 'react';
import { Project, ProjectStats, SyncHistoryEntry } from '../types';
import { formatFileSize, formatRelativeTime } from '../stores/versionStore';
import './ProjectDashboard.css';

interface ProjectDashboardProps {
  project: Project;
  stats?: ProjectStats;
  onClose?: () => void;
}

// Generate mock stats from project data for now
// In production, this would come from a stats service
function generateStatsFromProject(project: Project): ProjectStats {
  const syncHistory: SyncHistoryEntry[] = [];

  // Generate some example history based on lastSync
  if (project.sftp.lastSync) {
    const lastSync = new Date(project.sftp.lastSync).getTime();
    syncHistory.push({
      id: '1',
      timestamp: project.sftp.lastSync,
      filesCount: Math.floor(Math.random() * 20) + 5,
      bytesTransferred: Math.floor(Math.random() * 5000000) + 100000,
      duration: Math.floor(Math.random() * 60) + 10,
      success: true,
    });

    // Add some historical entries
    for (let i = 1; i < 5; i++) {
      const daysAgo = i * 2 + Math.floor(Math.random() * 3);
      syncHistory.push({
        id: `${i + 1}`,
        timestamp: new Date(lastSync - daysAgo * 86400000).toISOString(),
        filesCount: Math.floor(Math.random() * 15) + 3,
        bytesTransferred: Math.floor(Math.random() * 3000000) + 50000,
        duration: Math.floor(Math.random() * 45) + 5,
        success: Math.random() > 0.1,
        error: Math.random() < 0.1 ? 'Connection timeout' : undefined,
      });
    }
  }

  const totalBytesTransferred = syncHistory.reduce((sum, s) => sum + s.bytesTransferred, 0);
  const totalFilesUploaded = syncHistory.reduce((sum, s) => sum + s.filesCount, 0);
  const avgDuration = syncHistory.length
    ? syncHistory.reduce((sum, s) => sum + s.duration, 0) / syncHistory.length
    : 0;

  return {
    totalSyncs: syncHistory.length,
    lastSyncDate: project.sftp.lastSync,
    totalFilesUploaded,
    totalBytesTransferred,
    averageSyncDuration: Math.round(avgDuration),
    syncHistory: syncHistory.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ),
    fileTypeBreakdown: {
      'HTML': Math.floor(Math.random() * 10) + 5,
      'CSS': Math.floor(Math.random() * 8) + 2,
      'JS': Math.floor(Math.random() * 12) + 3,
      'Images': Math.floor(Math.random() * 30) + 10,
      'Autres': Math.floor(Math.random() * 5) + 1,
    },
  };
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  project,
  stats: externalStats,
  onClose,
}) => {
  const stats = useMemo(
    () => externalStats || generateStatsFromProject(project),
    [project, externalStats]
  );

  const successRate = useMemo(() => {
    if (stats.syncHistory.length === 0) return 100;
    const successful = stats.syncHistory.filter((s) => s.success).length;
    return Math.round((successful / stats.syncHistory.length) * 100);
  }, [stats.syncHistory]);

  const lastSyncRelative = stats.lastSyncDate
    ? formatRelativeTime(stats.lastSyncDate)
    : 'Jamais';

  return (
    <div className="project-dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h2>{project.name}</h2>
          <span className="project-client">{project.client || 'Client non défini'}</span>
        </div>
        {onClose && (
          <button className="btn-close" onClick={onClose}>
            ×
          </button>
        )}
      </div>

      <div className="dashboard-grid">
        {/* Key Metrics */}
        <div className="metric-cards">
          <div className="metric-card">
            <span className="metric-value">{stats.totalSyncs}</span>
            <span className="metric-label">Syncs totaux</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{stats.totalFilesUploaded}</span>
            <span className="metric-label">Fichiers uploadés</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{formatFileSize(stats.totalBytesTransferred)}</span>
            <span className="metric-label">Volume transféré</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{stats.averageSyncDuration}s</span>
            <span className="metric-label">Durée moyenne</span>
          </div>
        </div>

        {/* Status Overview */}
        <div className="status-section">
          <h3>État du projet</h3>
          <div className="status-grid">
            <div className="status-item">
              <span className="status-label">Dernière sync</span>
              <span className="status-value">{lastSyncRelative}</span>
            </div>
            <div className="status-item">
              <span className="status-label">Taux de succès</span>
              <span className={`status-value ${successRate >= 90 ? 'success' : successRate >= 70 ? 'warning' : 'error'}`}>
                {successRate}%
              </span>
            </div>
            <div className="status-item">
              <span className="status-label">FTP configuré</span>
              <span className={`status-value ${project.sftp.configured ? 'success' : 'error'}`}>
                {project.sftp.configured ? 'Oui' : 'Non'}
              </span>
            </div>
            <div className="status-item">
              <span className="status-label">Protocole</span>
              <span className="status-value">
                {project.sftp.protocol?.toUpperCase() || 'FTP'}
              </span>
            </div>
          </div>
        </div>

        {/* File Type Breakdown */}
        <div className="breakdown-section">
          <h3>Types de fichiers</h3>
          <div className="breakdown-list">
            {Object.entries(stats.fileTypeBreakdown).map(([type, count]) => {
              const total = Object.values(stats.fileTypeBreakdown).reduce((a, b) => a + b, 0);
              const percentage = Math.round((count / total) * 100);
              return (
                <div key={type} className="breakdown-item">
                  <div className="breakdown-header">
                    <span className="breakdown-type">{type}</span>
                    <span className="breakdown-count">{count}</span>
                  </div>
                  <div className="breakdown-bar">
                    <div
                      className="breakdown-fill"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sync History */}
        <div className="history-section">
          <h3>Historique des syncs</h3>
          {stats.syncHistory.length === 0 ? (
            <div className="empty-history">
              <p>Aucune synchronisation effectuée</p>
            </div>
          ) : (
            <div className="history-list">
              {stats.syncHistory.map((entry) => (
                <div
                  key={entry.id}
                  className={`history-item ${entry.success ? 'success' : 'error'}`}
                >
                  <div className="history-status">
                    <span className={`status-indicator ${entry.success ? 'success' : 'error'}`} />
                  </div>
                  <div className="history-content">
                    <div className="history-main">
                      <span className="history-date">
                        {formatRelativeTime(entry.timestamp)}
                      </span>
                      <span className="history-files">
                        {entry.filesCount} fichiers
                      </span>
                      <span className="history-size">
                        {formatFileSize(entry.bytesTransferred)}
                      </span>
                      <span className="history-duration">{entry.duration}s</span>
                    </div>
                    {entry.error && (
                      <div className="history-error">{entry.error}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Info */}
        <div className="info-section">
          <h3>Informations</h3>
          <div className="info-list">
            <div className="info-item">
              <span className="info-label">Chemin local</span>
              <span className="info-value">{project.path}</span>
            </div>
            {project.sftp.host && (
              <div className="info-item">
                <span className="info-label">Serveur FTP</span>
                <span className="info-value">
                  {project.sftp.host}:{project.sftp.port || 21}
                </span>
              </div>
            )}
            {project.sftp.remotePath && (
              <div className="info-item">
                <span className="info-label">Chemin distant</span>
                <span className="info-value">{project.sftp.remotePath}</span>
              </div>
            )}
            {project.urls.testUrl && (
              <div className="info-item">
                <span className="info-label">URL de test</span>
                <a
                  href={project.urls.testUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="info-link"
                >
                  {project.urls.testUrl}
                </a>
              </div>
            )}
            <div className="info-item">
              <span className="info-label">Créé le</span>
              <span className="info-value">
                {new Date(project.created).toLocaleDateString('fr-FR')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDashboard;
