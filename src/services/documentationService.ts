import { invoke } from '@tauri-apps/api/tauri';
import { fileSystemService } from './fileSystemService';

/**
 * Types for scraping results
 */
export interface ScrapeConfig {
  url: string;
  outputPath: string;
  maxPages?: number;
  downloadImages: boolean;
  downloadCss: boolean;
  extractText: boolean;
}

export interface ScrapedPage {
  url: string;
  title: string;
  path: string;
}

export interface ScrapedAsset {
  url: string;
  localPath: string;
  fileType: string;
}

export interface ExtractedText {
  pageUrl: string;
  elementType: string;
  content: string;
}

export interface SiteLink {
  fromPage: string;
  toPage: string;
  linkText: string;
}

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
 * Documentation generation configuration
 */
export interface DocumentationConfig {
  projectName: string;
  projectPath: string;
  siteUrl: string;
  scrapeResult: ScrapeResult;
  improvedTexts?: { original: string; improved: string }[];
  clientDescription?: string;
  themeTags?: string[];
  referenceWebsites?: { url: string; name?: string }[];
}

/**
 * Service for generating project documentation from scraped content
 */
export const documentationService = {
  /**
   * Scrape a website
   */
  async scrapeWebsite(config: ScrapeConfig): Promise<ScrapeResult> {
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
      return result;
    } catch (error) {
      console.error('Scraping failed:', error);
      throw new Error(`Failed to scrape website: ${error}`);
    }
  },

  /**
   * Generate documentation.md from scrape results
   */
  async generateDocumentation(config: DocumentationConfig): Promise<string> {
    const { projectName, projectPath, siteUrl, scrapeResult, improvedTexts, clientDescription, themeTags, referenceWebsites } = config;
    const docPath = fileSystemService.joinPath(projectPath, 'Documentation', 'documentation.md');

    let content = `# Documentation - ${projectName}

> Généré automatiquement par Forge le ${new Date().toLocaleDateString('fr-FR')}
> Source: ${siteUrl}

---

## Profil Client

${clientDescription || '*Aucune description disponible*'}

### Orientations de design

${themeTags && themeTags.length > 0 ? themeTags.map(t => `- ${t}`).join('\n') : '*Aucun thème défini*'}

### Sites de référence graphique

${referenceWebsites && referenceWebsites.length > 0
  ? referenceWebsites.map(r => `- [${r.name || r.url}](${r.url})`).join('\n')
  : '*Aucun site de référence*'}

---

## 1. Structure du Site Scrapé

### Pages analysées (${scrapeResult.pages.length})

| Page | Titre |
|------|-------|
`;

    for (const page of scrapeResult.pages) {
      content += `| ${page.path} | ${page.title} |\n`;
    }

    content += `

### Architecture du site

\`\`\`
`;

    // Build site tree
    const paths = [...new Set(scrapeResult.pages.map((p) => p.path))].sort();
    for (const path of paths) {
      const indent = '  '.repeat((path.match(/\//g) || []).length);
      const name = path.split('/').pop() || path;
      content += `${indent}├── ${name}\n`;
    }

    content += `\`\`\`

---

## 2. Textes du Site

### Textes originaux

`;

    // Group texts by page
    const textsByPage = new Map<string, ExtractedText[]>();
    for (const text of scrapeResult.texts) {
      const existing = textsByPage.get(text.pageUrl) || [];
      existing.push(text);
      textsByPage.set(text.pageUrl, existing);
    }

    for (const [pageUrl, texts] of textsByPage) {
      content += `#### ${pageUrl}\n\n`;
      for (const text of texts) {
        if (!text.content) continue; // Skip empty texts
        const elementType = text.elementType || 'p';
        const prefix = elementType.startsWith('h') ? '#'.repeat(parseInt(elementType[1]) || 1) + ' ' : '';
        content += `${prefix}${text.content}\n\n`;
      }
    }

    // Add improved texts if available
    if (improvedTexts && improvedTexts.length > 0) {
      content += `
### Textes améliorés par l'IA

`;
      for (const { original, improved } of improvedTexts) {
        content += `**Original:**
> ${original.substring(0, 200)}${original.length > 200 ? '...' : ''}

**Amélioré:**
${improved}

---

`;
      }
    }

    content += `
---

## 3. Assets

### Images (${scrapeResult.images.length})

`;

    if (scrapeResult.images.length > 0) {
      content += `| Fichier | URL source |
|---------|------------|
`;
      for (const img of scrapeResult.images.slice(0, 20)) {
        const filename = img.localPath?.split('/').pop() || 'unknown';
        content += `| ${filename} | ${img.url} |\n`;
      }
      if (scrapeResult.images.length > 20) {
        content += `\n*... et ${scrapeResult.images.length - 20} autres images*\n`;
      }
    } else {
      content += `Aucune image téléchargée.\n`;
    }

    content += `
### Feuilles de style (${scrapeResult.stylesheets.length})

`;

    if (scrapeResult.stylesheets.length > 0) {
      for (const css of scrapeResult.stylesheets) {
        const filename = css.localPath?.split('/').pop() || 'unknown';
        content += `- \`${filename}\` (${css.url})\n`;
      }
    } else {
      content += `Aucune feuille de style téléchargée.\n`;
    }

    content += `

---

## 4. Design

### Couleurs détectées

`;

    if (scrapeResult.colors.length > 0) {
      content += `| Couleur | Hex |
|---------|-----|
`;
      const uniqueColors = [...new Set(scrapeResult.colors)].slice(0, 20);
      for (const color of uniqueColors) {
        content += `| ![${color}](https://via.placeholder.com/15/${color.replace('#', '')}/000000?text=+) | \`${color}\` |\n`;
      }
    } else {
      content += `Aucune couleur détectée.\n`;
    }

    content += `

### Polices détectées

`;

    if (scrapeResult.fonts.length > 0) {
      const uniqueFonts = [...new Set(scrapeResult.fonts)];
      for (const font of uniqueFonts) {
        content += `- ${font}\n`;
      }
    } else {
      content += `Aucune police détectée.\n`;
    }

    content += `

---

## 5. Instructions pour Claude

### Contexte du projet

Ce projet est une **refonte du site ${siteUrl}**. Les fichiers scrapés se trouvent dans:

- \`_Inbox/scraped/\` - Fichiers bruts du scraping
- \`Documentation/textes/\` - Textes extraits
- \`References/images/\` - Images de référence
- \`References/styles/\` - Fichiers CSS et styles

### Règles de développement

1. **Le nouveau site doit être développé dans \`www/\`** - C'est le seul dossier synchronisé via FTP
2. Ne jamais copier les fichiers scrapés directement dans \`www/\`
3. Utiliser les références comme inspiration, pas comme source

### Design system suggéré

\`\`\`css
:root {
${scrapeResult.colors.slice(0, 5).map((c, i) => `  --color-${i + 1}: ${c};`).join('\n')}
${scrapeResult.fonts.slice(0, 2).map((f, i) => `  --font-${i === 0 ? 'primary' : 'secondary'}: "${f}", sans-serif;`).join('\n')}
}
\`\`\`

### Points d'attention

- Nombre de pages à recréer: ${scrapeResult.pages.length}
- Images à optimiser/remplacer: ${scrapeResult.images.length}
${scrapeResult.errors.length > 0 ? `- Erreurs lors du scraping: ${scrapeResult.errors.length}` : ''}

---

*Document généré par Forge v2*
`;

    // Save the documentation
    try {
      // Ensure the directory exists
      await fileSystemService.createFolder(fileSystemService.joinPath(projectPath, 'Documentation'));

      // Write the file using Tauri's fs API
      const { writeTextFile } = await import('@tauri-apps/api/fs');
      await writeTextFile(docPath, content);

      return docPath;
    } catch (error) {
      console.error('Failed to save documentation:', error);
      throw new Error(`Failed to save documentation: ${error}`);
    }
  },

  /**
   * Organize scraped files into proper project folders
   */
  async organizeScrapedFiles(
    projectPath: string,
    scrapeResult: ScrapeResult
  ): Promise<void> {
    const refImages = fileSystemService.joinPath(projectPath, 'References', 'images');
    const refDesign = fileSystemService.joinPath(projectPath, 'References', 'styles');
    const docsTexts = fileSystemService.joinPath(projectPath, 'Documentation', 'textes');

    // Ensure target directories exist
    await fileSystemService.createFolder(refImages);
    await fileSystemService.createFolder(refDesign);
    await fileSystemService.createFolder(docsTexts);

    // Move images
    for (const img of scrapeResult.images) {
      if (!img.localPath) continue; // Skip if no local file
      const filename = img.localPath.split('/').pop();
      if (filename) {
        const dest = fileSystemService.joinPath(refImages, filename);
        try {
          await fileSystemService.moveItem(img.localPath, dest);
        } catch (e) {
          // File might already be moved or doesn't exist
          console.warn(`Could not move image ${filename}:`, e);
        }
      }
    }

    // Move stylesheets
    for (const css of scrapeResult.stylesheets) {
      if (!css.localPath) continue; // Skip if no local file
      const filename = css.localPath.split('/').pop();
      if (filename) {
        const dest = fileSystemService.joinPath(refDesign, filename);
        try {
          await fileSystemService.moveItem(css.localPath, dest);
        } catch (e) {
          console.warn(`Could not move stylesheet ${filename}:`, e);
        }
      }
    }

    // Texts are already saved by the scraper
  },
};
