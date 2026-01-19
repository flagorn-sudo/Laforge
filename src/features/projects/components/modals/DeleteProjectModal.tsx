/**
 * Delete Project Confirmation Modal
 */

import { AlertTriangle, Loader } from 'lucide-react';
import { Modal, Button } from '../../../../components/ui';

interface DeleteProjectModalProps {
  projectName: string;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}

export function DeleteProjectModal({
  projectName,
  onClose,
  onConfirm,
  deleting,
}: DeleteProjectModalProps) {
  return (
    <Modal
      onClose={onClose}
      title="Supprimer le projet"
    >
      <div className="delete-modal-content">
        <div className="delete-warning">
          <AlertTriangle size={48} />
          <p>
            Êtes-vous sûr de vouloir supprimer le projet{' '}
            <strong>{projectName}</strong> ?
          </p>
          <p className="delete-subtext">
            Cette action supprimera tous les fichiers du projet et ne peut pas être annulée.
          </p>
        </div>
        <div className="delete-modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={deleting}
            style={{ background: 'var(--error)' }}
          >
            {deleting ? (
              <>
                <Loader size={16} className="spinner" />
                Suppression...
              </>
            ) : (
              'Supprimer définitivement'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
