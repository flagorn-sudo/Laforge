import { useState, useMemo, useCallback } from 'react';
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
import { ChevronRight, ChevronDown, Folder, FolderOpen, Lock } from 'lucide-react';
import {
  TreeNode,
  cloneNodes,
  findNodeById,
  isAncestorOf,
} from './TreeViewUtils';

// Re-export utilities for backward compatibility
export { flatToTree, treeToFlat, generateNodeId } from './TreeViewUtils';
export type { TreeNode } from './TreeViewUtils';

export interface TreeViewProps {
  nodes: TreeNode[];
  onChange: (nodes: TreeNode[]) => void;
  onContextMenu?: (e: React.MouseEvent, node: TreeNode, path: number[]) => void;
  lockedFolders?: string[];
  /** Optional descriptions for folders, keyed by folder name */
  descriptions?: Record<string, string>;
}

// Flattened node representation for rendering
interface FlatNode {
  id: string;
  name: string;
  depth: number;
  isExpanded: boolean;
  isLocked: boolean;
  hasChildren: boolean;
  path: number[];
}

/**
 * Flatten tree to a list for rendering (respecting expansion state)
 */
function flattenTree(nodes: TreeNode[], depth = 0, basePath: number[] = []): FlatNode[] {
  return nodes.flatMap((node, index) => {
    const path = [...basePath, index];
    const isExpanded = node.isExpanded !== false;
    const flat: FlatNode = {
      id: node.id,
      name: node.name,
      depth,
      isExpanded,
      isLocked: node.isLocked || false,
      hasChildren: (node.children?.length ?? 0) > 0,
      path,
    };
    if (isExpanded && node.children && node.children.length > 0) {
      return [flat, ...flattenTree(node.children, depth + 1, path)];
    }
    return [flat];
  });
}

/**
 * Move a node inside another node as a child
 */
function moveNodeInto(nodes: TreeNode[], sourceId: string, targetId: string): TreeNode[] | null {
  const newNodes = cloneNodes(nodes);

  // Find source
  const sourceResult = findNodeById(newNodes, sourceId, newNodes);
  if (!sourceResult) {
    console.error('[TreeView] Source not found:', sourceId);
    return null;
  }

  // Save a deep copy of the node we're moving
  const movedNode = JSON.parse(JSON.stringify(sourceResult.node));

  // Remove source from parent array
  sourceResult.parent.splice(sourceResult.index, 1);

  // Find target AFTER removing source (indices may have shifted)
  const targetResult = findNodeById(newNodes, targetId, newNodes);
  if (!targetResult) {
    console.error('[TreeView] Target not found:', targetId);
    return null;
  }

  // Add to target's children
  if (!targetResult.node.children) {
    targetResult.node.children = [];
  }
  targetResult.node.children.push(movedNode);
  targetResult.node.isExpanded = true;

  return newNodes;
}

// Helper to create droppable ID from node ID
const toDroppableId = (nodeId: string) => `drop:${nodeId}`;
// Helper to extract node ID from droppable ID
const fromDroppableId = (droppableId: string) => droppableId.replace('drop:', '');

// Draggable tree item component
interface DraggableTreeItemProps {
  node: FlatNode;
  isOverTarget: boolean;
  isDraggingSource: boolean;
  lockedFolders: string[];
  descriptions?: Record<string, string>;
  onToggle: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, node: FlatNode) => void;
}

function DraggableTreeItem({
  node,
  isOverTarget,
  isDraggingSource,
  lockedFolders,
  descriptions,
  onToggle,
  onContextMenu,
}: DraggableTreeItemProps) {
  const isLocked = node.isLocked || lockedFolders.includes(node.name);
  const description = descriptions?.[node.name];

  // Draggable setup - uses node.id
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: node.id,
    disabled: isLocked,
  });

  // Droppable setup - uses different ID to avoid conflict
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: toDroppableId(node.id),
    disabled: isLocked,
  });

  // Combine refs
  const setNodeRef = useCallback((el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  }, [setDragRef, setDropRef]);

  const showDropIndicator = (isOverTarget || isOver) && !isDraggingSource && !isDragging;

  const className = [
    'tree-item',
    showDropIndicator ? 'drag-over drag-over-inside' : '',
    isDraggingSource || isDragging ? 'dragging' : '',
    isLocked ? 'locked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={{
        opacity: isDraggingSource || isDragging ? 0.4 : 1,
        cursor: isLocked ? 'not-allowed' : 'grab',
      }}
      {...attributes}
      {...(isLocked ? {} : listeners)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e, node);
      }}
    >
      <div
        style={{
          paddingLeft: `${node.depth * 20 + 8}px`,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <button
          className="tree-toggle"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ visibility: node.hasChildren ? 'visible' : 'hidden' }}
        >
          {node.isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="tree-icon">
          {isLocked ? (
            <Lock size={16} />
          ) : node.isExpanded && node.hasChildren ? (
            <FolderOpen size={16} />
          ) : (
            <Folder size={16} />
          )}
        </span>
        <span className="tree-label">{node.name}</span>
        {description && (
          <span className="tree-description">{description}</span>
        )}
        {isLocked && <span className="tree-locked-badge">verrouille</span>}
      </div>
    </div>
  );
}

