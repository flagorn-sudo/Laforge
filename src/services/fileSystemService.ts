import { invoke } from '@tauri-apps/api/tauri';
import { exists as fsExists } from '@tauri-apps/api/fs';
import { DirectoryNode } from '../types';

/**
 * Service for filesystem operations via Tauri backend
 * Used by ProjectFileTree to interact with real directories
 */

export const fileSystemService = {
  /**
   * Read directory tree recursively
   * @param path - Root path to read
   * @param maxDepth - Maximum depth to traverse (default: 10)
   * @returns DirectoryNode tree structure
   */
  async readDirectoryTree(path: string, maxDepth = 10): Promise<DirectoryNode> {
    try {
      return await invoke<DirectoryNode>('read_directory_tree', {
        path,
        maxDepth,
      });
    } catch (error) {
      console.error('Failed to read directory tree:', error);
      throw new Error(`Failed to read directory: ${error}`);
    }
  },

  /**
   * Create a new folder
   * @param path - Full path for the new folder
   */
  async createFolder(path: string): Promise<void> {
    try {
      await invoke('create_folder', { path });
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw new Error(`Failed to create folder: ${error}`);
    }
  },

  /**
   * Delete a folder
   * @param path - Path to the folder to delete
   * @param recursive - Delete contents recursively (default: false)
   */
  async deleteFolder(path: string, recursive = false): Promise<void> {
    try {
      await invoke('delete_folder', { path, recursive });
    } catch (error) {
      console.error('Failed to delete folder:', error);
      throw new Error(`Failed to delete folder: ${error}`);
    }
  },

  /**
   * Delete a file
   * @param path - Path to the file to delete
   */
  async deleteFile(path: string): Promise<void> {
    try {
      await invoke('delete_file', { path });
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw new Error(`Failed to delete file: ${error}`);
    }
  },

  /**
   * Rename a file or folder
   * @param oldPath - Current path
   * @param newPath - New path (same parent directory with new name)
   */
  async renameItem(oldPath: string, newPath: string): Promise<void> {
    try {
      await invoke('rename_item', { oldPath, newPath });
    } catch (error) {
      console.error('Failed to rename item:', error);
      throw new Error(`Failed to rename: ${error}`);
    }
  },

  /**
   * Move a file or folder to a new location
   * @param source - Source path
   * @param destination - Destination path
   */
  async moveItem(source: string, destination: string): Promise<void> {
    try {
      await invoke('move_item', { source, destination });
    } catch (error) {
      console.error('Failed to move item:', error);
      throw new Error(`Failed to move: ${error}`);
    }
  },

  /**
   * Create the initial folder structure for a new project
   * @param projectPath - Root path of the project
   * @param folders - Array of folder paths to create
   */
  async createProjectStructure(projectPath: string, folders: string[]): Promise<void> {
    try {
      await invoke('create_project_structure', { projectPath, folders });
    } catch (error) {
      console.error('Failed to create project structure:', error);
      throw new Error(`Failed to create project structure: ${error}`);
    }
  },

  /**
   * Helper: Get the parent path from a full path
   */
  getParentPath(path: string): string {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/') || '/';
  },

  /**
   * Helper: Get the filename/folder name from a full path
   */
  getName(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1] || '';
  },

  /**
   * Helper: Join path segments
   */
  joinPath(...segments: string[]): string {
    return segments
      .map((s, i) => {
        if (i === 0) return s.replace(/\/+$/, '');
        return s.replace(/^\/+|\/+$/g, '');
      })
      .filter(Boolean)
      .join('/');
  },

  /**
   * Check if a file or folder exists
   * @param path - Path to check
   * @returns true if exists, false otherwise
   */
  async exists(path: string): Promise<boolean> {
    try {
      return await fsExists(path);
    } catch {
      return false;
    }
  },
};

export type { DirectoryNode };
