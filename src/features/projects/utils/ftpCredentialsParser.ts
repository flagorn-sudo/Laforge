/**
 * Parser for FTP credentials from plain text (emails, documents, etc.)
 */

export interface ParsedCredentials {
  host: string | null;
  username: string | null;
  password: string | null;
  port: number | null;
  path: string | null;
  testUrl: string | null;
}

/**
 * Parse FTP credentials from a text block using regex patterns
 * Supports French and English labels
 */
export function parseCredentialsFromText(text: string): ParsedCredentials {
  const result: ParsedCredentials = {
    host: null,
    username: null,
    password: null,
    port: null,
    path: null,
    testUrl: null,
  };

  const normalizedText = text.replace(/\t/g, ' ').replace(/\r\n/g, '\n');

  // Host patterns
  const hostPatterns = [
    /(?:h[oô]te|host|serveur\s*(?:ftp|sftp)?|server|ftp\s*server)\s*[:\-=]\s*([^\s\n,;]+)/i,
    /(?:ftp|sftp):\/\/([^\s\/:]+)/i,
    /([a-z0-9][\w.-]*\.(?:com|net|org|fr|eu|io|co)[^\s]*?)(?:\s|$|:)/i,
  ];
  for (const pattern of hostPatterns) {
    const match = normalizedText.match(pattern);
    if (match && match[1] && !result.host) {
      result.host = match[1].trim();
      break;
    }
  }

  // Username patterns
  const userPatterns = [
    /(?:utilisateur|username|user|login|identifiant|user\s*name|nom\s*d'utilisateur)\s*[:\-=]\s*([^\s\n,;]+)/i,
    /(?:ftp|sftp)\s+(?:login|user)[:\s]+([^\s\n,;]+)/i,
  ];
  for (const pattern of userPatterns) {
    const match = normalizedText.match(pattern);
    if (match && match[1] && !result.username) {
      result.username = match[1].trim();
      break;
    }
  }

  // Password patterns
  const passwordPatterns = [
    /(?:mot\s*de\s*passe|password|pass|pwd|mdp)\s*[:\-=]\s*([^\s\n]+)/i,
    /(?:ftp|sftp)\s+(?:password|pass)[:\s]+([^\s\n]+)/i,
  ];
  for (const pattern of passwordPatterns) {
    const match = normalizedText.match(pattern);
    if (match && match[1] && !result.password) {
      result.password = match[1].trim();
      break;
    }
  }

  // Port patterns
  const portPatterns = [
    /(?:port)\s*[:\-=]\s*(\d+)/i,
    /:(\d{2,5})(?:\s|$|\/)/,
  ];
  for (const pattern of portPatterns) {
    const match = normalizedText.match(pattern);
    if (match && match[1] && !result.port) {
      const port = parseInt(match[1], 10);
      if (port > 0 && port < 65536) {
        result.port = port;
        break;
      }
    }
  }

  // Path patterns
  const pathPatterns = [
    /(?:chemin|path|dossier|r[ée]pertoire|directory|remote\s*path)\s*[:\-=]\s*(\/[^\s\n,;]*)/i,
    /(?:public_html|www|htdocs|web)(?:\/[^\s\n,;]*)?/i,
  ];
  for (const pattern of pathPatterns) {
    const match = normalizedText.match(pattern);
    if (match && !result.path) {
      result.path = match[1] ? match[1].trim() : '/' + match[0].trim();
      break;
    }
  }

  // Test URL patterns
  const urlPatterns = [
    // Explicit patterns with label - with or without protocol
    /(?:url\s*(?:de\s*)?(?:test|pr[ée]visualisation|preview|staging|temp)|lien\s*(?:de\s*)?(?:test|pr[ée]visualisation|preview)|test\s*url|preview\s*url|url\s*du\s*site|site\s*url|url)\s*[:\-=]\s*((?:https?:\/\/)?[a-z0-9][\w.-]*\.[a-z]{2,}[^\s\n,;]*)/i,
    // URL containing test keywords - with or without protocol
    /((?:https?:\/\/)?[a-z0-9][\w.-]*(?:temp|test|staging|preview|dev|preprod)[^\s\n,;]*\.[a-z]{2,}[^\s\n,;]*)/i,
    /((?:https?:\/\/)?(?:temp|test|staging|preview|dev|preprod)[.-][a-z0-9][\w.-]*\.[a-z]{2,}[^\s\n,;]*)/i,
    // Any http/https URL that is not an FTP server
    /(?:https?:\/\/(?!ftp\.)[^\s\n,;]+)/i,
  ];
  for (const pattern of urlPatterns) {
    const match = normalizedText.match(pattern);
    if (match && !result.testUrl) {
      let url = match[1] ? match[1].trim() : match[0].trim();
      // Avoid capturing FTP host as test URL
      if (!url.includes('ftp.') && !url.includes(':21') && !url.includes(':22')) {
        // Normalize: add https:// if missing
        if (!/^https?:\/\//i.test(url)) {
          url = `https://${url}`;
        }
        result.testUrl = url;
        break;
      }
    }
  }

  return result;
}

/**
 * Check if parsed credentials contain any useful data
 */
export function hasCredentials(credentials: ParsedCredentials): boolean {
  return !!(credentials.host || credentials.username || credentials.password);
}
