import { useState } from 'react';
import { Plus, Loader } from 'lucide-react';
import { ReferenceWebsite } from '../types';
import { Modal, Button } from './ui';

export interface ProjectFormData {
  name: string;
  client?: string;
  currentSiteUrl?: string;
  testUrl?: string;
  localPath?: string;
  referenceWebsites: ReferenceWebsite[];
  sftp: {
    configured: boolean;
    host?: string;
    username?: string;
    password?: string;
    port?: number;
    remotePath?: string;
    passive?: boolean;
    protocol?: 'sftp' | 'ftp' | 'ftps';
    acceptInvalidCerts?: boolean;
  };
  savePassword: boolean;
}

interface ProjectFormProps {
  mode: 'create' | 'edit';
  workspacePath: string;
  geminiApiKey?: string;
  geminiModel?: string;
  onSave: (data: ProjectFormData) => Promise<void>;
  onClose: () => void;
}

export function ProjectForm({
  mode,
  workspacePath,
  onSave,
  onClose,
}: ProjectFormProps) {
  const [name, setName] = useState('');
  const [currentSiteUrl, setCurrentSiteUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Le nom du dossier est requis');
      return;
    }

    if (mode === 'create' && !workspacePath) {
      setError("Configurez d'abord le dossier de travail dans les paramètres");
      return;
    }

    // Validate URL if provided
    if (currentSiteUrl.trim()) {
      try {
        new URL(currentSiteUrl.trim());
      } catch {
        setError('URL invalide');
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const formData: ProjectFormData = {
        name: name.trim(),
        client: name.trim(), // Nom dossier = nom client par défaut
        currentSiteUrl: currentSiteUrl.trim() || undefined,
        localPath: 'www',
        referenceWebsites: [],
        sftp: { configured: false },
        savePassword: false,
      };
      await onSave(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création");
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Nouveau projet"
      onClose={onClose}
      className="project-form-modal project-form-modal-simple"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !name.trim()}>
            {loading ? (
              <>
                <Loader size={16} className="spinner" />
                Création...
              </>
            ) : (
              <>
                <Plus size={16} />
                Créer le projet
              </>
            )}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        {/* Nom du dossier / client */}
        <div className="form-field">
          <label className="form-label">Nom du dossier / client *</label>
          <input
            type="text"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: MonClient"
            required
            autoFocus
          />
          <span className="form-hint">
            Ce nom sera utilisé pour le dossier et comme nom du client
          </span>
        </div>

        {/* URL site d'origine */}
        <div className="form-field">
          <label className="form-label">URL du site d'origine</label>
          <input
            type="url"
            className="form-input"
            value={currentSiteUrl}
            onChange={(e) => setCurrentSiteUrl(e.target.value)}
            placeholder="https://www.exemple.com"
          />
          <span className="form-hint">
            Optionnel — peut être ajouté plus tard dans la fiche projet
          </span>
        </div>

        {error && (
          <p className="form-error">{error}</p>
        )}
      </form>
    </Modal>
  );
}
