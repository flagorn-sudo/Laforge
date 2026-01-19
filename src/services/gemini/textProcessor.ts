/**
 * Text Processor
 * Text improvement and content generation using Gemini AI
 */

import { geminiRequest, parseGeminiJson } from './geminiApiClient';
import { logger } from '../../lib/logger';
import { GeminiAPIError } from '../../lib/errors';

const log = logger.scope('TextProcessor');
const DEFAULT_MODEL = 'gemini-2.0-flash';

// Rate limiting configuration
const RATE_LIMIT_DELAY_MS = 2000; // 2 seconds between batches
const RETRY_DELAYS = [5000, 10000, 20000]; // Exponential backoff for retries

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff on 429 errors
 */
async function retryOn429<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a 429 rate limit error
      const is429 = error instanceof GeminiAPIError && error.statusCode === 429;

      if (!is429 || attempt === maxRetries) {
        throw error;
      }

      const delay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      log.warn(`Rate limited (429), retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(delay);
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

export interface ImprovedText {
  original: string;
  improved: string;
  elementType: string;
}

export interface ClientProfile {
  description: string;
  themeTags: string[];
}

/**
 * Improve extracted texts from a website for better readability and SEO
 */
export async function improveTexts(
  texts: { elementType: string; content: string }[],
  context: { siteName?: string; industry?: string },
  apiKey: string,
  model?: string
): Promise<ImprovedText[]> {
  const modelName = model || DEFAULT_MODEL;
  const results: ImprovedText[] = [];

  // Process in batches of 5 with rate limiting
  const batchSize = 5;
  const totalBatches = Math.ceil(texts.length / batchSize);

  for (let i = 0; i < texts.length; i += batchSize) {
    const batchIndex = Math.floor(i / batchSize) + 1;
    const batch = texts.slice(i, i + batchSize);

    // Add delay between batches to avoid rate limiting (except first batch)
    if (i > 0) {
      log.debug(`Waiting ${RATE_LIMIT_DELAY_MS / 1000}s before batch ${batchIndex}/${totalBatches}...`);
      await sleep(RATE_LIMIT_DELAY_MS);
    }

    log.debug(`Processing batch ${batchIndex}/${totalBatches} (${batch.length} texts)`);

    const prompt = `Tu es un rédacteur web professionnel. Améliore les textes suivants extraits d'un site web.

Contexte:
${context.siteName ? `- Site: ${context.siteName}` : ''}
${context.industry ? `- Secteur: ${context.industry}` : ''}

Règles:
1. Garde le sens original et les informations clés
2. Améliore la lisibilité et la structure
3. Corrige les fautes d'orthographe et de grammaire
4. Optimise pour le SEO si pertinent
5. Garde un ton professionnel mais engageant
6. Les titres (h1, h2, h3) doivent être percutants et courts
7. Les paragraphes doivent être clairs et bien structurés

Textes à améliorer:
${batch
  .map(
    (t, idx) => `
[${idx + 1}] Type: ${t.elementType}
Texte original:
"""
${t.content}
"""
`
  )
  .join('\n')}

Retourne UNIQUEMENT un tableau JSON avec les textes améliorés:
[
  {
    "index": 1,
    "improved": "texte amélioré"
  },
  ...
]

Ne retourne que le JSON, sans explication.`;

    try {
      // Use retry logic for rate limiting
      const response = await retryOn429(async () => {
        return geminiRequest(apiKey, modelName, prompt, {
          temperature: 0.7,
          maxOutputTokens: 4096,
        });
      });

      // Try to parse JSON, with fallback on error
      let improvements: { index: number; improved: string }[] = [];
      try {
        improvements = parseGeminiJson<{ index: number; improved: string }[]>(response);

        // Validate that we got an array
        if (!Array.isArray(improvements)) {
          log.warn(`Batch ${batchIndex}: Response is not an array, using original texts`);
          improvements = [];
        }
      } catch (parseError) {
        log.warn(`Batch ${batchIndex}: Failed to parse JSON response, using original texts`);
        improvements = [];
      }

      // Match improvements with original texts
      batch.forEach((t, idx) => {
        const improvement = improvements.find((imp) => imp.index === idx + 1);
        results.push({
          original: t.content,
          improved: improvement?.improved || t.content,
          elementType: t.elementType,
        });
      });

      log.debug(`Batch ${batchIndex}/${totalBatches} completed successfully`);
    } catch (error) {
      log.error(`Error improving texts batch ${batchIndex}/${totalBatches}`, error);
      // Return original texts on error
      batch.forEach((t) => {
        results.push({
          original: t.content,
          improved: t.content,
          elementType: t.elementType,
        });
      });
    }
  }

  return results;
}

/**
 * Generate client profile (description + theme tags) from website content
 */
export async function generateClientProfile(
  projectName: string,
  clientName: string | undefined,
  websiteUrl: string,
  scrapedTexts: string[],
  colors: string[],
  fonts: string[],
  apiKey: string,
  model?: string
): Promise<ClientProfile> {
  const modelName = model || DEFAULT_MODEL;

  const prompt = `Tu es un expert en analyse de sites web et en stratégie digitale. Analyse le contenu du site web suivant et génère:

1. Une description courte (2-3 phrases max) de l'activité du client, son secteur d'activité, et ce qu'il propose à ses clients. Sois factuel, précis et professionnel.
2. 3-5 tags de thème pour orienter le design de la refonte (ex: minimaliste, corporate, moderne, coloré, élégant, premium, artisanal, tech, médical, juridique, e-commerce, portfolio, blog, institutionnel, créatif)

Site web analysé: ${websiteUrl}

Informations extraites:
- Nom du projet: ${projectName}
- Client: ${clientName || 'Non spécifié'}
- Couleurs principales du site actuel: ${colors.length > 0 ? colors.slice(0, 5).join(', ') : 'Non détectées'}
- Polices utilisées: ${fonts.length > 0 ? fonts.join(', ') : 'Non détectées'}

Contenu textuel extrait du site:
${scrapedTexts
  .slice(0, 20)
  .map((t) => `- "${t.substring(0, 300)}"`)
  .join('\n')}

Instructions:
- Base ta description sur le contenu réel du site, pas sur des suppositions
- Les tags de design doivent refléter soit le style actuel, soit un style recommandé pour ce type d'activité
- Si c'est un artisan, suggère des tags comme "artisanal", "authentique", "local"
- Si c'est une entreprise tech, suggère "moderne", "tech", "innovant"
- Adapte les tags au secteur d'activité identifié

Réponds UNIQUEMENT avec un JSON valide (sans markdown, sans \`\`\`):
{
  "description": "Description de l'activité du client...",
  "themeTags": ["tag1", "tag2", "tag3", "tag4"]
}`;

  const response = await geminiRequest(apiKey, modelName, prompt, {
    temperature: 0.3,
    maxOutputTokens: 1024,
  });

  return parseGeminiJson<ClientProfile>(response);
}

/**
 * Generate a content brief for a new website based on scraped content
 */
export async function generateContentBrief(
  originalTexts: { elementType: string; content: string }[],
  targetAudience: string,
  apiKey: string,
  model?: string
): Promise<string> {
  const modelName = model || DEFAULT_MODEL;

  // Summarize texts by type
  const textsByType = originalTexts.reduce(
    (acc, t) => {
      if (!acc[t.elementType]) acc[t.elementType] = [];
      acc[t.elementType].push(t.content);
      return acc;
    },
    {} as Record<string, string[]>
  );

  const textSummary = Object.entries(textsByType)
    .map(([type, contents]) => `${type}: ${contents.slice(0, 3).join(' | ')}`)
    .join('\n');

  const prompt = `Tu es un stratège de contenu web. Analyse les textes suivants extraits d'un ancien site et génère un brief de contenu pour la refonte.

Textes analysés:
${textSummary}

Public cible: ${targetAudience || 'Non spécifié'}

Génère un brief de contenu en markdown qui inclut:

1. **Analyse du contenu existant**
   - Thèmes principaux identifiés
   - Ton et style actuels
   - Points forts et faiblesses

2. **Recommandations pour la refonte**
   - Ton de voix suggéré
   - Messages clés à conserver
   - Nouveaux contenus à créer
   - Contenus à supprimer ou modifier

3. **Structure de contenu suggérée**
   - Pages principales recommandées
   - Hiérarchie de l'information
   - Appels à l'action

4. **SEO & Mots-clés**
   - Mots-clés principaux détectés
   - Opportunités SEO

Retourne le brief en markdown, prêt à être inclus dans la documentation.`;

  const response = await geminiRequest(apiKey, modelName, prompt, {
    temperature: 0.7,
    maxOutputTokens: 4096,
  });

  return response;
}
