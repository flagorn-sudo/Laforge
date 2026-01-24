//! Full Site Scraper Module
//!
//! Downloads an entire website and makes it work locally.
//! - Downloads HTML, CSS, JS, images, fonts
//! - Rewrites URLs to work locally (relative paths)
//! - Extracts design system (colors, fonts, typography)
//! - Generates comprehensive scraping report

use reqwest::blocking::Client;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use url::Url;

/// Progress event for full site scraping
#[derive(Debug, Clone, Serialize)]
pub struct FullScrapeProgress {
    pub project_id: String,
    pub event_type: String, // "connecting", "page_start", "page_complete", "asset_download", "analyzing", "rewriting", "complete", "error"
    pub current_step: String,
    pub progress_percent: f32,
    pub pages_downloaded: usize,
    pub pages_total: usize,
    pub assets_downloaded: usize,
    pub current_url: Option<String>,
    pub message: String,
    pub bytes_downloaded: u64,
}

/// Configuration for full site scraping
#[derive(Debug, Clone, Deserialize)]
pub struct FullScrapeConfig {
    pub url: String,
    pub output_path: String,
    #[serde(default = "default_max_pages")]
    pub max_pages: u32,
    #[serde(default = "default_true")]
    pub download_images: bool,
    #[serde(default = "default_true")]
    pub download_css: bool,
    #[serde(default = "default_true")]
    pub download_js: bool,
    #[serde(default = "default_true")]
    pub download_fonts: bool,
    #[serde(default = "default_true")]
    pub rewrite_urls: bool,
    #[serde(default = "default_true")]
    pub generate_report: bool,
}

fn default_max_pages() -> u32 { 100 }
fn default_true() -> bool { true }

