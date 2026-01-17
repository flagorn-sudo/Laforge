export interface Project {
  id: string;
  name: string;
  path: string;
  client?: string;
  created: string;
  updated: string;
  status: ProjectStatus;
  urls: ProjectURLs;
  sftp: SFTPInfo;
  scraping: ScrapingInfo;
  colors: string[];
  fonts: string[];
  notes?: string;
  localPath?: string;
  referenceWebsites: ReferenceWebsite[];  // Max 5 sites de référence graphique
}

export type ProjectStatus = 'active' | 'paused' | 'archived' | 'completed';

export interface ProjectURLs {
  currentSite?: string;    // URL du site actuel (ancien site client)
  testUrl?: string;        // URL de test (prévisualisation nouveau site)
  staging?: string;
  local?: string;
  // Legacy support
  production?: string;     // @deprecated - use currentSite instead
}

export interface ReferenceWebsite {
  url: string;
  name?: string;           // Nom/description du site
  addedAt: string;
}

export type FTPProtocol = 'sftp' | 'ftp' | 'ftps';

export interface SFTPInfo {
  configured: boolean;
  host?: string;
  username?: string;
  port?: number;
  remotePath?: string;
  lastSync?: string;
  passive?: boolean;
  protocol?: FTPProtocol;
  acceptInvalidCerts?: boolean;
}

export interface ScrapingInfo {
  completed: boolean;
  sourceUrl?: string;
  scrapedAt?: string;
}

export interface SFTPConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath: string;
  passive?: boolean;
  protocol?: FTPProtocol;
  acceptInvalidCerts?: boolean;
}

export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'unchanged';
  localSize?: number;
  remoteSize?: number;
}

export interface Settings {
  workspacePath: string;
  geminiApiKey?: string;
  geminiModel?: string;
  folderStructure: string[];
}

export const DEFAULT_FOLDER_STRUCTURE = [
  '01-sources',
  'psd',
  'ai',
  'figma',
  'fonts',
  '02-docs',
  '03-assets',
  'images',
  'videos',
  'icons',
  'logos',
  '04-references',
  'screenshots',
  'competitors',
  'scraped',
  'www/css',
  'www/js',
  'www/assets',
  'www/pages',
];

export interface ParsedFTPCredentials {
  host?: string;
  username?: string;
  password?: string;
  port?: number;
  path?: string;
  testUrl?: string;  // URL de test/prévisualisation extraite
}

export const PROJECT_STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string }> = {
  active: { label: 'Actif', color: '#4fc3f7' },
  paused: { label: 'En pause', color: '#ffb74d' },
  archived: { label: 'Archivé', color: '#90a4ae' },
  completed: { label: 'Terminé', color: '#81c784' },
};
