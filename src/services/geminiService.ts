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
    const prompt = `Analyze this text and extract FTP/SFTP credentials and any test/preview URL.
Return a JSON object with: host, username, password, port (number), path, testUrl
- host: FTP/SFTP server hostname
- username: FTP/SFTP username
- password: FTP/SFTP password
- port: connection port (number)
- path: remote path/directory
- testUrl: any preview URL, test URL, staging URL, or temporary URL for viewing the site (e.g. liens de prévisualisation, URLs temporaires)
Use null for missing values. Return ONLY JSON, no explanation.

Text:
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
};
