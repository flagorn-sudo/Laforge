import { save } from '@tauri-apps/api/dialog';
import { writeTextFile } from '@tauri-apps/api/fs';
import { ScrapingRun, ScrapingStats, ScrapingInfo } from '../types';

export type ExportFormat = 'json' | 'csv';

interface ExportData {
  projectName: string;
  exportDate: string;
  latestScraping?: {
    sourceUrl: string;
    scrapedAt: string;
    stats: ScrapingStats;
  };
  history: ScrapingRun[];
}

/**
 * Service for exporting scraping results to JSON or CSV
 */
class ScrapingExportService {
  /**
   * Export scraping data to a file
   */
  async exportScrapingData(
    projectName: string,
    scrapingInfo: ScrapingInfo,
    format: ExportFormat
  ): Promise<string | null> {
    const exportData = this.prepareExportData(projectName, scrapingInfo);

    const content = format === 'json'
      ? this.toJSON(exportData)
      : this.toCSV(exportData);

    const extension = format === 'json' ? 'json' : 'csv';
    const defaultFileName = `scraping-${projectName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.${extension}`;

    const filePath = await save({
      defaultPath: defaultFileName,
      filters: [
        {
          name: format === 'json' ? 'JSON' : 'CSV',
          extensions: [extension],
        },
      ],
    });

    if (!filePath) {
      return null; // User cancelled
    }

    await writeTextFile(filePath, content);
    return filePath;
  }

  /**
   * Prepare data for export
   */
  private prepareExportData(projectName: string, scrapingInfo: ScrapingInfo): ExportData {
    return {
      projectName,
      exportDate: new Date().toISOString(),
      latestScraping: scrapingInfo.completed && scrapingInfo.stats
        ? {
            sourceUrl: scrapingInfo.sourceUrl || '',
            scrapedAt: scrapingInfo.scrapedAt || '',
            stats: scrapingInfo.stats,
          }
        : undefined,
      history: scrapingInfo.history || [],
    };
  }

  /**
   * Convert to JSON string
   */
  private toJSON(data: ExportData): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Convert to CSV string
   */
  private toCSV(data: ExportData): string {
    const lines: string[] = [];

    // Header
    lines.push('Date,URL,Pages,Images,Textes,Couleurs,Polices,Liste Couleurs,Liste Polices');

    // Helper to escape CSV values
    const escapeCSV = (value: string | number | undefined): string => {
      if (value === undefined || value === null) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Add history rows
    const allRuns = data.history.length > 0
      ? data.history
      : data.latestScraping
        ? [{
            id: 'latest',
            sourceUrl: data.latestScraping.sourceUrl,
            scrapedAt: data.latestScraping.scrapedAt,
            stats: data.latestScraping.stats,
          }]
        : [];

    for (const run of allRuns) {
      const row = [
        escapeCSV(this.formatDate(run.scrapedAt)),
        escapeCSV(run.sourceUrl),
        escapeCSV(run.stats.pagesCount),
        escapeCSV(run.stats.imagesCount),
        escapeCSV(run.stats.textsCount),
        escapeCSV(run.stats.colorsCount),
        escapeCSV(run.stats.fontsCount),
        escapeCSV(run.stats.colors.join('; ')),
        escapeCSV(run.stats.fonts.join('; ')),
      ];
      lines.push(row.join(','));
    }

    return lines.join('\n');
  }

  /**
   * Format date for display
   */
  private formatDate(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoDate;
    }
  }

  /**
   * Export only colors as a CSS variables file
   */
  async exportColorsAsCSS(
    projectName: string,
    colors: string[]
  ): Promise<string | null> {
    const uniqueColors = [...new Set(colors)];

    const cssContent = `:root {
  /* Colors extracted from ${projectName} */
  /* Generated on ${new Date().toLocaleDateString('fr-FR')} */

${uniqueColors.map((color, i) => `  --color-${i + 1}: ${color};`).join('\n')}
}
`;

    const defaultFileName = `colors-${projectName.toLowerCase().replace(/\s+/g, '-')}.css`;

    const filePath = await save({
      defaultPath: defaultFileName,
      filters: [
        {
          name: 'CSS',
          extensions: ['css'],
        },
      ],
    });

    if (!filePath) {
      return null;
    }

    await writeTextFile(filePath, cssContent);
    return filePath;
  }
}

export const scrapingExportService = new ScrapingExportService();