/// Design System extracted from the website
#[derive(Debug, Clone, Serialize, Default)]
pub struct DesignSystem {
    pub colors: Vec<ColorInfo>,
    pub fonts: Vec<FontInfo>,
    pub typography: TypographyInfo,
    pub spacing: Vec<String>,
    pub breakpoints: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ColorInfo {
    pub hex: String,
    pub rgb: Option<String>,
    pub usage: String, // "background", "text", "border", "accent"
    pub occurrences: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct FontInfo {
    pub family: String,
    pub weights: Vec<String>,
    pub source: String, // "google", "local", "embedded"
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct TypographyInfo {
    pub base_font_size: Option<String>,
    pub headings: HashMap<String, HeadingStyle>,
    pub body_line_height: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HeadingStyle {
    pub font_size: String,
    pub font_weight: Option<String>,
    pub line_height: Option<String>,
}

/// Result of full site scraping
#[derive(Debug, Clone, Serialize)]
pub struct FullScrapeResult {
    pub success: bool,
    pub pages_downloaded: usize,
    pub assets_downloaded: usize,
    pub total_size_bytes: u64,
    pub output_path: String,
    pub index_path: String,
    pub design_system: DesignSystem,
    pub report_path: Option<String>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

/// Asset tracking during scraping
#[derive(Debug, Clone)]
struct DownloadedAsset {
    original_url: String,
    local_path: PathBuf,
    asset_type: AssetType,
    size: u64,
}

#[derive(Debug, Clone, PartialEq)]
enum AssetType {
    Html,
    Css,
    JavaScript,
    Image,
    Font,
    Other,
}

impl AssetType {
    fn from_url(url: &str) -> Self {
        let lower = url.to_lowercase();
        if lower.ends_with(".html") || lower.ends_with(".htm") || lower.contains(".html?") || lower.contains(".htm?") {
            AssetType::Html
        } else if lower.ends_with(".css") || lower.contains(".css?") {
            AssetType::Css
        } else if lower.ends_with(".js") || lower.contains(".js?") {
            AssetType::JavaScript
        } else if lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".jpeg")
            || lower.ends_with(".gif") || lower.ends_with(".svg") || lower.ends_with(".webp")
            || lower.ends_with(".ico")
        {
            AssetType::Image
        } else if lower.ends_with(".woff") || lower.ends_with(".woff2") || lower.ends_with(".ttf")
            || lower.ends_with(".otf") || lower.ends_with(".eot")
        {
            AssetType::Font
        } else {
            AssetType::Other
        }
    }

    fn directory(&self) -> &str {
        match self {
            AssetType::Html => "",
            AssetType::Css => "css",
            AssetType::JavaScript => "js",
            AssetType::Image => "images",
            AssetType::Font => "fonts",
            AssetType::Other => "assets",
        }
    }
}

/// Full site scraper implementation
pub struct FullSiteScraper {
    client: Client,
    base_url: Url,
    config: FullScrapeConfig,
    project_id: String,
    visited_urls: HashSet<String>,
    downloaded_assets: HashMap<String, DownloadedAsset>,
    url_to_local_path: HashMap<String, String>,
    colors_found: HashMap<String, usize>,
    fonts_found: HashMap<String, HashSet<String>>, // font_name -> weights
    font_urls: HashMap<String, String>,
    errors: Vec<String>,
    warnings: Vec<String>,
    cancel_flag: Arc<AtomicBool>,
}

impl FullSiteScraper {
    pub fn new(config: FullScrapeConfig, project_id: &str, cancel_flag: Arc<AtomicBool>) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(60))
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let base_url = Url::parse(&config.url)
            .map_err(|e| format!("Invalid URL: {}", e))?;

        Ok(Self {
            client,
            base_url,
            config,
            project_id: project_id.to_string(),
            visited_urls: HashSet::new(),
            downloaded_assets: HashMap::new(),
            url_to_local_path: HashMap::new(),
            colors_found: HashMap::new(),
            fonts_found: HashMap::new(),
            font_urls: HashMap::new(),
            errors: Vec::new(),
            warnings: Vec::new(),
            cancel_flag,
        })
    }

    /// Check if scraping has been cancelled
    fn is_cancelled(&self) -> bool {
        self.cancel_flag.load(Ordering::Relaxed)
    }

    pub fn scrape(&mut self) -> Result<FullScrapeResult, String> {
        self.scrape_with_callback(|_| {})
    }

    pub fn scrape_with_callback<F>(&mut self, on_progress: F) -> Result<FullScrapeResult, String>
    where
        F: Fn(FullScrapeProgress),
    {
        // Clone the output path to avoid borrowing issues
        let output_path = self.config.output_path.clone();
        let output_base = Path::new(&output_path);

        // Emit connecting event
        on_progress(FullScrapeProgress {
            project_id: self.project_id.clone(),
            event_type: "connecting".to_string(),
            current_step: "Connexion au site".to_string(),
            progress_percent: 0.0,
            pages_downloaded: 0,
            pages_total: self.config.max_pages as usize,
            assets_downloaded: 0,
            current_url: Some(self.config.url.clone()),
            message: format!("Connexion a {}...", self.config.url),
            bytes_downloaded: 0,
        });

        self.create_directory_structure(output_base)?;

        // Start crawling from the base URL
        let mut urls_to_visit = vec![self.config.url.clone()];
        let max_pages = self.config.max_pages as usize;

        while let Some(url) = urls_to_visit.pop() {
            // Check cancellation
            if self.is_cancelled() {
                return Err("Scraping annule par l'utilisateur".to_string());
            }

            if self.visited_urls.len() >= max_pages {
                self.warnings.push(format!(
                    "Limite de {} pages atteinte. Certaines pages n'ont pas ete telechargees.",
                    max_pages
                ));
                break;
            }

            if self.visited_urls.contains(&url) {
                continue;
            }

            // Only process same-domain URLs
            if !self.is_same_domain(&url) {
                continue;
            }

            self.visited_urls.insert(url.clone());

            // Emit page start event
            let progress = (self.visited_urls.len() as f32 / max_pages as f32) * 60.0; // 0-60% for pages
            on_progress(FullScrapeProgress {
                project_id: self.project_id.clone(),
                event_type: "page_start".to_string(),
                current_step: "Telechargement des pages".to_string(),
                progress_percent: progress,
                pages_downloaded: self.visited_urls.len(),
                pages_total: max_pages,
                assets_downloaded: self.downloaded_assets.len(),
                current_url: Some(url.clone()),
                message: format!("Page {}/{}: {}", self.visited_urls.len(), max_pages, url),
                bytes_downloaded: self.downloaded_assets.values().map(|a| a.size).sum(),
            });

            match self.process_page(&url, output_base) {
                Ok(new_urls) => {
                    // Emit page complete event
                    on_progress(FullScrapeProgress {
                        project_id: self.project_id.clone(),
                        event_type: "page_complete".to_string(),
                        current_step: "Telechargement des pages".to_string(),
                        progress_percent: progress,
                        pages_downloaded: self.visited_urls.len(),
                        pages_total: max_pages,
                        assets_downloaded: self.downloaded_assets.len(),
                        current_url: Some(url.clone()),
                        message: format!("Page terminee: {}", url),
                        bytes_downloaded: self.downloaded_assets.values().map(|a| a.size).sum(),
                    });

                    for new_url in new_urls {
                        if !self.visited_urls.contains(&new_url) {
                            urls_to_visit.push(new_url);
                        }
                    }
                }
                Err(e) => {
                    self.errors.push(format!("Erreur sur {}: {}", url, e));
                    on_progress(FullScrapeProgress {
                        project_id: self.project_id.clone(),
                        event_type: "error".to_string(),
                        current_step: "Telechargement des pages".to_string(),
                        progress_percent: progress,
                        pages_downloaded: self.visited_urls.len(),
                        pages_total: max_pages,
                        assets_downloaded: self.downloaded_assets.len(),
                        current_url: Some(url.clone()),
                        message: format!("Erreur: {}", e),
                        bytes_downloaded: self.downloaded_assets.values().map(|a| a.size).sum(),
                    });
                }
            }
        }

        // Check cancellation before rewriting
        if self.is_cancelled() {
            return Err("Scraping annule par l'utilisateur".to_string());
        }

        // Rewrite URLs in all HTML and CSS files
        if self.config.rewrite_urls {
            on_progress(FullScrapeProgress {
                project_id: self.project_id.clone(),
                event_type: "rewriting".to_string(),
                current_step: "Reecriture des URLs".to_string(),
                progress_percent: 70.0,
                pages_downloaded: self.visited_urls.len(),
                pages_total: max_pages,
                assets_downloaded: self.downloaded_assets.len(),
                current_url: None,
                message: "Reecriture des URLs pour fonctionnement local...".to_string(),
                bytes_downloaded: self.downloaded_assets.values().map(|a| a.size).sum(),
            });
            self.rewrite_all_urls(output_base)?;
        }

        // Build design system
        on_progress(FullScrapeProgress {
            project_id: self.project_id.clone(),
            event_type: "analyzing".to_string(),
            current_step: "Analyse de la charte graphique".to_string(),
            progress_percent: 85.0,
            pages_downloaded: self.visited_urls.len(),
            pages_total: max_pages,
            assets_downloaded: self.downloaded_assets.len(),
            current_url: None,
            message: "Extraction des couleurs et polices...".to_string(),
            bytes_downloaded: self.downloaded_assets.values().map(|a| a.size).sum(),
        });
        let design_system = self.build_design_system();

        // Generate report
        let report_path = if self.config.generate_report {
            on_progress(FullScrapeProgress {
                project_id: self.project_id.clone(),
                event_type: "analyzing".to_string(),
                current_step: "Generation du rapport".to_string(),
                progress_percent: 95.0,
                pages_downloaded: self.visited_urls.len(),
                pages_total: max_pages,
                assets_downloaded: self.downloaded_assets.len(),
                current_url: None,
                message: "Generation du rapport...".to_string(),
                bytes_downloaded: self.downloaded_assets.values().map(|a| a.size).sum(),
            });
            Some(self.generate_report(output_base, &design_system)?)
        } else {
            None
        };

        // Calculate totals
        let total_size: u64 = self.downloaded_assets.values().map(|a| a.size).sum();
        let index_path = output_base.join("index.html");

        // Emit complete event
        on_progress(FullScrapeProgress {
            project_id: self.project_id.clone(),
            event_type: "complete".to_string(),
            current_step: "Termine".to_string(),
            progress_percent: 100.0,
            pages_downloaded: self.visited_urls.len(),
            pages_total: self.visited_urls.len(),
            assets_downloaded: self.downloaded_assets.len(),
            current_url: None,
            message: format!(
                "Scraping termine: {} pages, {} assets, {}",
                self.visited_urls.len(),
                self.downloaded_assets.len(),
                format_bytes(total_size)
            ),
            bytes_downloaded: total_size,
        });

        Ok(FullScrapeResult {
            success: self.errors.len() < 5,
            pages_downloaded: self.visited_urls.len(),
            assets_downloaded: self.downloaded_assets.len(),
            total_size_bytes: total_size,
            output_path: output_base.to_string_lossy().to_string(),
            index_path: index_path.to_string_lossy().to_string(),
            design_system,
            report_path,
            errors: self.errors.clone(),
            warnings: self.warnings.clone(),
        })
    }

    fn create_directory_structure(&self, base: &Path) -> Result<(), String> {
        let dirs = ["css", "js", "images", "fonts", "assets"];
        for dir in dirs {
            fs::create_dir_all(base.join(dir))
                .map_err(|e| format!("Failed to create directory {}: {}", dir, e))?;
        }
        Ok(())
    }

    fn is_same_domain(&self, url: &str) -> bool {
        if let Ok(parsed) = Url::parse(url) {
            parsed.host_str() == self.base_url.host_str()
        } else {
            false
        }
    }

    fn process_page(&mut self, url: &str, output_base: &Path) -> Result<Vec<String>, String> {
        let response = self.client.get(url).send()
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("HTTP {}", response.status()));
        }

        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        // Only process HTML pages for crawling
        if !content_type.contains("text/html") {
            return Ok(vec![]);
        }

        let html = response.text()
            .map_err(|e| format!("Failed to read response: {}", e))?;

        let document = Html::parse_document(&html);
        let base_url = Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;

        // Save HTML file
        let html_path = self.url_to_local_html_path(url, output_base);
        self.save_content(&html_path, html.as_bytes())?;

        let size = html.len() as u64;
        self.downloaded_assets.insert(url.to_string(), DownloadedAsset {
            original_url: url.to_string(),
            local_path: html_path.clone(),
            asset_type: AssetType::Html,
            size,
        });
        self.url_to_local_path.insert(url.to_string(), html_path.to_string_lossy().to_string());

        let mut new_urls = Vec::new();

        // Extract links
        let link_selector = Selector::parse("a[href]").unwrap();
        for element in document.select(&link_selector) {
            if let Some(href) = element.value().attr("href") {
                if let Ok(absolute_url) = base_url.join(href) {
                    let url_str = absolute_url.to_string();
                    if self.is_same_domain(&url_str) && !url_str.contains('#') {
                        new_urls.push(url_str);
                    }
                }
            }
        }

        // Download CSS
        if self.config.download_css {
            let css_selector = Selector::parse("link[rel='stylesheet'][href]").unwrap();
            for element in document.select(&css_selector) {
                if let Some(href) = element.value().attr("href") {
                    if let Ok(absolute_url) = base_url.join(href) {
                        self.download_asset(&absolute_url.to_string(), output_base, AssetType::Css);
                    }
                }
            }

            // Inline styles
            let style_selector = Selector::parse("style").unwrap();
            for element in document.select(&style_selector) {
                let css_content: String = element.text().collect();
                self.extract_colors_from_css(&css_content);
                self.extract_fonts_from_css(&css_content);
            }
        }

        // Download JavaScript
        if self.config.download_js {
            let js_selector = Selector::parse("script[src]").unwrap();
            for element in document.select(&js_selector) {
                if let Some(src) = element.value().attr("src") {
                    if let Ok(absolute_url) = base_url.join(src) {
                        self.download_asset(&absolute_url.to_string(), output_base, AssetType::JavaScript);
                    }
                }
            }
        }

        // Download images
        if self.config.download_images {
            let img_selector = Selector::parse("img[src]").unwrap();
            for element in document.select(&img_selector) {
                if let Some(src) = element.value().attr("src") {
                    if let Ok(absolute_url) = base_url.join(src) {
                        self.download_asset(&absolute_url.to_string(), output_base, AssetType::Image);
                    }
                }
            }

            // Also check srcset
            let srcset_selector = Selector::parse("img[srcset], source[srcset]").unwrap();
            for element in document.select(&srcset_selector) {
                if let Some(srcset) = element.value().attr("srcset") {
                    for part in srcset.split(',') {
                        let src = part.trim().split_whitespace().next().unwrap_or("");
                        if !src.is_empty() {
                            if let Ok(absolute_url) = base_url.join(src) {
                                self.download_asset(&absolute_url.to_string(), output_base, AssetType::Image);
                            }
                        }
                    }
                }
            }

            // Background images in inline styles
            let style_attr_selector = Selector::parse("[style]").unwrap();
            for element in document.select(&style_attr_selector) {
                if let Some(style) = element.value().attr("style") {
                    self.extract_background_images(style, &base_url, output_base);
                }
            }
        }

        // Extract inline colors
        self.extract_inline_colors(&document);

        Ok(new_urls)
    }

