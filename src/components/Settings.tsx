import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, Key, Save, Plus, CheckCircle, XCircle, Loader, RotateCcw, RefreshCw, FolderPlus, Trash2, Edit3 } from 'lucide-react';
import { open } from '@tauri-apps/api/dialog';
import { Settings as SettingsType, DEFAULT_FOLDER_STRUCTURE } from '../types';
import { geminiService, GeminiModel } from '../services/geminiService';
import { Modal, Button, TreeView, ContextMenu, flatToTree, treeToFlat, generateNodeId } from './ui';
import type { TreeNode, ContextMenuItem } from './ui';

interface SettingsProps {
  settings: SettingsType;
  onUpdate: (partial: Partial<SettingsType>) => void;
  onSave: () => void;
  onClose: () => void;
}

export function Settings({ settings, onUpdate, onSave, onClose }: SettingsProps) {
  const [workspacePath, setWorkspacePath] = useState(settings.workspacePath);
  const [geminiApiKey, setGeminiApiKey] = useState(settings.geminiApiKey || '');
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel || '');
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>(() =>
    flatToTree(settings.folderStructure)
  );

  const [geminiStatus, setGeminiStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [availableModels, setAvailableModels] = useState<GeminiModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saved, setSaved] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: TreeNode;
    path: number[];
  } | null>(null);

  // Rename state
  const [renameNode, setRenameNode] = useState<{
    path: number[];
    name: string;
  } | null>(null);

  // Charger les modèles quand la connexion est réussie
  const loadModels = async (apiKey: string) => {
    setLoadingModels(true);
    try {
      const models = await geminiService.listModels(apiKey);
      setAvailableModels(models);
      // Auto-sélectionner le meilleur modèle si aucun n'est sélectionné
      if (!geminiModel && models.length > 0) {
        const bestModel = geminiService.getBestDefaultModel(models);
        setGeminiModel(bestModel);
      }
    } catch {
      setAvailableModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  // Charger les modèles au démarrage si on a une clé API
  useEffect(() => {
    if (settings.geminiApiKey) {
      loadModels(settings.geminiApiKey);
    }
  }, []);

  const handleSelectFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Sélectionner le dossier de travail',
    });
    if (selected && typeof selected === 'string') {
      setWorkspacePath(selected);
    }
  };

  const handleTestGemini = async () => {
    if (!geminiApiKey) return;

    setGeminiStatus('testing');
    try {
      const success = await geminiService.testConnection(geminiApiKey, geminiModel || undefined);
      if (success) {
        setGeminiStatus('connected');
        // Charger la liste des modèles disponibles
        await loadModels(geminiApiKey);
      } else {
        setGeminiStatus('error');
      }
    } catch {
      setGeminiStatus('error');
    }
  };

  const handleResetStructure = () => {
    setTreeNodes(flatToTree([...DEFAULT_FOLDER_STRUCTURE]));
  };

  const handleTreeChange = useCallback((newNodes: TreeNode[]) => {
    setTreeNodes(newNodes);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode, path: number[]) => {
    setContextMenu({ x: e.clientX, y: e.clientY, node, path });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const addRootFolder = useCallback(() => {
    const name = prompt('Nom du nouveau dossier :');
    if (name && name.trim()) {
      const newNode: TreeNode = {
        id: generateNodeId(),
        name: name.trim(),
        children: [],
        isExpanded: true,
      };
      setTreeNodes((prev) => [...prev, newNode]);
    }
  }, []);

  const addSubfolder = useCallback((path: number[]) => {
    const name = prompt('Nom du sous-dossier :');
    if (name && name.trim()) {
      const newNodes = JSON.parse(JSON.stringify(treeNodes)) as TreeNode[];
      let current = newNodes;
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]].children!;
      }
      const parent = current[path[path.length - 1]];
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push({
        id: generateNodeId(),
        name: name.trim(),
        children: [],
        isExpanded: true,
      });
      parent.isExpanded = true;
      setTreeNodes(newNodes);
    }
    closeContextMenu();
  }, [treeNodes, closeContextMenu]);

  const deleteFolder = useCallback((path: number[]) => {
    const newNodes = JSON.parse(JSON.stringify(treeNodes)) as TreeNode[];
    let current = newNodes;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]].children!;
    }
    current.splice(path[path.length - 1], 1);
    setTreeNodes(newNodes);
    closeContextMenu();
  }, [treeNodes, closeContextMenu]);

  const startRename = useCallback((path: number[], currentName: string) => {
    setRenameNode({ path, name: currentName });
    closeContextMenu();
  }, [closeContextMenu]);

  const confirmRename = useCallback(() => {
    if (renameNode && renameNode.name.trim()) {
      const newNodes = JSON.parse(JSON.stringify(treeNodes)) as TreeNode[];
      let current = newNodes;
      for (let i = 0; i < renameNode.path.length - 1; i++) {
        current = current[renameNode.path[i]].children!;
      }
      current[renameNode.path[renameNode.path.length - 1]].name = renameNode.name.trim();
      setTreeNodes(newNodes);
    }
    setRenameNode(null);
  }, [renameNode, treeNodes]);

  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    if (!contextMenu) return [];
    return [
      {
        label: 'Ajouter sous-dossier',
        icon: <FolderPlus size={14} />,
        onClick: () => addSubfolder(contextMenu.path),
      },
      {
        label: 'Renommer',
        icon: <Edit3 size={14} />,
        onClick: () => startRename(contextMenu.path, contextMenu.node.name),
      },
      { label: '', onClick: () => {}, divider: true },
      {
        label: 'Supprimer',
        icon: <Trash2 size={14} />,
        onClick: () => deleteFolder(contextMenu.path),
        danger: true,
      },
    ];
  }, [contextMenu, addSubfolder, startRename, deleteFolder]);

  const handleSave = () => {
    const folderStructure = treeToFlat(treeNodes);
    onUpdate({
      workspacePath,
      geminiApiKey: geminiApiKey || undefined,
      geminiModel: geminiModel || undefined,
      folderStructure,
    });
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Modal
      title="Paramètres"
      onClose={onClose}
      className="settings-modal"
      footer={
        <Button onClick={handleSave}>
          <Save size={16} />
          {saved ? 'Enregistré !' : 'Sauvegarder'}
        </Button>
      }
    >
      <div className="settings-content">
        {/* Dossier de travail */}
        <div className="settings-section">
          <h3 className="settings-section-title">Dossier de travail</h3>
          <p className="settings-hint">
            Le dossier contenant tous vos projets web.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <input
              className="form-input"
              value={workspacePath}
              onChange={(e) => setWorkspacePath(e.target.value)}
              placeholder="/Users/vous/Sites"
              style={{ flex: 1 }}
            />
            <Button variant="secondary" onClick={handleSelectFolder}>
              <FolderOpen size={16} />
            </Button>
          </div>
        </div>

        {/* API Gemini */}
        <div className="settings-section">
          <h3 className="settings-section-title">API Gemini</h3>
          <p className="settings-hint">
            Clé API pour le parsing intelligent des credentials FTP.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <input
                className="form-input"
                type="password"
                value={geminiApiKey}
                onChange={(e) => {
                  setGeminiApiKey(e.target.value);
                  setGeminiStatus('idle');
                }}
                placeholder="AIza..."
              />
            </div>
            <Button
              variant="secondary"
              onClick={handleTestGemini}
              disabled={!geminiApiKey || geminiStatus === 'testing'}
            >
              {geminiStatus === 'testing' ? (
                <Loader size={16} className="spinner" />
              ) : (
                'Tester'
              )}
            </Button>
          </div>

          {/* Statut de connexion */}
          {geminiStatus !== 'idle' && geminiStatus !== 'testing' && (
            <div
              className={`gemini-status ${geminiStatus}`}
              style={{ marginTop: 12 }}
            >
              {geminiStatus === 'connected' ? (
                <>
                  <CheckCircle size={16} />
                  <span>Connexion réussie à Gemini API</span>
                </>
              ) : (
                <>
                  <XCircle size={16} />
                  <span>Échec de connexion - Vérifiez votre clé API</span>
                </>
              )}
            </div>
          )}

          {/* Sélecteur de modèle */}
          {availableModels.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <label className="settings-label">Modèle Gemini</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  className="form-input form-select"
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  style={{ flex: 1 }}
                >
                  {availableModels.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.displayName}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  onClick={() => loadModels(geminiApiKey)}
                  disabled={loadingModels || !geminiApiKey}
                  title="Actualiser la liste des modèles"
                >
                  {loadingModels ? (
                    <Loader size={16} className="spinner" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                </Button>
              </div>
              {geminiModel && (
                <p className="settings-hint" style={{ marginTop: 4 }}>
                  Modèle sélectionné : {geminiModel}
                </p>
              )}
            </div>
          )}

          <p className="settings-hint" style={{ marginTop: 8 }}>
            <Key size={12} style={{ marginRight: 4 }} />
            Obtenez votre clé sur{' '}
            <a
              href="https://makersuite.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent-blue)' }}
            >
              Google AI Studio
            </a>
          </p>
        </div>

        {/* Structure des dossiers */}
        <div className="settings-section settings-section-folders">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 className="settings-section-title" style={{ marginBottom: 0 }}>
              Structure des dossiers projet
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-ghost-small"
                onClick={addRootFolder}
                title="Ajouter un dossier racine"
              >
                <Plus size={14} />
                Nouveau
              </button>
              <button
                className="btn-ghost-small"
                onClick={handleResetStructure}
                title="Réinitialiser la structure par défaut"
              >
                <RotateCcw size={14} />
                Réinitialiser
              </button>
            </div>
          </div>
          <p className="settings-hint">
            Dossiers créés automatiquement pour chaque nouveau projet. Clic droit pour ajouter/supprimer.
          </p>

          <div className="tree-container">
            {treeNodes.length > 0 ? (
              <TreeView
                nodes={treeNodes}
                onChange={handleTreeChange}
                onContextMenu={handleContextMenu}
              />
            ) : (
              <div className="tree-empty">
                Aucun dossier. Cliquez sur "Nouveau" pour en ajouter.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={closeContextMenu}
        />
      )}

      {/* Rename Dialog */}
      {renameNode && (
        <div className="rename-overlay">
          <div className="rename-dialog">
            <h4>Renommer le dossier</h4>
            <input
              className="form-input"
              value={renameNode.name}
              onChange={(e) => setRenameNode({ ...renameNode, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename();
                if (e.key === 'Escape') setRenameNode(null);
              }}
              autoFocus
            />
            <div className="rename-actions">
              <Button variant="secondary" onClick={() => setRenameNode(null)}>
                Annuler
              </Button>
              <Button onClick={confirmRename}>
                Renommer
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
