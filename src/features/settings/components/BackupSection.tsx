import { useState } from 'react';
import { Download, Upload, Shield } from 'lucide-react';
import { Button } from '../../../components/ui';
import { exportBackup, importBackup, applyBackupData, BackupData } from '../../../services/backupService';
import { Settings, Project } from '../../../types';

interface BackupSectionProps {
  settings: Partial<Settings>;
  projects: Project[];
  onSettingsUpdate: (settings: Partial<Settings>) => void;
  onProjectsRefresh: () => void;
  onNotification: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void;
}

export function BackupSection({
  settings,
  projects,
  onSettingsUpdate,
  onProjectsRefresh,
  onNotification,
}: BackupSectionProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<BackupData | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportBackup(settings, projects);
      if (result.success) {
        onNotification('success', `Sauvegarde exportée vers ${result.filePath}`);
      } else {
        onNotification('error', result.error || 'Erreur lors de l\'export');
      }
    } catch (error) {
      onNotification('error', error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const result = await importBackup();
      if (result.success && result.data) {
        setImportPreview(result.data);
      } else if (result.error !== 'Import annulé') {
        onNotification('error', result.error || 'Erreur lors de l\'import');
      }
    } catch (error) {
      onNotification('error', error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;

    try {
      const result = await applyBackupData(importPreview, onSettingsUpdate);

      if (result.settingsRestored) {
        onNotification('success', `Restauration terminée: ${result.projectsRestored} projet(s) restauré(s)`);
      } else {
        onNotification('warning', `Restauration partielle: ${result.errors.join(', ')}`);
      }

      // Refresh projects list after import
      onProjectsRefresh();
      setImportPreview(null);
    } catch (error) {
      onNotification('error', error instanceof Error ? error.message : 'Erreur lors de la restauration');
    }
  };

  const handleCancelImport = () => {
    setImportPreview(null);
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Sauvegarde et restauration</h3>

      <div className="backup-section">
        <p className="settings-hint">
          Exportez vos paramètres et configurations de projets dans un fichier .fg pour les sauvegarder ou les transférer.
        </p>

        <div className="backup-actions">
          <Button onClick={handleExport} disabled={isExporting}>
            <Download size={16} />
            {isExporting ? 'Export en cours...' : 'Exporter (.fg)'}
          </Button>
          <Button onClick={handleImport} disabled={isImporting} className="btn-secondary">
            <Upload size={16} />
            {isImporting ? 'Import en cours...' : 'Importer'}
          </Button>
        </div>

        <div className="backup-info-box">
          <Shield size={16} />
          <span>
            Le fichier .fg contient toutes vos données, y compris les mots de passe FTP et la clé API Gemini. Conservez-le en lieu sûr.
          </span>
        </div>

        {importPreview && (
          <div className="import-preview">
            <h4>Aperçu de l'import</h4>
            <p>
              <strong>Date d'export:</strong>{' '}
              {new Date(importPreview.exportedAt).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            <p>
              <strong>Workspace:</strong> {importPreview.settings.workspacePath || 'Non défini'}
            </p>
            <p>
              <strong>Projets:</strong> {importPreview.projects.length} projet(s)
            </p>

            <div className="import-preview-actions">
              <Button onClick={handleConfirmImport}>
                Confirmer l'import
              </Button>
              <Button onClick={handleCancelImport} className="btn-secondary">
                Annuler
              </Button>
            </div>
          </div>
        )}

        <p className="backup-info">
          La sauvegarde contient : chemin du workspace, modèle Gemini, structure des dossiers, paramètres d'organisation automatique, et configurations des projets (URLs, FTP sans mot de passe, couleurs, polices...).
        </p>
      </div>
    </div>
  );
}
