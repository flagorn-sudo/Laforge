import { useState } from 'react';
import { Loader, TestTube, ChevronDown, Folder, Wand2, Check, AlertCircle, X } from 'lucide-react';
import { FTPProtocol } from '../../../types';
import { Input, Button, Switch } from '../../../components/ui';
import { ConnectionStage } from '../hooks/useFTPConnection';

const PROTOCOL_CONFIG: Record<
  FTPProtocol,
  { label: string; defaultPort: number; description: string }
> = {
  sftp: { label: 'SFTP', defaultPort: 22, description: 'SSH (sécurisé)' },
  ftp: { label: 'FTP', defaultPort: 21, description: 'Standard' },
  ftps: { label: 'FTPS', defaultPort: 21, description: 'SSL/TLS' },
};

interface FTPFormData {
  configured: boolean;
  host?: string;
  username?: string;
  password?: string;
  port?: number;
  remotePath?: string;
  passive?: boolean;
  protocol?: FTPProtocol;
  acceptInvalidCerts?: boolean;
}

interface FTPSectionProps {
  sftp: FTPFormData;
  localPath?: string;
  testUrl?: string;
  savePassword: boolean;
  geminiApiKey?: string;
  geminiModel?: string;
  testing: boolean;
  testResult: 'success' | 'error' | null;
  remoteFolders: string[];
  loadingFolders: boolean;
  connectionStage?: ConnectionStage;
  elapsedSeconds?: number;
  onSftpChange: (sftp: FTPFormData) => void;
  onLocalPathChange: (path: string) => void;
  onTestUrlChange: (url: string) => void;
  onSavePasswordChange: (save: boolean) => void;
  onTestConnection: () => void;
  onResetTestResult: () => void;
  onCancelConnection?: () => void;
}

