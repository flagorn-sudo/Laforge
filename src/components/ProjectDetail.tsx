import { useState } from 'react';
import { ArrowLeft, Folder, Globe, ExternalLink, Edit2, RefreshCw, Loader, TestTube } from 'lucide-react';
import { Project, PROJECT_STATUS_CONFIG } from '../types';
import { projectService } from '../services/projectService';
import { sftpService } from '../services/sftpService';
import { Button, Card } from './ui';
import { ProjectForm, ProjectFormData } from './ProjectForm';

interface ProjectDetailProps {
  project: Project;
  workspacePath: string;
  geminiApiKey?: string;
  onBack: () => void;
  onUpdate: (project: Project) => void;
  onSync?: (project: Project) => Promise<void>;
}

export function ProjectDetail({ project, workspacePath, geminiApiKey, onBack, onUpdate, onSync }: ProjectDetailProps) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSave = async (data: ProjectFormData) => {
    const hasSftp = data.sftp.host && data.sftp.username;

    const updated: Project = {
      ...project,
      client: data.client || undefined,
      urls: {
        ...project.urls,
        currentSite: data.currentSiteUrl || undefined,
        testUrl: data.testUrl || undefined,
        // Keep production for legacy but also set currentSite
        production: data.currentSiteUrl || undefined,
      },
      sftp: hasSftp
        ? {
            configured: true,
            host: data.sftp.host,
            username: data.sftp.username,
            port: data.sftp.port || 21,
            remotePath: data.sftp.remotePath || '/public_html',
            passive: data.sftp.passive ?? true,
            protocol: data.sftp.protocol || 'ftp',
            acceptInvalidCerts: data.sftp.acceptInvalidCerts ?? false,
            lastSync: project.sftp.lastSync,
          }
        : project.sftp,
      localPath: data.localPath || 'www',
      referenceWebsites: data.referenceWebsites || [],
      updated: new Date().toISOString(),
    };

    // Save password to keychain if requested
    if (data.savePassword && data.sftp.password) {
      await sftpService.saveCredentials(project.id, data.sftp.password);
    }

    await projectService.saveProject(updated);
    onUpdate(updated);
    setShowEditModal(false);
  };

  const handleSync = async () => {
    if (!onSync || syncing) return;
    setSyncing(true);
    try {
      await onSync(project);
    } finally {
      setSyncing(false);
    }
  };

  const statusConfig = PROJECT_STATUS_CONFIG[project.status];

  // Use currentSite if available, fallback to production for legacy
  const currentSiteUrl = project.urls.currentSite || project.urls.production;

  return (
    <div>
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <div className="detail-title">
          <h1>{project.client || project.name}</h1>
          {project.client && <span className="subtitle">{project.name}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {project.sftp.configured && onSync && (
            <Button variant="primary" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader size={16} className="spinner" /> : <RefreshCw size={16} />}
              Synchroniser
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowEditModal(true)}>
            <Edit2 size={16} />
            Modifier
          </Button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          <Card title="Informations">
            <div className="card-info">
              <div className="info-row">
                <strong>Dossier:</strong>
                <span>{project.path}</span>
              </div>
              {project.client && (
                <div className="info-row">
                  <strong>Client:</strong>
                  <span>{project.client}</span>
                </div>
              )}
              <div className="info-row">
                <strong>Statut:</strong>
                <span
                  className="status-badge"
                  style={{ background: `${statusConfig.color}20`, color: statusConfig.color }}
                >
                  {statusConfig.label}
                </span>
              </div>
              <div className="info-row">
                <strong>Créé le:</strong>
                <span>{new Date(project.created).toLocaleDateString('fr-FR')}</span>
              </div>
              {project.localPath && (
                <div className="info-row">
                  <strong>Dossier local:</strong>
                  <span>{project.localPath}</span>
                </div>
              )}
            </div>
          </Card>

          {project.sftp.configured && (
            <Card title="Configuration FTP">
              <div className="card-info">
                <div className="info-row">
                  <strong>Protocole:</strong>
                  <span style={{ textTransform: 'uppercase' }}>{project.sftp.protocol || 'FTP'}</span>
                </div>
                <div className="info-row">
                  <strong>Hôte:</strong>
                  <span>{project.sftp.host}</span>
                </div>
                <div className="info-row">
                  <strong>Utilisateur:</strong>
                  <span>{project.sftp.username}</span>
                </div>
                <div className="info-row">
                  <strong>Port:</strong>
                  <span>{project.sftp.port || 21}</span>
                </div>
                {project.sftp.protocol !== 'sftp' && (
                  <div className="info-row">
                    <strong>Mode:</strong>
                    <span>{project.sftp.passive !== false ? 'Passif' : 'Actif'}</span>
                  </div>
                )}
                <div className="info-row">
                  <strong>Chemin distant:</strong>
                  <span>{project.sftp.remotePath || '/public_html'}</span>
                </div>
                {project.sftp.acceptInvalidCerts && (
                  <div className="info-row">
                    <strong>SSL:</strong>
                    <span style={{ color: 'var(--warning)' }}>Certificats non vérifiés acceptés</span>
                  </div>
                )}
                {project.sftp.lastSync && (
                  <div className="info-row">
                    <strong>Dernière sync:</strong>
                    <span>{new Date(project.sftp.lastSync).toLocaleString('fr-FR')}</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Reference Websites Card */}
          {project.referenceWebsites && project.referenceWebsites.length > 0 && (
            <Card title="Sites de référence graphique">
              <div className="card-info">
                {project.referenceWebsites.map((ref, index) => (
                  <div key={index} className="info-row">
                    <Globe size={14} />
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent-blue)' }}
                    >
                      {ref.name || ref.url}
                      <ExternalLink size={12} style={{ marginLeft: 4 }} />
                    </a>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {project.notes && (
            <Card title="Notes">
              <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                {project.notes}
              </p>
            </Card>
          )}
        </div>

        <div className="detail-sidebar">
          <Card title="Actions rapides">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button
                variant="secondary"
                onClick={() => projectService.openInFinder(project.path)}
                style={{ justifyContent: 'flex-start' }}
              >
                <Folder size={16} />
                Ouvrir dans Finder
              </Button>
              {currentSiteUrl && (
                <Button
                  variant="secondary"
                  onClick={() => projectService.openInBrowser(currentSiteUrl)}
                  style={{ justifyContent: 'flex-start' }}
                >
                  <Globe size={16} />
                  Site actuel
                </Button>
              )}
              {project.urls.testUrl && (
                <Button
                  variant="secondary"
                  onClick={() => projectService.openInBrowser(project.urls.testUrl!)}
                  style={{ justifyContent: 'flex-start' }}
                >
                  <TestTube size={16} />
                  URL de test
                </Button>
              )}
            </div>
          </Card>

          {/* URLs Card */}
          {(currentSiteUrl || project.urls.testUrl || project.urls.staging) && (
            <Card title="URLs">
              <div className="card-info">
                {currentSiteUrl && (
                  <div className="info-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Site actuel</span>
                    <a
                      href={currentSiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center' }}
                    >
                      <Globe size={14} style={{ marginRight: 6 }} />
                      {currentSiteUrl}
                      <ExternalLink size={12} style={{ marginLeft: 4 }} />
                    </a>
                  </div>
                )}
                {project.urls.testUrl && (
                  <div className="info-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginTop: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>URL de test</span>
                    <a
                      href={project.urls.testUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--success)', display: 'flex', alignItems: 'center' }}
                    >
                      <TestTube size={14} style={{ marginRight: 6 }} />
                      {project.urls.testUrl}
                      <ExternalLink size={12} style={{ marginLeft: 4 }} />
                    </a>
                  </div>
                )}
                {project.urls.staging && (
                  <div className="info-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginTop: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Staging</span>
                    <a
                      href={project.urls.staging}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent-yellow)', display: 'flex', alignItems: 'center' }}
                    >
                      <Globe size={14} style={{ marginRight: 6 }} />
                      {project.urls.staging}
                      <ExternalLink size={12} style={{ marginLeft: 4 }} />
                    </a>
                  </div>
                )}
              </div>
            </Card>
          )}

          {project.colors.length > 0 && (
            <Card title="Couleurs">
              <div className="color-swatches">
                {project.colors.map((color, i) => (
                  <div
                    key={i}
                    className="color-swatch"
                    style={{ background: color }}
                    title={color}
                  />
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {showEditModal && (
        <ProjectForm
          mode="edit"
          project={project}
          workspacePath={workspacePath}
          geminiApiKey={geminiApiKey}
          onSave={handleSave}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
}
