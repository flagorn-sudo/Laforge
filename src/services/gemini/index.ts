/**
 * Gemini Service - Main exports
 * Re-exports all modules for backward compatibility
 */

// API Client - import for legacy service, also re-export
import {
  GEMINI_BASE_URL as _BASE_URL,
  geminiRequest as _geminiRequest,
  parseGeminiJson as _parseGeminiJson,
  listModels as _listModels,
  getBestDefaultModel as _getBestDefaultModel,
  testConnection as _testConnection,
} from './geminiApiClient';

export {
  _BASE_URL as GEMINI_BASE_URL,
  _geminiRequest as geminiRequest,
  _parseGeminiJson as parseGeminiJson,
  _listModels as listModels,
  _getBestDefaultModel as getBestDefaultModel,
  _testConnection as testConnection,
};
export type { GeminiModel, GeminiRequestConfig, GeminiResponse } from './geminiApiClient';

// FTP Credential Parser
export {
  parseFTPCredentials,
  parseCredentialsLocally,
  parseCredentialsSmart,
} from './ftpCredentialParser';

// Content Analyzer
export {
  analyzeWebsite,
  categorizeFile,
  categorizeFileLocally,
} from './contentAnalyzer';
export type { WebsiteAnalysis } from './contentAnalyzer';

// Text Processor
export {
  improveTexts,
  generateClientProfile,
  generateContentBrief,
} from './textProcessor';
export type { ImprovedText, ClientProfile } from './textProcessor';

/**
 * Legacy geminiService object for backward compatibility
 * @deprecated Use individual exports instead
 */
export const geminiService = {
  // API Client
  listModels: async (apiKey: string) => {
    const { listModels } = await import('./geminiApiClient');
    return listModels(apiKey);
  },
  getBestDefaultModel: (models: import('./geminiApiClient').GeminiModel[]) => {
    return _getBestDefaultModel(models);
  },
  testConnection: async (apiKey: string, model?: string) => {
    const { testConnection } = await import('./geminiApiClient');
    return testConnection(apiKey, model);
  },

  // FTP Credential Parser
  parseFTPCredentials: async (text: string, apiKey: string, model?: string) => {
    const { parseFTPCredentials } = await import('./ftpCredentialParser');
    return parseFTPCredentials(text, apiKey, model);
  },

  // Content Analyzer
  analyzeWebsite: async (html: string, css: string | null, apiKey: string, model?: string) => {
    const { analyzeWebsite } = await import('./contentAnalyzer');
    return analyzeWebsite(html, css, apiKey, model);
  },
  categorizeFile: async (
    fileName: string,
    extension: string | null,
    folderStructure: string[],
    apiKey: string,
    model?: string
  ) => {
    const { categorizeFile } = await import('./contentAnalyzer');
    return categorizeFile(fileName, extension, folderStructure, apiKey, model);
  },

  // Text Processor
  improveTexts: async (
    texts: { elementType: string; content: string }[],
    context: { siteName?: string; industry?: string },
    apiKey: string,
    model?: string
  ) => {
    const { improveTexts } = await import('./textProcessor');
    return improveTexts(texts, context, apiKey, model);
  },
  generateClientProfile: async (
    projectName: string,
    clientName: string | undefined,
    websiteUrl: string,
    scrapedTexts: string[],
    colors: string[],
    fonts: string[],
    apiKey: string,
    model?: string
  ) => {
    const { generateClientProfile } = await import('./textProcessor');
    return generateClientProfile(
      projectName,
      clientName,
      websiteUrl,
      scrapedTexts,
      colors,
      fonts,
      apiKey,
      model
    );
  },
  generateContentBrief: async (
    originalTexts: { elementType: string; content: string }[],
    targetAudience: string,
    apiKey: string,
    model?: string
  ) => {
    const { generateContentBrief } = await import('./textProcessor');
    return generateContentBrief(originalTexts, targetAudience, apiKey, model);
  },
};
