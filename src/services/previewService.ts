/**
 * Preview Service
 * Generates secure temporary preview links for client sharing
 */

// Simple UUID v4 generator (crypto-based)
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface PreviewLink {
  id: string;
  projectId: string;
  projectName: string;
  url: string;
  password?: string;
  expiresAt: string;
  createdAt: string;
  accessCount: number;
  lastAccessedAt?: string;
  notes?: string;
  active: boolean;
}

export interface PreviewLinkOptions {
  expirationDays: number;
  passwordProtected: boolean;
  password?: string;
  notes?: string;
}

// Storage key for preview links
const STORAGE_KEY = 'forge-preview-links';

// Generate a random password
function generatePassword(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Generate a short ID for URLs
function generateShortId(): string {
  return generateUUID().substring(0, 8);
}

export const previewService = {
  /**
   * Get all preview links
   */
  getLinks(): PreviewLink[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  /**
   * Get links for a specific project
   */
  getLinksForProject(projectId: string): PreviewLink[] {
    return this.getLinks().filter((link) => link.projectId === projectId);
  },

  /**
   * Get a specific link by ID
   */
  getLink(linkId: string): PreviewLink | null {
    const links = this.getLinks();
    return links.find((link) => link.id === linkId) || null;
  },

  /**
   * Save links to storage
   */
  saveLinks(links: PreviewLink[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  },

  /**
   * Create a new preview link
   */
  createLink(
    projectId: string,
    projectName: string,
    baseUrl: string,
    options: PreviewLinkOptions
  ): PreviewLink {
    const id = generateShortId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + options.expirationDays * 24 * 60 * 60 * 1000);

    // Build the preview URL
    // In a real implementation, this would point to a preview server
    // For now, we just append a token to the base URL
    const previewToken = generateUUID();
    let url = baseUrl;
    if (url.includes('?')) {
      url += `&preview=${previewToken}`;
    } else {
      url += `?preview=${previewToken}`;
    }

    const link: PreviewLink = {
      id,
      projectId,
      projectName,
      url,
      password: options.passwordProtected
        ? options.password || generatePassword()
        : undefined,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      accessCount: 0,
      notes: options.notes,
      active: true,
    };

    const links = this.getLinks();
    links.push(link);
    this.saveLinks(links);

    return link;
  },

  /**
   * Update a preview link
   */
  updateLink(linkId: string, updates: Partial<PreviewLink>): PreviewLink | null {
    const links = this.getLinks();
    const index = links.findIndex((link) => link.id === linkId);

    if (index === -1) return null;

    links[index] = { ...links[index], ...updates };
    this.saveLinks(links);

    return links[index];
  },

  /**
   * Delete a preview link
   */
  deleteLink(linkId: string): boolean {
    const links = this.getLinks();
    const filtered = links.filter((link) => link.id !== linkId);

    if (filtered.length === links.length) return false;

    this.saveLinks(filtered);
    return true;
  },

  /**
   * Deactivate a preview link
   */
  deactivateLink(linkId: string): PreviewLink | null {
    return this.updateLink(linkId, { active: false });
  },

  /**
   * Record an access to a preview link
   */
  recordAccess(linkId: string): PreviewLink | null {
    const link = this.getLink(linkId);
    if (!link) return null;

    return this.updateLink(linkId, {
      accessCount: link.accessCount + 1,
      lastAccessedAt: new Date().toISOString(),
    });
  },

  /**
   * Check if a link is expired
   */
  isExpired(link: PreviewLink): boolean {
    return new Date(link.expiresAt) < new Date();
  },

  /**
   * Check if a link is valid (active and not expired)
   */
  isValid(link: PreviewLink): boolean {
    return link.active && !this.isExpired(link);
  },

  /**
   * Clean up expired links
   */
  cleanupExpiredLinks(): number {
    const links = this.getLinks();
    const validLinks = links.filter((link) => !this.isExpired(link));
    const removedCount = links.length - validLinks.length;

    if (removedCount > 0) {
      this.saveLinks(validLinks);
    }

    return removedCount;
  },

  /**
   * Get active links count for a project
   */
  getActiveLinksCount(projectId: string): number {
    return this.getLinksForProject(projectId).filter((link) => this.isValid(link)).length;
  },

  /**
   * Copy link to clipboard with optional password
   */
  async copyToClipboard(link: PreviewLink, includePassword: boolean = true): Promise<string> {
    let text = link.url;
    if (includePassword && link.password) {
      text += `\n\nMot de passe: ${link.password}`;
    }

    await navigator.clipboard.writeText(text);
    return text;
  },

  /**
   * Generate a shareable message for the link
   */
  generateShareMessage(link: PreviewLink, includePassword: boolean = true): string {
    let message = `Voici le lien de prévisualisation pour "${link.projectName}":\n\n`;
    message += link.url;

    if (includePassword && link.password) {
      message += `\n\nMot de passe: ${link.password}`;
    }

    message += `\n\nCe lien expire le ${new Date(link.expiresAt).toLocaleDateString('fr-FR')}.`;

    return message;
  },

  /**
   * Extend link expiration
   */
  extendExpiration(linkId: string, additionalDays: number): PreviewLink | null {
    const link = this.getLink(linkId);
    if (!link) return null;

    const currentExpiration = new Date(link.expiresAt);
    const newExpiration = new Date(
      currentExpiration.getTime() + additionalDays * 24 * 60 * 60 * 1000
    );

    return this.updateLink(linkId, {
      expiresAt: newExpiration.toISOString(),
    });
  },

  /**
   * Change link password
   */
  changePassword(linkId: string, newPassword?: string): PreviewLink | null {
    return this.updateLink(linkId, {
      password: newPassword || generatePassword(),
    });
  },

  /**
   * Remove password from link
   */
  removePassword(linkId: string): PreviewLink | null {
    return this.updateLink(linkId, {
      password: undefined,
    });
  },
};
