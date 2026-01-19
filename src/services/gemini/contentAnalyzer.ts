/**
 * Content Analyzer
 * Analyzes websites and files using Gemini AI
 */

import { geminiRequest, parseGeminiJson } from './geminiApiClient';
import { FileCategorization } from '../../types';

const DEFAULT_MODEL = 'gemini-2.0-flash';

export interface WebsiteAnalysis {
  colors: string[];
  fonts: string[];
  structure: string;
  technologies: string[];
}

/**
 * Analyze website HTML/CSS and extract design information
 */
export async function analyzeWebsite(
  html: string,
  css: string | null,
  apiKey: string,
  model?: string
): Promise<WebsiteAnalysis> {
  const modelName = model || DEFAULT_MODEL;

  const prompt = `Analyze this website HTML/CSS and extract:
- colors: array of hex color codes (primary colors first)
- fonts: array of font names
- structure: brief description
- technologies: detected frameworks/libraries

Return ONLY JSON.

HTML:
${html.substring(0, 8000)}

${css ? `CSS:\n${css.substring(0, 4000)}` : ''}`;

  const response = await geminiRequest(apiKey, modelName, prompt, {
    temperature: 0.1,
    maxOutputTokens: 2048,
  });

  return parseGeminiJson<WebsiteAnalysis>(response);
}

/**
 * Categorize a file into the appropriate folder
 */
export async function categorizeFile(
  fileName: string,
  extension: string | null,
  folderStructure: string[],
  apiKey: string,
  model?: string
): Promise<FileCategorization> {
  const modelName = model || DEFAULT_MODEL;

  const foldersDescription = folderStructure.map((f) => `- ${f}`).join('\n');

  const prompt = `Tu es un assistant d'organisation de fichiers. Analyse le fichier suivant et détermine dans quel dossier il devrait être rangé.

Nom du fichier: ${fileName}
Extension: ${extension || 'aucune'}

Structure de dossiers disponible:
${foldersDescription}

Règles de catégorisation:
- Les fichiers .psd, .ai, .fig vont dans les dossiers sources (psd, ai, figma)
- Les fichiers .jpg, .jpeg, .png, .gif, .webp vont dans images ou assets/images
- Les fichiers .mp4, .mov, .avi vont dans videos
- Les fichiers .svg, .ico vont dans icons
- Les fichiers .pdf, .doc, .docx, .txt vont dans docs
- Les fichiers .css, .scss vont dans www/css
- Les fichiers .js, .ts vont dans www/js
- Les fichiers .html vont dans www/pages
- Les fonts (.ttf, .otf, .woff, .woff2) vont dans fonts

Retourne un JSON avec:
- targetFolder: le chemin du dossier cible (ex: "01-sources/psd" ou "03-assets/images")
- confidence: un score de 0 à 100 indiquant ta confiance
- reason: une brève explication en français

Retourne UNIQUEMENT le JSON, sans explication.`;

  const response = await geminiRequest(apiKey, modelName, prompt, {
    temperature: 0.1,
    maxOutputTokens: 512,
  });

  return parseGeminiJson<FileCategorization>(response);
}

/**
 * Quick local file categorization (without AI)
 */
export function categorizeFileLocally(
  _fileName: string,
  extension: string | null,
  folderStructure: string[]
): FileCategorization | null {
  const ext = (extension || '').toLowerCase().replace('.', '');

  // Extension to folder mapping
  const extensionMap: Record<string, { folder: string; confidence: number; reason: string }> = {
    // Design files
    psd: { folder: 'Assets/design', confidence: 95, reason: 'Fichier Photoshop' },
    ai: { folder: 'Assets/design', confidence: 95, reason: 'Fichier Illustrator' },
    fig: { folder: 'Assets/design', confidence: 95, reason: 'Fichier Figma' },
    sketch: { folder: 'Assets/design', confidence: 95, reason: 'Fichier Sketch' },
    xd: { folder: 'Assets/design', confidence: 95, reason: 'Fichier Adobe XD' },

    // Images
    jpg: { folder: 'Assets/images', confidence: 90, reason: 'Image JPEG' },
    jpeg: { folder: 'Assets/images', confidence: 90, reason: 'Image JPEG' },
    png: { folder: 'Assets/images', confidence: 90, reason: 'Image PNG' },
    gif: { folder: 'Assets/images', confidence: 90, reason: 'Image GIF' },
    webp: { folder: 'Assets/images', confidence: 90, reason: 'Image WebP' },
    svg: { folder: 'Assets/images', confidence: 85, reason: 'Image vectorielle SVG' },
    ico: { folder: 'Assets/images', confidence: 85, reason: 'Icône' },

    // Documents
    pdf: { folder: 'Documentation', confidence: 80, reason: 'Document PDF' },
    doc: { folder: 'Documentation/textes', confidence: 80, reason: 'Document Word' },
    docx: { folder: 'Documentation/textes', confidence: 80, reason: 'Document Word' },
    txt: { folder: 'Documentation/notes', confidence: 75, reason: 'Fichier texte' },
    md: { folder: 'Documentation', confidence: 80, reason: 'Document Markdown' },

    // Web files
    html: { folder: 'www', confidence: 85, reason: 'Page HTML' },
    css: { folder: 'www/css', confidence: 90, reason: 'Feuille de style CSS' },
    scss: { folder: 'www/css', confidence: 85, reason: 'Fichier SCSS' },
    js: { folder: 'www/js', confidence: 90, reason: 'Script JavaScript' },
    ts: { folder: 'www/js', confidence: 85, reason: 'Script TypeScript' },

    // Fonts
    ttf: { folder: 'Assets', confidence: 85, reason: 'Police TrueType' },
    otf: { folder: 'Assets', confidence: 85, reason: 'Police OpenType' },
    woff: { folder: 'Assets', confidence: 85, reason: 'Police Web' },
    woff2: { folder: 'Assets', confidence: 85, reason: 'Police Web 2' },

    // Video
    mp4: { folder: 'Assets', confidence: 80, reason: 'Vidéo MP4' },
    mov: { folder: 'Assets', confidence: 80, reason: 'Vidéo QuickTime' },
    avi: { folder: 'Assets', confidence: 80, reason: 'Vidéo AVI' },
  };

  const mapping = extensionMap[ext];
  if (!mapping) return null;

  // Verify the folder exists in structure
  const folderExists = folderStructure.some(
    (f) => f === mapping.folder || f.startsWith(mapping.folder + '/')
  );

  if (!folderExists) {
    // Try to find a similar folder
    const similarFolder = folderStructure.find((f) =>
      f.toLowerCase().includes(mapping.folder.toLowerCase().split('/')[0])
    );
    if (similarFolder) {
      return {
        targetFolder: similarFolder,
        confidence: mapping.confidence - 10,
        reason: mapping.reason,
      };
    }
    return null;
  }

  return {
    targetFolder: mapping.folder,
    confidence: mapping.confidence,
    reason: mapping.reason,
  };
}
