import { useState, useEffect } from 'react';
import { Loader, TestTube, ChevronDown, Folder, Wand2, Plus, Trash2, FileDown, Globe, Check } from 'lucide-react';
import { Project, SFTPConfig as SFTPConfigType, FTPProtocol, ParsedFTPCredentials, ReferenceWebsite } from '../types';
import { sftpService } from '../services/sftpService';
import { geminiService } from '../services/geminiService';
import { Modal, Button, Input, Switch } from './ui';
import { SmartPaste } from './SmartPaste';

export interface ProjectFormData {
  name: string;
  client?: string;
  currentSiteUrl?: string;  // URL du site actuel (ancien site client)
  testUrl?: string;         // URL de test (prévisualisation)
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
    protocol?: FTPProtocol;
    acceptInvalidCerts?: boolean;
  };
  savePassword: boolean;
}

const PROTOCOL_CONFIG: Record<FTPProtocol, { label: string; defaultPort: number; description: string }> = {
  sftp: { label: 'SFTP', defaultPort: 22, description: 'SSH File Transfer (sécurisé)' },
  ftp: { label: 'FTP', defaultPort: 21, description: 'FTP standard' },
  ftps: { label: 'FTPS', defaultPort: 21, description: 'FTP sur SSL/TLS' },
};

const MAX_REFERENCE_WEBSITES = 5;

interface ProjectFormProps {
  mode: 'create' | 'edit';
  project?: Project;
  workspacePath: string;
  geminiApiKey?: string;
  onSave: (data: ProjectFormData) => Promise<void>;
  onClose: () => void;
}

