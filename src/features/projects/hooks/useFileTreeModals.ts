import { useState, useCallback } from 'react';
import { fileSystemService } from '../../../services/fileSystemService';

export interface NewFolderModalState {
  parentPath: string;
  parentName: string;
}

export interface RenameModalState {
  path: string;
  currentName: string;
  isDirectory: boolean;
}

export interface DeleteModalState {
  path: string;
  name: string;
  isDirectory: boolean;
}

interface UseFileTreeModalsOptions {
  onOperationComplete: () => Promise<void>;
}

interface UseFileTreeModalsResult {
  // New folder modal
  newFolderModal: NewFolderModalState | null;
  newFolderName: string;
  setNewFolderName: (name: string) => void;
  openNewFolderModal: (parentPath: string, parentName: string) => void;
  closeNewFolderModal: () => void;
  handleCreateFolder: () => Promise<void>;

  // Rename modal
  renameModal: RenameModalState | null;
  renameName: string;
  setRenameName: (name: string) => void;
  openRenameModal: (path: string, currentName: string, isDirectory: boolean) => void;
  closeRenameModal: () => void;
  handleRename: () => Promise<void>;

  // Delete modal
  deleteModal: DeleteModalState | null;
  openDeleteModal: (path: string, name: string, isDirectory: boolean) => void;
  closeDeleteModal: () => void;
  handleDelete: () => Promise<void>;

  // Shared state
  isOperating: boolean;
}

/**
 * Hook for managing file tree modals (create folder, rename, delete)
 */
export function useFileTreeModals({
  onOperationComplete,
}: UseFileTreeModalsOptions): UseFileTreeModalsResult {
  // Modal states
  const [newFolderModal, setNewFolderModal] = useState<NewFolderModalState | null>(null);
  const [renameModal, setRenameModal] = useState<RenameModalState | null>(null);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);

  // Form states
  const [newFolderName, setNewFolderName] = useState('');
  const [renameName, setRenameName] = useState('');
  const [isOperating, setIsOperating] = useState(false);

  // New folder modal handlers
  const openNewFolderModal = useCallback((parentPath: string, parentName: string) => {
    setNewFolderModal({ parentPath, parentName });
    setNewFolderName('');
  }, []);

  const closeNewFolderModal = useCallback(() => {
    setNewFolderModal(null);
    setNewFolderName('');
  }, []);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderModal || !newFolderName.trim()) return;

    setIsOperating(true);
    try {
      const newPath = fileSystemService.joinPath(newFolderModal.parentPath, newFolderName.trim());
      await fileSystemService.createFolder(newPath);
      await onOperationComplete();
      closeNewFolderModal();
    } catch (err) {
      console.error('Failed to create folder:', err);
    } finally {
      setIsOperating(false);
    }
  }, [newFolderModal, newFolderName, onOperationComplete, closeNewFolderModal]);

  // Rename modal handlers
  const openRenameModal = useCallback((path: string, currentName: string, isDirectory: boolean) => {
    setRenameModal({ path, currentName, isDirectory });
    setRenameName(currentName);
  }, []);

  const closeRenameModal = useCallback(() => {
    setRenameModal(null);
    setRenameName('');
  }, []);

  const handleRename = useCallback(async () => {
    if (!renameModal || !renameName.trim()) return;

    setIsOperating(true);
    try {
      const parentPath = fileSystemService.getParentPath(renameModal.path);
      const newPath = fileSystemService.joinPath(parentPath, renameName.trim());
      await fileSystemService.renameItem(renameModal.path, newPath);
      await onOperationComplete();
      closeRenameModal();
    } catch (err) {
      console.error('Failed to rename:', err);
    } finally {
      setIsOperating(false);
    }
  }, [renameModal, renameName, onOperationComplete, closeRenameModal]);

  // Delete modal handlers
  const openDeleteModal = useCallback((path: string, name: string, isDirectory: boolean) => {
    setDeleteModal({ path, name, isDirectory });
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteModal(null);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteModal) return;

    setIsOperating(true);
    try {
      if (deleteModal.isDirectory) {
        await fileSystemService.deleteFolder(deleteModal.path, true);
      } else {
        await fileSystemService.deleteFile(deleteModal.path);
      }
      await onOperationComplete();
      closeDeleteModal();
    } catch (err) {
      console.error('Failed to delete:', err);
    } finally {
      setIsOperating(false);
    }
  }, [deleteModal, onOperationComplete, closeDeleteModal]);

  return {
    // New folder
    newFolderModal,
    newFolderName,
    setNewFolderName,
    openNewFolderModal,
    closeNewFolderModal,
    handleCreateFolder,

    // Rename
    renameModal,
    renameName,
    setRenameName,
    openRenameModal,
    closeRenameModal,
    handleRename,

    // Delete
    deleteModal,
    openDeleteModal,
    closeDeleteModal,
    handleDelete,

    // Shared
    isOperating,
  };
}
