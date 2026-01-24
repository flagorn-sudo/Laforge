import { useState, useEffect, useCallback, useMemo } from 'react';
import { fileSystemService, DirectoryNode } from '../../../services/fileSystemService';

/**
 * Flat node for rendering the tree
 */
export interface FlatFileNode {
  path: string;
  name: string;
  depth: number;
  isDirectory: boolean;
  isExpanded: boolean;
  isLocked: boolean;
  hasChildren: boolean;
  size?: number;
}

interface UseFileTreeOptions {
  projectPath: string;
  lockedFolders?: string[];
  maxDepth?: number;
}

interface UseFileTreeResult {
  tree: DirectoryNode | null;
  flatNodes: FlatFileNode[];
  loading: boolean;
  error: string | null;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  loadTree: () => Promise<void>;
  toggleExpand: (path: string) => void;
  setSelectedPath: (path: string | null) => void;
}

/**
 * Hook for managing file tree state and operations
 */
export function useFileTree({
  projectPath,
  lockedFolders = ['_Inbox'],
  maxDepth = 10,
}: UseFileTreeOptions): UseFileTreeResult {
  const [tree, setTree] = useState<DirectoryNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Load directory tree
  const loadTree = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fileSystemService.readDirectoryTree(projectPath, maxDepth);
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
  }, [projectPath, maxDepth]);

  // Load on mount
  useEffect(() => {
    loadTree();
  }, [loadTree]);

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

  // Memoized flat nodes
  const flatNodes = useMemo(() => {
    if (!tree) return [];
    // Start from children to not show root
    return tree.children?.flatMap((child) => flattenTree(child, 0)) ?? [];
  }, [tree, flattenTree]);

  return {
    tree,
    flatNodes,
    loading,
    error,
    expandedPaths,
    selectedPath,
    loadTree,
    toggleExpand,
    setSelectedPath,
  };
}
