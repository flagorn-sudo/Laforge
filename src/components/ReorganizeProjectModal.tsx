import { useState, useEffect } from 'react';
import { Loader, Folder, ArrowRight, CheckCircle, FolderSync, Trash2 } from 'lucide-react';
import { Project } from '../types';
import { projectReorganizeService, ReorganizeProposal } from '../services/projectReorganizeService';
import { fileSystemService } from '../services/fileSystemService';
import { Modal, Button } from './ui';
import { useUIStore } from '../stores';

interface ReorganizeProjectModalProps {
  project: Project;
  onClose: () => void;
  onComplete: () => void;
}

export function ReorganizeProjectModal({
  project,
  onClose,
  onComplete,
}: ReorganizeProjectModalProps) {
  const [analyzing, setAnalyzing] = useState(true);
  const [proposal, setProposal] = useState<ReorganizeProposal | null>(null);
  const [executing, setExecuting] = useState(false);
  const [selectedMoves, setSelectedMoves] = useState<Set<number>>(new Set());
  const { addNotification } = useUIStore();

  useEffect(() => {
    analyzeProject();
  }, []);

  const analyzeProject = async () => {
    setAnalyzing(true);
    try {
      const result = await projectReorganizeService.analyzeProject(project.path);
      setProposal(result);
      // Select all moves by default
      setSelectedMoves(new Set(result.filesToMove.map((_, i) => i)));
    } catch (error) {
      console.error('Analysis failed:', error);
      addNotification('error', 'Erreur lors de l\'analyse du projet');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExecute = async () => {
    if (!proposal) return;
    setExecuting(true);

    try {
      // Filter only selected moves
      const filteredProposal: ReorganizeProposal = {
        ...proposal,
        filesToMove: proposal.filesToMove.filter((_, i) => selectedMoves.has(i)),
      };

      const result = await projectReorganizeService.executeReorganization(
        project.path,
        filteredProposal
      );

      if (result.success) {
        const messages: string[] = [];
        if (result.foldersCreated > 0) {
          messages.push(`${result.foldersCreated} dossier${result.foldersCreated > 1 ? 's' : ''} créé${result.foldersCreated > 1 ? 's' : ''}`);
        }
        if (result.movedCount > 0) {
          messages.push(`${result.movedCount} fichier${result.movedCount > 1 ? 's' : ''} déplacé${result.movedCount > 1 ? 's' : ''}`);
        }
        if (result.foldersDeleted > 0) {
          messages.push(`${result.foldersDeleted} dossier${result.foldersDeleted > 1 ? 's' : ''} vide${result.foldersDeleted > 1 ? 's' : ''} supprimé${result.foldersDeleted > 1 ? 's' : ''}`);
        }
        addNotification('success', `Réorganisation terminée : ${messages.join(', ')}`);
        onComplete();
      } else {
        addNotification('warning', `Réorganisation partielle : ${result.errors.slice(0, 3).join(', ')}`);
        onComplete();
      }
    } catch (error) {
      console.error('Reorganization failed:', error);
      addNotification('error', 'Erreur lors de la réorganisation');
    } finally {
      setExecuting(false);
    }
  };

  const toggleMove = (index: number) => {
    const newSet = new Set(selectedMoves);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedMoves(newSet);
  };

  const selectAll = () => {
    if (!proposal) return;
    setSelectedMoves(new Set(proposal.filesToMove.map((_, i) => i)));
  };

  const deselectAll = () => {
    setSelectedMoves(new Set());
  };

  const isProjectOrganized = proposal &&
    proposal.foldersToCreate.length === 0 &&
    proposal.filesToMove.length === 0 &&
    proposal.emptyFoldersToDelete.length === 0;

  return (
    <Modal
      title="Réorganiser le projet"
      onClose={onClose}
      className="reorganize-modal"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={executing}>
            {isProjectOrganized ? 'Fermer' : 'Annuler'}
          </Button>
          {!isProjectOrganized && proposal && (proposal.foldersToCreate.length > 0 || selectedMoves.size > 0 || proposal.emptyFoldersToDelete.length > 0) && (
            <Button onClick={handleExecute} disabled={executing}>
              {executing ? (
                <>
                  <Loader size={16} className="spinner" />
                  Réorganisation...
                </>
              ) : (
                <>
                  <FolderSync size={16} />
                  Réorganiser
                </>
              )}
            </Button>
          )}
        </>
      }
    >
      {analyzing ? (
        <div className="reorganize-loading">
          <Loader size={32} className="spinner" />
          <p>Analyse du projet en cours...</p>
        </div>
      ) : proposal ? (
        <div className="reorganize-content">
          {/* Project already organized */}
          {isProjectOrganized && (
            <div className="reorganize-complete">
              <CheckCircle size={48} />
              <p>Ce projet est déjà bien organisé !</p>
              <span className="reorganize-hint">
                Tous les dossiers de la structure standard existent et aucun fichier n'a besoin d'être déplacé.
              </span>
            </div>
          )}

          {/* Folders to create */}
          {proposal.foldersToCreate.length > 0 && (
            <div className="reorganize-section">
              <h4>Dossiers à créer ({proposal.foldersToCreate.length})</h4>
              <ul className="folders-list">
                {proposal.foldersToCreate.map((f) => (
                  <li key={f}>
                    <Folder size={14} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Files to move */}
          {proposal.filesToMove.length > 0 && (
            <div className="reorganize-section">
              <div className="section-header">
                <h4>Fichiers à déplacer ({selectedMoves.size}/{proposal.filesToMove.length})</h4>
                <div className="section-actions">
                  <button onClick={selectAll}>Tout</button>
                  <button onClick={deselectAll}>Aucun</button>
                </div>
              </div>
              <div className="file-moves-list">
                {proposal.filesToMove.map((move, i) => (
                  <label key={i} className="file-move-item">
                    <input
                      type="checkbox"
                      checked={selectedMoves.has(i)}
                      onChange={() => toggleMove(i)}
                    />
                    <span className="file-name">
                      {fileSystemService.getName(move.source)}
                    </span>
                    <ArrowRight size={12} className="arrow-icon" />
                    <span className="file-dest">
                      {move.destination.replace(project.path + '/', '')}
                    </span>
                    <span className="file-reason">({move.reason})</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Unmapped files */}
          {proposal.filesUnmapped.length > 0 && (
            <div className="reorganize-section">
              <h4>Fichiers non classés ({proposal.filesUnmapped.length})</h4>
              <p className="reorganize-hint">
                Ces fichiers resteront à leur emplacement actuel.
              </p>
              <ul className="unmapped-list">
                {proposal.filesUnmapped.slice(0, 10).map((f) => (
                  <li key={f}>{f}</li>
                ))}
                {proposal.filesUnmapped.length > 10 && (
                  <li className="more-items">
                    ... et {proposal.filesUnmapped.length - 10} autres
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Empty folders to delete */}
          {proposal.emptyFoldersToDelete.length > 0 && (
            <div className="reorganize-section">
              <h4>
                <Trash2 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Dossiers vides à supprimer ({proposal.emptyFoldersToDelete.length})
              </h4>
              <p className="reorganize-hint">
                Ces dossiers ne font pas partie de la structure standard et sont vides.
              </p>
              <ul className="folders-list folders-delete">
                {proposal.emptyFoldersToDelete.slice(0, 15).map((f) => (
                  <li key={f}>
                    <Folder size={14} />
                    {f}
                  </li>
                ))}
                {proposal.emptyFoldersToDelete.length > 15 && (
                  <li className="more-items">
                    ... et {proposal.emptyFoldersToDelete.length - 15} autres
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
