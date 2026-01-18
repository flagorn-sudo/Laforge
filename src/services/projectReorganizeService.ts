import { fileSystemService } from './fileSystemService';
import { DirectoryNode, DEFAULT_FOLDER_STRUCTURE } from '../types';

export interface FileMoveProposal {
  source: string;
  destination: string;
  reason: string;
}

export interface ReorganizeProposal {
  foldersToCreate: string[];
  filesToMove: FileMoveProposal[];
  filesUnmapped: string[];
}

interface FileInfo {
  name: string;
  path: string;
  extension: string | null;
}

/**
 * Extract all folder paths from a directory tree
 */
function extractFolderPaths(node: DirectoryNode, basePath: string = ''): string[] {
  const folders: string[] = [];

  if (node.isDirectory) {
    const relativePath = basePath ? `${basePath}/${node.name}` : node.name;
    // Skip the root path itself
    if (basePath) {
      folders.push(relativePath);
    }

    if (node.children) {
      for (const child of node.children) {
        folders.push(...extractFolderPaths(child, basePath ? relativePath : ''));
      }
    }
  }

  return folders;
}

/**
 * Extract all files from a directory tree
 */
function extractAllFiles(node: DirectoryNode, basePath: string = ''): FileInfo[] {
  const files: FileInfo[] = [];

  if (!node.isDirectory) {
    const extension = node.name.includes('.')
      ? '.' + node.name.split('.').pop()?.toLowerCase()
      : null;
    files.push({
      name: node.name,
      path: basePath ? `${basePath}/${node.name}` : node.name,
      extension,
    });
  } else if (node.children) {
    const currentPath = basePath ? `${basePath}/${node.name}` : node.name;
    for (const child of node.children) {
      files.push(...extractAllFiles(child, basePath ? currentPath : ''));
    }
  }

  return files;
}

/**
 * Check if a file is already in a correct location within the structure
 */
function isInCorrectLocation(filePath: string): boolean {
  const correctFolders = [
    '_Inbox', '_Inbox/scraped',
    'Source',
    'Documentation', 'Documentation/admin', 'Documentation/textes', 'Documentation/notes',
    'Assets', 'Assets/images', 'Assets/design',
    'References', 'References/images', 'References/styles',
    'www',
  ];

  return correctFolders.some(folder => filePath.startsWith(folder + '/'));
}

/**
 * Categorize a file and propose a destination based on extension and name
 */
function categorizeFile(file: FileInfo, projectPath: string): FileMoveProposal | null {
  const ext = file.extension?.toLowerCase() || '';
  const name = file.name.toLowerCase();

  // Don't move files already in correct location
  if (isInCorrectLocation(file.path)) return null;

  // Don't move special files at root
  if (['readme.md', '.gitignore', 'project.json', '.ds_store'].includes(name)) return null;

  // Don't move hidden files
  if (name.startsWith('.')) return null;

  // Images
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff'].includes(ext)) {
    return {
      source: `${projectPath}/${file.path}`,
      destination: `${projectPath}/Assets/images/${file.name}`,
      reason: 'Image',
    };
  }

  // Design sources
  if (['.psd', '.ai', '.fig', '.sketch', '.xd', '.indd', '.eps'].includes(ext)) {
    return {
      source: `${projectPath}/${file.path}`,
      destination: `${projectPath}/Assets/design/${file.name}`,
      reason: 'Fichier design',
    };
  }

  // PDF/Documents - try to detect if admin or text
  if (ext === '.pdf' || ['.doc', '.docx', '.odt'].includes(ext)) {
    if (name.includes('devis') || name.includes('facture') || name.includes('contrat') ||
        name.includes('quote') || name.includes('invoice') || name.includes('contract')) {
      return {
        source: `${projectPath}/${file.path}`,
        destination: `${projectPath}/Documentation/admin/${file.name}`,
        reason: 'Document admin',
      };
    }
    return {
      source: `${projectPath}/${file.path}`,
      destination: `${projectPath}/Documentation/textes/${file.name}`,
      reason: 'Document texte',
    };
  }

  // CSS/Styles
  if (['.css', '.scss', '.sass', '.less', '.styl'].includes(ext)) {
    return {
      source: `${projectPath}/${file.path}`,
      destination: `${projectPath}/References/styles/${file.name}`,
      reason: 'Feuille de style',
    };
  }

  // Text/Markdown (except README)
  if (['.txt', '.md', '.markdown'].includes(ext) && !name.includes('readme')) {
    if (name.includes('note') || name.includes('meeting') || name.includes('reunion') || name.includes('cr_')) {
      return {
        source: `${projectPath}/${file.path}`,
        destination: `${projectPath}/Documentation/notes/${file.name}`,
        reason: 'Note/réunion',
      };
    }
    return {
      source: `${projectPath}/${file.path}`,
      destination: `${projectPath}/Documentation/textes/${file.name}`,
      reason: 'Fichier texte',
    };
  }

  // HTML files (move to www if not already there)
  if (['.html', '.htm'].includes(ext) && !file.path.includes('www/')) {
    return {
      source: `${projectPath}/${file.path}`,
      destination: `${projectPath}/www/${file.name}`,
      reason: 'Page HTML',
    };
  }

  // Notes detection by filename
  if (name.includes('note') || name.includes('meeting') || name.includes('reunion')) {
    return {
      source: `${projectPath}/${file.path}`,
      destination: `${projectPath}/Documentation/notes/${file.name}`,
      reason: 'Note/réunion',
    };
  }

  return null; // File cannot be categorized
}

