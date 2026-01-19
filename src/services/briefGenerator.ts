/**
 * Brief Generator Service
 * Generates a comprehensive Markdown brief document for website creation projects
 */

import { writeTextFile } from '@tauri-apps/api/fs';
import { Project } from '../types';
import { fileSystemService } from './fileSystemService';

export interface BriefGeneratorOptions {
  includeArborescence?: boolean;
  includeCharte?: boolean;
  includeMediatheque?: boolean;
  includeReferences?: boolean;
  includeInstructions?: boolean;
}

const DEFAULT_OPTIONS: BriefGeneratorOptions = {
  includeArborescence: true,
  includeCharte: true,
  includeMediatheque: true,
  includeReferences: true,
  includeInstructions: true,
};

/**
 * Count files in a directory recursively
 */
async function countFilesInDirectory(path: string): Promise<number> {
  try {
    const tree = await fileSystemService.readDirectoryTree(path, 10);
    let count = 0;

    const countRecursive = (node: typeof tree) => {
      if (!node.isDirectory) {
        count++;
      }
      if (node.children) {
        node.children.forEach(countRecursive);
      }
    };

    countRecursive(tree);
    return count;
  } catch {
    return 0;
  }
}

/**
 * Get site structure from scraping results or project config
 */
async function getSiteStructure(project: Project): Promise<string[]> {
  // Try to read structure from Documentation folder
  const docPath = fileSystemService.joinPath(project.path, 'Documentation');

  try {
    const tree = await fileSystemService.readDirectoryTree(docPath, 3);
    const pages: string[] = [];

    // Look for a sitemap or structure file
    if (tree.children) {
      for (const child of tree.children) {
        if (child.name.toLowerCase().includes('sitemap') ||
            child.name.toLowerCase().includes('structure') ||
            child.name.toLowerCase().includes('arborescence')) {
          // Found a structure file - could parse it
          pages.push(`Voir le fichier: ${child.name}`);
        }
      }
    }

    // If scraping was done, try to extract pages from References
    if (project.scraping?.completed && project.scraping.stats) {
      pages.push(`${project.scraping.stats.pagesCount} pages extraites du site actuel`);
    }

    return pages;
  } catch {
    return [];
  }
}

/**
 * Format colors for markdown display
 */
function formatColors(colors: string[]): string {
  if (!colors || colors.length === 0) return '*Aucune couleur définie*';

  const lines: string[] = [];

  // Group by type (guess based on position/brightness)
  const primary = colors.slice(0, 2);
  const secondary = colors.slice(2, 5);
  const others = colors.slice(5);

  if (primary.length > 0) {
    lines.push('**Couleurs principales:**');
    primary.forEach((c, i) => {
      lines.push(`- \`${c}\` - Couleur principale ${i + 1}`);
    });
  }

  if (secondary.length > 0) {
    lines.push('');
    lines.push('**Couleurs secondaires:**');
    secondary.forEach((c) => {
      lines.push(`- \`${c}\``);
    });
  }

  if (others.length > 0) {
    lines.push('');
    lines.push('**Autres couleurs:**');
    others.forEach((c) => {
      lines.push(`- \`${c}\``);
    });
  }

  // Add CSS variables suggestion
  lines.push('');
  lines.push('**Variables CSS suggérées:**');
  lines.push('```css');
  lines.push(':root {');
  if (colors[0]) lines.push(`  --color-primary: ${colors[0]};`);
  if (colors[1]) lines.push(`  --color-secondary: ${colors[1]};`);
  if (colors[2]) lines.push(`  --color-accent: ${colors[2]};`);
  if (colors[3]) lines.push(`  --color-background: ${colors[3]};`);
  if (colors[4]) lines.push(`  --color-text: ${colors[4]};`);
  lines.push('}');
  lines.push('```');

  return lines.join('\n');
}

/**
 * Format fonts for markdown display
 */
