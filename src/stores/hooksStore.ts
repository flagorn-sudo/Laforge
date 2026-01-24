/**
 * Hooks Store
 * Manages post-sync hooks and actions (webhooks, scripts, notifications)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { fetch } from '@tauri-apps/api/http';

export type HookType = 'webhook' | 'script' | 'notification';
export type HookTrigger = 'sync_complete' | 'sync_error' | 'sync_start' | 'file_uploaded';

export interface PostSyncHook {
  id: string;
  name: string;
  type: HookType;
  trigger: HookTrigger;
  enabled: boolean;
  config: WebhookConfig | ScriptConfig | NotificationConfig;
  projectId?: string; // If set, only applies to this project
  createdAt: string;
  lastRunAt?: string;
  lastRunSuccess?: boolean;
  lastRunError?: string;
}

export interface WebhookConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  includePayload: boolean;
  timeout: number; // seconds
}

export interface ScriptConfig {
  command: string;
  workingDirectory?: string;
  timeout: number; // seconds
  runInBackground: boolean;
}

export interface NotificationConfig {
  title: string;
  body: string;
  sound: boolean;
}

export interface HookExecutionContext {
  projectId: string;
  projectName: string;
  trigger: HookTrigger;
  timestamp: string;
  filesUploaded?: number;
  filesTotal?: number;
  bytesTransferred?: number;
  duration?: number;
  error?: string;
}

interface HooksState {
  hooks: PostSyncHook[];
  executing: Set<string>;
  lastExecutions: Record<string, { success: boolean; message: string; timestamp: string }>;
}

interface HooksStore extends HooksState {
  // Actions
  addHook: (hook: Omit<PostSyncHook, 'id' | 'createdAt'>) => PostSyncHook;
  updateHook: (id: string, updates: Partial<PostSyncHook>) => void;
  deleteHook: (id: string) => void;
  toggleHook: (id: string) => void;
  getHooksForProject: (projectId: string | null) => PostSyncHook[];
  getHooksForTrigger: (trigger: HookTrigger, projectId?: string) => PostSyncHook[];
  executeHooks: (trigger: HookTrigger, context: HookExecutionContext) => Promise<void>;
  executeHook: (hook: PostSyncHook, context: HookExecutionContext) => Promise<{ success: boolean; message: string }>;
  testHook: (hook: PostSyncHook) => Promise<{ success: boolean; message: string }>;
}

// Generate unique ID
function generateId(): string {
  return `hook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const useHooksStore = create<HooksStore>()(
  persist(
    (set, get) => ({
      hooks: [],
      executing: new Set(),
      lastExecutions: {},

      addHook: (hookData) => {
        const hook: PostSyncHook = {
          ...hookData,
          id: generateId(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          hooks: [...state.hooks, hook],
        }));
        return hook;
      },

      updateHook: (id, updates) => {
        set((state) => ({
          hooks: state.hooks.map((h) => (h.id === id ? { ...h, ...updates } : h)),
        }));
      },

      deleteHook: (id) => {
        set((state) => ({
          hooks: state.hooks.filter((h) => h.id !== id),
        }));
      },

      toggleHook: (id) => {
        set((state) => ({
          hooks: state.hooks.map((h) =>
            h.id === id ? { ...h, enabled: !h.enabled } : h
          ),
        }));
      },

      getHooksForProject: (projectId) => {
        const { hooks } = get();
        return hooks.filter((h) => !h.projectId || h.projectId === projectId);
      },

      getHooksForTrigger: (trigger, projectId) => {
        const { hooks } = get();
        return hooks.filter(
          (h) =>
            h.enabled &&
            h.trigger === trigger &&
            (!h.projectId || h.projectId === projectId)
        );
      },

      executeHooks: async (trigger, context) => {
        const hooks = get().getHooksForTrigger(trigger, context.projectId);

        for (const hook of hooks) {
          try {
            // Mark as executing
            set((state) => ({
              executing: new Set(state.executing).add(hook.id),
            }));

            const result = await get().executeHook(hook, context);

            // Update hook execution status
            get().updateHook(hook.id, {
              lastRunAt: new Date().toISOString(),
              lastRunSuccess: result.success,
              lastRunError: result.success ? undefined : result.message,
            });

            set((state) => ({
              lastExecutions: {
                ...state.lastExecutions,
                [hook.id]: {
                  success: result.success,
                  message: result.message,
                  timestamp: new Date().toISOString(),
                },
              },
            }));
          } catch (error) {
            console.error(`Hook execution failed: ${hook.name}`, error);
          } finally {
            // Remove from executing
            set((state) => {
              const newExecuting = new Set(state.executing);
              newExecuting.delete(hook.id);
              return { executing: newExecuting };
            });
          }
        }
      },

      executeHook: async (hook, context) => {
        switch (hook.type) {
          case 'webhook':
            return await executeWebhook(hook.config as WebhookConfig, context);
          case 'script':
            return await executeScript(hook.config as ScriptConfig, context);
          case 'notification':
            return await executeNotification(hook.config as NotificationConfig, context);
          default:
            return { success: false, message: 'Unknown hook type' };
        }
      },

      testHook: async (hook) => {
        const testContext: HookExecutionContext = {
          projectId: 'test-project',
          projectName: 'Test Project',
          trigger: hook.trigger,
          timestamp: new Date().toISOString(),
          filesUploaded: 5,
          filesTotal: 10,
          bytesTransferred: 1024000,
          duration: 30,
        };
        return await get().executeHook(hook, testContext);
      },
    }),
    {
      name: 'forge-hooks',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        hooks: state.hooks,
        lastExecutions: state.lastExecutions,
      }),
    }
  )
);

// Webhook execution
async function executeWebhook(
  config: WebhookConfig,
  context: HookExecutionContext
): Promise<{ success: boolean; message: string }> {
  try {
    const payload = config.includePayload
      ? {
          event: context.trigger,
          project_id: context.projectId,
          project_name: context.projectName,
          timestamp: context.timestamp,
          files_uploaded: context.filesUploaded,
          files_total: context.filesTotal,
          bytes_transferred: context.bytesTransferred,
          duration_seconds: context.duration,
          error: context.error,
        }
      : undefined;

    const response = await fetch(config.url, {
      method: config.method,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: payload ? { type: 'Json', payload } : undefined,
      timeout: config.timeout,
    });

    if (response.ok) {
      return { success: true, message: `Webhook sent successfully (${response.status})` };
    } else {
      return { success: false, message: `Webhook failed: ${response.status}` };
    }
  } catch (error) {
    return {
      success: false,
      message: `Webhook error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// Script execution (via Rust command)
async function executeScript(
  config: ScriptConfig,
  context: HookExecutionContext
): Promise<{ success: boolean; message: string }> {
  try {
    // Substitute variables in command
    let command = config.command
      .replace(/\$PROJECT_ID/g, context.projectId)
      .replace(/\$PROJECT_NAME/g, context.projectName)
      .replace(/\$TRIGGER/g, context.trigger)
      .replace(/\$FILES_UPLOADED/g, String(context.filesUploaded || 0))
      .replace(/\$FILES_TOTAL/g, String(context.filesTotal || 0))
      .replace(/\$BYTES_TRANSFERRED/g, String(context.bytesTransferred || 0))
      .replace(/\$DURATION/g, String(context.duration || 0));

    // Note: Script execution would typically go through a Rust command
    // For security, we just log here - actual implementation would need careful consideration
    console.log(`[Hook] Would execute script: ${command}`);

    return { success: true, message: 'Script execution logged (sandbox mode)' };
  } catch (error) {
    return {
      success: false,
      message: `Script error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// Notification (system notification)
async function executeNotification(
  config: NotificationConfig,
  context: HookExecutionContext
): Promise<{ success: boolean; message: string }> {
  try {
    // Substitute variables
    const title = config.title
      .replace(/\$PROJECT_NAME/g, context.projectName)
      .replace(/\$TRIGGER/g, getTriggerLabel(context.trigger));

    const body = config.body
      .replace(/\$PROJECT_NAME/g, context.projectName)
      .replace(/\$FILES_UPLOADED/g, String(context.filesUploaded || 0))
      .replace(/\$FILES_TOTAL/g, String(context.filesTotal || 0))
      .replace(/\$DURATION/g, String(context.duration || 0))
      .replace(/\$ERROR/g, context.error || '');

    // Use Notification API if available
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, silent: !config.sound });
      return { success: true, message: 'Notification sent' };
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification(title, { body, silent: !config.sound });
        return { success: true, message: 'Notification sent' };
      }
    }

    return { success: false, message: 'Notifications not permitted' };
  } catch (error) {
    return {
      success: false,
      message: `Notification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

function getTriggerLabel(trigger: HookTrigger): string {
  const labels: Record<HookTrigger, string> = {
    sync_complete: 'Sync terminée',
    sync_error: 'Erreur de sync',
    sync_start: 'Sync démarrée',
    file_uploaded: 'Fichier uploadé',
  };
  return labels[trigger] || trigger;
}

// Export trigger options for UI
export const HOOK_TRIGGER_OPTIONS: { value: HookTrigger; label: string }[] = [
  { value: 'sync_complete', label: 'Après sync réussie' },
  { value: 'sync_error', label: 'En cas d\'erreur' },
  { value: 'sync_start', label: 'Au démarrage de la sync' },
];

export const HOOK_TYPE_OPTIONS: { value: HookType; label: string; description: string }[] = [
  { value: 'webhook', label: 'Webhook', description: 'Envoyer une requête HTTP' },
  { value: 'notification', label: 'Notification', description: 'Afficher une notification système' },
  { value: 'script', label: 'Script', description: 'Exécuter une commande (sandbox)' },
];
