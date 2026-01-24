import { useCallback } from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import {
  Folder,
  FolderOpen,
  File,
  Lock,
  RefreshCw,
  FolderPlus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Loader,
  AlertTriangle,
} from 'lucide-react';
import { fileSystemService } from '../../../services/fileSystemService';
import { projectService } from '../../../services/projectService';
import { Button, Modal, ContextMenu } from '../../../components/ui';
import {
  useFileTree,
  useFileTreeDragAndDrop,
  useFileTreeModals,
  useFileTreeContextMenu,
  toDroppableId,
  FlatFileNode,
} from '../hooks';

interface ProjectFileTreeProps {
  projectPath: string;
  lockedFolders?: string[];
  onFileSelect?: (path: string) => void;
}

// Draggable/Droppable tree item component
interface DraggableFileItemProps {
  node: FlatFileNode;
  isDropTarget: boolean;
  isDraggingSource: boolean;
  onToggle: (path: string) => void;
  onClick: (node: FlatFileNode) => void;
  onDoubleClick: (node: FlatFileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FlatFileNode) => void;
}

function DraggableFileItem({
  node,
  isDropTarget,
  isDraggingSource,
  onToggle,
  onClick,
  onDoubleClick,
  onContextMenu,
}: DraggableFileItemProps) {
  // Draggable setup
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: node.path,
    disabled: node.isLocked,
  });

  // Droppable setup - only directories can be drop targets
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: toDroppableId(node.path),
    disabled: !node.isDirectory || node.isLocked,
  });

  // Combine refs
  const setNodeRef = useCallback(
    (el: HTMLElement | null) => {
      setDragRef(el);
      setDropRef(el);
    },
    [setDragRef, setDropRef]
  );

  const showDropIndicator = (isDropTarget || isOver) && !isDraggingSource && !isDragging && node.isDirectory;

  const className = [
    'tree-item',
    showDropIndicator ? 'drop-target drag-over-inside' : '',
    isDraggingSource || isDragging ? 'dragging' : '',
    node.isLocked ? 'locked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={{
        paddingLeft: `${node.depth * 20 + 8}px`,
        opacity: isDraggingSource || isDragging ? 0.4 : 1,
        cursor: node.isLocked ? 'not-allowed' : 'grab',
      }}
      onClick={() => onClick(node)}
      onDoubleClick={() => onDoubleClick(node)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, node);
      }}
      {...attributes}
      {...(node.isLocked ? {} : listeners)}
    >
      <button
        className="tree-toggle"
        onClick={(e) => {
          e.stopPropagation();
          if (node.isDirectory) onToggle(node.path);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          visibility: node.hasChildren ? 'visible' : 'hidden',
          opacity: node.hasChildren ? 1 : 0,
        }}
      >
        {node.isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <span className="tree-icon">
        {node.isLocked ? (
          <Lock size={16} />
        ) : node.isDirectory ? (
          node.isExpanded ? (
            <FolderOpen size={16} />
          ) : (
            <Folder size={16} />
          )
        ) : (
          <File size={16} />
        )}
      </span>
      <span className="tree-label">{node.name}</span>
      {node.isLocked && <span className="tree-locked-badge">verrouille</span>}
      {!node.isDirectory && node.size !== undefined && (
        <span className="tree-file-size">{formatFileSize(node.size)}</span>
      )}
    </div>
  );
}

