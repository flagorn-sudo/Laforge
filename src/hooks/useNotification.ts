/**
 * Hook wrapper for UI notifications
 * Provides a simpler interface to the notification system
 */

import { useCallback } from 'react';
import { useUIStore } from '../stores';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface UseNotificationResult {
  notify: (type: NotificationType, message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  clear: () => void;
}

/**
 * Hook for managing notifications
 *
 * @example
 * const { success, error } = useNotification();
 *
 * // Show success notification
 * success('Projet enregistré');
 *
 * // Show error notification
 * error('Échec de la connexion');
 */
export function useNotification(): UseNotificationResult {
  const { addNotification, clearNotifications } = useUIStore();

  const notify = useCallback(
    (type: NotificationType, message: string, duration?: number) => {
      addNotification(type, message, duration);
    },
    [addNotification]
  );

  const success = useCallback(
    (message: string, duration?: number) => {
      addNotification('success', message, duration);
    },
    [addNotification]
  );

  const error = useCallback(
    (message: string, duration?: number) => {
      addNotification('error', message, duration);
    },
    [addNotification]
  );

  const warning = useCallback(
    (message: string, duration?: number) => {
      addNotification('warning', message, duration);
    },
    [addNotification]
  );

  const info = useCallback(
    (message: string, duration?: number) => {
      addNotification('info', message, duration);
    },
    [addNotification]
  );

  const clear = useCallback(() => {
    clearNotifications();
  }, [clearNotifications]);

  return {
    notify,
    success,
    error,
    warning,
    info,
    clear,
  };
}

/**
 * Helper to show notifications for async operations
 * Shows loading, success, and error states automatically
 */
export function useAsyncNotification() {
  const { info, success, error } = useNotification();

  const withNotification = useCallback(
    async <T>(
      fn: () => Promise<T>,
      messages: {
        loading?: string;
        success?: string | ((result: T) => string);
        error?: string | ((err: unknown) => string);
      }
    ): Promise<T | null> => {
      if (messages.loading) {
        info(messages.loading);
      }

      try {
        const result = await fn();
        if (messages.success) {
          const message =
            typeof messages.success === 'function'
              ? messages.success(result)
              : messages.success;
          success(message);
        }
        return result;
      } catch (err) {
        if (messages.error) {
          const message =
            typeof messages.error === 'function'
              ? messages.error(err)
              : messages.error;
          error(message);
        }
        return null;
      }
    },
    [info, success, error]
  );

  return { withNotification };
}
