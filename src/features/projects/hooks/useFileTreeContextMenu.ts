import { useState, useCallback } from 'react';
import { FolderPlus, Edit3, Trash2, Folder } from 'lucide-react';
import { fileSystemService } from '../../../services/fileSystemService';
import { projectService } from '../../../services/projectService';
import { FlatFileNode } from './useFileTree';
import type { ContextMenuItem } from '../../../components/ui';

interface ContextMenuState {
  x: number;
  y: number;
  node: FlatFileNode;
}

interface UseFileTreeContextMenuOptions {
  onNewFolder: (parentPath: string, parentName: string) => void;
  onRename: (path: string, currentName: string, isDirectory: boolean) => void;
  onDelete: (path: string, name: string, isDirectory: boolean) => void;
}

interface UseFileTreeContextMenuResult {
  contextMenu: ContextMenuState | null;
  handleContextMenu: (e: React.MouseEvent, node: FlatFileNode) => void;
  closeContextMenu: () => void;
  getContextMenuItems: () => ContextMenuItem[];
}

/**
 * Hook for managing context menu in the file tree
 */
export function useFileTreeContextMenu({
  onNewFolder,
  onRename,
  onDelete,
}: UseFileTreeContextMenuOptions): UseFileTreeContextMenuResult {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FlatFileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    if (!contextMenu) return [];

    const { node } = contextMenu;
    const items: ContextMenuItem[] = [];

    if (node.isDirectory) {
      items.push({
        label: 'Nouveau dossier',
        icon: FolderPlus({ size: 14 }),
        onClick: () => {
          onNewFolder(node.path, node.name);
          closeContextMenu();
        },
      });
    }

    if (!node.isLocked) {
      items.push({
        label: 'Renommer',
        icon: Edit3({ size: 14 }),
        onClick: () => {
          onRename(node.path, node.name, node.isDirectory);
          closeContextMenu();
        },
      });

      items.push({ label: '', onClick: () => {}, divider: true });

      items.push({
        label: 'Supprimer',
        icon: Trash2({ size: 14 }),
        onClick: () => {
          onDelete(node.path, node.name, node.isDirectory);
          closeContextMenu();
        },
        danger: true,
      });
    }

    items.push({ label: '', onClick: () => {}, divider: true });
    items.push({
      label: 'Ouvrir dans Finder',
      icon: Folder({ size: 14 }),
      onClick: () => {
        const pathToOpen = node.isDirectory
          ? node.path
          : fileSystemService.getParentPath(node.path);
        projectService.openInFinder(pathToOpen);
        closeContextMenu();
      },
    });

    return items;
  }, [contextMenu, closeContextMenu, onNewFolder, onRename, onDelete]);

  return {
    contextMenu,
    handleContextMenu,
    closeContextMenu,
    getContextMenuItems,
  };
}
