/**
 * Documentation Service - Main exports
 * Re-exports all modules for backward compatibility
 */

// Web Scraper
export {
  scrapeWebsite,
  getUniqueColors,
  getUniqueFonts,
  groupTextsByPage,
} from './webScraper';
export type {
  ScrapeConfig,
  ScrapedPage,
  ScrapedAsset,
  ExtractedText,
  SiteLink,
  ScrapeResult,
} from './webScraper';

// File Organizer
export {
  getDefaultFolders,
  ensureFoldersExist,
  organizeImages,
  organizeStylesheets,
  organizeScrapedFiles,
  cleanupScrapedFolders,
} from './fileOrganizer';
export type { OrganizeFolders } from './fileOrganizer';

// Markdown Generator
export {
  generateDocumentationContent,
  generateDocumentation,
} from './markdownGenerator';
export type { DocumentationConfig } from './markdownGenerator';

/**
 * Legacy documentationService object for backward compatibility
 * @deprecated Use individual exports instead
 */
export const documentationService = {
  scrapeWebsite: async (config: import('./webScraper').ScrapeConfig) => {
    const { scrapeWebsite } = await import('./webScraper');
    return scrapeWebsite(config);
  },

  generateDocumentation: async (config: import('./markdownGenerator').DocumentationConfig) => {
    const { generateDocumentation } = await import('./markdownGenerator');
    return generateDocumentation(config);
  },

  organizeScrapedFiles: async (
    projectPath: string,
    scrapeResult: import('./webScraper').ScrapeResult
  ) => {
    const { organizeScrapedFiles } = await import('./fileOrganizer');
    return organizeScrapedFiles(projectPath, scrapeResult);
  },
};
