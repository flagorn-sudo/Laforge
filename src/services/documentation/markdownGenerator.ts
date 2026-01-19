/**
 * Markdown Generator
 * Generates documentation markdown from scrape results
 */

import { writeTextFile } from '@tauri-apps/api/fs';
import { fileSystemService } from '../fileSystemService';
import { logger } from '../../lib/logger';
import { ScrapeResult, ExtractedText, groupTextsByPage } from './webScraper';

const log = logger.scope('MarkdownGenerator');

/**
 * Configuration for documentation generation
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
 * Generate the header section of the documentation
 */
function generateHeader(projectName: string, siteUrl: string): string {
  return `# Documentation - ${projectName}

> Généré automatiquement par La Forge le ${new Date().toLocaleDateString('fr-FR')}
> Source: ${siteUrl}

---
`;
}

/**
 * Generate the client profile section
 */
function generateClientProfile(
  clientDescription?: string,
  themeTags?: string[],
  referenceWebsites?: { url: string; name?: string }[]
): string {
  return `## Profil Client

${clientDescription || '*Aucune description disponible*'}

### Orientations de design

${themeTags && themeTags.length > 0 ? themeTags.map((t) => `- ${t}`).join('\n') : '*Aucun thème défini*'}

### Sites de référence graphique

${
  referenceWebsites && referenceWebsites.length > 0
    ? referenceWebsites.map((r) => `- [${r.name || r.url}](${r.url})`).join('\n')
    : '*Aucun site de référence*'
}

---
`;
}

/**
 * Generate the site structure section
 */
function generateSiteStructure(pages: ScrapeResult['pages']): string {
  let content = `## 1. Structure du Site Scrapé

### Pages analysées (${pages.length})

| Page | Titre |
|------|-------|
`;

  for (const page of pages) {
    content += `| ${page.path} | ${page.title} |\n`;
  }

  content += `

### Architecture du site

\`\`\`
`;

  // Build site tree
  const paths = [...new Set(pages.map((p) => p.path))].sort();
  for (const path of paths) {
    const indent = '  '.repeat((path.match(/\//g) || []).length);
    const name = path.split('/').pop() || path;
    content += `${indent}├── ${name}\n`;
  }

  content += `\`\`\`

---
`;

  return content;
}

/**
 * Generate the texts section
 */
function generateTextsSection(
  texts: ExtractedText[],
  improvedTexts?: { original: string; improved: string }[]
): string {
  let content = `## 2. Textes du Site

### Textes originaux

`;

  const textsByPage = groupTextsByPage(texts);

  for (const [pageUrl, pageTexts] of textsByPage) {
    content += `#### ${pageUrl}\n\n`;
    for (const text of pageTexts) {
      if (!text.content) continue;
      const elementType = text.elementType || 'p';
      const prefix = elementType.startsWith('h')
        ? '#'.repeat(parseInt(elementType[1]) || 1) + ' '
        : '';
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
`;

  return content;
}

/**
 * Generate the assets section
 */
function generateAssetsSection(
  images: ScrapeResult['images'],
  stylesheets: ScrapeResult['stylesheets']
): string {
  let content = `## 3. Assets

### Images (${images.length})

`;

  if (images.length > 0) {
    content += `| Fichier | URL source |
|---------|------------|
`;
    for (const img of images.slice(0, 20)) {
      const filename = img.localPath?.split('/').pop() || 'unknown';
      content += `| ${filename} | ${img.url} |\n`;
    }
    if (images.length > 20) {
      content += `\n*... et ${images.length - 20} autres images*\n`;
    }
  } else {
    content += `Aucune image téléchargée.\n`;
  }

  content += `
### Feuilles de style (${stylesheets.length})

`;

  if (stylesheets.length > 0) {
    for (const css of stylesheets) {
      const filename = css.localPath?.split('/').pop() || 'unknown';
      content += `- \`${filename}\` (${css.url})\n`;
    }
  } else {
    content += `Aucune feuille de style téléchargée.\n`;
  }

  content += `

---
`;

  return content;
}

/**
 * Generate the design section
 */
function generateDesignSection(colors: string[], fonts: string[]): string {
  let content = `## 4. Design

### Couleurs détectées

`;

  if (colors.length > 0) {
    content += `| Couleur | Hex |
|---------|-----|
`;
    const uniqueColors = [...new Set(colors)].slice(0, 20);
    for (const color of uniqueColors) {
      content += `| ![${color}](https://via.placeholder.com/15/${color.replace('#', '')}/000000?text=+) | \`${color}\` |\n`;
    }
  } else {
    content += `Aucune couleur détectée.\n`;
  }

  content += `

### Polices détectées

`;

  if (fonts.length > 0) {
    const uniqueFonts = [...new Set(fonts)];
    for (const font of uniqueFonts) {
      content += `- ${font}\n`;
    }
  } else {
    content += `Aucune police détectée.\n`;
  }

  content += `

---
`;

  return content;
}

/**
 * Generate the Claude instructions section
 */
function generateClaudeInstructions(
  siteUrl: string,
  colors: string[],
  fonts: string[],
  pagesCount: number,
  imagesCount: number,
  errorsCount: number
): string {
  return `## 5. Instructions pour Claude

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
${colors
  .slice(0, 5)
  .map((c, i) => `  --color-${i + 1}: ${c};`)
  .join('\n')}
${fonts
  .slice(0, 2)
  .map((f, i) => `  --font-${i === 0 ? 'primary' : 'secondary'}: "${f}", sans-serif;`)
  .join('\n')}
}
\`\`\`

### Points d'attention

- Nombre de pages à recréer: ${pagesCount}
- Images à optimiser/remplacer: ${imagesCount}
${errorsCount > 0 ? `- Erreurs lors du scraping: ${errorsCount}` : ''}

---

*Document généré par La Forge*
`;
}

/**
 * Generate complete documentation markdown
 */
export function generateDocumentationContent(config: DocumentationConfig): string {
  const {
    projectName,
    siteUrl,
    scrapeResult,
    improvedTexts,
    clientDescription,
    themeTags,
    referenceWebsites,
  } = config;

  return [
    generateHeader(projectName, siteUrl),
    generateClientProfile(clientDescription, themeTags, referenceWebsites),
    generateSiteStructure(scrapeResult.pages),
    generateTextsSection(scrapeResult.texts, improvedTexts),
    generateAssetsSection(scrapeResult.images, scrapeResult.stylesheets),
    generateDesignSection(scrapeResult.colors, scrapeResult.fonts),
    generateClaudeInstructions(
      siteUrl,
      scrapeResult.colors,
      scrapeResult.fonts,
      scrapeResult.pages.length,
      scrapeResult.images.length,
      scrapeResult.errors.length
    ),
  ].join('\n');
}

/**
 * Generate and save documentation to file
 */
export async function generateDocumentation(config: DocumentationConfig): Promise<string> {
  const { projectPath } = config;
  const docPath = fileSystemService.joinPath(projectPath, 'Documentation', 'documentation.md');

  log.info('Generating documentation');

  // Generate content
  const content = generateDocumentationContent(config);

  // Ensure the directory exists
  await fileSystemService.createFolder(
    fileSystemService.joinPath(projectPath, 'Documentation')
  );

  // Write the file
  try {
    await writeTextFile(docPath, content);
    log.info(`Documentation saved to ${docPath}`);
    return docPath;
  } catch (error) {
    log.error('Failed to save documentation', error);
    throw new Error(`Failed to save documentation: ${error}`);
  }
}