export function ProjectFileTree({
  projectPath,
  lockedFolders = ['_Inbox'],
  onFileSelect,
}: ProjectFileTreeProps) {
  // File tree state
  const {
    tree,
    flatNodes,
    loading,
    error,
    loadTree,
    toggleExpand,
    setSelectedPath,
  } = useFileTree({ projectPath, lockedFolders });

  // Modal handlers
  const modals = useFileTreeModals({
    onOperationComplete: loadTree,
  });

  // Drag and drop
  const dnd = useFileTreeDragAndDrop({
    flatNodes,
    onMoveComplete: loadTree,
  });

  // Context menu
  const contextMenuHook = useFileTreeContextMenu({
    onNewFolder: modals.openNewFolderModal,
    onRename: modals.openRenameModal,
    onDelete: modals.openDeleteModal,
  });

  // Handle item click
  const handleItemClick = useCallback(
    (node: FlatFileNode) => {
      setSelectedPath(node.path);
      if (node.isDirectory) {
        toggleExpand(node.path);
      } else {
        onFileSelect?.(node.path);
      }
    },
    [toggleExpand, onFileSelect, setSelectedPath]
  );

  // Handle double click to open in Finder
  const handleItemDoubleClick = useCallback((node: FlatFileNode) => {
    const pathToOpen = node.isDirectory
      ? node.path
      : fileSystemService.getParentPath(node.path);
    projectService.openInFinder(pathToOpen);
  }, []);

  if (loading) {
    return (
      <div className="file-tree-loading">
        <Loader size={24} className="spinner" />
        <span>Chargement de l'arborescence...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-tree-error">
        <AlertTriangle size={24} />
        <span>{error}</span>
        <Button variant="secondary" onClick={loadTree}>
          <RefreshCw size={14} />
          Reessayer
        </Button>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="file-tree-empty">
        <Folder size={48} style={{ opacity: 0.3 }} />
        <span>Aucun fichier trouve</span>
      </div>
    );
  }

  return (
    <div className="project-file-tree">
      <div className="file-tree-header">
        <h4>Fichiers du projet</h4>
        <div className="file-tree-actions">
          <button
            className="btn-ghost-small"
            onClick={() =>
              modals.openNewFolderModal(projectPath, fileSystemService.getName(projectPath))
            }
            title="Nouveau dossier"
          >
            <FolderPlus size={14} />
            Nouveau
          </button>
          <button className="btn-ghost-small" onClick={loadTree} title="Actualiser">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <DndContext
        sensors={dnd.sensors}
        onDragStart={dnd.handleDragStart}
        onDragOver={dnd.handleDragOver}
        onDragEnd={dnd.handleDragEnd}
        onDragCancel={dnd.handleDragCancel}
      >
        <div className="tree-container file-tree-content">
          <div className="tree-view">
            {flatNodes.map((node) => (
              <DraggableFileItem
                key={node.path}
                node={node}
                isDropTarget={dnd.overId === node.path && dnd.activeId !== node.path}
                isDraggingSource={dnd.activeId === node.path}
                onToggle={toggleExpand}
                onClick={handleItemClick}
                onDoubleClick={handleItemDoubleClick}
                onContextMenu={contextMenuHook.handleContextMenu}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {dnd.activeNode && (
            <div
              className="tree-item"
              style={{
                padding: '8px 12px',
                background: 'var(--bg-secondary)',
                borderRadius: 4,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                border: '1px solid var(--accent-blue)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'grabbing',
              }}
            >
              {dnd.activeNode.isDirectory ? (
                <Folder size={16} style={{ color: 'var(--accent-yellow)' }} />
              ) : (
                <File size={16} style={{ color: 'var(--text-secondary)' }} />
              )}
              <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{dnd.activeNode.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Context Menu */}
      {contextMenuHook.contextMenu && (
        <ContextMenu
          x={contextMenuHook.contextMenu.x}
          y={contextMenuHook.contextMenu.y}
          items={contextMenuHook.getContextMenuItems()}
          onClose={contextMenuHook.closeContextMenu}
        />
      )}

      {/* New Folder Modal */}
      {modals.newFolderModal && (
        <Modal
          title={`Nouveau dossier dans "${modals.newFolderModal.parentName}"`}
          onClose={modals.closeNewFolderModal}
          className="folder-modal"
        >
          <div>
            <label className="form-label">Nom du dossier</label>
            <input
              className="form-input"
              value={modals.newFolderName}
              onChange={(e) => modals.setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') modals.handleCreateFolder();
                if (e.key === 'Escape') modals.closeNewFolderModal();
              }}
              placeholder="Nom du dossier..."
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" onClick={modals.closeNewFolderModal}>
              Annuler
            </Button>
            <Button onClick={modals.handleCreateFolder} disabled={!modals.newFolderName.trim() || modals.isOperating}>
              {modals.isOperating ? <Loader size={14} className="spinner" /> : null}
              Creer
            </Button>
          </div>
        </Modal>
      )}

      {/* Rename Modal */}
      {modals.renameModal && (
        <Modal
          title={`Renommer "${modals.renameModal.currentName}"`}
          onClose={modals.closeRenameModal}
          className="folder-modal"
        >
          <div>
            <label className="form-label">Nouveau nom</label>
            <input
              className="form-input"
              value={modals.renameName}
              onChange={(e) => modals.setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') modals.handleRename();
                if (e.key === 'Escape') modals.closeRenameModal();
              }}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" onClick={modals.closeRenameModal}>
              Annuler
            </Button>
            <Button onClick={modals.handleRename} disabled={!modals.renameName.trim() || modals.isOperating}>
              {modals.isOperating ? <Loader size={14} className="spinner" /> : null}
              Renommer
            </Button>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {modals.deleteModal && (
        <Modal
          title={`Supprimer "${modals.deleteModal.name}" ?`}
          onClose={modals.closeDeleteModal}
          className="folder-modal"
        >
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <AlertTriangle size={48} style={{ color: 'var(--error)', marginBottom: 16 }} />
            <p>
              Etes-vous sur de vouloir supprimer{' '}
              <strong>
                {modals.deleteModal.isDirectory ? 'le dossier' : 'le fichier'} "{modals.deleteModal.name}"
              </strong>{' '}
              ?
            </p>
            {modals.deleteModal.isDirectory && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>
                Tout le contenu sera supprime definitivement.
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" onClick={modals.closeDeleteModal}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={modals.handleDelete}
              disabled={modals.isOperating}
              style={{ background: 'var(--error)' }}
            >
              {modals.isOperating ? <Loader size={14} className="spinner" /> : <Trash2 size={14} />}
              Supprimer
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