    fn download_asset(&mut self, url: &str, output_base: &Path, asset_type: AssetType) {
        if self.downloaded_assets.contains_key(url) {
            return;
        }

        match self.do_download_asset(url, output_base, &asset_type) {
            Ok(asset) => {
                // If CSS, also extract fonts and colors
                if asset_type == AssetType::Css {
                    if let Ok(content) = fs::read_to_string(&asset.local_path) {
                        self.extract_colors_from_css(&content);
                        self.extract_fonts_from_css(&content);

                        // Download font files referenced in CSS
                        if self.config.download_fonts {
                            self.download_fonts_from_css(&content, url, output_base);
                        }
                    }
                }

                self.url_to_local_path.insert(url.to_string(), asset.local_path.to_string_lossy().to_string());
                self.downloaded_assets.insert(url.to_string(), asset);
            }
            Err(e) => {
                self.warnings.push(format!("Impossible de telecharger {}: {}", url, e));
            }
        }
    }

    fn do_download_asset(&self, url: &str, output_base: &Path, asset_type: &AssetType) -> Result<DownloadedAsset, String> {
        let response = self.client.get(url).send()
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("HTTP {}", response.status()));
        }

        let bytes = response.bytes()
            .map_err(|e| format!("Failed to read bytes: {}", e))?;

        let local_path = self.url_to_local_asset_path(url, output_base, asset_type);

        // Create parent directories if needed
        if let Some(parent) = local_path.parent() {
            fs::create_dir_all(parent).ok();
        }

        let mut file = File::create(&local_path)
            .map_err(|e| format!("Failed to create file: {}", e))?;

        file.write_all(&bytes)
            .map_err(|e| format!("Failed to write file: {}", e))?;

        Ok(DownloadedAsset {
            original_url: url.to_string(),
            local_path,
            asset_type: asset_type.clone(),
            size: bytes.len() as u64,
        })
    }

    fn url_to_local_html_path(&self, url: &str, output_base: &Path) -> PathBuf {
        let parsed = Url::parse(url).unwrap_or_else(|_| self.base_url.clone());
        let mut path = parsed.path().trim_start_matches('/').to_string();

        if path.is_empty() || path.ends_with('/') {
            path.push_str("index.html");
        } else if !path.contains('.') {
            path.push_str(".html");
        }

        output_base.join(sanitize_path(&path))
    }

    fn url_to_local_asset_path(&self, url: &str, output_base: &Path, asset_type: &AssetType) -> PathBuf {
        let parsed = Url::parse(url).ok();
        let filename = parsed
            .as_ref()
            .and_then(|u| u.path_segments())
            .and_then(|mut s| s.next_back())
            .filter(|s| !s.is_empty())
            .map(|s| sanitize_filename(s))
            .unwrap_or_else(|| format!("asset_{}", self.downloaded_assets.len()));

        let dir = output_base.join(asset_type.directory());
        dir.join(filename)
    }

    fn save_content(&self, path: &Path, content: &[u8]) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        let mut file = File::create(path)
            .map_err(|e| format!("Failed to create file: {}", e))?;

        file.write_all(content)
            .map_err(|e| format!("Failed to write file: {}", e))?;

        Ok(())
    }

    fn extract_colors_from_css(&mut self, css: &str) {
        // Extract hex colors
        for word in css.split([' ', ';', ':', '{', '}', '\n', '\r', '(', ')', ',']) {
            let trimmed = word.trim();
            if trimmed.starts_with('#') && (trimmed.len() == 4 || trimmed.len() == 7) {
                if trimmed.chars().skip(1).all(|c| c.is_ascii_hexdigit()) {
                    let normalized = trimmed.to_lowercase();
                    *self.colors_found.entry(normalized).or_insert(0) += 1;
                }
            }
        }

        // Extract rgb/rgba colors
        let css_lower = css.to_lowercase();
        for pattern in ["rgb(", "rgba("] {
            let mut search_from = 0;
            while let Some(start) = css_lower[search_from..].find(pattern) {
                let actual_start = search_from + start;
                if let Some(end) = css_lower[actual_start..].find(')') {
                    let color = &css[actual_start..actual_start + end + 1];
                    *self.colors_found.entry(color.to_string()).or_insert(0) += 1;
                }
                search_from = actual_start + 1;
            }
        }
    }

    fn extract_fonts_from_css(&mut self, css: &str) {
        let css_lower = css.to_lowercase();

        // Extract font-family declarations
        for line in css.lines() {
            let line_lower = line.to_lowercase();
            if line_lower.contains("font-family") {
                if let Some(colon_pos) = line.find(':') {
                    let value_part = &line[colon_pos + 1..];
                    let end_pos = value_part.find(';').unwrap_or(value_part.len());
                    let font_value = &value_part[..end_pos];

                    for font in font_value.split(',') {
                        let font_name = font.trim()
                            .trim_matches('"')
                            .trim_matches('\'')
                            .to_string();

                        if !font_name.is_empty()
                            && !is_generic_font(&font_name)
                        {
                            self.fonts_found.entry(font_name).or_insert_with(HashSet::new);
                        }
                    }
                }
            }

            // Extract font-weight
            if line_lower.contains("font-weight") {
                if let Some(colon_pos) = line.find(':') {
                    let value_part = &line[colon_pos + 1..];
                    let end_pos = value_part.find(';').unwrap_or(value_part.len());
                    let weight = value_part[..end_pos].trim().to_string();

                    // Add to last found font
                    if let Some(last_font) = self.fonts_found.keys().last().cloned() {
                        if let Some(weights) = self.fonts_found.get_mut(&last_font) {
                            weights.insert(weight);
                        }
                    }
                }
            }
        }

        // Extract @font-face declarations
        if css_lower.contains("@font-face") {
            // Simplified font-face parsing
            let mut in_font_face = false;
            let mut current_font = String::new();

            for line in css.lines() {
                let line_lower = line.to_lowercase();
                if line_lower.contains("@font-face") {
                    in_font_face = true;
                }
                if in_font_face {
                    if line_lower.contains("font-family") {
                        if let Some(colon_pos) = line.find(':') {
                            let value_part = &line[colon_pos + 1..];
                            current_font = value_part
                                .split([';', '}'])
                                .next()
                                .unwrap_or("")
                                .trim()
                                .trim_matches('"')
                                .trim_matches('\'')
                                .to_string();
                        }
                    }
                    if line.contains('}') {
                        in_font_face = false;
                        if !current_font.is_empty() {
                            self.fonts_found.entry(current_font.clone()).or_insert_with(HashSet::new);
                        }
                        current_font.clear();
                    }
                }
            }
        }
    }

    fn download_fonts_from_css(&mut self, css: &str, css_url: &str, output_base: &Path) {
        let base_url = Url::parse(css_url).ok();

        // Find font URLs in CSS
        for line in css.lines() {
            let line_lower = line.to_lowercase();
            if line_lower.contains("url(") && (line_lower.contains(".woff") || line_lower.contains(".ttf") || line_lower.contains(".otf") || line_lower.contains(".eot")) {
                // Extract URL
                if let Some(start) = line.find("url(") {
                    let rest = &line[start + 4..];
                    let end = rest.find(')').unwrap_or(rest.len());
                    let url_str = rest[..end]
                        .trim()
                        .trim_matches('"')
                        .trim_matches('\'');

                    if let Some(base) = &base_url {
                        if let Ok(font_url) = base.join(url_str) {
                            self.download_asset(&font_url.to_string(), output_base, AssetType::Font);
                        }
                    }
                }
            }
        }

        // Check for Google Fonts
        if css.contains("fonts.googleapis.com") || css.contains("fonts.gstatic.com") {
            self.warnings.push("Google Fonts detectees - les polices peuvent ne pas etre telechargees completement".to_string());
        }
    }

    fn extract_background_images(&mut self, style: &str, base_url: &Url, output_base: &Path) {
        if style.contains("url(") {
            if let Some(start) = style.find("url(") {
                let rest = &style[start + 4..];
                let end = rest.find(')').unwrap_or(rest.len());
                let url_str = rest[..end]
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'');

                if !url_str.starts_with("data:") {
                    if let Ok(absolute_url) = base_url.join(url_str) {
                        self.download_asset(&absolute_url.to_string(), output_base, AssetType::Image);
                    }
                }
            }
        }
    }

    fn extract_inline_colors(&mut self, document: &Html) {
        let style_selector = Selector::parse("[style]").unwrap();
        for element in document.select(&style_selector) {
            if let Some(style) = element.value().attr("style") {
                self.extract_colors_from_css(style);
            }
        }
    }

    fn rewrite_all_urls(&mut self, output_base: &Path) -> Result<(), String> {
        // Clone the downloaded_assets to avoid borrowing issues
        let assets: Vec<_> = self.downloaded_assets.values().cloned().collect();

        for asset in assets {
            match asset.asset_type {
                AssetType::Html => {
                    if let Ok(content) = fs::read_to_string(&asset.local_path) {
                        let rewritten = self.rewrite_html_urls(&content, &asset.local_path, output_base);
                        fs::write(&asset.local_path, rewritten).ok();
                    }
                }
                AssetType::Css => {
                    if let Ok(content) = fs::read_to_string(&asset.local_path) {
                        let rewritten = self.rewrite_css_urls(&content, &asset.local_path, output_base);
                        fs::write(&asset.local_path, rewritten).ok();
                    }
                }
                _ => {}
            }
        }

        Ok(())
    }

    fn rewrite_html_urls(&self, html: &str, current_file: &Path, output_base: &Path) -> String {
        let mut result = html.to_string();

        for (original_url, local_path) in &self.url_to_local_path {
            let relative_path = self.compute_relative_path(current_file, Path::new(local_path), output_base);

            // Replace various URL formats
            result = result.replace(&format!("href=\"{}\"", original_url), &format!("href=\"{}\"", relative_path));
            result = result.replace(&format!("src=\"{}\"", original_url), &format!("src=\"{}\"", relative_path));
            result = result.replace(&format!("href='{}'", original_url), &format!("href='{}'", relative_path));
            result = result.replace(&format!("src='{}'", original_url), &format!("src='{}'", relative_path));
        }

        result
    }

    fn rewrite_css_urls(&self, css: &str, current_file: &Path, output_base: &Path) -> String {
        let mut result = css.to_string();

        for (original_url, local_path) in &self.url_to_local_path {
            let relative_path = self.compute_relative_path(current_file, Path::new(local_path), output_base);

            result = result.replace(&format!("url(\"{}\")", original_url), &format!("url(\"{}\")", relative_path));
            result = result.replace(&format!("url('{}')", original_url), &format!("url('{}')", relative_path));
            result = result.replace(&format!("url({})", original_url), &format!("url({})", relative_path));
        }

        result
    }

    fn compute_relative_path(&self, from: &Path, to: &Path, _base: &Path) -> String {
        // Simplified: compute relative path from file to asset
        let from_dir = from.parent().unwrap_or(Path::new(""));

        if let Ok(rel) = to.strip_prefix(from_dir) {
            return rel.to_string_lossy().to_string();
        }

        // Fallback: use the filename with directory
        let to_filename = to.file_name().unwrap_or_default().to_string_lossy();
        let to_dir = to.parent()
            .and_then(|p| p.file_name())
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        if !to_dir.is_empty() {
            format!("{}/{}", to_dir, to_filename)
        } else {
            to_filename.to_string()
        }
    }

    fn build_design_system(&self) -> DesignSystem {
        // Sort colors by occurrence
        let mut sorted_colors: Vec<_> = self.colors_found.iter().collect();
        sorted_colors.sort_by(|a, b| b.1.cmp(a.1));

        let colors: Vec<ColorInfo> = sorted_colors
            .into_iter()
            .take(20)
            .map(|(hex, count)| ColorInfo {
                hex: hex.clone(),
                rgb: hex_to_rgb(hex),
                usage: guess_color_usage(hex),
                occurrences: *count,
            })
            .collect();

        let fonts: Vec<FontInfo> = self.fonts_found
            .iter()
            .map(|(name, weights)| FontInfo {
                family: name.clone(),
                weights: weights.iter().cloned().collect(),
                source: if name.contains(' ') || name.chars().next().map(|c| c.is_uppercase()).unwrap_or(false) {
                    "custom".to_string()
                } else {
                    "system".to_string()
                },
                url: self.font_urls.get(name).cloned(),
            })
            .collect();

        DesignSystem {
            colors,
            fonts,
            typography: TypographyInfo::default(),
            spacing: Vec::new(),
            breakpoints: Vec::new(),
        }
    }

    fn generate_report(&self, output_base: &Path, design_system: &DesignSystem) -> Result<String, String> {
        let report_path = output_base.join("scraping_report.md");

        let mut report = String::new();
        report.push_str("# Rapport de Scraping\n\n");
        report.push_str(&format!("**Site source:** {}\n", self.config.url));
        report.push_str(&format!("**Date:** {}\n\n", chrono::Local::now().format("%Y-%m-%d %H:%M")));

        report.push_str("## Resume\n\n");
        report.push_str(&format!("- **Pages telechargees:** {}\n", self.visited_urls.len()));
        report.push_str(&format!("- **Assets telecharges:** {}\n", self.downloaded_assets.len()));

        let total_size: u64 = self.downloaded_assets.values().map(|a| a.size).sum();
        report.push_str(&format!("- **Taille totale:** {}\n\n", format_bytes(total_size)));

        // Design System
        report.push_str("## Charte Graphique\n\n");

        report.push_str("### Couleurs\n\n");
        report.push_str("| Couleur | Hex | Occurrences | Usage |\n");
        report.push_str("|---------|-----|-------------|-------|\n");
        for color in &design_system.colors {
            report.push_str(&format!("| {} | `{}` | {} | {} |\n",
                color_square(&color.hex),
                color.hex,
                color.occurrences,
                color.usage
            ));
        }
        report.push_str("\n");

        report.push_str("### Polices\n\n");
        for font in &design_system.fonts {
            report.push_str(&format!("- **{}** ({})\n", font.family, font.source));
            if !font.weights.is_empty() {
                report.push_str(&format!("  - Graisses: {}\n", font.weights.join(", ")));
            }
        }
        report.push_str("\n");

        // Pages downloaded
        report.push_str("## Pages Telechargees\n\n");
        for url in &self.visited_urls {
            report.push_str(&format!("- {}\n", url));
        }
        report.push_str("\n");

        // Errors and warnings
        if !self.errors.is_empty() {
            report.push_str("## Erreurs\n\n");
            for error in &self.errors {
                report.push_str(&format!("- {}\n", error));
            }
            report.push_str("\n");
        }

        if !self.warnings.is_empty() {
            report.push_str("## Avertissements\n\n");
            for warning in &self.warnings {
                report.push_str(&format!("- {}\n", warning));
            }
        }

        // Usage instructions
        report.push_str("\n## Utilisation\n\n");
        report.push_str("Pour visualiser le site en local:\n\n");
        report.push_str("1. Ouvrir `index.html` dans un navigateur\n");
        report.push_str("2. Ou lancer un serveur local: `python -m http.server 8000`\n");

        fs::write(&report_path, &report)
            .map_err(|e| format!("Failed to write report: {}", e))?;

        Ok(report_path.to_string_lossy().to_string())
    }
}

