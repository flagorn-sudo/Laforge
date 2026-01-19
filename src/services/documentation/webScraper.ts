/**
 * Web Scraper
 * Wrapper for Tauri scrape command
 */

import { invoke } from '@tauri-apps/api/tauri';
import { ScrapingError } from '../../lib/errors';
import { logger } from '../../lib/logger';

const log = logger.scope('WebScraper');

/**
 * Configuration for website scraping
 */
export interface ScrapeConfig {
  url: string;
  outputPath: string;
  maxPages?: number;
  downloadImages: boolean;
  downloadCss: boolean;
  extractText: boolean;
}

/**
 * A scraped page from the website
 */
export interface ScrapedPage {
  url: string;
  title: string;
  path: string;
}

/**
 * A downloaded asset (image, stylesheet, etc.)
 */
export interface ScrapedAsset {
  url: string;
  localPath: string;
  fileType: string;
}

/**
 * Extracted text content from a page
 */
export interface ExtractedText {
  pageUrl: string;
  elementType: string;
  content: string;
}

/**
 * Link between pages in the site structure
 */
export interface SiteLink {
  fromPage: string;
  toPage: string;
  linkText: string;
}

/**
 * Complete results from a scraping operation
 */
export interface ScrapeResult {
  pages: ScrapedPage[];
  images: ScrapedAsset[];
  stylesheets: ScrapedAsset[];
  fonts: string[];
  colors: string[];
  texts: ExtractedText[];
  siteStructure: SiteLink[];
  errors: string[];
}

/**
 * Scrape a website and return the results
 */
export async function scrapeWebsite(config: ScrapeConfig): Promise<ScrapeResult> {
  log.info(`Starting scrape of ${config.url}`);

  try {
    const result = await invoke<ScrapeResult>('scrape_website', {
      config: {
        url: config.url,
        outputPath: config.outputPath,
        maxPages: config.maxPages || 50,
        downloadImages: config.downloadImages,
        downloadCss: config.downloadCss,
        extractText: config.extractText,
      },
    });

    log.info(`Scrape completed: ${result.pages.length} pages, ${result.images.length} images`);
    return result;
  } catch (error) {
    log.error('Scraping failed', error);
    throw new ScrapingError(
      `Failed to scrape website: ${error}`,
      config.url,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Get unique colors from scrape results, sorted by frequency
 */
export function getUniqueColors(result: ScrapeResult): string[] {
  const colorCounts = new Map<string, number>();

  for (const color of result.colors) {
    const normalized = color.toLowerCase();
    colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + 1);
  }

  return [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color);
}

/**
 * Get unique fonts from scrape results
 */
export function getUniqueFonts(result: ScrapeResult): string[] {
  return [...new Set(result.fonts)];
}

/**
 * Group texts by page URL
 */
export function groupTextsByPage(texts: ExtractedText[]): Map<string, ExtractedText[]> {
  const grouped = new Map<string, ExtractedText[]>();

  for (const text of texts) {
    const existing = grouped.get(text.pageUrl) || [];
    existing.push(text);
    grouped.set(text.pageUrl, existing);
  }

  return grouped;
}
