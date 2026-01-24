use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Cache entry for a scraped URL
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    pub url: String,
    pub url_hash: String,
    pub content_hash: String,
    pub scraped_at: u64,
    pub page_title: Option<String>,
    pub images_count: usize,
    pub texts_count: usize,
}

/// Scraping cache for a project
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScrapeCache {
    pub project_id: String,
    pub base_url: String,
    pub entries: HashMap<String, CacheEntry>,
    pub created_at: u64,
    pub updated_at: u64,
    /// TTL in seconds (default: 7 days)
    pub ttl_seconds: u64,
}

impl ScrapeCache {
    /// Create a new cache for a project
    pub fn new(project_id: &str, base_url: &str) -> Self {
        let now = current_timestamp();
        ScrapeCache {
            project_id: project_id.to_string(),
            base_url: base_url.to_string(),
            entries: HashMap::new(),
            created_at: now,
            updated_at: now,
            ttl_seconds: 7 * 24 * 60 * 60, // 7 days default
        }
    }

    /// Load cache from disk
    pub fn load(project_path: &str) -> Option<Self> {
        let cache_path = Self::cache_file_path(project_path);
        if !Path::new(&cache_path).exists() {
            return None;
        }

        match fs::read_to_string(&cache_path) {
            Ok(content) => serde_json::from_str(&content).ok(),
            Err(_) => None,
        }
    }

    /// Save cache to disk
    pub fn save(&self, project_path: &str) -> Result<(), String> {
        let cache_path = Self::cache_file_path(project_path);

        // Ensure directory exists
        if let Some(parent) = Path::new(&cache_path).parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create cache directory: {}", e))?;
        }

        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize cache: {}", e))?;

        fs::write(&cache_path, content)
            .map_err(|e| format!("Failed to write cache file: {}", e))?;

        Ok(())
    }

    /// Get cache file path for a project
    fn cache_file_path(project_path: &str) -> String {
        format!("{}/_Inbox/.scrape_cache.json", project_path)
    }

    /// Hash a URL
    pub fn hash_url(url: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(url.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Hash content
    pub fn hash_content(content: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Check if a URL is cached and still valid
    pub fn is_cached(&self, url: &str) -> bool {
        let url_hash = Self::hash_url(url);
        if let Some(entry) = self.entries.get(&url_hash) {
            let now = current_timestamp();
            let age = now.saturating_sub(entry.scraped_at);
            return age < self.ttl_seconds;
        }
        false
    }

    /// Check if a URL needs to be re-scraped (content changed)
    pub fn needs_rescrape(&self, url: &str, new_content: &str) -> bool {
        let url_hash = Self::hash_url(url);
        if let Some(entry) = self.entries.get(&url_hash) {
            let new_content_hash = Self::hash_content(new_content);
            return entry.content_hash != new_content_hash;
        }
        true // Not in cache, needs scraping
    }

    /// Add or update a cache entry
    pub fn set(
        &mut self,
        url: &str,
        content: &str,
        page_title: Option<String>,
        images_count: usize,
        texts_count: usize,
    ) {
        let url_hash = Self::hash_url(url);
        let content_hash = Self::hash_content(content);
        let now = current_timestamp();

        self.entries.insert(url_hash.clone(), CacheEntry {
            url: url.to_string(),
            url_hash,
            content_hash,
            scraped_at: now,
            page_title,
            images_count,
            texts_count,
        });

        self.updated_at = now;
    }

    /// Get cached entry for a URL
    pub fn get(&self, url: &str) -> Option<&CacheEntry> {
        let url_hash = Self::hash_url(url);
        self.entries.get(&url_hash)
    }

    /// Clear all cache entries
    pub fn clear(&mut self) {
        self.entries.clear();
        self.updated_at = current_timestamp();
    }

    /// Remove expired entries
    pub fn cleanup(&mut self) {
        let now = current_timestamp();
        self.entries.retain(|_, entry| {
            let age = now.saturating_sub(entry.scraped_at);
            age < self.ttl_seconds
        });
        self.updated_at = now;
    }

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        let now = current_timestamp();
        let valid_entries = self.entries.values()
            .filter(|e| now.saturating_sub(e.scraped_at) < self.ttl_seconds)
            .count();

        let total_images: usize = self.entries.values().map(|e| e.images_count).sum();
        let total_texts: usize = self.entries.values().map(|e| e.texts_count).sum();

        CacheStats {
            total_entries: self.entries.len(),
            valid_entries,
            expired_entries: self.entries.len() - valid_entries,
            total_images,
            total_texts,
            last_updated: self.updated_at,
        }
    }

    /// Set TTL in days
    pub fn set_ttl_days(&mut self, days: u64) {
        self.ttl_seconds = days * 24 * 60 * 60;
    }
}

/// Cache statistics
#[derive(Debug, Clone, Serialize)]
pub struct CacheStats {
    pub total_entries: usize,
    pub valid_entries: usize,
    pub expired_entries: usize,
    pub total_images: usize,
    pub total_texts: usize,
    pub last_updated: u64,
}

/// Get current timestamp in seconds
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_url() {
        let hash1 = ScrapeCache::hash_url("https://example.com");
        let hash2 = ScrapeCache::hash_url("https://example.com");
        let hash3 = ScrapeCache::hash_url("https://example.org");

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_cache_entry() {
        let mut cache = ScrapeCache::new("test-project", "https://example.com");

        cache.set(
            "https://example.com/page1",
            "<html>content</html>",
            Some("Page 1".to_string()),
            5,
            10,
        );

        assert!(cache.is_cached("https://example.com/page1"));
        assert!(!cache.is_cached("https://example.com/page2"));
    }
}