// Helper functions

fn sanitize_filename(name: &str) -> String {
    let name = name.split('?').next().unwrap_or(name);
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

fn sanitize_path(path: &str) -> String {
    path.replace("..", "_")
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '/' || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

fn is_generic_font(name: &str) -> bool {
    let lower = name.to_lowercase();
    matches!(lower.as_str(),
        "sans-serif" | "serif" | "monospace" | "cursive" | "fantasy" |
        "inherit" | "initial" | "unset" | "system-ui" | "-apple-system"
    )
}

fn hex_to_rgb(hex: &str) -> Option<String> {
    let hex = hex.trim_start_matches('#');
    if hex.len() == 3 {
        let r = u8::from_str_radix(&hex[0..1].repeat(2), 16).ok()?;
        let g = u8::from_str_radix(&hex[1..2].repeat(2), 16).ok()?;
        let b = u8::from_str_radix(&hex[2..3].repeat(2), 16).ok()?;
        Some(format!("rgb({}, {}, {})", r, g, b))
    } else if hex.len() == 6 {
        let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
        let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
        let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
        Some(format!("rgb({}, {}, {})", r, g, b))
    } else {
        None
    }
}

fn guess_color_usage(hex: &str) -> String {
    let hex = hex.trim_start_matches('#').to_lowercase();
    if hex.len() < 3 {
        return "unknown".to_string();
    }

    // Very simplified color analysis
    if hex == "fff" || hex == "ffffff" {
        "background".to_string()
    } else if hex == "000" || hex == "000000" {
        "text".to_string()
    } else if hex.starts_with("f") || hex.starts_with("e") {
        "background-light".to_string()
    } else if hex.starts_with("0") || hex.starts_with("1") || hex.starts_with("2") || hex.starts_with("3") {
        "text-dark".to_string()
    } else {
        "accent".to_string()
    }
}

fn color_square(hex: &str) -> String {
    // For markdown, we can't really show colors, but we can indicate
    format!("[{}]", hex)
}

fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

/// Tauri command to perform full site scraping (legacy, no progress)
pub fn scrape_full_site(config: FullScrapeConfig) -> Result<FullScrapeResult, String> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    let mut scraper = FullSiteScraper::new(config, "", cancel_flag)?;
    scraper.scrape()
}

/// Perform full site scraping with progress callback
pub fn scrape_full_site_with_callback<F>(
    config: FullScrapeConfig,
    project_id: &str,
    cancel_flag: Arc<AtomicBool>,
    on_progress: F,
) -> Result<FullScrapeResult, String>
where
    F: Fn(FullScrapeProgress),
{
    let mut scraper = FullSiteScraper::new(config, project_id, cancel_flag)?;
    scraper.scrape_with_callback(on_progress)
}
