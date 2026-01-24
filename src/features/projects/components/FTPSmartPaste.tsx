import { useState } from 'react';
import { Loader, Wand2, Check, AlertCircle } from 'lucide-react';
import { Button } from '../../../components/ui';
import { FTPFormData } from './FTPConnectionCard';
import { parseCredentialsFromText, hasCredentials } from '../utils/ftpCredentialsParser';

interface FTPSmartPasteProps {
  sftp: FTPFormData;
  onSftpChange: (sftp: FTPFormData) => void;
  onTestUrlChange: (url: string) => void;
  onResetTestResult: () => void;
}

export function FTPSmartPaste({
  sftp,
  onSftpChange,
  onTestUrlChange,
  onResetTestResult,
}: FTPSmartPasteProps) {
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseSuccess, setParseSuccess] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleInlinePaste = () => {
    if (!pasteText.trim()) return;

    setParsing(true);
    setParseSuccess(false);
    setParseError(null);

    const credentials = parseCredentialsFromText(pasteText);

    if (!hasCredentials(credentials)) {
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

  return (
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
  );
}
