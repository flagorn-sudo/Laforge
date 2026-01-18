import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  Folder,
  FolderOpen,
  File,
  Lock,
  RefreshCw,
  FolderPlus,
  Trash2,
  Edit3,
  ChevronRight,
  ChevronDown,
  Loader,
  AlertTriangle,
} from 'lucide-react';
import { fileSystemService, DirectoryNode } from '../../../services/fileSystemService';
import { projectService } from '../../../services/projectService';
import { Button, Modal, ContextMenu } from '../../../components/ui';
import type { ContextMenuItem } from '../../../components/ui';

interface ProjectFileTreeProps {
  projectPath: string;
  lockedFolders?: string[];
  onFileSelect?: (path: string) => void;
}

// Flat node for rendering
interface FlatFileNode {
  path: string;
  name: string;
  depth: number;
  isDirectory: boolean;
  isExpanded: boolean;
  isLocked: boolean;
  hasChildren: boolean;
  size?: number;
}

// Helper to create droppable ID
const toDroppableId = (path: string) => `drop:${path}`;
const fromDroppableId = (droppableId: string) => droppableId.replace('drop:', '');

// Draggable/Droppable tree item
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
  const [tree, setTree] = useState<DirectoryNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [, setSelectedPath] = useState<string | null>(null);

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: FlatFileNode;
  } | null>(null);

  // Modal states
  const [newFolderModal, setNewFolderModal] = useState<{
    parentPath: string;
    parentName: string;
  } | null>(null);
  const [renameModal, setRenameModal] = useState<{
    path: string;
    currentName: string;
    isDirectory: boolean;
  } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{
    path: string;
    name: string;
    isDirectory: boolean;
  } | null>(null);

  const [newFolderName, setNewFolderName] = useState('');
  const [renameName, setRenameName] = useState('');
  const [isOperating, setIsOperating] = useState(false);

  // Configure dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Load directory tree
  const loadTree = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fileSystemService.readDirectoryTree(projectPath, 10);
      setTree(result);

      // Expand root and first level by default
      const initialExpanded = new Set<string>([result.path]);
      result.children?.forEach((child) => {
        if (child.isDirectory) {
          initialExpanded.add(child.path);
        }
      });
      setExpandedPaths(initialExpanded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Flatten tree for rendering
  const flattenTree = useCallback(
    (node: DirectoryNode, depth: number): FlatFileNode[] => {
      const name = fileSystemService.getName(node.path);
      const isLocked = lockedFolders.includes(name);
      const isExpanded = expandedPaths.has(node.path);
      const hasChildren = node.isDirectory && (node.children?.length ?? 0) > 0;

      const flatNode: FlatFileNode = {
        path: node.path,
        name,
        depth,
        isDirectory: node.isDirectory,
        isExpanded,
        isLocked,
        hasChildren,
        size: node.size,
      };

      if (node.isDirectory && isExpanded && node.children) {
        return [flatNode, ...node.children.flatMap((child) => flattenTree(child, depth + 1))];
      }

      return [flatNode];
    },
    [expandedPaths, lockedFolders]
  );

  const flatNodes = useMemo(() => {
    if (!tree) return [];
    // Start from children to not show root
    return tree.children?.flatMap((child) => flattenTree(child, 0)) ?? [];
  }, [tree, flattenTree]);

  const activeNode = useMemo(
    () => flatNodes.find((n) => n.path === activeId) || null,
    [flatNodes, activeId]
  );

  // Toggle expand/collapse
  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // DnD handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = event.active.id as string;
      const node = flatNodes.find((n) => n.path === id);
      if (!node || node.isLocked) return;
      console.log('[ProjectFileTree] dragStart:', id);
      setActiveId(id);
    },
    [flatNodes]
  );

  const handleDragOver = useCallback((event: DragOverEvent) => {
    if (!event.over) {
      setOverId(null);
      return;
    }
    const rawId = event.over.id as string;
    const targetPath = rawId.startsWith('drop:') ? fromDroppableId(rawId) : rawId;
    setOverId(targetPath);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      const sourcePath = active.id as string;

      setActiveId(null);
      setOverId(null);

      if (!over) return;

      const rawTargetId = over.id as string;
      const targetPath = rawTargetId.startsWith('drop:') ? fromDroppableId(rawTargetId) : rawTargetId;

      // Don't drop on self
      if (sourcePath === targetPath) return;

      const sourceNode = flatNodes.find((n) => n.path === sourcePath);
      const targetNode = flatNodes.find((n) => n.path === targetPath);

      if (!sourceNode || !targetNode) {
        console.error('[ProjectFileTree] Node not found:', { sourcePath, targetPath });
        return;
      }

      // Only drop on directories
      if (!targetNode.isDirectory) {
        console.log('[ProjectFileTree] Target is not a directory');
        return;
      }

      // Don't drop on locked folders
      if (targetNode.isLocked) {
        console.log('[ProjectFileTree] Target is locked');
        return;
      }

      // Don't drop parent into child
      if (targetPath.startsWith(sourcePath + '/')) {
        console.log('[ProjectFileTree] Cannot drop parent into child');
        return;
      }

      console.log('[ProjectFileTree] Moving:', sourcePath, '->', targetPath);

      setIsOperating(true);
      try {
        const name = fileSystemService.getName(sourcePath);
        const newPath = fileSystemService.joinPath(targetPath, name);
        await fileSystemService.moveItem(sourcePath, newPath);
        await loadTree();
        console.log('[ProjectFileTree] Move successful');
      } catch (err) {
        console.error('[ProjectFileTree] Move failed:', err);
      } finally {
        setIsOperating(false);
      }
    },
    [flatNodes, loadTree]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOverId(null);
  }, []);

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, node: FlatFileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Context menu items
  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    if (!contextMenu) return [];

    const { node } = contextMenu;
    const items: ContextMenuItem[] = [];

    if (node.isDirectory) {
      items.push({
        label: 'Nouveau dossier',
        icon: <FolderPlus size={14} />,
        onClick: () => {
          setNewFolderModal({
            parentPath: node.path,
            parentName: node.name,
          });
          closeContextMenu();
        },
      });
    }

    if (!node.isLocked) {
      items.push({
        label: 'Renommer',
        icon: <Edit3 size={14} />,
        onClick: () => {
          setRenameModal({
            path: node.path,
            currentName: node.name,
            isDirectory: node.isDirectory,
          });
          closeContextMenu();
        },
      });

      items.push({ label: '', onClick: () => {}, divider: true });

      items.push({
        label: 'Supprimer',
        icon: <Trash2 size={14} />,
        onClick: () => {
          setDeleteModal({
            path: node.path,
            name: node.name,
            isDirectory: node.isDirectory,
          });
          closeContextMenu();
        },
        danger: true,
      });
    }

    items.push({ label: '', onClick: () => {}, divider: true });
    items.push({
      label: 'Ouvrir dans Finder',
      icon: <Folder size={14} />,
      onClick: () => {
        const pathToOpen = node.isDirectory
          ? node.path
          : fileSystemService.getParentPath(node.path);
        projectService.openInFinder(pathToOpen);
        closeContextMenu();
      },
    });

    return items;
  }, [contextMenu, closeContextMenu]);

  // Create folder
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderModal || !newFolderName.trim()) return;

    setIsOperating(true);
    try {
      const newPath = fileSystemService.joinPath(newFolderModal.parentPath, newFolderName.trim());
      await fileSystemService.createFolder(newPath);
      await loadTree();
      setNewFolderModal(null);
      setNewFolderName('');
    } catch (err) {
      console.error('Failed to create folder:', err);
    } finally {
      setIsOperating(false);
    }
  }, [newFolderModal, newFolderName, loadTree]);

  // Rename item
  const handleRename = useCallback(async () => {
    if (!renameModal || !renameName.trim()) return;

    setIsOperating(true);
    try {
      const parentPath = fileSystemService.getParentPath(renameModal.path);
      const newPath = fileSystemService.joinPath(parentPath, renameName.trim());
      await fileSystemService.renameItem(renameModal.path, newPath);
      await loadTree();
      setRenameModal(null);
      setRenameName('');
    } catch (err) {
      console.error('Failed to rename:', err);
    } finally {
      setIsOperating(false);
    }
  }, [renameModal, renameName, loadTree]);

  // Delete item
  const handleDelete = useCallback(async () => {
    if (!deleteModal) return;

    setIsOperating(true);
    try {
      if (deleteModal.isDirectory) {
        await fileSystemService.deleteFolder(deleteModal.path, true);
      } else {
        await fileSystemService.deleteFile(deleteModal.path);
      }
      await loadTree();
      setDeleteModal(null);
    } catch (err) {
      console.error('Failed to delete:', err);
    } finally {
      setIsOperating(false);
    }
  }, [deleteModal, loadTree]);

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
    [toggleExpand, onFileSelect]
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
              setNewFolderModal({
                parentPath: projectPath,
                parentName: fileSystemService.getName(projectPath),
              })
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
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="tree-container file-tree-content">
          <div className="tree-view">
            {flatNodes.map((node) => (
              <DraggableFileItem
                key={node.path}
                node={node}
                isDropTarget={overId === node.path && activeId !== node.path}
                isDraggingSource={activeId === node.path}
                onToggle={toggleExpand}
                onClick={handleItemClick}
                onDoubleClick={handleItemDoubleClick}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeNode && (
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
              {activeNode.isDirectory ? (
                <Folder size={16} style={{ color: 'var(--accent-yellow)' }} />
              ) : (
                <File size={16} style={{ color: 'var(--text-secondary)' }} />
              )}
              <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{activeNode.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Context Menu */}
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
          title={`Nouveau dossier dans "${newFolderModal.parentName}"`}
          onClose={() => setNewFolderModal(null)}
          className="folder-modal"
        >
          <div>
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
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setNewFolderModal(null)}>
              Annuler
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || isOperating}>
              {isOperating ? <Loader size={14} className="spinner" /> : null}
              Creer
            </Button>
          </div>
        </Modal>
      )}

      {/* Rename Modal */}
      {renameModal && (
        <Modal
          title={`Renommer "${renameModal.currentName}"`}
          onClose={() => setRenameModal(null)}
          className="folder-modal"
        >
          <div>
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
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setRenameModal(null)}>
              Annuler
            </Button>
            <Button onClick={handleRename} disabled={!renameName.trim() || isOperating}>
              {isOperating ? <Loader size={14} className="spinner" /> : null}
              Renommer
            </Button>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <Modal
          title={`Supprimer "${deleteModal.name}" ?`}
          onClose={() => setDeleteModal(null)}
          className="folder-modal"
        >
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <AlertTriangle size={48} style={{ color: 'var(--error)', marginBottom: 16 }} />
            <p>
              Etes-vous sur de vouloir supprimer{' '}
              <strong>
                {deleteModal.isDirectory ? 'le dossier' : 'le fichier'} "{deleteModal.name}"
              </strong>{' '}
              ?
            </p>
            {deleteModal.isDirectory && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>
                Tout le contenu sera supprime definitivement.
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setDeleteModal(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleDelete}
              disabled={isOperating}
              style={{ background: 'var(--error)' }}
            >
              {isOperating ? <Loader size={14} className="spinner" /> : <Trash2 size={14} />}
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
