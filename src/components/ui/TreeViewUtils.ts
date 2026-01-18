export interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  isExpanded?: boolean;
  isLocked?: boolean;
}

/**
 * Generate a unique ID for new nodes
 */
export function generateNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Deep clone helper for tree nodes
 */
export function cloneNodes(nodes: TreeNode[]): TreeNode[] {
  return JSON.parse(JSON.stringify(nodes));
}

/**
 * Find result containing node, parent array, and index
 */
interface FindResult {
  node: TreeNode;
  parent: TreeNode[];
  index: number;
}

/**
 * Find node by ID - returns node, parent array, and index
 */
export function findNodeById(
  nodes: TreeNode[],
  id: string,
  parent: TreeNode[] = nodes
): FindResult | null {
  for (let i = 0; i < parent.length; i++) {
    const node = parent[i];
    if (node.id === id) {
      return { node, parent, index: i };
    }
    if (node.children && node.children.length > 0) {
      const found = findNodeById(nodes, id, node.children);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Check if ancestorId is an ancestor of descendantId
 */
export function isAncestorOf(
  nodes: TreeNode[],
  ancestorId: string,
  descendantId: string
): boolean {
  const ancestorResult = findNodeById(nodes, ancestorId);
  if (!ancestorResult) return false;

  const searchInChildren = (children: TreeNode[] | undefined): boolean => {
    if (!children) return false;
    for (const child of children) {
      if (child.id === descendantId) return true;
      if (searchInChildren(child.children)) return true;
    }
    return false;
  };

  return searchInChildren(ancestorResult.node.children);
}

/**
 * Convert a flat list of folder paths to a tree structure
 */
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
          id: generateNodeId(),
          name: part,
          children: [],
          isExpanded: true,
          isLocked: part === '_Inbox', // Lock _Inbox by default
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

/**
 * Convert a tree structure back to a flat list of folder paths
 */
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

/**
 * Get node at path (for backward compatibility with onContextMenu)
 */
export function getNodeAtPath(nodes: TreeNode[], path: number[]): TreeNode | null {
  if (!nodes || path.length === 0) return null;

  let current: TreeNode[] | undefined = nodes;
  let node: TreeNode | null = null;

  for (let i = 0; i < path.length; i++) {
    if (!current || path[i] < 0 || path[i] >= current.length) return null;
    node = current[path[i]];
    if (!node) return null;
    current = node.children;
  }

  return node;
}
