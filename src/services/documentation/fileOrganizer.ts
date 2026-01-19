/**
 * File Organizer
 * Organizes scraped files into proper project folder structure
 */

import { fileSystemService } from '../fileSystemService';
import { logger } from '../../lib/logger';
import { ScrapeResult } from './webScraper';

const log = logger.scope('FileOrganizer');

/**
 * Target folder structure for organized files
 */
export interface OrganizeFolders {
  images: string;
  styles: string;
  texts: string;
}

/**
 * Get default folder paths for a project
 */
export function getDefaultFolders(projectPath: string): OrganizeFolders {
  return {
    images: fileSystemService.joinPath(projectPath, 'References', 'images'),
    styles: fileSystemService.joinPath(projectPath, 'References', 'styles'),
    texts: fileSystemService.joinPath(projectPath, 'Documentation', 'textes'),
  };
}

/**
 * Ensure all target folders exist
 */
export async function ensureFoldersExist(folders: OrganizeFolders): Promise<void> {
  await Promise.all([
    fileSystemService.createFolder(folders.images),
    fileSystemService.createFolder(folders.styles),
    fileSystemService.createFolder(folders.texts),
  ]);
}

/**
 * Move a file to a target folder
 * Returns true if successful, false otherwise
 */
async function moveFile(sourcePath: string, targetFolder: string): Promise<boolean> {
  if (!sourcePath) return false;

  const filename = sourcePath.split('/').pop();
  if (!filename) return false;

  const destPath = fileSystemService.joinPath(targetFolder, filename);

  try {
    await fileSystemService.moveItem(sourcePath, destPath);
    return true;
  } catch (error) {
    log.warn(`Could not move file ${filename}`, error);
    return false;
  }
}

/**
 * Organize scraped images into the project structure
 */
export async function organizeImages(
  images: ScrapeResult['images'],
  targetFolder: string
): Promise<{ moved: number; failed: number }> {
  let moved = 0;
  let failed = 0;

  for (const img of images) {
    const success = await moveFile(img.localPath, targetFolder);
    if (success) {
      moved++;
    } else {
      failed++;
    }
  }

  log.info(`Organized images: ${moved} moved, ${failed} failed`);
  return { moved, failed };
}

/**
 * Organize scraped stylesheets into the project structure
 */
export async function organizeStylesheets(
  stylesheets: ScrapeResult['stylesheets'],
  targetFolder: string
): Promise<{ moved: number; failed: number }> {
  let moved = 0;
  let failed = 0;

  for (const css of stylesheets) {
    const success = await moveFile(css.localPath, targetFolder);
    if (success) {
      moved++;
    } else {
      failed++;
    }
  }

  log.info(`Organized stylesheets: ${moved} moved, ${failed} failed`);
  return { moved, failed };
}

/**
 * Organize all scraped files into proper project folders
 */
export async function organizeScrapedFiles(
  projectPath: string,
  scrapeResult: ScrapeResult
): Promise<{ images: { moved: number; failed: number }; styles: { moved: number; failed: number } }> {
  const folders = getDefaultFolders(projectPath);

  // Ensure target directories exist
  await ensureFoldersExist(folders);

  // Move files in parallel
  const [imageResults, styleResults] = await Promise.all([
    organizeImages(scrapeResult.images, folders.images),
    organizeStylesheets(scrapeResult.stylesheets, folders.styles),
  ]);

  return {
    images: imageResults,
    styles: styleResults,
  };
}

/**
 * Clean up empty scraped folders
 */
export async function cleanupScrapedFolders(projectPath: string): Promise<void> {
  const scrapedPath = fileSystemService.joinPath(projectPath, '_Inbox', 'scraped');

  try {
    // Try to read the directory to check if it exists and is empty
    const tree = await fileSystemService.readDirectoryTree(scrapedPath, 1);

    // If no children, remove the folder
    if (!tree.children || tree.children.length === 0) {
      await fileSystemService.deleteFolder(scrapedPath);
      log.info('Cleaned up empty scraped folder');
    }
  } catch {
    // Folder doesn't exist or can't be accessed - that's fine
  }
}
