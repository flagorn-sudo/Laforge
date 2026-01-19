/**
 * Project Detail Header Component
 * Contains back button, title, and action buttons
 */

import {
  ArrowLeft,
  Globe,
  RefreshCw,
  Loader,
  TestTube,
  Trash2,
  Save,
} from 'lucide-react';
import { Project } from '../../../types';
import { projectService } from '../../../services/projectService';
import { Button } from '../../../components/ui';

interface ProjectDetailHeaderProps {
  project: Project;
  currentSiteUrl?: string;
  testUrl?: string;
  hasChanges: boolean;
  canSync: boolean;
  syncing: boolean;
  saving: boolean;
  credentialsLoading: boolean;
  onBack: () => void;
  onSync?: () => void;
  onSave: () => void;
  onDelete?: () => void;
}

export function ProjectDetailHeader({
  project,
  currentSiteUrl,
  testUrl,
  hasChanges,
  canSync,
  syncing,
  saving,
  credentialsLoading,
  onBack,
  onSync,
  onSave,
  onDelete,
}: ProjectDetailHeaderProps) {
  return (
    <div className="detail-header">
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={20} />
      </button>
      <div className="detail-title">
        <h1>{project.client || project.name}</h1>
        {project.client && <span className="subtitle">{project.name}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {currentSiteUrl && (
          <Button
            variant="ghost"
            onClick={() => projectService.openInBrowser(currentSiteUrl)}
            title="Ouvrir le site actuel"
          >
            <Globe size={16} />
            Site
          </Button>
        )}
        {testUrl && (
          <Button
            variant="ghost"
            onClick={() => projectService.openInBrowser(testUrl)}
            title="Ouvrir l'URL de test"
            style={{ color: 'var(--success)' }}
          >
            <TestTube size={16} />
            Test
          </Button>
        )}
        {(currentSiteUrl || testUrl) && (
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
        )}
        {canSync && onSync && (
          <Button variant="primary" onClick={onSync} disabled={syncing}>
            {syncing ? <Loader size={16} className="spinner" /> : <RefreshCw size={16} />}
            Synchroniser
          </Button>
        )}
        {hasChanges && (
          <Button
            variant="secondary"
            onClick={onSave}
            disabled={saving || credentialsLoading}
          >
            {saving ? <Loader size={16} className="spinner" /> : <Save size={16} />}
            {credentialsLoading ? 'Chargement...' : 'Enregistrer'}
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            onClick={onDelete}
            style={{ color: 'var(--error)' }}
          >
            <Trash2 size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}
