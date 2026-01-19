/**
 * Centralized Tauri invoke wrapper
 * Provides consistent error handling and logging for all Tauri commands
 */

import { invoke } from '@tauri-apps/api/tauri';
import { TauriInvokeError, Result, ok, err } from '../errors';
import { logger } from '../logger';

/**
 * Type-safe Tauri invoke wrapper
 * Returns a Result type instead of throwing exceptions
 */
export async function tauriInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<Result<T, TauriInvokeError>> {
  const startTime = performance.now();

  try {
    logger.debug(`[Tauri] Invoking: ${command}`, args);
    const result = await invoke<T>(command, args);
    const duration = performance.now() - startTime;
    logger.debug(`[Tauri] ${command} completed in ${duration.toFixed(2)}ms`);
    return ok(result);
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[Tauri] ${command} failed after ${duration.toFixed(2)}ms`, error);

    const message = error instanceof Error ? error.message : String(error);
    return err(new TauriInvokeError(message, command, error instanceof Error ? error : undefined));
  }
}

/**
 * Type-safe Tauri invoke that throws on error
 * Use when you want traditional exception handling
 */
export async function tauriInvokeOrThrow<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  const result = await tauriInvoke<T>(command, args);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

/**
 * Available Tauri commands with their argument and return types
 */
export interface TauriCommands {
  // File system operations
  read_directory_tree: {
    args: { path: string };
    returns: DirectoryTreeNode;
  };
  open_in_finder: {
    args: { path: string };
    returns: void;
  };
  create_folder: {
    args: { path: string };
    returns: void;
  };
  rename_item: {
    args: { oldPath: string; newPath: string };
    returns: void;
  };
  delete_item: {
    args: { path: string };
    returns: void;
  };
  move_item: {
    args: { sourcePath: string; destinationPath: string };
    returns: void;
  };

  // FTP/SFTP operations
  sftp_test_connection: {
    args: {
      host: string;
      port: number;
      username: string;
      password: string;
      remotePath: string;
      protocol: string;
      acceptInvalidCerts: boolean;
    };
    returns: string[];
  };

  // Scraping operations
  scrape_website: {
    args: {
      url: string;
      outputPath: string;
    };
    returns: ScrapingResult;
  };

  // File watcher operations
  start_watcher: {
    args: { projectPath: string; projectId: string };
    returns: void;
  };
  stop_watcher: {
    args: { projectId: string };
    returns: void;
  };

  // Keychain operations
  save_credentials: {
    args: { projectId: string; password: string };
    returns: void;
  };
  get_credentials: {
    args: { projectId: string };
    returns: string | null;
  };
  delete_credentials: {
    args: { projectId: string };
    returns: void;
  };
}

// Types used by Tauri commands
export interface DirectoryTreeNode {
  name: string;
  path: string;
  is_directory: boolean;
  children?: DirectoryTreeNode[];
  size?: number;
  modified?: string;
}

export interface ScrapingResult {
  pages: ScrapedPage[];
  images: string[];
  stylesheets: string[];
  colors: string[];
  fonts: string[];
  texts: ExtractedText[];
}

export interface ScrapedPage {
  url: string;
  title: string;
  path: string;
}

export interface ExtractedText {
  pageUrl: string;
  texts: string[];
}

/**
 * Type-safe command invoker
 * Provides autocomplete for command names and type checking for args/returns
 */
export function createTypedInvoke<K extends keyof TauriCommands>(command: K) {
  return async (args: TauriCommands[K]['args']): Promise<Result<TauriCommands[K]['returns'], TauriInvokeError>> => {
    return tauriInvoke<TauriCommands[K]['returns']>(command, args as Record<string, unknown>);
  };
}

// Pre-created typed invokers for common commands
export const commands = {
  readDirectoryTree: createTypedInvoke('read_directory_tree'),
  openInFinder: createTypedInvoke('open_in_finder'),
  createFolder: createTypedInvoke('create_folder'),
  renameItem: createTypedInvoke('rename_item'),
  deleteItem: createTypedInvoke('delete_item'),
  moveItem: createTypedInvoke('move_item'),
  testConnection: createTypedInvoke('sftp_test_connection'),
  scrapeWebsite: createTypedInvoke('scrape_website'),
  startWatcher: createTypedInvoke('start_watcher'),
  stopWatcher: createTypedInvoke('stop_watcher'),
  saveCredentials: createTypedInvoke('save_credentials'),
  getCredentials: createTypedInvoke('get_credentials'),
  deleteCredentials: createTypedInvoke('delete_credentials'),
} as const;
