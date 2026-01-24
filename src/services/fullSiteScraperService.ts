/**
 * Full Site Scraper Service
 * Downloads entire websites with local working versions
 */

import { invoke } from '@tauri-apps/api/tauri';

export interface FullScrapeConfig {
  url: string;
  outputPath: string;
  maxPages?: number;
  downloadImages?: boolean;
  downloadCss?: boolean;
  downloadJs?: boolean;
  downloadFonts?: boolean;
  rewriteUrls?: boolean;
  generateReport?: boolean;
}

export interface FullScrapeProgress {
  project_id: string;
  event_type: string; // "connecting", "page_start", "page_complete", "asset_download", "analyzing", "rewriting", "complete", "error"
  current_step: string;
  progress_percent: number;
  pages_downloaded: number;
  pages_total: number;
  assets_downloaded: number;
  current_url: string | null;
  message: string;
  bytes_downloaded: number;
}

export interface ColorInfo {
  hex: string;
  rgb: string | null;
  usage: string;
  occurrences: number;
}

export interface FontInfo {
  family: string;
  weights: string[];
  source: string;
  url: string | null;
}

export interface DesignSystem {
  colors: ColorInfo[];
  fonts: FontInfo[];
  typography: {
    base_font_size: string | null;
    headings: Record<string, { font_size: string; font_weight?: string; line_height?: string }>;
    body_line_height: string | null;
  };
  spacing: string[];
  breakpoints: string[];
}

export interface FullScrapeResult {
  success: boolean;
  pages_downloaded: number;
  assets_downloaded: number;
  total_size_bytes: number;
  output_path: string;
  index_path: string;
  design_system: DesignSystem;
  report_path: string | null;
  errors: string[];
  warnings: string[];
}

/**
 * Scrape an entire website with full local working copy
 */
export async function scrapeFullSite(config: FullScrapeConfig): Promise<FullScrapeResult> {
  return invoke('scrape_full_site', { config });
}

/**
 * Scrape an entire website with progress events
 * Listen to 'full-scrape-progress' events for real-time updates
 */
export async function scrapeFullSiteWithEvents(
  config: FullScrapeConfig,
  projectId: string
): Promise<FullScrapeResult> {
  return invoke('scrape_full_site_with_events', { config, projectId });
}

/**
 * Cancel an ongoing full site scrape
 */
export async function cancelFullSiteScrape(projectId: string): Promise<void> {
  return invoke('cancel_full_site_scrape', { projectId });
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get color as CSS color for preview
 */
export function getColorPreviewStyle(color: ColorInfo): React.CSSProperties {
  return {
    backgroundColor: color.hex,
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.2)',
  };
}

/**
 * Sort colors by brightness (light to dark)
 */
export function sortColorsByBrightness(colors: ColorInfo[]): ColorInfo[] {
  return [...colors].sort((a, b) => {
    const brightnessA = getColorBrightness(a.hex);
    const brightnessB = getColorBrightness(b.hex);
    return brightnessB - brightnessA;
  });
}

function getColorBrightness(hex: string): number {
  const cleanHex = hex.replace('#', '');
  let r = 0, g = 0, b = 0;

  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.slice(0, 2), 16);
    g = parseInt(cleanHex.slice(2, 4), 16);
    b = parseInt(cleanHex.slice(4, 6), 16);
  }

  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Group colors by usage type
 */
export function groupColorsByUsage(colors: ColorInfo[]): Record<string, ColorInfo[]> {
  return colors.reduce((acc, color) => {
    const usage = color.usage || 'other';
    if (!acc[usage]) {
      acc[usage] = [];
    }
    acc[usage].push(color);
    return acc;
  }, {} as Record<string, ColorInfo[]>);
}

/**
 * Get primary/accent colors (most used non-white/black)
 */
export function getPrimaryColors(colors: ColorInfo[]): ColorInfo[] {
  return colors
    .filter((c) => {
      const hex = c.hex.toLowerCase();
      return hex !== '#fff' && hex !== '#ffffff' && hex !== '#000' && hex !== '#000000';
    })
    .slice(0, 5);
}

export const fullSiteScraperService = {
  scrapeFullSite,
  scrapeFullSiteWithEvents,
  cancelFullSiteScrape,
  formatBytes,
  getColorPreviewStyle,
  sortColorsByBrightness,
  groupColorsByUsage,
  getPrimaryColors,
};

export default fullSiteScraperService;
