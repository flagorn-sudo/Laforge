import { invoke } from '@tauri-apps/api/tauri';
import { geminiService } from './geminiService';

// Timeout configuration for scraping operations
const SCRAPING_TIMEOUT_MS = 300000; // 5 minutes max for full scraping

/**
 * Wrapper to add timeout to any Promise
 * Prevents UI from hanging if Rust backend doesn't respond
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout: ${operation} a dépassé ${timeoutMs / 1000}s`));
      }, timeoutMs);
    }),
  ]);
}

// Track ongoing scraping operations
let currentScrapingProjectId: string | null = null;

interface WebpageContent {
  html: string;
  css: string | null;
}

export interface WebsiteAnalysis {
  colors: string[];
  fonts: string[];
  structure?: string;
  technologies?: string[];
}

export interface ExtractedTexts {
  title: string;
  metaDescription: string;
  headings: string[];
  paragraphs: string[];
  allTexts: string[];
}

export const scrapingService = {
  /**
   * Fetch webpage content via Tauri (bypasses CORS)
   */
  async fetchWebpage(url: string): Promise<WebpageContent> {
    return await invoke('fetch_webpage', { url });
  },

  /**
   * Extract key texts from HTML content
   */
  extractTextsFromHtml(html: string): ExtractedTexts {
    // Create a DOM parser (works in browser context)
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract title
    const title = doc.querySelector('title')?.textContent?.trim() || '';

    // Extract meta description
    const metaDescription =
      doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';

    // Extract headings (h1-h3)
    const headings: string[] = [];
    doc.querySelectorAll('h1, h2, h3').forEach((el) => {
      const text = el.textContent?.trim();
      if (text && text.length > 2 && text.length < 200) {
        headings.push(text);
      }
    });

    // Extract paragraphs
    const paragraphs: string[] = [];
    doc.querySelectorAll('p').forEach((el) => {
      const text = el.textContent?.trim();
      if (text && text.length > 20 && text.length < 1000) {
        paragraphs.push(text);
      }
    });

    // Extract all meaningful texts (limited to avoid noise)
    const allTexts: string[] = [title, metaDescription, ...headings, ...paragraphs.slice(0, 10)];

    return {
      title,
      metaDescription,
      headings: headings.slice(0, 10),
      paragraphs: paragraphs.slice(0, 15),
      allTexts: allTexts.filter(t => t.length > 0),
    };
  },

  /**
   * Fetch and extract texts from a website URL
   */
  async fetchAndExtractTexts(url: string): Promise<ExtractedTexts> {
    const content = await this.fetchWebpage(url);
    return this.extractTextsFromHtml(content.html);
  },

  /**
   * Analyze a website and extract colors, fonts, etc.
   */
  async analyzeWebsite(
    url: string,
    apiKey: string,
    model?: string
  ): Promise<WebsiteAnalysis> {
    // Fetch the webpage content
    const content = await this.fetchWebpage(url);

    // Use Gemini to analyze
    const analysis = await geminiService.analyzeWebsite(
      content.html,
      content.css,
      apiKey,
      model
    );

    return {
      colors: analysis.colors || [],
      fonts: analysis.fonts || [],
      structure: analysis.structure,
      technologies: analysis.technologies,
    };
  },

  /**
   * Check if a scraping operation is in progress
   */
  isScrapingInProgress(): boolean {
    return currentScrapingProjectId !== null;
  },

  /**
   * Get the current scraping project ID
   */
  getCurrentScrapingProjectId(): string | null {
    return currentScrapingProjectId;
  },

  /**
   * Scrape website with events and timeout protection
   * This wraps the Rust scrape_website_with_events command with proper error handling
   * Transforms Rust snake_case result to camelCase for frontend compatibility
   */
  async scrapeWebsiteWithEvents(config: {
    url: string;
    outputPath: string;
    maxPages: number;
    downloadImages: boolean;
    downloadCss: boolean;
    extractText: boolean;
  }, projectId: string): Promise<TransformedScrapeResult> {
    // Check if scraping is already in progress
    if (currentScrapingProjectId !== null) {
      throw new Error(`Un scraping est déjà en cours pour ${currentScrapingProjectId}`);
    }

    currentScrapingProjectId = projectId;

    try {
      const rustResult = await withTimeout(
        invoke<RustScrapeResult>('scrape_website_with_events', {
          config,
          projectId,
        }),
        SCRAPING_TIMEOUT_MS,
        'Scraping du site'
      );

      // Transform snake_case to camelCase for frontend compatibility
      return {
        pages: rustResult.pages,
        images: rustResult.images.map(img => ({
          url: img.url,
          localPath: img.local_path,
          fileType: img.file_type,
        })),
        stylesheets: rustResult.stylesheets.map(css => ({
          url: css.url,
          localPath: css.local_path,
          fileType: css.file_type,
        })),
        fonts: rustResult.fonts,
        colors: rustResult.colors,
        texts: rustResult.texts.map(t => ({
          pageUrl: t.page_url,
          elementType: t.element_type,
          content: t.content,
        })),
        siteStructure: rustResult.site_structure.map(link => ({
          fromPage: link.from_page,
          toPage: link.to_page,
          linkText: link.link_text,
        })),
        errors: rustResult.errors,
      };
    } finally {
      currentScrapingProjectId = null;
    }
  },

  /**
   * Cancel current scraping operation (if supported by backend)
   */
  cancelScraping(): void {
    currentScrapingProjectId = null;
    // Note: The Rust backend would need to implement cancellation support
    // For now, we just reset the tracking state
  },
};

// Type for raw ScrapeResult from Rust (snake_case)
interface RustScrapeResult {
  pages: Array<{ url: string; title: string; path: string }>;
  images: Array<{ url: string; local_path: string; file_type: string }>;
  stylesheets: Array<{ url: string; local_path: string; file_type: string }>;
  fonts: string[];
  colors: string[];
  texts: Array<{ page_url: string; element_type: string; content: string }>;
  site_structure: Array<{ from_page: string; to_page: string; link_text: string }>;
  errors: string[];
}

// Transformed result with camelCase for frontend
export interface TransformedScrapeResult {
  pages: Array<{ url: string; title: string; path: string }>;
  images: Array<{ url: string; localPath: string; fileType: string }>;
  stylesheets: Array<{ url: string; localPath: string; fileType: string }>;
  fonts: string[];
  colors: string[];
  texts: Array<{ pageUrl: string; elementType: string; content: string }>;
  siteStructure: Array<{ fromPage: string; toPage: string; linkText: string }>;
  errors: string[];
}

// Re-export ScrapeResult type from documentationService for convenience
export type { ScrapeResult } from './documentationService';
