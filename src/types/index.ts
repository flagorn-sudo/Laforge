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
  clientDescription?: string;             // Description de l'activité client (généré par IA)
  themeTags?: string[];                   // Tags de thème/orientations design
  themeTagsGeneratedAt?: string;          // Date de génération des tags
}

export type ProjectStatus = 'prospect' | 'development' | 'review' | 'validated' | 'live' | 'archived';

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
  passwordAvailable?: boolean;
  encryptedPassword?: string;  // AES-256 encrypted password stored inline
}

export interface ScrapingStats {
  pagesCount: number;
  imagesCount: number;
  textsCount: number;
  colorsCount: number;
  fontsCount: number;
  colors: string[];        // Couleurs détectées
  fonts: string[];         // Polices détectées
}

export interface ScrapingInfo {
  completed: boolean;
  sourceUrl?: string;
  scrapedAt?: string;
  stats?: ScrapingStats;   // Statistiques détaillées du scraping
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

export interface FilterPreferences {
  filterBarOpen: boolean;
  statusFilters: ProjectStatus[];
  sortBy: 'name' | 'date';
}

export interface Settings {
  workspacePath: string;
  geminiApiKey?: string;
  geminiModel?: string;
  folderStructure: string[];
  autoOrganize?: AutoOrganizeSettings;
  showMenuBarIcon?: boolean;
  viewMode?: 'grid' | 'list';
  filterPreferences?: FilterPreferences;
}

export interface AutoOrganizeSettings {
  enabled: boolean;
  autoMove: boolean;
  confidenceThreshold: number;
}

export interface FileWatcherEvent {
  event_type: string;
  path: string;
  file_name: string;
  extension: string | null;
  project_id: string;
}

export interface FileCategorization {
  targetFolder: string;
  confidence: number;
  reason: string;
}

// New folder structure for Forge v2 - Website redesign workflow
// Simplified structure with 5 main folders at root
export const DEFAULT_FOLDER_STRUCTURE = [
  '_Inbox',                         // Entry point for scraping (locked)
  '_Inbox/scraped',                 // Raw scraped files before organization
  'Source',                         // Code source of the new website
  'Documentation',                  // All project documentation
  'Documentation/admin',            // Quotes, contracts, invoices
  'Documentation/textes',           // Text content for the site
  'Documentation/notes',            // Project notes and meeting notes
  'Assets',                         // All graphical resources
  'Assets/images',                  // Project images
  'Assets/design',                  // Mockups, wireframes, logos
  'References',                     // Content from the old client site
  'References/images',              // Recovered images from old site
  'References/styles',              // Detected CSS, colors, fonts
  'www',                            // Deployment folder - synced via FTP
  'www/css',                        // CSS stylesheets
  'www/js',                         // JavaScript files
];

// Descriptions for each folder (shown in the tree view)
export const FOLDER_DESCRIPTIONS: Record<string, string> = {
  '_Inbox': 'Depot fichiers a analyser (PDF, Word, scraping...)',
  'scraped': 'Fichiers bruts du scraping web',
  'Source': 'Code source nouveau site',
  'Documentation': 'Documentation projet',
  'admin': 'Devis, contrats, factures',
  'textes': 'Contenus textuels',
  'notes': 'Notes et comptes-rendus',
  'Assets': 'Ressources graphiques',
  'images': 'Images du projet',
  'design': 'Maquettes, wireframes',
  'References': 'Ancien site client',
  'styles': 'CSS, couleurs, polices',
  'www': 'Dossier deploiement FTP',
  'css': 'Feuilles de style CSS',
  'js': 'Scripts JavaScript',
};

// Directory node structure for filesystem operations
export interface DirectoryNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DirectoryNode[];
  size?: number;
  modified?: string;
}

// Scraping status
export interface ScrapingStatus {
  stage: 'idle' | 'fetching' | 'parsing' | 'downloading' | 'organizing' | 'generating' | 'complete' | 'error';
  progress: number;
  message: string;
  pagesScraped?: number;
  totalPages?: number;
  imagesDownloaded?: number;
  totalImages?: number;
}

export interface ParsedFTPCredentials {
  host?: string;
  username?: string;
  password?: string;
  port?: number;
  path?: string;
  testUrl?: string;  // URL de test/prévisualisation extraite
}

export const PROJECT_STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string }> = {
  prospect: { label: 'Prospect', color: '#ffb74d' },      // Orange
  development: { label: 'En développement', color: '#4fc3f7' }, // Bleu
  review: { label: 'En recette', color: '#ce93d8' },      // Violet
  validated: { label: 'Validé', color: '#aed581' },       // Vert clair
  live: { label: 'En ligne', color: '#81c784' },          // Vert
  archived: { label: 'Archivé', color: '#90a4ae' },       // Gris
};

