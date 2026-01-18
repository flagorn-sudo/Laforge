import { ParsedFTPCredentials } from '../types';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiModel {
  name: string;
  displayName: string;
  description?: string;
  supportedMethods: string[];
}

export const geminiService = {
  // Récupérer la liste des modèles disponibles
  async listModels(apiKey: string): Promise<GeminiModel[]> {
    const response = await fetch(`${GEMINI_BASE_URL}/models?key=${apiKey}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // Filtrer les modèles qui supportent generateContent
    const models = (data.models || [])
      .filter((m: any) =>
        m.supportedGenerationMethods?.includes('generateContent') &&
        m.name?.includes('gemini')
      )
      .map((m: any) => ({
        name: m.name.replace('models/', ''),
        displayName: m.displayName || m.name.replace('models/', ''),
        description: m.description,
        supportedMethods: m.supportedGenerationMethods || [],
      }));

    // Trier pour avoir les plus récents en premier (2.5, 2.0, 1.5...)
    return models.sort((a: GeminiModel, b: GeminiModel) => {
      // Priorité aux modèles flash
      const aFlash = a.name.includes('flash') ? 1 : 0;
      const bFlash = b.name.includes('flash') ? 1 : 0;
      if (aFlash !== bFlash) return bFlash - aFlash;

      // Puis par version (2.5 > 2.0 > 1.5)
      return b.name.localeCompare(a.name);
    });
  },

  // Obtenir le meilleur modèle par défaut (le plus récent flash)
  getBestDefaultModel(models: GeminiModel[]): string {
    const flashModel = models.find(m =>
      m.name.includes('flash') &&
      !m.name.includes('exp') &&
      !m.name.includes('preview') &&
      !m.name.includes('lite')
    );
    return flashModel?.name || models[0]?.name || 'gemini-2.0-flash';
  },

  async testConnection(apiKey: string, model?: string): Promise<boolean> {
    const modelName = model || 'gemini-2.0-flash';
    const response = await fetch(`${GEMINI_BASE_URL}/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say "ok"' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 10 },
      }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return !!data.candidates?.[0]?.content?.parts?.[0]?.text;
  },

  async parseFTPCredentials(text: string, apiKey: string, model?: string): Promise<ParsedFTPCredentials> {
    const modelName = model || 'gemini-2.0-flash';
    const prompt = `Tu es un assistant qui extrait les identifiants FTP/SFTP d'un texte.

Analyse attentivement le texte suivant et extrais les informations de connexion FTP/SFTP.

Cherche ces informations (peuvent être en français ou anglais):
- Hôte/Host/Serveur FTP: l'adresse du serveur (ex: ftp.example.com, sftp.example.com)
- Utilisateur/Username/Login/Identifiant: le nom d'utilisateur
- Mot de passe/Password: le mot de passe
- Port: le numéro de port (souvent 21 pour FTP, 22 pour SFTP)
- Chemin/Path/Dossier: le répertoire distant (ex: /public_html, /www)
- URL de test/Preview URL/Lien de prévisualisation: une URL pour visualiser le site

Retourne UNIQUEMENT un objet JSON valide avec cette structure exacte:
{
  "host": "valeur ou null",
  "username": "valeur ou null",
  "password": "valeur ou null",
  "port": nombre ou null,
  "path": "valeur ou null",
  "testUrl": "valeur ou null"
}

Important:
- Retourne UNIQUEMENT le JSON, sans \`\`\` ni explication
- Si une information n'est pas trouvée, utilise null
- Le port doit être un nombre, pas une chaîne
- Cherche les patterns courants comme "Hôte:", "Host:", "Serveur:", "Server:", "User:", "Utilisateur:", "Pass:", "Password:", etc.

Texte à analyser:
${text}`;

    const response = await fetch(`${GEMINI_BASE_URL}/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('Empty response from Gemini');
    }

    const cleanJson = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanJson);
  },

  async analyzeWebsite(html: string, css: string | null, apiKey: string, model?: string) {
    const modelName = model || 'gemini-2.0-flash';
    const prompt = `Analyze this website HTML/CSS and extract:
- colors: array of hex color codes (primary colors first)
- fonts: array of font names
- structure: brief description
- technologies: detected frameworks/libraries

Return ONLY JSON.

HTML:
${html.substring(0, 8000)}

${css ? `CSS:\n${css.substring(0, 4000)}` : ''}`;

    const response = await fetch(`${GEMINI_BASE_URL}/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
    });

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const cleanJson = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanJson);
  },

  async categorizeFile(
    fileName: string,
    extension: string | null,
    folderStructure: string[],
    apiKey: string,
    model?: string
  ): Promise<{ targetFolder: string; confidence: number; reason: string }> {
    const modelName = model || 'gemini-2.0-flash';

    // Build folder context
    const foldersDescription = folderStructure.map(f => `- ${f}`).join('\n');

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

    const response = await fetch(
      `${GEMINI_BASE_URL}/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('Empty response from Gemini');
    }

    const cleanJson = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanJson);
  },

  /**
   * Improve extracted texts from a website for better readability and SEO
   */
  async improveTexts(
    texts: { elementType: string; content: string }[],
    context: { siteName?: string; industry?: string },
    apiKey: string,
    model?: string
  ): Promise<{ original: string; improved: string; elementType: string }[]> {
    const modelName = model || 'gemini-2.0-flash';

    // Group texts by type and batch them to reduce API calls
    const results: { original: string; improved: string; elementType: string }[] = [];

    // Process in batches of 5
    const batchSize = 5;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

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
${batch.map((t, idx) => `
[${idx + 1}] Type: ${t.elementType}
Texte original:
"""
${t.content}
"""
`).join('\n')}

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
        const response = await fetch(
          `${GEMINI_BASE_URL}/models/${modelName}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
            }),
          }
        );

        if (!response.ok) {
          console.error(`Gemini API error: ${response.status}`);
          // Return original texts if API fails
          batch.forEach((t) => {
            results.push({ original: t.content, improved: t.content, elementType: t.elementType });
          });
          continue;
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!content) {
          batch.forEach((t) => {
            results.push({ original: t.content, improved: t.content, elementType: t.elementType });
          });
          continue;
        }

        const cleanJson = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const improvements = JSON.parse(cleanJson) as { index: number; improved: string }[];

        // Match improvements with original texts
        batch.forEach((t, idx) => {
          const improvement = improvements.find((imp) => imp.index === idx + 1);
          results.push({
            original: t.content,
            improved: improvement?.improved || t.content,
            elementType: t.elementType,
          });
        });
      } catch (error) {
        console.error('Error improving texts:', error);
        // Return original texts on error
        batch.forEach((t) => {
          results.push({ original: t.content, improved: t.content, elementType: t.elementType });
        });
      }
    }

    return results;
  },

  /**
   * Generate client profile (description + theme tags) from website content
   */
  async generateClientProfile(
    projectName: string,
    clientName: string | undefined,
    websiteUrl: string,
    scrapedTexts: string[],
    colors: string[],
    fonts: string[],
    apiKey: string,
    model?: string
  ): Promise<{ description: string; themeTags: string[] }> {
    const modelName = model || 'gemini-2.0-flash';

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
${scrapedTexts.slice(0, 20).map(t => `- "${t.substring(0, 300)}"`).join('\n')}

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

    const response = await fetch(
      `${GEMINI_BASE_URL}/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('Empty response from Gemini');
    }

    const cleanJson = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanJson);
  },

  /**
   * Generate a content brief for a new website based on scraped content
   */
  async generateContentBrief(
    originalTexts: { elementType: string; content: string }[],
    targetAudience: string,
    apiKey: string,
    model?: string
  ): Promise<string> {
    const modelName = model || 'gemini-2.0-flash';

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

    const response = await fetch(
      `${GEMINI_BASE_URL}/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('Empty response from Gemini');
    }

    return content;
  },
};
