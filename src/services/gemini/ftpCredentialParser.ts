/**
 * FTP Credential Parser
 * Extracts FTP/SFTP credentials from text using Gemini AI
 */

import { ParsedFTPCredentials } from '../../types';
import { geminiRequest, parseGeminiJson } from './geminiApiClient';

const DEFAULT_MODEL = 'gemini-2.0-flash';

/**
 * Parse FTP credentials from text using Gemini AI
 */
export async function parseFTPCredentials(
  text: string,
  apiKey: string,
  model?: string
): Promise<ParsedFTPCredentials> {
  const modelName = model || DEFAULT_MODEL;

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

  const response = await geminiRequest(apiKey, modelName, prompt, {
    temperature: 0.1,
    maxOutputTokens: 1024,
  });

  return parseGeminiJson<ParsedFTPCredentials>(response);
}

/**
 * Local regex-based FTP credential extraction (fallback when no API key)
 */
export function parseCredentialsLocally(text: string): ParsedFTPCredentials {
  const result: ParsedFTPCredentials = {};

  // Host patterns
  const hostPatterns = [
    /(?:hôte|host|serveur|server|ftp)[\s:]+([a-z0-9][\w.-]+\.[a-z]{2,})/i,
    /(?:sftp|ftp|ftps):\/\/([a-z0-9][\w.-]+\.[a-z]{2,})/i,
    /\b([a-z0-9][\w.-]*\.(?:ftp|sftp)[a-z0-9.-]*\.[a-z]{2,})\b/i,
  ];

  for (const pattern of hostPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.host = match[1];
      break;
    }
  }

  // Username patterns
  const userPatterns = [
    /(?:utilisateur|username|user|login|identifiant)[\s:]+([^\s,;]+)/i,
    /(?:user|login):\s*([^\s,;@]+)/i,
  ];

  for (const pattern of userPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.username = match[1];
      break;
    }
  }

  // Password patterns
  const passwordPatterns = [
    /(?:mot de passe|password|pass|mdp)[\s:]+([^\s,;]+)/i,
    /(?:pw|pwd):\s*([^\s,;]+)/i,
  ];

  for (const pattern of passwordPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.password = match[1];
      break;
    }
  }

  // Port patterns
  const portPatterns = [
    /(?:port)[\s:]+(\d+)/i,
    /:(\d{2,5})(?:\s|$|\/)/,
  ];

  for (const pattern of portPatterns) {
    const match = text.match(pattern);
    if (match) {
      const port = parseInt(match[1], 10);
      if (port > 0 && port < 65536) {
        result.port = port;
        break;
      }
    }
  }

  // Path patterns
  const pathPatterns = [
    /(?:chemin|path|dossier|répertoire|directory)[\s:]+([/\w.-]+)/i,
    /\b(\/(?:public_html|www|htdocs|web|html)[/\w.-]*)\b/i,
  ];

  for (const pattern of pathPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.path = match[1];
      break;
    }
  }

  // Test URL patterns
  const urlPatterns = [
    /(?:url|lien|preview|test|staging)[\s:]+(\bhttps?:\/\/[^\s,;]+)/i,
    /(\bhttps?:\/\/(?:preview|test|staging|dev)[^\s,;]+)/i,
  ];

  for (const pattern of urlPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.testUrl = match[1];
      break;
    }
  }

  return result;
}

/**
 * Smart credential parser - uses AI if available, falls back to regex
 */
export async function parseCredentialsSmart(
  text: string,
  apiKey?: string,
  model?: string
): Promise<ParsedFTPCredentials> {
  // Try local parsing first for quick results
  const localResult = parseCredentialsLocally(text);

  // If we have all main fields, return local result
  const hasMainFields = localResult.host && localResult.username && localResult.password;
  if (hasMainFields || !apiKey) {
    return localResult;
  }

  // Use AI for more complex parsing
  try {
    return await parseFTPCredentials(text, apiKey, model);
  } catch {
    // Fall back to local result on AI failure
    return localResult;
  }
}
