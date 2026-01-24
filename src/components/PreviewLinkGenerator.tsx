/**
 * Preview Link Generator Component
 * Create and manage secure preview links for client sharing
 */

import React, { useState, useEffect } from 'react';
import { previewService, PreviewLink, PreviewLinkOptions } from '../services/previewService';
import './PreviewLinkGenerator.css';

interface PreviewLinkGeneratorProps {
  projectId: string;
  projectName: string;
  testUrl?: string;
  onClose?: () => void;
}

export const PreviewLinkGenerator: React.FC<PreviewLinkGeneratorProps> = ({
  projectId,
  projectName,
  testUrl,
  onClose,
}) => {
  const [links, setLinks] = useState<PreviewLink[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [expirationDays, setExpirationDays] = useState(7);
  const [usePassword, setUsePassword] = useState(true);
  const [customPassword, setCustomPassword] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadLinks();
  }, [projectId]);

  const loadLinks = () => {
    const projectLinks = previewService.getLinksForProject(projectId);
    setLinks(projectLinks);
  };

  const handleCreateLink = () => {
    if (!testUrl) {
      alert('Veuillez configurer une URL de test pour ce projet');
      return;
    }

    const options: PreviewLinkOptions = {
      expirationDays,
      passwordProtected: usePassword,
      password: customPassword || undefined,
      notes: notes || undefined,
    };

    previewService.createLink(projectId, projectName, testUrl, options);
    loadLinks();
    setShowForm(false);
    resetForm();
  };

  const resetForm = () => {
    setExpirationDays(7);
    setUsePassword(true);
    setCustomPassword('');
    setNotes('');
  };

  const handleDeleteLink = (linkId: string) => {
    if (confirm('Supprimer ce lien de prévisualisation ?')) {
      previewService.deleteLink(linkId);
      loadLinks();
    }
  };

  const handleDeactivateLink = (linkId: string) => {
    previewService.deactivateLink(linkId);
    loadLinks();
  };

  const handleExtendLink = (linkId: string) => {
    previewService.extendExpiration(linkId, 7);
    loadLinks();
  };

  const handleCopyLink = async (link: PreviewLink) => {
    await previewService.copyToClipboard(link);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyMessage = async (link: PreviewLink) => {
    const message = previewService.generateShareMessage(link);
    await navigator.clipboard.writeText(message);
    setCopiedId(`msg-${link.id}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Expiré';
    if (diffDays === 0) return 'Expire aujourd\'hui';
    if (diffDays === 1) return 'Expire demain';
    return `Expire dans ${diffDays} jours`;
  };

  const activeLinks = links.filter((l) => previewService.isValid(l));
  const expiredLinks = links.filter((l) => !previewService.isValid(l));

  return (
    <div className="preview-link-generator">
      <div className="preview-header">
        <div>
          <h3>Liens de prévisualisation</h3>
          <span className="project-name">{projectName}</span>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Nouveau lien
          </button>
          {onClose && (
            <button className="btn-secondary" onClick={onClose}>
              Fermer
            </button>
          )}
        </div>
      </div>

      {!testUrl && (
        <div className="warning-banner">
          <span>Configurez une URL de test dans les paramètres FTP pour générer des liens</span>
        </div>
      )}

      <div className="preview-content">
        {activeLinks.length > 0 && (
          <div className="links-section">
            <h4>Liens actifs ({activeLinks.length})</h4>
            <div className="links-list">
              {activeLinks.map((link) => (
                <LinkCard
                  key={link.id}
                  link={link}
                  copiedId={copiedId}
                  onCopy={() => handleCopyLink(link)}
                  onCopyMessage={() => handleCopyMessage(link)}
                  onExtend={() => handleExtendLink(link.id)}
                  onDeactivate={() => handleDeactivateLink(link.id)}
                  onDelete={() => handleDeleteLink(link.id)}
                  formatRelativeDate={formatRelativeDate}
                />
              ))}
            </div>
          </div>
        )}

        {activeLinks.length === 0 && links.length === 0 && (
          <div className="empty-state">
            <p>Aucun lien de prévisualisation</p>
            <p className="hint">
              Créez un lien sécurisé à partager avec vos clients pour leur permettre de
              prévisualiser le site
            </p>
          </div>
        )}

        {expiredLinks.length > 0 && (
          <div className="links-section expired-section">
            <h4>Liens expirés ({expiredLinks.length})</h4>
            <div className="links-list">
              {expiredLinks.slice(0, 5).map((link) => (
                <div key={link.id} className="link-card expired">
                  <div className="link-info">
                    <span className="link-url">{link.url}</span>
                    <span className="link-expired">Expiré le {formatDate(link.expiresAt)}</span>
                  </div>
                  <button
                    className="btn-icon danger"
                    onClick={() => handleDeleteLink(link.id)}
                    title="Supprimer"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h4>Nouveau lien de prévisualisation</h4>

            <div className="form-group">
              <label>URL de base</label>
              <input type="text" value={testUrl || ''} disabled />
            </div>

            <div className="form-group">
              <label>Expiration</label>
              <select
                value={expirationDays}
                onChange={(e) => setExpirationDays(parseInt(e.target.value))}
              >
                <option value={1}>1 jour</option>
                <option value={3}>3 jours</option>
                <option value={7}>7 jours</option>
                <option value={14}>14 jours</option>
                <option value={30}>30 jours</option>
                <option value={90}>90 jours</option>
              </select>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={usePassword}
                  onChange={(e) => setUsePassword(e.target.checked)}
                />
                Protéger par mot de passe
              </label>
            </div>

            {usePassword && (
              <div className="form-group">
                <label>Mot de passe (optionnel)</label>
                <input
                  type="text"
                  value={customPassword}
                  onChange={(e) => setCustomPassword(e.target.value)}
                  placeholder="Laisser vide pour génération automatique"
                />
              </div>
            )}

            <div className="form-group">
              <label>Notes (optionnel)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Pour validation page d'accueil"
              />
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>
                Annuler
              </button>
              <button className="btn-primary" onClick={handleCreateLink} disabled={!testUrl}>
                Créer le lien
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface LinkCardProps {
  link: PreviewLink;
  copiedId: string | null;
  onCopy: () => void;
  onCopyMessage: () => void;
  onExtend: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  formatRelativeDate: (date: string) => string;
}

const LinkCard: React.FC<LinkCardProps> = ({
  link,
  copiedId,
  onCopy,
  onCopyMessage,
  onExtend,
  onDeactivate,
  onDelete,
  formatRelativeDate,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="link-card">
      <div className="link-main">
        <div className="link-url-row">
          <span className="link-url">{link.url}</span>
          <button
            className={`btn-copy ${copiedId === link.id ? 'copied' : ''}`}
            onClick={onCopy}
            title="Copier le lien"
          >
            {copiedId === link.id ? '✓' : '📋'}
          </button>
        </div>

        {link.password && (
          <div className="link-password-row">
            <span className="password-label">Mot de passe:</span>
            <span className="password-value">
              {showPassword ? link.password : '••••••••'}
            </span>
            <button
              className="btn-show-password"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
        )}

        <div className="link-meta">
          <span className={`expiration ${previewService.isExpired(link) ? 'expired' : ''}`}>
            {formatRelativeDate(link.expiresAt)}
          </span>
          <span className="access-count">{link.accessCount} accès</span>
          {link.notes && <span className="link-notes">{link.notes}</span>}
        </div>
      </div>

      <div className="link-actions">
        <button
          className={`btn-action ${copiedId === `msg-${link.id}` ? 'copied' : ''}`}
          onClick={onCopyMessage}
          title="Copier le message de partage"
        >
          {copiedId === `msg-${link.id}` ? '✓' : '📨'}
        </button>
        <button className="btn-action" onClick={onExtend} title="Prolonger de 7 jours">
          +7j
        </button>
        <button className="btn-action warning" onClick={onDeactivate} title="Désactiver">
          ⏸
        </button>
        <button className="btn-action danger" onClick={onDelete} title="Supprimer">
          ×
        </button>
      </div>
    </div>
  );
};

export default PreviewLinkGenerator;