// Migration helper for old status values
export function migrateProjectStatus(status: string): ProjectStatus {
  const statusMigration: Record<string, ProjectStatus> = {
    active: 'development',
    completed: 'live',
    paused: 'review',
  };
  return statusMigration[status] || (status as ProjectStatus) || 'prospect';
}

// ============================================
// Sync Progress Event Types
// ============================================

export type SyncEventType =
  | 'connecting'
  | 'analyzing'
  | 'file_start'
  | 'file_progress'
  | 'file_complete'
  | 'file_error'
  | 'complete'
  | 'error'
  | 'cancelled';

export interface SyncProgressEvent {
  project_id: string;
  event: SyncEventType;
  file: string | null;
  progress: number;          // 0-100 overall progress
  file_progress: number | null; // 0-100 for current file
  bytes_sent: number | null;
  bytes_total: number | null;
  message: string | null;
  timestamp: number;
}

export type SyncLogLevel = 'info' | 'success' | 'warning' | 'error';

export interface SyncLogEntry {
  id: string;
  timestamp: number;
  level: SyncLogLevel;
  message: string;
  file?: string;
  details?: string;
}

export interface SyncFailedFile {
  path: string;
  error: string;
  timestamp: number;
  retryCount: number;
}

// ============================================
// Version History Types
// ============================================

export interface FileVersion {
  id: string;
  path: string;
  hash: string;
  size: number;
  modified: string;
  sync_id: string;
  backup_path?: string;
}

export interface SyncSnapshot {
  id: string;
  project_id: string;
  timestamp: string;
  files: FileVersion[];
  total_size: number;
  files_count: number;
  message?: string;
}

export interface SnapshotSummary {
  id: string;
  timestamp: string;
  files_count: number;
  total_size: number;
  message?: string;
}

export interface SnapshotDiff {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: string[];
}

// ============================================
// Scheduler Types
// ============================================

export type ScheduleType = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

export interface SyncSchedule {
  project_id: string;
  enabled: boolean;
  schedule_type: ScheduleType;
  cron_expression?: string;
  next_run?: string;
  last_run?: string;
  last_result?: ScheduleResult;
}

export interface ScheduleResult {
  success: boolean;
  timestamp: string;
  files_synced: number;
  error?: string;
}

export interface ScheduleEvent {
  project_id: string;
  schedule_type: string;
  timestamp: number;
}

// ============================================
// Sync Options Types
// ============================================

export interface SyncOptions {
  parallel_enabled: boolean;
  parallel_connections: number;
  create_snapshot: boolean;
  snapshot_message?: string;
}

export interface SyncConfig {
  parallel_enabled: boolean;
  parallel_connections: number;
  auto_snapshot: boolean;
}

// ============================================
// Dashboard Stats Types
// ============================================

export interface ProjectStats {
  totalSyncs: number;
  lastSyncDate?: string;
  totalFilesUploaded: number;
  totalBytesTransferred: number;
  averageSyncDuration: number;
  syncHistory: SyncHistoryEntry[];
  fileTypeBreakdown: Record<string, number>;
}

export interface SyncHistoryEntry {
  id: string;
  timestamp: string;
  filesCount: number;
  bytesTransferred: number;
  duration: number;
  success: boolean;
  error?: string;
}

export interface AgencyStats {
  totalProjects: number;
  activeProjects: number;
  totalSyncs: number;
  totalBytesTransferred: number;
  projectsByStatus: Record<ProjectStatus, number>;
  recentActivity: ActivityEntry[];
}

export interface ActivityEntry {
  id: string;
  type: 'sync' | 'create' | 'update' | 'scrape';
  projectId: string;
  projectName: string;
  timestamp: string;
  details?: string;
}

// ============================================
// Delta Sync Types
// ============================================

export type DeltaStatus = 'new' | 'unchanged' | 'modified' | 'smallfile' | 'deleted';

export interface ChunkHash {
  index: number;
  offset: number;
  size: number;
  hash: string;
}

export interface FileSignature {
  path: string;
  total_size: number;
  full_hash: string;
  chunk_size: number;
  chunk_hashes: ChunkHash[];
  modified_at: string;
  created_at: string;
}

export interface SignatureCache {
  project_id: string;
  signatures: Record<string, FileSignature>;
  updated_at: string;
}

export interface FileDelta {
  path: string;
  status: DeltaStatus;
  total_size: number;
  transfer_size: number;
  changed_chunks: number[];
  savings_percent: number;
}

export interface DeltaTransferStats {
  total_files: number;
  new_files: number;
  modified_files: number;
  unchanged_files: number;
  deleted_files: number;
  total_size: number;
  transfer_size: number;
  savings_bytes: number;
  savings_percent: number;
}
