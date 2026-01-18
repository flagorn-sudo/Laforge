import { useState, useCallback, useEffect, useRef } from 'react';
import { DEFAULT_FOLDER_STRUCTURE } from '../../../types';
import { TreeNode, flatToTree, generateNodeId, treeToFlat } from '../../../components/ui';

// Locked folder that should always exist
const LOCKED_FOLDER = '_Inbox';

interface UseFolderTreeOptions {
  onAutoSave?: (flatStructure: string[]) => void;
}

interface UseFolderTreeResult {
  treeNodes: TreeNode[];
  setTreeNodes: (nodes: TreeNode[]) => void;
  addRootFolder: (name: string) => void;
  addSubfolder: (path: number[], name: string) => void;
  deleteFolder: (path: number[]) => void;
  renameFolder: (path: number[], newName: string) => void;
  resetToDefault: () => void;
  isDirty: boolean;
}

// Ensure _Inbox is always present at root level
function ensureInboxFolder(nodes: TreeNode[]): TreeNode[] {
  const hasInbox = nodes.some(node => node.name === LOCKED_FOLDER);
  if (!hasInbox) {
    return [
      {
        id: generateNodeId(),
        name: LOCKED_FOLDER,
        children: [
          {
            id: generateNodeId(),
            name: 'scraped',
            children: [],
            isExpanded: true,
          }
        ],
        isExpanded: true,
        isLocked: true,
      },
      ...nodes,
    ];
  }
  // Mark existing _Inbox as locked
  return nodes.map(node =>
    node.name === LOCKED_FOLDER ? { ...node, isLocked: true } : node
  );
}

// Deep clone to ensure immutability
function cloneNodes(nodes: TreeNode[]): TreeNode[] {
  return JSON.parse(JSON.stringify(nodes));
}

// Get node at a specific path
function getNodeAtPath(nodes: TreeNode[], path: number[]): TreeNode | null {
  if (path.length === 0) return null;

  let current: TreeNode[] = nodes;
  let node: TreeNode | null = null;

  for (let i = 0; i < path.length; i++) {
    if (!current || path[i] < 0 || path[i] >= current.length) return null;
    node = current[path[i]];
    if (!node) return null;
    current = node.children || [];
  }

  return node;
}

