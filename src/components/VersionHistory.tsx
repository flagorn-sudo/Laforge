/**
 * Version History Component
 * Displays sync snapshots and allows rollback to previous versions
 */

import React, { useEffect, useState } from 'react';
import { useVersionStore, formatFileSize, formatRelativeTime } from '../stores/versionStore';
import { SnapshotDiff } from '../types';
import './VersionHistory.css';

interface VersionHistoryProps {
  projectId: string;
  localPath: string;
  onClose?: () => void;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  projectId,
  localPath,
  onClose,
}) => {
  const {
    snapshots,
    selectedSnapshot,
    loading,
    error,
    loadSnapshots,
    createSnapshot,
    getSnapshotDetails,
    restoreVersion,
    compareSnapshots,
    clearError,
  } = useVersionStore();

  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<string | null>(null);
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [snapshotMessage, setSnapshotMessage] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoredFiles, setRestoredFiles] = useState<string[]>([]);

  const projectSnapshots = snapshots[projectId] || [];

  useEffect(() => {
    loadSnapshots(projectId);
  }, [projectId, loadSnapshots]);

  const handleSelectSnapshot = async (snapshotId: string) => {
    setSelectedSnapshotId(snapshotId);
    setCompareWith(null);
    setDiff(null);
    await getSnapshotDetails(projectId, snapshotId);
  };

  const handleCreateSnapshot = async () => {
    try {
      await createSnapshot(projectId, localPath, snapshotMessage || undefined);
      setShowCreateModal(false);
      setSnapshotMessage('');
    } catch (e) {
      // Error is already handled in store
    }
  };

  const handleCompare = async () => {
    if (selectedSnapshotId && compareWith) {
      const result = await compareSnapshots(projectId, selectedSnapshotId, compareWith);
      setDiff(result);
    }
  };

  const handleRestore = async () => {
    if (!selectedSnapshotId) return;

    setRestoring(true);
    try {
      const restored = await restoreVersion(projectId, selectedSnapshotId, localPath);
      setRestoredFiles(restored);
    } catch (e) {
      // Error is already handled in store
    } finally {
      setRestoring(false);
    }
  };

  const handleRestoreFile = async (filePath: string) => {
    if (!selectedSnapshotId) return;

    setRestoring(true);
    try {
      const restored = await restoreVersion(projectId, selectedSnapshotId, localPath, [filePath]);
      setRestoredFiles(restored);
    } catch (e) {
      // Error is already handled in store
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="version-history">
      <div className="version-history-header">
        <h3>Historique des versions</h3>
        <div className="header-actions">
          <button
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
            disabled={loading}
          >
            + Créer un snapshot
          </button>
          {onClose && (
            <button className="btn-secondary" onClick={onClose}>
              Fermer
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={clearError}>×</button>
        </div>
      )}

      {restoredFiles.length > 0 && (
        <div className="success-banner">
          <span>{restoredFiles.length} fichier(s) restauré(s)</span>
          <button onClick={() => setRestoredFiles([])}>×</button>
        </div>
      )}

      <div className="version-history-content">
        <div className="snapshots-list">
          <h4>Snapshots ({projectSnapshots.length})</h4>
          {loading && projectSnapshots.length === 0 ? (
            <div className="loading">Chargement...</div>
          ) : projectSnapshots.length === 0 ? (
            <div className="empty-state">
              <p>Aucun snapshot disponible</p>
              <p className="hint">
                Créez un snapshot avant chaque sync pour pouvoir revenir en arrière
              </p>
            </div>
          ) : (
            <ul>
              {projectSnapshots.map((snapshot) => (
                <li
                  key={snapshot.id}
                  className={selectedSnapshotId === snapshot.id ? 'selected' : ''}
                  onClick={() => handleSelectSnapshot(snapshot.id)}
                >
                  <div className="snapshot-info">
                    <span className="snapshot-date">
                      {formatRelativeTime(snapshot.timestamp)}
                    </span>
                    <span className="snapshot-files">
                      {snapshot.files_count} fichiers
                    </span>
                    <span className="snapshot-size">
                      {formatFileSize(snapshot.total_size)}
                    </span>
                  </div>
                  {snapshot.message && (
                    <div className="snapshot-message">{snapshot.message}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="snapshot-details">
          {selectedSnapshot ? (
            <>
              <div className="details-header">
                <h4>Détails du snapshot</h4>
                <div className="details-meta">
                  <span>{new Date(selectedSnapshot.timestamp).toLocaleString('fr-FR')}</span>
                  <span>{selectedSnapshot.files_count} fichiers</span>
                  <span>{formatFileSize(selectedSnapshot.total_size)}</span>
                </div>
              </div>

              <div className="details-actions">
                <button
                  className="btn-primary"
                  onClick={handleRestore}
                  disabled={restoring || !selectedSnapshot.files.some(f => f.backup_path)}
                >
                  {restoring ? 'Restauration...' : 'Restaurer tout'}
                </button>

                <div className="compare-section">
                  <select
                    value={compareWith || ''}
                    onChange={(e) => setCompareWith(e.target.value || null)}
                  >
                    <option value="">Comparer avec...</option>
                    {projectSnapshots
                      .filter((s) => s.id !== selectedSnapshotId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {formatRelativeTime(s.timestamp)}
                        </option>
                      ))}
                  </select>
                  <button
                    className="btn-secondary"
                    onClick={handleCompare}
                    disabled={!compareWith || loading}
                  >
                    Comparer
                  </button>
                </div>
              </div>

              {diff && (
                <div className="diff-results">
                  <h5>Différences</h5>
                  {diff.added.length > 0 && (
                    <div className="diff-section added">
                      <span className="diff-label">Ajoutés: {diff.added.length}</span>
                      <ul>
                        {diff.added.slice(0, 10).map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                        {diff.added.length > 10 && (
                          <li className="more">...et {diff.added.length - 10} autres</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {diff.modified.length > 0 && (
                    <div className="diff-section modified">
                      <span className="diff-label">Modifiés: {diff.modified.length}</span>
                      <ul>
                        {diff.modified.slice(0, 10).map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                        {diff.modified.length > 10 && (
                          <li className="more">...et {diff.modified.length - 10} autres</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {diff.deleted.length > 0 && (
                    <div className="diff-section deleted">
                      <span className="diff-label">Supprimés: {diff.deleted.length}</span>
                      <ul>
                        {diff.deleted.slice(0, 10).map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                        {diff.deleted.length > 10 && (
                          <li className="more">...et {diff.deleted.length - 10} autres</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="files-list">
                <h5>Fichiers ({selectedSnapshot.files.length})</h5>
                <ul>
                  {selectedSnapshot.files.slice(0, 50).map((file) => (
                    <li key={file.id} className="file-item">
                      <span className="file-path">{file.path}</span>
                      <span className="file-size">{formatFileSize(file.size)}</span>
                      {file.backup_path && (
                        <button
                          className="btn-restore-file"
                          onClick={() => handleRestoreFile(file.path)}
                          disabled={restoring}
                          title="Restaurer ce fichier"
                        >
                          ↩
                        </button>
                      )}
                    </li>
                  ))}
                  {selectedSnapshot.files.length > 50 && (
                    <li className="more">
                      ...et {selectedSnapshot.files.length - 50} autres fichiers
                    </li>
                  )}
                </ul>
              </div>
            </>
          ) : (
            <div className="empty-details">
              <p>Sélectionnez un snapshot pour voir les détails</p>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h4>Créer un snapshot</h4>
            <p>
              Un snapshot sauvegarde l'état actuel de vos fichiers locaux avant la synchronisation.
            </p>
            <div className="form-group">
              <label>Description (optionnel)</label>
              <input
                type="text"
                value={snapshotMessage}
                onChange={(e) => setSnapshotMessage(e.target.value)}
                placeholder="Ex: Avant mise en prod v2.0"
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                Annuler
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateSnapshot}
                disabled={loading}
              >
                {loading ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VersionHistory;
