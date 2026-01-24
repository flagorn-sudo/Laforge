import { ConnectionStage } from '../hooks/useFTPConnection';
import { FTPConnectionCard, FTPFormData } from './FTPConnectionCard';
import { FTPSyncCard } from './FTPSyncCard';
import { FTPSmartPaste } from './FTPSmartPaste';

// Re-export FTPFormData for backward compatibility
export type { FTPFormData } from './FTPConnectionCard';

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
  return (
    <div className="ftp-section-grid">
      {/* Colonne gauche : Connexion */}
      <div className="ftp-column">
        <FTPConnectionCard
          sftp={sftp}
          testing={testing}
          testResult={testResult}
          connectionStage={connectionStage}
          elapsedSeconds={elapsedSeconds}
          onSftpChange={onSftpChange}
          onTestConnection={onTestConnection}
          onResetTestResult={onResetTestResult}
          onCancelConnection={onCancelConnection}
        />
      </div>

      {/* Colonne droite : Synchronisation + Smart Paste */}
      <div className="ftp-column">
        <FTPSyncCard
          sftp={sftp}
          localPath={localPath}
          testUrl={testUrl}
          savePassword={savePassword}
          testResult={testResult}
          remoteFolders={remoteFolders}
          loadingFolders={loadingFolders}
          onSftpChange={onSftpChange}
          onLocalPathChange={onLocalPathChange}
          onTestUrlChange={onTestUrlChange}
          onSavePasswordChange={onSavePasswordChange}
          onResetTestResult={onResetTestResult}
        />

        <FTPSmartPaste
          sftp={sftp}
          onSftpChange={onSftpChange}
          onTestUrlChange={onTestUrlChange}
          onResetTestResult={onResetTestResult}
        />
      </div>
    </div>
  );
}
