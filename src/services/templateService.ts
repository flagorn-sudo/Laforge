/**
 * Template Service
 * Consolidated template creation for projects
 */

import { writeTextFile, createDir } from '@tauri-apps/api/fs';
import { join } from '@tauri-apps/api/path';
import { DEFAULT_FOLDER_STRUCTURE } from '../types';
import { logger } from '../lib/logger';

const log = logger.scope('TemplateService');

/**
 * HTML template configuration
 */
export interface HtmlTemplateConfig {
  title: string;
  lang?: string;
  includeViewport?: boolean;
  cssPath?: string;
  jsPath?: string;
  bodyContent?: string;
}

/**
 * CSS template configuration
 */
export interface CssTemplateConfig {
  includeReset?: boolean;
  fontFamily?: string;
  colors?: Record<string, string>;
  fonts?: Record<string, string>;
}

/**
 * JavaScript template configuration
 */
export interface JsTemplateConfig {
  projectName: string;
  includeLogMessage?: boolean;
}

/**
 * Generate HTML boilerplate
 */
export function generateHtmlTemplate(config: HtmlTemplateConfig): string {
  const {
    title,
    lang = 'fr',
    includeViewport = true,
    cssPath = 'css/style.css',
    jsPath = 'js/main.js',
    bodyContent = `<h1>${title}</h1>`,
  } = config;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
${includeViewport ? '  <meta name="viewport" content="width=device-width, initial-scale=1.0">' : ''}
  <title>${title}</title>
  <link rel="stylesheet" href="${cssPath}">
</head>
<body>
  ${bodyContent}
  <script src="${jsPath}"></script>
</body>
</html>`;
}

/**
 * Generate CSS boilerplate
 */
export function generateCssTemplate(config: CssTemplateConfig = {}): string {
  const {
    includeReset = true,
    fontFamily = 'system-ui, sans-serif',
    colors = {},
    fonts = {},
  } = config;

  let css = '';

  // CSS Reset
  if (includeReset) {
    css += `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
`;
  }

  // CSS Variables
  if (Object.keys(colors).length > 0 || Object.keys(fonts).length > 0) {
    css += `:root {
`;
    for (const [name, value] of Object.entries(colors)) {
      css += `  --color-${name}: ${value};
`;
    }
    for (const [name, value] of Object.entries(fonts)) {
      css += `  --font-${name}: ${value};
`;
    }
    css += `}

`;
  }

  // Body styles
  css += `body { font-family: ${fontFamily}; line-height: 1.6; }`;

  return css;
}

/**
 * Generate JavaScript boilerplate
 */
export function generateJsTemplate(config: JsTemplateConfig): string {
  const { projectName, includeLogMessage = true } = config;

  let js = `document.addEventListener('DOMContentLoaded', () => {
`;

  if (includeLogMessage) {
    js += `  console.log('${projectName} initialized');
`;
  }

  js += `});`;

  return js;
}

/**
 * Create standard web project template files
 */
export async function createWebTemplateFiles(
  projectPath: string,
  localPath: string,
  projectName: string
): Promise<void> {
  log.info(`Creating template files in ${localPath}`);

  // Ensure directories exist
  await createDir(await join(projectPath, localPath, 'css'), { recursive: true });
  await createDir(await join(projectPath, localPath, 'js'), { recursive: true });

  // Create HTML
  await writeTextFile(
    await join(projectPath, localPath, 'index.html'),
    generateHtmlTemplate({ title: projectName })
  );

  // Create CSS
  await writeTextFile(
    await join(projectPath, localPath, 'css', 'style.css'),
    generateCssTemplate()
  );

  // Create JS
  await writeTextFile(
    await join(projectPath, localPath, 'js', 'main.js'),
    generateJsTemplate({ projectName })
  );

  log.info('Template files created');
}

/**
 * Create project folder structure
 */
export async function createFolderStructure(
  projectPath: string,
  structure?: string[]
): Promise<void> {
  const folders = structure || DEFAULT_FOLDER_STRUCTURE;

  log.info(`Creating ${folders.length} folders`);

  for (const folder of folders) {
    await createDir(await join(projectPath, folder), { recursive: true });
  }

  log.info('Folder structure created');
}

/**
 * Create a complete project with structure and templates
 */
export async function createProjectStructure(
  projectPath: string,
  projectName: string,
  options: {
    folderStructure?: string[];
    localPath?: string;
    includeWebTemplates?: boolean;
  } = {}
): Promise<void> {
  const {
    folderStructure = DEFAULT_FOLDER_STRUCTURE,
    localPath = 'www',
    includeWebTemplates = true,
  } = options;

  // Create folder structure
  await createFolderStructure(projectPath, folderStructure);

  // Create web templates
  if (includeWebTemplates) {
    await createWebTemplateFiles(projectPath, localPath, projectName);
  }
}

/**
 * Generate CSS with project colors and fonts
 */
export function generateProjectCss(
  colors: string[],
  fonts: string[]
): string {
  const colorVars: Record<string, string> = {};
  const fontVars: Record<string, string> = {};

  colors.slice(0, 5).forEach((color, i) => {
    colorVars[String(i + 1)] = color;
  });

  if (fonts.length > 0) {
    fontVars['primary'] = `"${fonts[0]}", sans-serif`;
  }
  if (fonts.length > 1) {
    fontVars['secondary'] = `"${fonts[1]}", sans-serif`;
  }

  return generateCssTemplate({
    includeReset: true,
    colors: colorVars,
    fonts: fontVars,
  });
}

/**
 * Generate a README template for the project
 */
export function generateReadmeTemplate(project: {
  name: string;
  client?: string;
  urls?: { currentSite?: string; testUrl?: string };
  clientDescription?: string;
}): string {
  return `# ${project.name}

${project.client ? `**Client:** ${project.client}` : ''}

${project.clientDescription || '*Aucune description disponible*'}

## URLs

- Site actuel: ${project.urls?.currentSite || '*Non défini*'}
- URL de test: ${project.urls?.testUrl || '*Non défini*'}

## Structure

\`\`\`
├── _Inbox/           # Fichiers à traiter
├── Source/           # Code source
├── Documentation/    # Documents projet
├── Assets/           # Ressources graphiques
├── References/       # Fichiers de l'ancien site
└── www/              # Déploiement FTP
\`\`\`

---

*Projet géré avec La Forge*
`;
}