export function FTPSection({
  sftp,
  localPath,
  testUrl,
  savePassword,
  testing,
  testResult,
  remoteFolders,
  loadingFolders,
  connectionStage,
  elapsedSeconds = 0,
  onSftpChange,
  onLocalPathChange,
  onTestUrlChange,
  onSavePasswordChange,
  onTestConnection,
  onResetTestResult,
  onCancelConnection,
}: FTPSectionProps) {
  const [showFolderSelect, setShowFolderSelect] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseSuccess, setParseSuccess] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Normalize URL: add https:// if protocol is missing
  const normalizeUrl = (url: string): string => {
    if (!url || url.trim() === '') return '';
    const trimmed = url.trim();
    // Already has protocol
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    // Add https:// by default
    return `https://${trimmed}`;
  };

  const handleTestUrlBlur = () => {
    if (testUrl && testUrl.trim()) {
      const normalized = normalizeUrl(testUrl);
      if (normalized !== testUrl) {
        onTestUrlChange(normalized);
      }
    }
  };

  const handleProtocolChange = (protocol: FTPProtocol) => {
    const defaultPort = PROTOCOL_CONFIG[protocol].defaultPort;
    onSftpChange({
      ...sftp,
      protocol,
      port: defaultPort,
    });
    onResetTestResult();
  };

  const handleFieldChange = <K extends keyof FTPFormData>(
    field: K,
    value: FTPFormData[K]
  ) => {
    onSftpChange({ ...sftp, [field]: value });
    onResetTestResult();
  };

  // Parser local avec regex pour les credentials FTP
  const parseCredentialsLocally = (text: string) => {
    const result: {
      host: string | null;
      username: string | null;
      password: string | null;
      port: number | null;
      path: string | null;
      testUrl: string | null;
    } = {
      host: null,
      username: null,
      password: null,
      port: null,
      path: null,
      testUrl: null,
    };

    const normalizedText = text.replace(/\t/g, ' ').replace(/\r\n/g, '\n');

    const hostPatterns = [
      /(?:h[oô]te|host|serveur\s*(?:ftp|sftp)?|server|ftp\s*server)\s*[:\-=]\s*([^\s\n,;]+)/i,
      /(?:ftp|sftp):\/\/([^\s\/:]+)/i,
      /([a-z0-9][\w.-]*\.(?:com|net|org|fr|eu|io|co)[^\s]*?)(?:\s|$|:)/i,
    ];
    for (const pattern of hostPatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1] && !result.host) {
        result.host = match[1].trim();
        break;
      }
    }

    const userPatterns = [
      /(?:utilisateur|username|user|login|identifiant|user\s*name|nom\s*d'utilisateur)\s*[:\-=]\s*([^\s\n,;]+)/i,
      /(?:ftp|sftp)\s+(?:login|user)[:\s]+([^\s\n,;]+)/i,
    ];
    for (const pattern of userPatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1] && !result.username) {
        result.username = match[1].trim();
        break;
      }
    }

    const passwordPatterns = [
      /(?:mot\s*de\s*passe|password|pass|pwd|mdp)\s*[:\-=]\s*([^\s\n]+)/i,
      /(?:ftp|sftp)\s+(?:password|pass)[:\s]+([^\s\n]+)/i,
    ];
    for (const pattern of passwordPatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1] && !result.password) {
        result.password = match[1].trim();
        break;
      }
    }

    const portPatterns = [
      /(?:port)\s*[:\-=]\s*(\d+)/i,
      /:(\d{2,5})(?:\s|$|\/)/,
    ];
    for (const pattern of portPatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1] && !result.port) {
        const port = parseInt(match[1], 10);
        if (port > 0 && port < 65536) {
          result.port = port;
          break;
        }
      }
    }

    const pathPatterns = [
      /(?:chemin|path|dossier|r[ée]pertoire|directory|remote\s*path)\s*[:\-=]\s*(\/[^\s\n,;]*)/i,
      /(?:public_html|www|htdocs|web)(?:\/[^\s\n,;]*)?/i,
    ];
    for (const pattern of pathPatterns) {
      const match = normalizedText.match(pattern);
      if (match && !result.path) {
        result.path = match[1] ? match[1].trim() : '/' + match[0].trim();
        break;
      }
    }

    const urlPatterns = [
      // Patterns explicites avec label - avec ou sans protocol
      /(?:url\s*(?:de\s*)?(?:test|pr[ée]visualisation|preview|staging|temp)|lien\s*(?:de\s*)?(?:test|pr[ée]visualisation|preview)|test\s*url|preview\s*url|url\s*du\s*site|site\s*url|url)\s*[:\-=]\s*((?:https?:\/\/)?[a-z0-9][\w.-]*\.[a-z]{2,}[^\s\n,;]*)/i,
      // URL contenant des mots-clés de test - avec ou sans protocol
      /((?:https?:\/\/)?[a-z0-9][\w.-]*(?:temp|test|staging|preview|dev|preprod)[^\s\n,;]*\.[a-z]{2,}[^\s\n,;]*)/i,
      /((?:https?:\/\/)?(?:temp|test|staging|preview|dev|preprod)[.-][a-z0-9][\w.-]*\.[a-z]{2,}[^\s\n,;]*)/i,
      // Toute URL http/https qui n'est pas un serveur FTP
      /(?:https?:\/\/(?!ftp\.)[^\s\n,;]+)/i,
    ];
    for (const pattern of urlPatterns) {
      const match = normalizedText.match(pattern);
      if (match && !result.testUrl) {
        let url = match[1] ? match[1].trim() : match[0].trim();
        // Éviter de capturer le host FTP comme URL de test
        if (!url.includes('ftp.') && !url.includes(':21') && !url.includes(':22')) {
          // Normalize: add https:// if missing
          if (!/^https?:\/\//i.test(url)) {
            url = `https://${url}`;
          }
          result.testUrl = url;
          break;
        }
      }
    }

    return result;
  };

  const handleInlinePaste = () => {
    if (!pasteText.trim()) return;

    setParsing(true);
    setParseSuccess(false);
    setParseError(null);

    const credentials = parseCredentialsLocally(pasteText);
    const hasValues = credentials.host || credentials.username || credentials.password;

    if (!hasValues) {
      setParseError('Aucune information FTP trouvée');
      setParsing(false);
      return;
    }

    onSftpChange({
      ...sftp,
      host: credentials.host || sftp.host,
      username: credentials.username || sftp.username,
      password: credentials.password || sftp.password,
      port: credentials.port || sftp.port,
      remotePath: credentials.path || sftp.remotePath,
    });

    if (credentials.testUrl) {
      onTestUrlChange(credentials.testUrl);
    }

    setParseSuccess(true);
    onResetTestResult();

    setTimeout(() => {
      setPasteText('');
      setParseSuccess(false);
    }, 2000);

    setParsing(false);
  };

  const isFtpValid = sftp.host && sftp.username && sftp.password;

  return (
    <div className="ftp-section-grid">
      {/* Colonne gauche : Connexion */}
      <div className="ftp-column">
        <div className="ftp-card">
          <h3 className="ftp-card-title">Connexion</h3>

          <div className="form-field">
            <label className="form-label">Protocole</label>
            <div className="protocol-select-compact">
              {(Object.keys(PROTOCOL_CONFIG) as FTPProtocol[]).map((protocol) => (
                <button
                  key={protocol}
                  type="button"
                  className={`protocol-btn ${sftp.protocol === protocol ? 'active' : ''}`}
                  onClick={() => handleProtocolChange(protocol)}
                >
                  {PROTOCOL_CONFIG[protocol].label}
                </button>
              ))}
            </div>
          </div>

          <div className="ftp-form-grid">
            <div className="ftp-form-row-full">
              <Input
                label="Hôte"
                value={sftp.host || ''}
                onChange={(e) => handleFieldChange('host', e.target.value)}
                placeholder="ftp.example.com"
              />
            </div>

            <div className="ftp-form-row-2col">
              <Input
                label="Utilisateur"
                value={sftp.username || ''}
                onChange={(e) => handleFieldChange('username', e.target.value)}
                placeholder="username"
              />
              <Input
                label="Port"
                type="number"
                value={sftp.port || 21}
                onChange={(e) => handleFieldChange('port', parseInt(e.target.value) || 21)}
              />
            </div>

            <div className="ftp-form-row-full">
              <Input
                label="Mot de passe"
                type="password"
                value={sftp.password || ''}
                onChange={(e) => handleFieldChange('password', e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          {sftp.protocol !== 'sftp' && (
            <div className="form-field" style={{ marginTop: 12 }}>
              <label className="form-label">Mode</label>
              <div className="connection-mode-toggle">
                <button
                  type="button"
                  className={`mode-option ${sftp.passive ? 'active' : ''}`}
                  onClick={() => handleFieldChange('passive', true)}
                >
                  Passif
                </button>
                <button
                  type="button"
                  className={`mode-option ${!sftp.passive ? 'active' : ''}`}
                  onClick={() => handleFieldChange('passive', false)}
                >
                  Actif
                </button>
              </div>
            </div>
          )}

          {(sftp.protocol === 'ftps' || sftp.protocol === 'sftp') && (
            <div style={{ marginTop: 12 }}>
              <Switch
                label="Certificats non vérifiés"
                checked={sftp.acceptInvalidCerts || false}
                onChange={(checked) => handleFieldChange('acceptInvalidCerts', checked)}
              />
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            {testing ? (
              <div className="connection-progress">
                <Loader className="spinner" size={16} />
                <span className="connection-progress-text">
                  Connexion en cours... ({elapsedSeconds}s)
                </span>
                {onCancelConnection && (
                  <button
                    type="button"
                    className="connection-cancel-btn"
                    onClick={onCancelConnection}
                    title="Annuler"
                  >
                    <X size={16} />
                    Annuler
                  </button>
                )}
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onTestConnection}
                  disabled={!isFtpValid}
                >
                  <TestTube size={16} />
                  Tester
                </Button>
                {testResult && (
                  <span className={`test-badge ${testResult}`}>
                    {connectionStage === 'timeout'
                      ? 'Timeout (15s)'
                      : testResult === 'success'
                      ? 'Connexion OK'
                      : 'Échec'}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Colonne droite : Synchronisation + Smart Paste */}
      <div className="ftp-column">
        <div className="ftp-card">
          <h3 className="ftp-card-title">Synchronisation</h3>

          <div className="ftp-form-grid">
            <div className="ftp-form-row-2col">
              <Input
                label="Dossier local"
                value={localPath || ''}
                onChange={(e) => onLocalPathChange(e.target.value)}
                placeholder="www"
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
                      <span>{sftp.remotePath || '/public_html'}</span>
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
                              handleFieldChange('remotePath', `/${folder}`);
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
                  <input
                    className="form-input"
                    value={sftp.remotePath || ''}
                    onChange={(e) => handleFieldChange('remotePath', e.target.value)}
                    placeholder="/public_html"
                  />
                )}
              </div>
            </div>

            <div className="ftp-form-row-full">
              <Input
                label="URL de test"
                value={testUrl || ''}
                onChange={(e) => onTestUrlChange(e.target.value)}
                onBlur={handleTestUrlBlur}
                placeholder="test.example.com"
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <Switch
              label="Sauvegarder le mot de passe (Keychain)"
              checked={savePassword}
              onChange={onSavePasswordChange}
            />
          </div>
        </div>

        {/* Smart Paste */}
        <div className="ftp-card">
          <h3 className="ftp-card-title">
            <Wand2 size={14} style={{ marginRight: 6 }} />
            Import automatique
          </h3>
          <div className="smart-paste-row">
            <textarea
              className="form-input smart-paste-textarea"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Collez ici un email ou texte avec les identifiants FTP..."
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
          {parseError && (
            <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} />
              {parseError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
