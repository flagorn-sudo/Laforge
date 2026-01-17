import { useState, useRef, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';

export interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  isExpanded?: boolean;
}

export interface TreeViewProps {
  nodes: TreeNode[];
  onChange: (nodes: TreeNode[]) => void;
  onContextMenu?: (e: React.MouseEvent, node: TreeNode, path: number[]) => void;
}

interface TreeItemProps {
  node: TreeNode;
  path: number[];
  level: number;
  onToggle: (path: number[]) => void;
  onContextMenu?: (e: React.MouseEvent, node: TreeNode, path: number[]) => void;
  onDragStart: (e: React.DragEvent, path: number[]) => void;
  onDragOver: (e: React.DragEvent, path: number[]) => void;
  onDrop: (e: React.DragEvent, path: number[]) => void;
  onDragEnd: () => void;
  dragOverPath: number[] | null;
  dragOverPosition: 'before' | 'inside' | 'after' | null;
}

function TreeItem({
  node,
  path,
  level,
  onToggle,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragOverPath,
  dragOverPosition,
}: TreeItemProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = node.isExpanded ?? true;

  const isDragOver = dragOverPath &&
    dragOverPath.length === path.length &&
    dragOverPath.every((v, i) => v === path[i]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e, node, path);
  };

  return (
    <div className="tree-item-container">
      <div
        className={`tree-item ${isDragOver ? `drag-over drag-over-${dragOverPosition}` : ''}`}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        draggable
        onDragStart={(e) => onDragStart(e, path)}
        onDragOver={(e) => onDragOver(e, path)}
        onDrop={(e) => onDrop(e, path)}
        onDragEnd={onDragEnd}
        onContextMenu={handleContextMenu}
      >
        <button
          className="tree-toggle"
          onClick={() => onToggle(path)}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="tree-icon">
          {hasChildren && isExpanded ? (
            <FolderOpen size={16} />
          ) : (
            <Folder size={16} />
          )}
        </span>
        <span className="tree-label">{node.name}</span>
      </div>

      {hasChildren && isExpanded && (
        <div className="tree-children">
          {node.children!.map((child, index) => (
            <TreeItem
              key={child.id}
              node={child}
              path={[...path, index]}
              level={level + 1}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              dragOverPath={dragOverPath}
              dragOverPosition={dragOverPosition}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeView({ nodes, onChange, onContextMenu }: TreeViewProps) {
  const [dragOverPath, setDragOverPath] = useState<number[] | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'inside' | 'after' | null>(null);
  const dragSourcePath = useRef<number[] | null>(null);

  const toggleNode = useCallback((path: number[]) => {
    const newNodes = JSON.parse(JSON.stringify(nodes)) as TreeNode[];
    let current = newNodes;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]].children!;
    }
    const node = current[path[path.length - 1]];
    node.isExpanded = !(node.isExpanded ?? true);
    onChange(newNodes);
  }, [nodes, onChange]);

  const handleDragStart = useCallback((e: React.DragEvent, path: number[]) => {
    dragSourcePath.current = path;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(path));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, path: number[]) => {
    e.preventDefault();
    e.stopPropagation();

    if (!dragSourcePath.current) return;

    // Don't allow dropping on itself
    const isSameNode = dragSourcePath.current.length === path.length &&
      dragSourcePath.current.every((v, i) => v === path[i]);
    if (isSameNode) return;

    // Don't allow dropping on descendant
    const isDescendant = dragSourcePath.current.length < path.length &&
      dragSourcePath.current.every((v, i) => v === path[i]);
    if (isDescendant) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    let position: 'before' | 'inside' | 'after';
    if (y < height * 0.25) {
      position = 'before';
    } else if (y > height * 0.75) {
      position = 'after';
    } else {
      position = 'inside';
    }

    setDragOverPath(path);
    setDragOverPosition(position);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetPath: number[]) => {
    e.preventDefault();
    e.stopPropagation();

    const sourcePath = dragSourcePath.current;
    if (!sourcePath || !dragOverPosition) return;

    // Get node from source
    const newNodes = JSON.parse(JSON.stringify(nodes)) as TreeNode[];

    // Navigate to source parent and remove node
    let sourceParent = newNodes;
    for (let i = 0; i < sourcePath.length - 1; i++) {
      sourceParent = sourceParent[sourcePath[i]].children!;
    }
    const [movedNode] = sourceParent.splice(sourcePath[sourcePath.length - 1], 1);

    // Adjust target path if source was before target in same parent
    const adjustedTargetPath = [...targetPath];
    if (sourcePath.length === targetPath.length) {
      const sameParent = sourcePath.slice(0, -1).every((v, i) => v === targetPath[i]);
      if (sameParent && sourcePath[sourcePath.length - 1] < targetPath[targetPath.length - 1]) {
        adjustedTargetPath[adjustedTargetPath.length - 1]--;
      }
    }

    // Navigate to target
    let targetParent = newNodes;
    for (let i = 0; i < adjustedTargetPath.length - 1; i++) {
      targetParent = targetParent[adjustedTargetPath[i]].children!;
    }
    const targetIndex = adjustedTargetPath[adjustedTargetPath.length - 1];
    const targetNode = targetParent[targetIndex];

    if (dragOverPosition === 'inside') {
      // Add as child
      if (!targetNode.children) {
        targetNode.children = [];
      }
      targetNode.children.push(movedNode);
      targetNode.isExpanded = true;
    } else if (dragOverPosition === 'before') {
      targetParent.splice(targetIndex, 0, movedNode);
    } else {
      targetParent.splice(targetIndex + 1, 0, movedNode);
    }

    onChange(newNodes);
    setDragOverPath(null);
    setDragOverPosition(null);
    dragSourcePath.current = null;
  }, [nodes, onChange, dragOverPosition]);

  const handleDragEnd = useCallback(() => {
    setDragOverPath(null);
    setDragOverPosition(null);
    dragSourcePath.current = null;
  }, []);

  return (
    <div className="tree-view">
      {nodes.map((node, index) => (
        <TreeItem
          key={node.id}
          node={node}
          path={[index]}
          level={0}
          onToggle={toggleNode}
          onContextMenu={onContextMenu}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          dragOverPath={dragOverPath}
          dragOverPosition={dragOverPosition}
        />
      ))}
    </div>
  );
}

// Utility functions for converting between flat list and tree structure
export function flatToTree(folders: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  // Sort folders to ensure parents come before children
  const sortedFolders = [...folders].sort();

  for (const folder of sortedFolders) {
    const parts = folder.split('/');
    let currentPath = '';
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const newPath = currentPath ? `${currentPath}/${part}` : part;

      let existingNode = nodeMap.get(newPath);
      if (!existingNode) {
        existingNode = {
          id: newPath,
          name: part,
          children: [],
          isExpanded: true,
        };
        nodeMap.set(newPath, existingNode);
        currentLevel.push(existingNode);
      }

      currentLevel = existingNode.children!;
      currentPath = newPath;
    }
  }

  return root;
}

export function treeToFlat(nodes: TreeNode[], parentPath = ''): string[] {
  const result: string[] = [];

  for (const node of nodes) {
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    result.push(currentPath);

    if (node.children && node.children.length > 0) {
      result.push(...treeToFlat(node.children, currentPath));
    }
  }

  return result;
}

// Generate a unique ID for new nodes
export function generateNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
