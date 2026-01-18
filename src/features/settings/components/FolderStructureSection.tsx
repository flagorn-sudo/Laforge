import { useState, useCallback, useEffect } from 'react';
import { Plus, RotateCcw, FolderPlus, Trash2, Edit3 } from 'lucide-react';
import { TreeView, ContextMenu, Button, Modal } from '../../../components/ui';
import type { TreeNode, ContextMenuItem } from '../../../components/ui';
import { FOLDER_DESCRIPTIONS } from '../../../types';

// Locked folders that cannot be modified
const LOCKED_FOLDERS = ['_Inbox'];

interface FolderStructureSectionProps {
  treeNodes: TreeNode[];
  onTreeChange: (nodes: TreeNode[]) => void;
  onAddRootFolder: (name: string) => void;
  onAddSubfolder: (path: number[], name: string) => void;
  onDeleteFolder: (path: number[]) => void;
  onRenameFolder: (path: number[], newName: string) => void;
  onReset: () => void;
}

export function FolderStructureSection({
  treeNodes,
  onTreeChange,
  onAddRootFolder,
  onAddSubfolder,
  onDeleteFolder,
  onRenameFolder,
  onReset,
}: FolderStructureSectionProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: TreeNode;
    path: number[];
  } | null>(null);

  const [newFolderModal, setNewFolderModal] = useState<{
    type: 'root' | 'subfolder';
    path?: number[];
    parentName?: string;
  } | null>(null);

  const [renameModal, setRenameModal] = useState<{
    path: number[];
    currentName: string;
  } | null>(null);

  const [newFolderName, setNewFolderName] = useState('');
  const [renameName, setRenameName] = useState('');

  // Reset input when modal opens
  useEffect(() => {
    if (newFolderModal) {
      setNewFolderName('');
    }
  }, [newFolderModal]);

  useEffect(() => {
    if (renameModal) {
      setRenameName(renameModal.currentName);
    }
  }, [renameModal]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: TreeNode, path: number[]) => {
      // Don't show context menu for locked folders
      if (LOCKED_FOLDERS.includes(node.name)) {
        return;
      }
      setContextMenu({ x: e.clientX, y: e.clientY, node, path });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleOpenNewRootFolder = useCallback(() => {
    setNewFolderModal({ type: 'root' });
  }, []);

  const handleOpenNewSubfolder = useCallback((path: number[], parentName: string) => {
    setNewFolderModal({ type: 'subfolder', path, parentName });
    closeContextMenu();
  }, [closeContextMenu]);

  const handleCreateFolder = useCallback(() => {
    const name = newFolderName.trim();
    if (!name) return;

    // Don't allow creating folders with locked names
    if (LOCKED_FOLDERS.includes(name)) {
      return;
    }

    if (newFolderModal?.type === 'root') {
      onAddRootFolder(name);
    } else if (newFolderModal?.type === 'subfolder' && newFolderModal.path) {
      onAddSubfolder(newFolderModal.path, name);
    }

    setNewFolderModal(null);
    setNewFolderName('');
  }, [newFolderName, newFolderModal, onAddRootFolder, onAddSubfolder]);

  const handleOpenRename = useCallback((path: number[], currentName: string) => {
    setRenameModal({ path, currentName });
    closeContextMenu();
  }, [closeContextMenu]);

  const handleRename = useCallback(() => {
    const name = renameName.trim();
    if (!name || !renameModal) return;

    // Don't allow renaming to locked folder names
    if (LOCKED_FOLDERS.includes(name)) {
      return;
    }

    onRenameFolder(renameModal.path, name);
    setRenameModal(null);
    setRenameName('');
  }, [renameName, renameModal, onRenameFolder]);

  const handleDelete = useCallback((path: number[]) => {
    onDeleteFolder(path);
    closeContextMenu();
  }, [onDeleteFolder, closeContextMenu]);

  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    if (!contextMenu) return [];

    const isLocked = LOCKED_FOLDERS.includes(contextMenu.node.name);
    if (isLocked) return [];

    return [
      {
        label: 'Ajouter sous-dossier',
        icon: <FolderPlus size={14} />,
        onClick: () => handleOpenNewSubfolder(contextMenu.path, contextMenu.node.name),
      },
      {
        label: 'Renommer',
        icon: <Edit3 size={14} />,
        onClick: () => handleOpenRename(contextMenu.path, contextMenu.node.name),
      },
      { label: '', onClick: () => {}, divider: true },
      {
        label: 'Supprimer',
        icon: <Trash2 size={14} />,
        onClick: () => handleDelete(contextMenu.path),
        danger: true,
      },
    ];
  }, [contextMenu, handleOpenNewSubfolder, handleOpenRename, handleDelete]);

  return (
    <>
      <div className="settings-section settings-section-folders">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <h3 className="settings-section-title" style={{ marginBottom: 0 }}>
            Structure des dossiers projet
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-ghost-small"
              onClick={handleOpenNewRootFolder}
              title="Ajouter un dossier racine"
            >
              <Plus size={14} />
              Nouveau
            </button>
            <button
              className="btn-ghost-small"
              onClick={onReset}
              title="Réinitialiser la structure par défaut"
            >
              <RotateCcw size={14} />
              Réinitialiser
            </button>
          </div>
        </div>
        <p className="settings-hint">
          Dossiers créés automatiquement pour chaque nouveau projet. Glissez-déposez pour réorganiser.
          Clic droit pour ajouter/renommer/supprimer. Le dossier _Inbox est verrouillé (surveillance automatique).
        </p>

        <div className="tree-container">
          {treeNodes.length > 0 ? (
            <TreeView
              nodes={treeNodes}
              onChange={onTreeChange}
              onContextMenu={handleContextMenu}
              lockedFolders={LOCKED_FOLDERS}
              descriptions={FOLDER_DESCRIPTIONS}
            />
          ) : (
            <div className="tree-empty">
              Aucun dossier. Cliquez sur "Nouveau" pour en ajouter.
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={closeContextMenu}
        />
      )}

      {/* New Folder Modal */}
      {newFolderModal && (
        <Modal
          title={newFolderModal.type === 'root' ? 'Nouveau dossier' : `Nouveau sous-dossier dans "${newFolderModal.parentName}"`}
          onClose={() => setNewFolderModal(null)}
          className="folder-modal"
        >
          <div style={{ padding: '0' }}>
            <label className="form-label">Nom du dossier</label>
            <input
              className="form-input"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') setNewFolderModal(null);
              }}
              placeholder="Nom du dossier..."
              autoFocus
            />
            {LOCKED_FOLDERS.includes(newFolderName.trim()) && (
              <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>
                Ce nom est réservé et ne peut pas être utilisé.
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setNewFolderModal(null)}>
              Annuler
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || LOCKED_FOLDERS.includes(newFolderName.trim())}
            >
              Créer
            </Button>
          </div>
        </Modal>
      )}

      {/* Rename Modal */}
      {renameModal && (
        <Modal
          title="Renommer le dossier"
          onClose={() => setRenameModal(null)}
          className="folder-modal"
        >
          <div style={{ padding: '0' }}>
            <label className="form-label">Nouveau nom</label>
            <input
              className="form-input"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setRenameModal(null);
              }}
              autoFocus
            />
            {LOCKED_FOLDERS.includes(renameName.trim()) && (
              <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>
                Ce nom est réservé et ne peut pas être utilisé.
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setRenameModal(null)}>
              Annuler
            </Button>
            <Button
              onClick={handleRename}
              disabled={!renameName.trim() || LOCKED_FOLDERS.includes(renameName.trim())}
            >
              Renommer
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
