/**
 * Post-Sync Hooks Component
 * Configure automated actions after sync operations
 */

import React, { useState } from 'react';
import {
  useHooksStore,
  PostSyncHook,
  HookType,
  HookTrigger,
  WebhookConfig,
  ScriptConfig,
  NotificationConfig,
  HOOK_TRIGGER_OPTIONS,
  HOOK_TYPE_OPTIONS,
} from '../stores/hooksStore';
import './PostSyncHooks.css';

interface PostSyncHooksProps {
  projectId?: string;
  projectName?: string;
  onClose?: () => void;
}

export const PostSyncHooks: React.FC<PostSyncHooksProps> = ({
  projectId,
  projectName,
  onClose,
}) => {
  const { hooks, addHook, updateHook, deleteHook, toggleHook, testHook, executing, lastExecutions } =
    useHooksStore();

  const [showForm, setShowForm] = useState(false);
  const [editingHook, setEditingHook] = useState<PostSyncHook | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ hookId: string; success: boolean; message: string } | null>(null);

  const filteredHooks = projectId
    ? hooks.filter((h) => !h.projectId || h.projectId === projectId)
    : hooks;

  const handleAddHook = () => {
    setEditingHook(null);
    setShowForm(true);
  };

  const handleEditHook = (hook: PostSyncHook) => {
    setEditingHook(hook);
    setShowForm(true);
  };

  const handleDeleteHook = (id: string) => {
    if (confirm('Supprimer ce hook ?')) {
      deleteHook(id);
    }
  };

  const handleTestHook = async (hook: PostSyncHook) => {
    setTesting(hook.id);
    setTestResult(null);
    try {
      const result = await testHook(hook);
      setTestResult({ hookId: hook.id, ...result });
    } catch (error) {
      setTestResult({
        hookId: hook.id,
        success: false,
        message: error instanceof Error ? error.message : 'Test failed',
      });
    } finally {
      setTesting(null);
    }
  };

  const handleSaveHook = (hookData: Omit<PostSyncHook, 'id' | 'createdAt'>) => {
    if (editingHook) {
      updateHook(editingHook.id, hookData);
    } else {
      addHook(hookData);
    }
    setShowForm(false);
    setEditingHook(null);
  };

  return (
    <div className="post-sync-hooks">
      <div className="hooks-header">
        <div>
          <h3>Actions post-sync</h3>
          {projectName && <span className="project-name">{projectName}</span>}
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={handleAddHook}>
            + Ajouter un hook
          </button>
          {onClose && (
            <button className="btn-secondary" onClick={onClose}>
              Fermer
            </button>
          )}
        </div>
      </div>

      <div className="hooks-content">
        {filteredHooks.length === 0 ? (
          <div className="empty-state">
            <p>Aucun hook configuré</p>
            <p className="hint">
              Ajoutez des actions automatiques qui s'exécuteront après chaque synchronisation
            </p>
          </div>
        ) : (
          <div className="hooks-list">
            {filteredHooks.map((hook) => (
              <HookCard
                key={hook.id}
                hook={hook}
                isExecuting={executing.has(hook.id)}
                isTesting={testing === hook.id}
                lastExecution={lastExecutions[hook.id]}
                testResult={testResult?.hookId === hook.id ? testResult : null}
                onToggle={() => toggleHook(hook.id)}
                onEdit={() => handleEditHook(hook)}
                onDelete={() => handleDeleteHook(hook.id)}
                onTest={() => handleTestHook(hook)}
              />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <HookForm
          hook={editingHook}
          projectId={projectId}
          onSave={handleSaveHook}
          onCancel={() => {
            setShowForm(false);
            setEditingHook(null);
          }}
        />
      )}
    </div>
  );
};

interface HookCardProps {
  hook: PostSyncHook;
  isExecuting: boolean;
  isTesting: boolean;
  lastExecution?: { success: boolean; message: string; timestamp: string };
  testResult?: { success: boolean; message: string } | null;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
}

const HookCard: React.FC<HookCardProps> = ({
  hook,
  isExecuting,
  isTesting,
  lastExecution,
  testResult,
  onToggle,
  onEdit,
  onDelete,
  onTest,
}) => {
  const typeInfo = HOOK_TYPE_OPTIONS.find((t) => t.value === hook.type);
  const triggerInfo = HOOK_TRIGGER_OPTIONS.find((t) => t.value === hook.trigger);

  return (
    <div className={`hook-card ${hook.enabled ? 'enabled' : 'disabled'}`}>
      <div className="hook-header">
        <label className="toggle">
          <input
            type="checkbox"
            checked={hook.enabled}
            onChange={onToggle}
            disabled={isExecuting}
          />
          <span className="toggle-slider" />
        </label>
        <div className="hook-info">
          <span className="hook-name">{hook.name}</span>
          <span className="hook-type">{typeInfo?.label || hook.type}</span>
        </div>
        <div className="hook-actions">
          <button
            className="btn-icon"
            onClick={onTest}
            disabled={isTesting || isExecuting}
            title="Tester"
          >
            {isTesting ? '...' : '▶'}
          </button>
          <button className="btn-icon" onClick={onEdit} title="Modifier">
            ✎
          </button>
          <button className="btn-icon danger" onClick={onDelete} title="Supprimer">
            ×
          </button>
        </div>
      </div>

      <div className="hook-details">
        <span className="hook-trigger">
          Déclenché: {triggerInfo?.label || hook.trigger}
        </span>
        {hook.projectId && <span className="hook-scope">Ce projet uniquement</span>}
      </div>

      {(testResult || lastExecution) && (
        <div className={`hook-status ${(testResult || lastExecution)?.success ? 'success' : 'error'}`}>
          <span className="status-indicator" />
          <span className="status-message">
            {testResult?.message || lastExecution?.message}
          </span>
        </div>
      )}

      {isExecuting && (
        <div className="hook-executing">
          <span className="spinner" />
          Exécution en cours...
        </div>
      )}
    </div>
  );
};

interface HookFormProps {
  hook: PostSyncHook | null;
  projectId?: string;
  onSave: (hook: Omit<PostSyncHook, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}

const HookForm: React.FC<HookFormProps> = ({ hook, projectId, onSave, onCancel }) => {
  const [name, setName] = useState(hook?.name || '');
  const [type, setType] = useState<HookType>(hook?.type || 'webhook');
  const [trigger, setTrigger] = useState<HookTrigger>(hook?.trigger || 'sync_complete');
  const [enabled, setEnabled] = useState(hook?.enabled ?? true);
  const [applyToProject, setApplyToProject] = useState(!!hook?.projectId);

  // Webhook config
  const [webhookUrl, setWebhookUrl] = useState(
    (hook?.config as WebhookConfig)?.url || ''
  );
  const [webhookMethod, setWebhookMethod] = useState<'GET' | 'POST' | 'PUT'>(
    (hook?.config as WebhookConfig)?.method || 'POST'
  );
  const [includePayload, setIncludePayload] = useState(
    (hook?.config as WebhookConfig)?.includePayload ?? true
  );

  // Script config
  const [scriptCommand, setScriptCommand] = useState(
    (hook?.config as ScriptConfig)?.command || ''
  );

  // Notification config
  const [notifTitle, setNotifTitle] = useState(
    (hook?.config as NotificationConfig)?.title || 'Forge - $PROJECT_NAME'
  );
  const [notifBody, setNotifBody] = useState(
    (hook?.config as NotificationConfig)?.body || 'Sync terminée: $FILES_UPLOADED fichiers'
  );
  const [notifSound, setNotifSound] = useState(
    (hook?.config as NotificationConfig)?.sound ?? true
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let config: WebhookConfig | ScriptConfig | NotificationConfig;

    switch (type) {
      case 'webhook':
        config = {
          url: webhookUrl,
          method: webhookMethod,
          includePayload,
          timeout: 30,
        };
        break;
      case 'script':
        config = {
          command: scriptCommand,
          timeout: 60,
          runInBackground: false,
        };
        break;
      case 'notification':
        config = {
          title: notifTitle,
          body: notifBody,
          sound: notifSound,
        };
        break;
    }

    onSave({
      name,
      type,
      trigger,
      enabled,
      config,
      projectId: applyToProject ? projectId : undefined,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal hook-form" onClick={(e) => e.stopPropagation()}>
        <h4>{hook ? 'Modifier le hook' : 'Nouveau hook'}</h4>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mon webhook Slack"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as HookType)}>
                {HOOK_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Déclencheur</label>
              <select
                value={trigger}
                onChange={(e) => setTrigger(e.target.value as HookTrigger)}
              >
                {HOOK_TRIGGER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {type === 'webhook' && (
            <>
              <div className="form-group">
                <label>URL du webhook</label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Méthode</label>
                  <select
                    value={webhookMethod}
                    onChange={(e) => setWebhookMethod(e.target.value as 'GET' | 'POST' | 'PUT')}
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={includePayload}
                      onChange={(e) => setIncludePayload(e.target.checked)}
                    />
                    Inclure les données de sync
                  </label>
                </div>
              </div>
            </>
          )}

          {type === 'script' && (
            <div className="form-group">
              <label>Commande</label>
              <input
                type="text"
                value={scriptCommand}
                onChange={(e) => setScriptCommand(e.target.value)}
                placeholder="echo 'Sync terminée pour $PROJECT_NAME'"
                required
              />
              <span className="hint">
                Variables: $PROJECT_ID, $PROJECT_NAME, $FILES_UPLOADED, $DURATION
              </span>
            </div>
          )}

          {type === 'notification' && (
            <>
              <div className="form-group">
                <label>Titre</label>
                <input
                  type="text"
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  placeholder="Forge - $PROJECT_NAME"
                  required
                />
              </div>
              <div className="form-group">
                <label>Message</label>
                <input
                  type="text"
                  value={notifBody}
                  onChange={(e) => setNotifBody(e.target.value)}
                  placeholder="Sync terminée: $FILES_UPLOADED fichiers"
                  required
                />
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={notifSound}
                    onChange={(e) => setNotifSound(e.target.checked)}
                  />
                  Son de notification
                </label>
              </div>
            </>
          )}

          {projectId && (
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={applyToProject}
                  onChange={(e) => setApplyToProject(e.target.checked)}
                />
                Uniquement pour ce projet
              </label>
            </div>
          )}

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Activer ce hook
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Annuler
            </button>
            <button type="submit" className="btn-primary">
              {hook ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PostSyncHooks;
