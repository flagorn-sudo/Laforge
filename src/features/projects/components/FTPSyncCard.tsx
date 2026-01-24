import { useState } from 'react';
import { Loader, ChevronDown, Folder } from 'lucide-react';
import { Input, Switch } from '../../../components/ui';
import { FTPFormData } from './FTPConnectionCard';

interface FTPSyncCardProps {
  sftp: FTPFormData;
  localPath?: string;
  testUrl?: string;
  savePassword: boolean;
  testResult: 'success' | 'error' | null;
  remoteFolders: string[];
  loadingFolders: boolean;
  onSftpChange: (sftp: FTPFormData) => void;
  onLocalPathChange: (path: string) => void;
  onTestUrlChange: (url: string) => void;
  onSavePasswordChange: (save: boolean) => void;
  onResetTestResult: () => void;
}

export function FTPSyncCard({
  sftp,
  localPath,
  testUrl,
  savePassword,
  testResult,
  remoteFolders,
  loadingFolders,
  onSftpChange,
  onLocalPathChange,
  onTestUrlChange,
  onSavePasswordChange,
  onResetTestResult,
}: FTPSyncCardProps) {
  const [showFolderSelect, setShowFolderSelect] = useState(false);

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

  const handleFieldChange = <K extends keyof FTPFormData>(
    field: K,
    value: FTPFormData[K]
  ) => {
    onSftpChange({ ...sftp, [field]: value });
    onResetTestResult();
  };

  return (
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
  );
}