function formatFonts(fonts: string[]): string {
  if (!fonts || fonts.length === 0) return '*Aucune police définie*';

  const lines: string[] = [];

  fonts.forEach((font, i) => {
    if (i === 0) {
      lines.push(`- **${font}** (police principale)`);
    } else if (i === 1) {
      lines.push(`- **${font}** (police secondaire)`);
    } else {
      lines.push(`- ${font}`);
    }
  });

  return lines.join('\n');
}

/**
 * Generate the complete brief document
 */
export async function generateBrief(
  project: Project,
  options: BriefGeneratorOptions = DEFAULT_OPTIONS
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];
  const now = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Header
  lines.push(`# Brief Projet - ${project.client || project.name}`);
  lines.push('');
  lines.push(`> Document généré automatiquement par La Forge le ${now}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 1. Informations projet
  lines.push('## 1. Informations du projet');
  lines.push('');
  lines.push(`| Champ | Valeur |`);
  lines.push(`|-------|--------|`);
  lines.push(`| **Nom du projet** | ${project.name} |`);
  if (project.client && project.client !== project.name) {
    lines.push(`| **Client** | ${project.client} |`);
  }
  if (project.urls.currentSite || project.urls.production) {
    lines.push(`| **Site actuel** | ${project.urls.currentSite || project.urls.production} |`);
  }
  if (project.urls.testUrl) {
    lines.push(`| **URL de test** | ${project.urls.testUrl} |`);
  }
  lines.push(`| **Statut** | ${project.status} |`);
  lines.push(`| **Créé le** | ${new Date(project.created).toLocaleDateString('fr-FR')} |`);
  lines.push('');

  // Client description
  if (project.clientDescription) {
    lines.push('### Description de l\'activité');
    lines.push('');
    lines.push(project.clientDescription);
    lines.push('');
  }

  // Theme tags
  if (project.themeTags && project.themeTags.length > 0) {
    lines.push('### Orientations design');
    lines.push('');
    lines.push(project.themeTags.map(tag => `\`${tag}\``).join(' • '));
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // 2. Arborescence du site
  if (opts.includeArborescence) {
    lines.push('## 2. Arborescence du site');
    lines.push('');

    const structure = await getSiteStructure(project);

    if (structure.length > 0) {
      structure.forEach(item => lines.push(`- ${item}`));
    } else {
      lines.push('*Structure à définir avec le client*');
      lines.push('');
      lines.push('Suggestion de structure type:');
      lines.push('```');
      lines.push('├── Accueil');
      lines.push('├── À propos');
      lines.push('├── Services');
      lines.push('│   ├── Service 1');
      lines.push('│   ├── Service 2');
      lines.push('│   └── Service 3');
      lines.push('├── Réalisations / Portfolio');
      lines.push('├── Blog / Actualités');
      lines.push('├── Contact');
      lines.push('└── Mentions légales');
      lines.push('```');
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // 3. Charte graphique
  if (opts.includeCharte) {
    lines.push('## 3. Charte graphique');
    lines.push('');

    // Colors
    lines.push('### Palette de couleurs');
    lines.push('');
    lines.push(formatColors(project.colors));
    lines.push('');

    // Fonts
    lines.push('### Typographie');
    lines.push('');
    lines.push(formatFonts(project.fonts));
    lines.push('');

    lines.push('---');
    lines.push('');
  }

  // 4. Médiathèque
  if (opts.includeMediatheque) {
    lines.push('## 4. Médiathèque disponible');
    lines.push('');

    const referencesPath = fileSystemService.joinPath(project.path, 'References');
    const assetsPath = fileSystemService.joinPath(project.path, 'Assets');

    const refImagesCount = await countFilesInDirectory(
      fileSystemService.joinPath(referencesPath, 'images')
    );
    const assetsImagesCount = await countFilesInDirectory(
      fileSystemService.joinPath(assetsPath, 'images')
    );
    const designCount = await countFilesInDirectory(
      fileSystemService.joinPath(assetsPath, 'design')
    );

    lines.push('| Dossier | Contenu | Fichiers |');
    lines.push('|---------|---------|----------|');
    lines.push(`| \`References/images/\` | Images récupérées de l'ancien site | ${refImagesCount} |`);
    lines.push(`| \`Assets/images/\` | Nouvelles images fournies | ${assetsImagesCount} |`);
    lines.push(`| \`Assets/design/\` | Maquettes, logos, chartes | ${designCount} |`);
    lines.push('');

    if (project.scraping?.completed) {
      lines.push(`> **Note:** Le scraping a été effectué le ${new Date(project.scraping.scrapedAt!).toLocaleDateString('fr-FR')} `);
      lines.push(`> depuis ${project.scraping.sourceUrl}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  // 5. Sites de référence
  if (opts.includeReferences && project.referenceWebsites && project.referenceWebsites.length > 0) {
    lines.push('## 5. Sites de référence graphique');
    lines.push('');
    lines.push('Sites d\'inspiration pour le design:');
    lines.push('');

    project.referenceWebsites.forEach((ref, i) => {
      const name = ref.name || new URL(ref.url).hostname;
      lines.push(`${i + 1}. [${name}](${ref.url})`);
    });
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // 6. Instructions de développement
  if (opts.includeInstructions) {
    lines.push('## 6. Instructions pour le développement');
    lines.push('');
    lines.push('### Dossier de travail');
    lines.push('');
    lines.push('Le nouveau site doit être développé dans le dossier:');
    lines.push('```');
    lines.push(`${project.path}/www/`);
    lines.push('```');
    lines.push('');
    lines.push('### Structure recommandée');
    lines.push('```');
    lines.push('www/');
    lines.push('├── index.html');
    lines.push('├── css/');
    lines.push('│   └── style.css');
    lines.push('├── js/');
    lines.push('│   └── main.js');
    lines.push('├── assets/');
    lines.push('│   ├── images/');
    lines.push('│   ├── fonts/');
    lines.push('│   └── icons/');
    lines.push('└── pages/');
    lines.push('    ├── about.html');
    lines.push('    ├── contact.html');
    lines.push('    └── ...');
    lines.push('```');
    lines.push('');
    lines.push('### Points d\'attention');
    lines.push('');
    lines.push('- [ ] Responsive design (mobile-first)');
    lines.push('- [ ] Optimisation des images (WebP, lazy loading)');
    lines.push('- [ ] SEO de base (meta tags, sitemap.xml)');
    lines.push('- [ ] Accessibilité (WCAG 2.1 niveau AA)');
    lines.push('- [ ] Performance (Core Web Vitals)');
    lines.push('- [ ] Compatibilité navigateurs (Chrome, Firefox, Safari, Edge)');
    lines.push('');

    if (project.sftp.configured) {
      lines.push('### Déploiement');
      lines.push('');
      lines.push(`Le site sera déployé via FTP sur \`${project.sftp.host}\``);
      if (project.sftp.remotePath) {
        lines.push(`dans le dossier \`${project.sftp.remotePath}\``);
      }
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*Document généré par [La Forge](https://github.com/anthropics/forge)*');

  return lines.join('\n');
}

/**
 * Generate and save the brief document
 */
export async function generateAndSaveBrief(
  project: Project,
  options?: BriefGeneratorOptions
): Promise<string> {
  const content = await generateBrief(project, options);

  // Ensure Documentation folder exists
  const docPath = fileSystemService.joinPath(project.path, 'Documentation');
  await fileSystemService.createFolder(docPath);

  // Save the brief
  const briefPath = fileSystemService.joinPath(docPath, 'brief-projet.md');
  await writeTextFile(briefPath, content);

  return briefPath;
}

export const briefGenerator = {
  generateBrief,
  generateAndSaveBrief,
};