export function useFolderTree(
  initialStructure: string[],
  options?: UseFolderTreeOptions
): UseFolderTreeResult {
  const [treeNodes, setTreeNodesInternal] = useState<TreeNode[]>(() => {
    const nodes = flatToTree(initialStructure);
    return ensureInboxFolder(nodes);
  });

  const [isDirty, setIsDirty] = useState(false);
  const initialStructureRef = useRef<string[]>(initialStructure);
  const isFirstRender = useRef(true);

  // Stable ref for onAutoSave to avoid stale closures in callbacks
  const onAutoSaveRef = useRef(options?.onAutoSave);
  useEffect(() => {
    onAutoSaveRef.current = options?.onAutoSave;
  }, [options?.onAutoSave]);

  // Wrapper that ensures _Inbox is always present and triggers auto-save
  // Uses ref for onAutoSave to avoid callback instability
  const setTreeNodes = useCallback((nodes: TreeNode[]) => {
    console.log('[useFolderTree] setTreeNodes called with:', nodes.length, 'nodes');
    console.log('[useFolderTree] nodes structure:', JSON.stringify(nodes.map(n => ({ name: n.name, childCount: n.children?.length || 0 })), null, 2));

    const updatedNodes = ensureInboxFolder(cloneNodes(nodes));
    console.log('[useFolderTree] after ensureInboxFolder:', updatedNodes.length, 'nodes');

    setTreeNodesInternal(updatedNodes);
    setIsDirty(true);

    // Auto-save using ref for stable callback access
    if (onAutoSaveRef.current) {
      const flatStructure = treeToFlat(updatedNodes);
      console.log('[useFolderTree] auto-saving flatStructure:', flatStructure);
      onAutoSaveRef.current(flatStructure);
    }
  }, []); // No dependencies - uses refs for stable access

  // Sync with initialStructure changes from external source
  useEffect(() => {
    // Skip first render as we already initialized
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Only sync if the structure actually changed
    const currentFlat = JSON.stringify(initialStructure.sort());
    const prevFlat = JSON.stringify(initialStructureRef.current.sort());

    if (currentFlat !== prevFlat) {
      const nodes = flatToTree(initialStructure);
      setTreeNodesInternal(ensureInboxFolder(nodes));
      initialStructureRef.current = initialStructure;
      setIsDirty(false);
    }
  }, [initialStructure]);

  const addRootFolder = useCallback((name: string) => {
    if (!name.trim() || name === LOCKED_FOLDER) return;

    const newNode: TreeNode = {
      id: generateNodeId(),
      name: name.trim(),
      children: [],
      isExpanded: true,
    };

    setTreeNodesInternal((prev) => {
      const newNodes = ensureInboxFolder([...cloneNodes(prev), newNode]);
      setIsDirty(true);

      // Auto-save
      if (options?.onAutoSave) {
        const flatStructure = treeToFlat(newNodes);
        options.onAutoSave(flatStructure);
      }

      return newNodes;
    });
  }, [options]);

  const addSubfolder = useCallback((path: number[], name: string) => {
    if (!name.trim() || name === LOCKED_FOLDER) return;

    setTreeNodesInternal((prev) => {
      const newNodes = cloneNodes(prev);
      const parentNode = getNodeAtPath(newNodes, path);

      if (!parentNode) return prev;

      // Don't allow adding to _Inbox root (but allow its children like 'scraped')
      if (parentNode.name === LOCKED_FOLDER && path.length === 1) {
        return prev;
      }

      if (!parentNode.children) {
        parentNode.children = [];
      }

      parentNode.children.push({
        id: generateNodeId(),
        name: name.trim(),
        children: [],
        isExpanded: true,
      });

      parentNode.isExpanded = true;

      const finalNodes = ensureInboxFolder(newNodes);
      setIsDirty(true);

      // Auto-save
      if (options?.onAutoSave) {
        const flatStructure = treeToFlat(finalNodes);
        options.onAutoSave(flatStructure);
      }

      return finalNodes;
    });
  }, [options]);

  const deleteFolder = useCallback((path: number[]) => {
    setTreeNodesInternal((prev) => {
      const newNodes = cloneNodes(prev);

      // Navigate to parent array
      let current: TreeNode[] = newNodes;
      for (let i = 0; i < path.length - 1; i++) {
        const node = current[path[i]];
        if (!node || !node.children) return prev;
        current = node.children;
      }

      const indexToDelete = path[path.length - 1];
      if (indexToDelete < 0 || indexToDelete >= current.length) return prev;

      const nodeToDelete = current[indexToDelete];

      // Don't allow deleting _Inbox
      if (nodeToDelete?.name === LOCKED_FOLDER) return prev;

      current.splice(indexToDelete, 1);

      const finalNodes = ensureInboxFolder(newNodes);
      setIsDirty(true);

      // Auto-save
      if (options?.onAutoSave) {
        const flatStructure = treeToFlat(finalNodes);
        options.onAutoSave(flatStructure);
      }

      return finalNodes;
    });
  }, [options]);

  const renameFolder = useCallback((path: number[], newName: string) => {
    if (!newName.trim() || newName === LOCKED_FOLDER) return;

    setTreeNodesInternal((prev) => {
      const newNodes = cloneNodes(prev);
      const node = getNodeAtPath(newNodes, path);

      // Don't allow renaming _Inbox
      if (!node || node.name === LOCKED_FOLDER) return prev;

      node.name = newName.trim();

      const finalNodes = ensureInboxFolder(newNodes);
      setIsDirty(true);

      // Auto-save
      if (options?.onAutoSave) {
        const flatStructure = treeToFlat(finalNodes);
        options.onAutoSave(flatStructure);
      }

      return finalNodes;
    });
  }, [options]);

  const resetToDefault = useCallback(() => {
    const nodes = flatToTree([...DEFAULT_FOLDER_STRUCTURE]);
    const finalNodes = ensureInboxFolder(nodes);
    setTreeNodesInternal(finalNodes);
    setIsDirty(true);

    // Auto-save
    if (options?.onAutoSave) {
      const flatStructure = treeToFlat(finalNodes);
      options.onAutoSave(flatStructure);
    }
  }, [options]);

  return {
    treeNodes,
    setTreeNodes,
    addRootFolder,
    addSubfolder,
    deleteFolder,
    renameFolder,
    resetToDefault,
    isDirty,
  };
}
