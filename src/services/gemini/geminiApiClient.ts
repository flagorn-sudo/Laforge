/**
 * Gemini API Client
 * Low-level API communication with Google Gemini
 */

import { GeminiAPIError } from '../../lib/errors';
import { logger } from '../../lib/logger';

const log = logger.scope('GeminiAPI');

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiModel {
  name: string;
  displayName: string;
  description?: string;
  supportedMethods: string[];
}

export interface GeminiRequestConfig {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
}

export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Make a request to the Gemini API
 */
export async function geminiRequest(
  apiKey: string,
  model: string,
  prompt: string,
  config: GeminiRequestConfig = {}
): Promise<string> {
  const {
    temperature = 0.3,
    maxOutputTokens = 2048,
    topP,
    topK,
  } = config;

  const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey}`;

  log.debug(`Request to ${model}`, { temperature, maxOutputTokens });

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(topP !== undefined && { topP }),
      ...(topK !== undefined && { topK }),
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    log.error(`API error: ${response.status}`);
    throw new GeminiAPIError(`Gemini API error: ${response.status}`, response.status);
  }

  const data: GeminiResponse = await response.json();

  if (data.error) {
    log.error(`API returned error: ${data.error.message}`);
    throw new GeminiAPIError(data.error.message, data.error.code);
  }

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new GeminiAPIError('Empty response from Gemini');
  }

  return content;
}

/**
 * Parse JSON from Gemini response (handles markdown code blocks)
 */
export function parseGeminiJson<T>(response: string): T {
  const cleanJson = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    return JSON.parse(cleanJson);
  } catch (error) {
    throw new GeminiAPIError(`Failed to parse JSON response: ${cleanJson.substring(0, 100)}...`);
  }
}

/**
 * List available Gemini models
 */
export async function listModels(apiKey: string): Promise<GeminiModel[]> {
  const response = await fetch(`${GEMINI_BASE_URL}/models?key=${apiKey}`);

  if (!response.ok) {
    throw new GeminiAPIError(`API error: ${response.status}`, response.status);
  }

  const data = await response.json();

  // Filter models that support generateContent
  const models = (data.models || [])
    .filter(
      (m: any) =>
        m.supportedGenerationMethods?.includes('generateContent') &&
        m.name?.includes('gemini')
    )
    .map((m: any) => ({
      name: m.name.replace('models/', ''),
      displayName: m.displayName || m.name.replace('models/', ''),
      description: m.description,
      supportedMethods: m.supportedGenerationMethods || [],
    }));

  // Sort: flash models first, then by version
  return models.sort((a: GeminiModel, b: GeminiModel) => {
    const aFlash = a.name.includes('flash') ? 1 : 0;
    const bFlash = b.name.includes('flash') ? 1 : 0;
    if (aFlash !== bFlash) return bFlash - aFlash;
    return b.name.localeCompare(a.name);
  });
}

/**
 * Get the best default model (latest stable flash model)
 */
export function getBestDefaultModel(models: GeminiModel[]): string {
  const flashModel = models.find(
    (m) =>
      m.name.includes('flash') &&
      !m.name.includes('exp') &&
      !m.name.includes('preview') &&
      !m.name.includes('lite')
  );
  return flashModel?.name || models[0]?.name || 'gemini-2.0-flash';
}

/**
 * Test API connection
 */
export async function testConnection(apiKey: string, model?: string): Promise<boolean> {
  const modelName = model || 'gemini-2.0-flash';

  try {
    await geminiRequest(apiKey, modelName, 'Say "ok"', {
      temperature: 0,
      maxOutputTokens: 10,
    });
    return true;
  } catch {
    return false;
  }
}
