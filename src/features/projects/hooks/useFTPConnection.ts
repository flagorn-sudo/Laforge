import { useState, useRef, useCallback, useEffect } from 'react';
import { SFTPConfig } from '../../../types';
import { sftpService } from '../../../services/sftpService';

export type ConnectionStage = 'idle' | 'connecting' | 'success' | 'error' | 'cancelled' | 'timeout';

const CONNECTION_TIMEOUT_MS = 15000; // 15 seconds

interface UseFTPConnectionResult {
  testing: boolean;
  testResult: 'success' | 'error' | null;
  remoteFolders: string[];
  loadingFolders: boolean;
  stage: ConnectionStage;
  elapsedSeconds: number;
  testConnection: (config: SFTPConfig) => Promise<boolean>;
  loadRemoteFolders: (config: SFTPConfig, path?: string) => Promise<void>;
  resetTestResult: () => void;
  cancelConnection: () => void;
}

export function useFTPConnection(): UseFTPConnectionResult {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [remoteFolders, setRemoteFolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [stage, setStage] = useState<ConnectionStage>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Refs for cancellation and timing
  const connectionIdRef = useRef<number>(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  const startTimer = useCallback(() => {
    setElapsedSeconds(0);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const cancelConnection = useCallback(() => {
    // Increment connection ID to invalidate any pending connection
    connectionIdRef.current += 1;
    stopTimer();
    setTesting(false);
    setStage('cancelled');
    setElapsedSeconds(0);
    // Reset to idle after a brief moment
    setTimeout(() => {
      setStage('idle');
    }, 100);
  }, [stopTimer]);

  const testConnection = async (config: SFTPConfig): Promise<boolean> => {
    // Generate a new connection ID for this attempt
    const currentConnectionId = ++connectionIdRef.current;

    setTesting(true);
    setTestResult(null);
    setStage('connecting');
    startTimer();

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('CONNECTION_TIMEOUT'));
        }, CONNECTION_TIMEOUT_MS);
      });

      // Race between actual connection and timeout
      const success = await Promise.race([
        sftpService.testConnection(config),
        timeoutPromise,
      ]);

      // Check if this connection was cancelled
      if (currentConnectionId !== connectionIdRef.current) {
        return false;
      }

      stopTimer();
      setTestResult(success ? 'success' : 'error');
      setStage(success ? 'success' : 'error');

      if (success) {
        await loadRemoteFolders(config);
      }

      return success;
    } catch (error) {
      // Check if this connection was cancelled
      if (currentConnectionId !== connectionIdRef.current) {
        return false;
      }

      stopTimer();

      // Check if it's a timeout error
      if (error instanceof Error && error.message === 'CONNECTION_TIMEOUT') {
        setTestResult('error');
        setStage('timeout');
      } else {
        setTestResult('error');
        setStage('error');
      }

      return false;
    } finally {
      // Only update testing state if this is still the current connection
      if (currentConnectionId === connectionIdRef.current) {
        setTesting(false);
      }
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
    setStage('idle');
    setElapsedSeconds(0);
  };

  return {
    testing,
    testResult,
    remoteFolders,
    loadingFolders,
    stage,
    elapsedSeconds,
    testConnection,
    loadRemoteFolders,
    resetTestResult,
    cancelConnection,
  };
}