export const projectReorganizeService = {
  /**
   * Analyze a project and propose a reorganization plan
   */
  async analyzeProject(projectPath: string): Promise<ReorganizeProposal> {
    // 1. Read the current directory tree
    const tree = await fileSystemService.readDirectoryTree(projectPath, 5);

    // 2. Identify missing folders from the standard structure
    const existingFolders = extractFolderPaths(tree);
    const foldersToCreate = DEFAULT_FOLDER_STRUCTURE.filter(
      folder => !existingFolders.includes(folder)
    );

    // 3. Analyze files and propose moves
    const allFiles = extractAllFiles(tree);
    const filesToMove: FileMoveProposal[] = [];
    const filesUnmapped: string[] = [];

    for (const file of allFiles) {
      const proposal = categorizeFile(file, projectPath);
      if (proposal) {
        filesToMove.push(proposal);
      } else if (!isInCorrectLocation(file.path) &&
                 !['readme.md', '.gitignore', 'project.json', '.ds_store'].includes(file.name.toLowerCase()) &&
                 !file.name.startsWith('.')) {
        filesUnmapped.push(file.path);
      }
    }

    return { foldersToCreate, filesToMove, filesUnmapped };
  },

  /**
   * Execute the reorganization based on a proposal
   */
  async executeReorganization(
    projectPath: string,
    proposal: ReorganizeProposal
  ): Promise<{ success: boolean; movedCount: number; foldersCreated: number; errors: string[] }> {
    const errors: string[] = [];
    let movedCount = 0;
    let foldersCreated = 0;

    // 1. Create missing folders
    for (const folder of proposal.foldersToCreate) {
      try {
        const fullPath = fileSystemService.joinPath(projectPath, folder);
        await fileSystemService.createFolder(fullPath);
        foldersCreated++;
      } catch (e) {
        errors.push(`Erreur création ${folder}: ${e}`);
      }
    }

    // 2. Move files
    for (const move of proposal.filesToMove) {
      try {
        await fileSystemService.moveItem(move.source, move.destination);
        movedCount++;
      } catch (e) {
        errors.push(`Erreur déplacement ${fileSystemService.getName(move.source)}: ${e}`);
      }
    }

    return {
      success: errors.length === 0,
      movedCount,
      foldersCreated,
      errors,
    };
  },

  /**
   * Check if a project needs reorganization
   */
  async needsReorganization(projectPath: string): Promise<boolean> {
    const proposal = await this.analyzeProject(projectPath);
    return proposal.foldersToCreate.length > 0 || proposal.filesToMove.length > 0;
  },
};