export function TreeView({
  nodes,
  onChange,
  onContextMenu,
  lockedFolders = [],
  descriptions,
}: TreeViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Flatten the tree for rendering
  const flatNodes = useMemo(() => flattenTree(nodes), [nodes]);

  // Find the active node for the drag overlay
  const activeNode = useMemo(
    () => flatNodes.find((n) => n.id === activeId) || null,
    [flatNodes, activeId]
  );

  // Configure sensors with activation constraint
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    const node = flatNodes.find((n) => n.id === id);

    if (!node) return;

    // Don't start drag on locked items
    if (node.isLocked || lockedFolders.includes(node.name)) {
      return;
    }

    setActiveId(id);
  }, [flatNodes, lockedFolders]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    if (!event.over) {
      setOverId(null);
      return;
    }

    const rawId = event.over.id as string;
    // Extract node ID from droppable ID (format: "drop:nodeId")
    const nodeId = rawId.startsWith('drop:') ? fromDroppableId(rawId) : rawId;
    setOverId(nodeId);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    // Get source ID directly from the event (more reliable than state)
    const sourceId = active.id as string;

    // Clear state
    setActiveId(null);
    setOverId(null);

    if (!over) return;

    // Extract target node ID from droppable ID
    const rawTargetId = over.id as string;
    const targetId = rawTargetId.startsWith('drop:') ? fromDroppableId(rawTargetId) : rawTargetId;

    // Don't drop on self
    if (sourceId === targetId) return;

    // Find nodes
    const sourceNode = flatNodes.find((n) => n.id === sourceId);
    const targetNode = flatNodes.find((n) => n.id === targetId);

    if (!sourceNode || !targetNode) {
      console.error('[TreeView] Node not found:', { sourceId, targetId });
      return;
    }

    // Validate: can't drop on locked folders
    if (targetNode.isLocked || lockedFolders.includes(targetNode.name)) {
      return;
    }

    // Validate: can't drop on own descendant
    if (isAncestorOf(nodes, sourceId, targetId)) {
      return;
    }

    // Move the node
    const newNodes = moveNodeInto(nodes, sourceId, targetId);
    if (newNodes) {
      onChange(newNodes);
    }
  }, [flatNodes, lockedFolders, nodes, onChange]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOverId(null);
  }, []);

  const handleToggle = useCallback((id: string) => {
    const newNodes = cloneNodes(nodes);
    const result = findNodeById(newNodes, id, newNodes);
    if (result) {
      result.node.isExpanded = result.node.isExpanded === false;
      onChange(newNodes);
    }
  }, [nodes, onChange]);

  const handleContextMenu = useCallback((e: React.MouseEvent, flatNode: FlatNode) => {
    if (!onContextMenu) return;

    // Find the original TreeNode
    const result = findNodeById(nodes, flatNode.id, nodes);
    if (result) {
      onContextMenu(e, result.node, flatNode.path);
    }
  }, [nodes, onContextMenu]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="tree-view">
        {flatNodes.map((node) => (
          <DraggableTreeItem
            key={node.id}
            node={node}
            isOverTarget={overId === node.id && activeId !== node.id}
            isDraggingSource={activeId === node.id}
            lockedFolders={lockedFolders}
            descriptions={descriptions}
            onToggle={handleToggle}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeNode && (
          <div
            className="tree-item"
            style={{
              padding: '6px 12px',
              background: 'var(--bg-secondary)',
              borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              border: '1px solid var(--accent-blue)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'grabbing',
            }}
          >
            <Folder size={16} style={{ color: 'var(--accent-yellow)' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{activeNode.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
