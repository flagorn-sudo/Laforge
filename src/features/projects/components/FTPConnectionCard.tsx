import { Loader, TestTube, X } from 'lucide-react';
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

export interface FTPFormData {
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

interface FTPConnectionCardProps {
  sftp: FTPFormData;
  testing: boolean;
  testResult: 'success' | 'error' | null;
  connectionStage?: ConnectionStage;
  elapsedSeconds?: number;
  onSftpChange: (sftp: FTPFormData) => void;
  onTestConnection: () => void;
  onResetTestResult: () => void;
  onCancelConnection?: () => void;
}

export function FTPConnectionCard({
  sftp,
  testing,
  testResult,
  connectionStage,
  elapsedSeconds = 0,
  onSftpChange,
  onTestConnection,
  onResetTestResult,
  onCancelConnection,
}: FTPConnectionCardProps) {
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

  const isFtpValid = sftp.host && sftp.username && sftp.password;

  return (
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
  );
}
