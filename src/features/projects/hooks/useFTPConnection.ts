import { useState } from 'react';
import { SFTPConfig } from '../../../types';
import { sftpService } from '../../../services/sftpService';

interface UseFTPConnectionResult {
  testing: boolean;
  testResult: 'success' | 'error' | null;
  remoteFolders: string[];
  loadingFolders: boolean;
  testConnection: (config: SFTPConfig) => Promise<boolean>;
  loadRemoteFolders: (config: SFTPConfig, path?: string) => Promise<void>;
  resetTestResult: () => void;
}

export function useFTPConnection(): UseFTPConnectionResult {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [remoteFolders, setRemoteFolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  const testConnection = async (config: SFTPConfig): Promise<boolean> => {
    setTesting(true);
    setTestResult(null);

    try {
      const success = await sftpService.testConnection(config);
      setTestResult(success ? 'success' : 'error');

      if (success) {
        await loadRemoteFolders(config);
      }

      return success;
    } catch {
      setTestResult('error');
      return false;
    } finally {
      setTesting(false);
    }
  };

  const loadRemoteFolders = async (config: SFTPConfig, path: string = '/') => {
    setLoadingFolders(true);
    try {
      const folders = await sftpService.listRemoteFiles(config, path);
      setRemoteFolders(folders.filter((f) => !f.includes('.')));
    } catch (err) {
      console.error('Failed to load remote folders:', err);
      setRemoteFolders([]);
    } finally {
      setLoadingFolders(false);
    }
  };

  const resetTestResult = () => {
    setTestResult(null);
  };

  return {
    testing,
    testResult,
    remoteFolders,
    loadingFolders,
    testConnection,
    loadRemoteFolders,
    resetTestResult,
  };
}
