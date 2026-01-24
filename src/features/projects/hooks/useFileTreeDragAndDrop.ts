import { useState, useCallback } from 'react';
import {
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import { fileSystemService } from '../../../services/fileSystemService';
import { FlatFileNode } from './useFileTree';

// Helper to create droppable ID
export const toDroppableId = (path: string) => `drop:${path}`;
export const fromDroppableId = (droppableId: string) => droppableId.replace('drop:', '');

interface UseFileTreeDragAndDropOptions {
  flatNodes: FlatFileNode[];
  onMoveComplete: () => Promise<void>;
}

interface UseFileTreeDragAndDropResult {
  activeId: string | null;
  overId: string | null;
  activeNode: FlatFileNode | null;
  sensors: ReturnType<typeof useSensors>;
  isOperating: boolean;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragOver: (event: DragOverEvent) => void;
  handleDragEnd: (event: DragEndEvent) => Promise<void>;
  handleDragCancel: () => void;
}

/**
 * Hook for managing drag and drop in the file tree
 */
export function useFileTreeDragAndDrop({
  flatNodes,
  onMoveComplete,
}: UseFileTreeDragAndDropOptions): UseFileTreeDragAndDropResult {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [isOperating, setIsOperating] = useState(false);

  // Configure dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Get active node
  const activeNode = flatNodes.find((n) => n.path === activeId) || null;

  // DnD handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = event.active.id as string;
      const node = flatNodes.find((n) => n.path === id);
      if (!node || node.isLocked) return;
      console.log('[FileTree] dragStart:', id);
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
        console.error('[FileTree] Node not found:', { sourcePath, targetPath });
        return;
      }

      // Only drop on directories
      if (!targetNode.isDirectory) {
        console.log('[FileTree] Target is not a directory');
        return;
      }

      // Don't drop on locked folders
      if (targetNode.isLocked) {
        console.log('[FileTree] Target is locked');
        return;
      }

      // Don't drop parent into child
      if (targetPath.startsWith(sourcePath + '/')) {
        console.log('[FileTree] Cannot drop parent into child');
        return;
      }

      console.log('[FileTree] Moving:', sourcePath, '->', targetPath);

      setIsOperating(true);
      try {
        const name = fileSystemService.getName(sourcePath);
        const newPath = fileSystemService.joinPath(targetPath, name);
        await fileSystemService.moveItem(sourcePath, newPath);
        await onMoveComplete();
        console.log('[FileTree] Move successful');
      } catch (err) {
        console.error('[FileTree] Move failed:', err);
      } finally {
        setIsOperating(false);
      }
    },
    [flatNodes, onMoveComplete]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOverId(null);
  }, []);

  return {
    activeId,
    overId,
    activeNode,
    sensors,
    isOperating,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  };
}