export function ProjectForm({ mode, project, workspacePath, geminiApiKey, onSave, onClose }: ProjectFormProps) {
  const [form, setForm] = useState<ProjectFormData>({
    name: project?.name || '',
    client: project?.client || '',
    currentSiteUrl: project?.urls.currentSite || project?.urls.production || '',
    testUrl: project?.urls.testUrl || '',
    localPath: project?.localPath || 'www',
    referenceWebsites: project?.referenceWebsites || [],
    sftp: {
      configured: project?.sftp.configured || false,
      host: project?.sftp.host || '',
      username: project?.sftp.username || '',
      password: '',
      port: project?.sftp.port || 21,
      remotePath: project?.sftp.remotePath || '/public_html',
      passive: project?.sftp.passive ?? true,
      protocol: project?.sftp.protocol || 'ftp',
      acceptInvalidCerts: project?.sftp.acceptInvalidCerts ?? false,
    },
    savePassword: true,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [remoteFolders, setRemoteFolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [showFolderSelect, setShowFolderSelect] = useState(false);
  const [showSmartPaste, setShowSmartPaste] = useState(false);
  const [newReferenceUrl, setNewReferenceUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseSuccess, setParseSuccess] = useState(false);

  // Load saved password if editing
  useEffect(() => {
    if (mode === 'edit' && project?.id && project.sftp.configured) {
      sftpService.getCredentials(project.id).then((password) => {
        if (password) {
          setForm((prev) => ({
            ...prev,
            sftp: { ...prev.sftp, password },
          }));
        }
      });
    }
  }, [mode, project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Le nom du projet est requis');
      return;
    }
    if (mode === 'create' && !workspacePath) {
      setError("Configurez d'abord le dossier de travail dans les paramètres");
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Mark FTP as configured if we have at least host and username
      const formToSave = {
        ...form,
        sftp: {
          ...form.sftp,
          configured: !!(form.sftp.host && form.sftp.username),
        },
      };
      await onSave(formToSave);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'opération");
      setLoading(false);
    }
  };

  const getSftpConfig = (): SFTPConfigType => ({
    host: form.sftp.host || '',
    port: form.sftp.port || 21,
    username: form.sftp.username || '',
    password: form.sftp.password || '',
    remotePath: form.sftp.remotePath || '/public_html',
    passive: form.sftp.passive,
    protocol: form.sftp.protocol || 'ftp',
    acceptInvalidCerts: form.sftp.acceptInvalidCerts,
  });

  const handleProtocolChange = (protocol: FTPProtocol) => {
    const defaultPort = PROTOCOL_CONFIG[protocol].defaultPort;
    setForm({
      ...form,
      sftp: {
        ...form.sftp,
        protocol,
        port: defaultPort,
      },
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const config = getSftpConfig();
      const success = await sftpService.testConnection(config);
      setTestResult(success ? 'success' : 'error');

      // If connection successful, load remote folders
      if (success) {
        await loadRemoteFolders();
      }
    } catch {
      setTestResult('error');
    }
    setTesting(false);
  };

  const loadRemoteFolders = async () => {
    setLoadingFolders(true);
    try {
      const config = getSftpConfig();
      const folders = await sftpService.listRemoteFiles(config, '/');
      setRemoteFolders(folders.filter((f) => !f.includes('.')));
    } catch (err) {
      console.error('Failed to load remote folders:', err);
    }
    setLoadingFolders(false);
  };

  const handleSmartPaste = (credentials: ParsedFTPCredentials) => {
    setForm((prev) => ({
      ...prev,
      testUrl: credentials.testUrl || prev.testUrl,
      sftp: {
        ...prev.sftp,
        host: credentials.host || prev.sftp.host,
        username: credentials.username || prev.sftp.username,
        password: credentials.password || prev.sftp.password,
        port: credentials.port || prev.sftp.port,
        remotePath: credentials.path || prev.sftp.remotePath,
      },
    }));
    setShowSmartPaste(false);
    setTestResult(null); // Reset test result when credentials change
  };

  const handleInlinePaste = async () => {
    if (!pasteText.trim() || !geminiApiKey) return;

    setParsing(true);
    setParseSuccess(false);

    try {
      const credentials = await geminiService.parseFTPCredentials(pasteText, geminiApiKey);
      setForm((prev) => ({
        ...prev,
        testUrl: credentials.testUrl || prev.testUrl,
        sftp: {
          ...prev.sftp,
          host: credentials.host || prev.sftp.host,
          username: credentials.username || prev.sftp.username,
          password: credentials.password || prev.sftp.password,
          port: credentials.port || prev.sftp.port,
          remotePath: credentials.path || prev.sftp.remotePath,
        },
      }));
      setParseSuccess(true);
      setTestResult(null);
      // Clear after success
      setTimeout(() => {
        setPasteText('');
        setParseSuccess(false);
      }, 1500);
    } catch (err) {
      console.error('Parse error:', err);
    }

    setParsing(false);
  };

  const handleAddReferenceWebsite = () => {
    if (!newReferenceUrl.trim()) return;
    if (form.referenceWebsites.length >= MAX_REFERENCE_WEBSITES) return;

    // Basic URL validation
    let url = newReferenceUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const newRef: ReferenceWebsite = {
      url,
      addedAt: new Date().toISOString(),
    };

    setForm((prev) => ({
      ...prev,
      referenceWebsites: [...prev.referenceWebsites, newRef],
    }));
    setNewReferenceUrl('');
  };

  const handleRemoveReferenceWebsite = (index: number) => {
    setForm((prev) => ({
      ...prev,
      referenceWebsites: prev.referenceWebsites.filter((_, i) => i !== index),
    }));
  };

  const handleExportMarkdown = () => {
    const lines = [
      `# ${form.name}`,
      '',
      form.client ? `**Client:** ${form.client}` : '',
      '',
      '## Site actuel',
      form.currentSiteUrl ? `- ${form.currentSiteUrl}` : '_Non défini_',
      '',
      '## Sites de référence graphique',
    ];

    if (form.referenceWebsites.length > 0) {
      form.referenceWebsites.forEach((ref) => {
        lines.push(`- [${ref.name || ref.url}](${ref.url})`);
      });
    } else {
      lines.push('_Aucun site de référence_');
    }

    const content = lines.filter(Boolean).join('\n');
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${form.name || 'projet'}-references.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasFtpInfo = form.sftp.host || form.sftp.username;
  const isFtpValid = form.sftp.host && form.sftp.username && form.sftp.password;
  const title = mode === 'create' ? 'Nouveau projet' : `Modifier ${project?.name}`;
  const submitText = mode === 'create' ? 'Créer' : 'Enregistrer';

  return (
    <>
      <Modal
        title={title}
        onClose={onClose}
        className="project-form-modal"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={loading || !form.name.trim()}>
              {loading ? 'Enregistrement...' : submitText}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          {/* Section 1: Général */}
          <div className="form-section">
            <div className="form-section-title">Général</div>
            <Input
              label="Nom du projet *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="mon-projet"
              autoFocus
              disabled={mode === 'edit'}
              hint={mode === 'edit' ? 'Le nom ne peut pas être modifié' : 'Sera utilisé comme nom du dossier'}
            />
            <Input
              label="Client"
              value={form.client}
              onChange={(e) => setForm({ ...form, client: e.target.value })}
              placeholder="Nom du client"
            />
          </div>

          {/* Section 2: Scrubbing */}
          <div className="form-section">
            <div className="form-section-title">Scrubbing</div>
            <Input
              label="Site actuel (ancien site client)"
              value={form.currentSiteUrl}
              onChange={(e) => setForm({ ...form, currentSiteUrl: e.target.value })}
              placeholder="https://old-site.com"
            />

            {/* Reference Websites */}
            <div className="form-field" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  Sites de référence graphique ({form.referenceWebsites.length}/{MAX_REFERENCE_WEBSITES})
                </label>
              </div>

              {form.referenceWebsites.length > 0 && (
                <div className="reference-websites-list">
                  {form.referenceWebsites.map((ref, index) => (
                    <div key={index} className="reference-website-item">
                      <Globe size={14} className="reference-icon" />
                      <span className="reference-url">{ref.url}</span>
                      <button
                        type="button"
                        className="reference-remove"
                        onClick={() => handleRemoveReferenceWebsite(index)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {form.referenceWebsites.length < MAX_REFERENCE_WEBSITES && (
                <div className="reference-add-row">
                  <Input
                    value={newReferenceUrl}
                    onChange={(e) => setNewReferenceUrl(e.target.value)}
                    placeholder="https://reference-site.com"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddReferenceWebsite();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddReferenceWebsite}
                    disabled={!newReferenceUrl.trim()}
                    style={{ flexShrink: 0 }}
                  >
                    <Plus size={16} />
                  </Button>
                </div>
              )}

              <Button
                type="button"
                variant="ghost"
                onClick={handleExportMarkdown}
                style={{ marginTop: 12, fontSize: 13 }}
              >
                <FileDown size={14} />
                Exporter en Markdown
              </Button>
            </div>
          </div>

          {/* Section 3: FTP */}
          <div className="form-section">
            <div className="form-section-title">FTP</div>

            <div className="form-field">
              <label className="form-label">Type de connexion</label>
              <div className="protocol-select">
                {(Object.keys(PROTOCOL_CONFIG) as FTPProtocol[]).map((protocol) => (
                  <button
                    key={protocol}
                    type="button"
                    className={`protocol-option ${form.sftp.protocol === protocol ? 'active' : ''}`}
                    onClick={() => handleProtocolChange(protocol)}
                  >
                    <span className="protocol-label">{PROTOCOL_CONFIG[protocol].label}</span>
                    <span className="protocol-desc">{PROTOCOL_CONFIG[protocol].description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Inline Smart Paste */}
            {geminiApiKey && (
              <div className="form-field smart-paste-inline">
                <label className="form-label">
                  <Wand2 size={14} style={{ marginRight: 6 }} />
                  Coller les identifiants FTP
                </label>
                <div className="smart-paste-row">
                  <textarea
                    className="form-input smart-paste-textarea"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="Collez ici un email ou texte contenant les identifiants FTP..."
                    rows={3}
                  />
                  <Button
                    type="button"
                    variant={parseSuccess ? 'primary' : 'secondary'}
                    onClick={handleInlinePaste}
                    disabled={!pasteText.trim() || parsing}
                    className="smart-paste-btn"
                  >
                    {parsing ? (
                      <Loader className="spinner" size={16} />
                    ) : parseSuccess ? (
                      <Check size={16} />
                    ) : (
                      <Wand2 size={16} />
                    )}
                  </Button>
                </div>
                <p className="form-hint">L'IA va extraire automatiquement hôte, utilisateur, mot de passe, port et URL de test</p>
              </div>
            )}

            <Input
              label="Hôte"
              value={form.sftp.host}
              onChange={(e) =>
                setForm({ ...form, sftp: { ...form.sftp, host: e.target.value } })
              }
              placeholder="ftp.example.com"
            />
            <div className="form-row">
              <Input
                label="Utilisateur"
                value={form.sftp.username}
                onChange={(e) =>
                  setForm({ ...form, sftp: { ...form.sftp, username: e.target.value } })
                }
                placeholder="username"
              />
              <Input
                label="Port"
                type="number"
                value={form.sftp.port}
                onChange={(e) =>
                  setForm({
                    ...form,
                    sftp: { ...form.sftp, port: parseInt(e.target.value) || 21 },
                  })
                }
                style={{ width: 100 }}
              />
            </div>
            <Input
              label="Mot de passe"
              type="password"
              value={form.sftp.password}
              onChange={(e) =>
                setForm({ ...form, sftp: { ...form.sftp, password: e.target.value } })
              }
              placeholder="••••••••"
            />

            {/* Mode passif/actif uniquement pour FTP et FTPS */}
            {form.sftp.protocol !== 'sftp' && (
              <div className="form-field">
                <label className="form-label">Mode connexion</label>
                <div className="connection-mode-toggle">
                  <button
                    type="button"
                    className={`mode-option ${form.sftp.passive ? 'active' : ''}`}
                    onClick={() =>
                      setForm({ ...form, sftp: { ...form.sftp, passive: true } })
                    }
                  >
                    Passif
                  </button>
                  <button
                    type="button"
                    className={`mode-option ${!form.sftp.passive ? 'active' : ''}`}
                    onClick={() =>
                      setForm({ ...form, sftp: { ...form.sftp, passive: false } })
                    }
                  >
                    Actif
                  </button>
                </div>
              </div>
            )}

            {/* Option certificat SSL pour FTPS et SFTP */}
            {(form.sftp.protocol === 'ftps' || form.sftp.protocol === 'sftp') && (
              <div style={{ marginTop: 12 }}>
                <Switch
                  label="Accepter les certificats non vérifiés"
                  checked={form.sftp.acceptInvalidCerts || false}
                  onChange={(checked) =>
                    setForm({ ...form, sftp: { ...form.sftp, acceptInvalidCerts: checked } })
                  }
                />
                <p className="form-hint" style={{ marginTop: 4 }}>
                  Utile pour les certificats auto-signés
                </p>
              </div>
            )}

            <Button
              type="button"
              variant="secondary"
              onClick={handleTestConnection}
              disabled={!isFtpValid || testing}
              style={{ marginTop: 8 }}
            >
              {testing ? <Loader className="spinner" size={16} /> : <TestTube size={16} />}
              Tester la connexion
            </Button>

            {testResult && (
              <div className={`test-result ${testResult}`}>
                {testResult === 'success'
                  ? 'Connexion réussie !'
                  : 'Échec de la connexion. Les paramètres seront quand même sauvegardés.'}
              </div>
            )}

            {/* Synchronisation sub-section */}
            {hasFtpInfo && (
              <div className="form-subsection">
                <div className="form-subsection-title">Synchronisation</div>
                <Input
                  label="Dossier local"
                  value={form.localPath}
                  onChange={(e) => setForm({ ...form, localPath: e.target.value })}
                  placeholder="www"
                  hint="Relatif à la racine du projet"
                />

                <div className="form-field">
                  <label className="form-label">Dossier distant</label>
                  {testResult === 'success' && remoteFolders.length > 0 ? (
                    <div className="folder-select-wrapper">
                      <button
                        type="button"
                        className="folder-select-btn"
                        onClick={() => setShowFolderSelect(!showFolderSelect)}
                        disabled={loadingFolders}
                      >
                        <Folder size={16} />
                        <span>{form.sftp.remotePath || '/public_html'}</span>
                        {loadingFolders ? (
                          <Loader className="spinner" size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </button>
                      {showFolderSelect && (
                        <div className="folder-dropdown">
                          {remoteFolders.map((folder) => (
                            <button
                              key={folder}
                              type="button"
                              className="folder-option"
                              onClick={() => {
                                setForm({
                                  ...form,
                                  sftp: { ...form.sftp, remotePath: `/${folder}` },
                                });
                                setShowFolderSelect(false);
                              }}
                            >
                              /{folder}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <Input
                      value={form.sftp.remotePath}
                      onChange={(e) =>
                        setForm({ ...form, sftp: { ...form.sftp, remotePath: e.target.value } })
                      }
                      placeholder="/public_html"
                      hint={testResult !== 'success' ? "Testez la connexion pour voir les dossiers disponibles" : undefined}
                    />
                  )}
                </div>

                <Input
                  label="URL de test"
                  value={form.testUrl}
                  onChange={(e) => setForm({ ...form, testUrl: e.target.value })}
                  placeholder="https://test.example.com"
                  hint="URL de prévisualisation du nouveau site"
                />

                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <Switch
                    label="Sauvegarder le mot de passe dans le Keychain"
                    checked={form.savePassword}
                    onChange={(checked) => setForm({ ...form, savePassword: checked })}
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <p style={{ color: 'var(--error)', fontSize: 14, marginTop: 16 }}>{error}</p>
          )}
        </form>
      </Modal>

      {showSmartPaste && geminiApiKey && (
        <SmartPaste
          apiKey={geminiApiKey}
          onCredentialsParsed={handleSmartPaste}
          onClose={() => setShowSmartPaste(false)}
        />
      )}
    </>
  );
}
