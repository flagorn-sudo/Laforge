import { invoke } from '@tauri-apps/api/tauri';

export interface CacheEntry {
  url: string;
  url_hash: string;
  content_hash: string;
  scraped_at: number;
  page_title: string | null;
  images_count: number;
  texts_count: number;
}

export interface ScrapeCache {
  project_id: string;
  base_url: string;
  entries: Record<string, CacheEntry>;
  created_at: number;
  updated_at: number;
  ttl_seconds: number;
}

export interface CacheStats {
  total_entries: number;
  valid_entries: number;
  expired_entries: number;
  total_images: number;
  total_texts: number;
  last_updated: number;
}

/**
 * Service for managing scraping cache
 */
class ScrapeCacheService {
  /**
   * Get the full cache for a project
   */
  async getCache(projectPath: string): Promise<ScrapeCache | null> {
    return invoke<ScrapeCache | null>('get_scrape_cache', { projectPath });
  }

  /**
   * Get cache statistics for a project
   */
  async getCacheStats(projectPath: string): Promise<CacheStats | null> {
    return invoke<CacheStats | null>('get_scrape_cache_stats', { projectPath });
  }

  /**
   * Clear the cache for a project
   */
  async clearCache(projectPath: string): Promise<void> {
    return invoke('clear_scrape_cache', { projectPath });
  }

  /**
   * Check if a URL is cached
   */
  async isUrlCached(projectPath: string, url: string): Promise<boolean> {
    return invoke<boolean>('is_url_cached', { projectPath, url });
  }

  /**
   * Set the cache TTL in days
   */
  async setTtlDays(projectPath: string, days: number): Promise<void> {
    return invoke('set_scrape_cache_ttl', { projectPath, days });
  }

  /**
   * Format a timestamp to a human-readable date
   */
  formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Get age of cache entry in human-readable format
   */
  getCacheAge(timestamp: number): string {
    const now = Math.floor(Date.now() / 1000);
    const ageSeconds = now - timestamp;

    if (ageSeconds < 60) return 'à l\'instant';
    if (ageSeconds < 3600) return `il y a ${Math.floor(ageSeconds / 60)} min`;
    if (ageSeconds < 86400) return `il y a ${Math.floor(ageSeconds / 3600)} h`;
    if (ageSeconds < 604800) return `il y a ${Math.floor(ageSeconds / 86400)} j`;
    return this.formatTimestamp(timestamp);
  }
}

export const scrapeCacheService = new ScrapeCacheService();
