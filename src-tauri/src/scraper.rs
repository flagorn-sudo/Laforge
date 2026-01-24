use reqwest::blocking::Client;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::time::Duration;
use url::Url;

/// Result of scraping a website
#[derive(Debug, Clone, Serialize)]
pub struct ScrapeResult {
    pub pages: Vec<ScrapedPage>,
    pub images: Vec<ScrapedAsset>,
    pub stylesheets: Vec<ScrapedAsset>,
    pub fonts: Vec<String>,
    pub colors: Vec<String>,
    pub texts: Vec<ExtractedText>,
    pub site_structure: Vec<SiteLink>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScrapedPage {
    pub url: String,
    pub title: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScrapedAsset {
    pub url: String,
    pub local_path: String,
    pub file_type: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExtractedText {
    pub page_url: String,
    pub element_type: String, // h1, h2, p, etc.
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SiteLink {
    pub from_page: String,
    pub to_page: String,
    pub link_text: String,
}

/// Configuration for scraping
#[derive(Debug, Clone, Deserialize)]
pub struct ScrapeConfig {
    pub url: String,
    pub output_path: String,
    pub max_pages: Option<u32>,
    pub download_images: bool,
    pub download_css: bool,
    pub extract_text: bool,
}

/// Scraper state for tracking progress
pub struct Scraper {
    client: Client,
    base_url: Url,
    visited_urls: HashSet<String>,
    config: ScrapeConfig,
}

impl Scraper {
    pub fn new(config: ScrapeConfig) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let base_url = Url::parse(&config.url)
            .map_err(|e| format!("Invalid URL: {}", e))?;

        Ok(Self {
            client,
            base_url,
            visited_urls: HashSet::new(),
            config,
        })
    }

    pub fn scrape(&mut self) -> Result<ScrapeResult, String> {
        let mut result = ScrapeResult {
            pages: Vec::new(),
            images: Vec::new(),
            stylesheets: Vec::new(),
            fonts: Vec::new(),
            colors: HashSet::new().into_iter().collect(),
            texts: Vec::new(),
            site_structure: Vec::new(),
            errors: Vec::new(),
        };

        let mut colors_set: HashSet<String> = HashSet::new();
        let mut fonts_set: HashSet<String> = HashSet::new();
        let mut urls_to_visit = vec![self.config.url.clone()];
        let max_pages = self.config.max_pages.unwrap_or(50) as usize;

        // Create output directories
        let base_output = Path::new(&self.config.output_path);
        let scraped_dir = base_output.join("scraped");
        let images_dir = scraped_dir.join("images");
        let css_dir = scraped_dir.join("css");
        let texts_dir = scraped_dir.join("texts");

        fs::create_dir_all(&images_dir).ok();
        fs::create_dir_all(&css_dir).ok();
        fs::create_dir_all(&texts_dir).ok();

        while let Some(url) = urls_to_visit.pop() {
            if self.visited_urls.len() >= max_pages {
                break;
            }

            if self.visited_urls.contains(&url) {
                continue;
            }

            // Only visit pages from the same domain
            if let Ok(parsed_url) = Url::parse(&url) {
                if parsed_url.host_str() != self.base_url.host_str() {
                    continue;
                }
            }

            self.visited_urls.insert(url.clone());

            match self.scrape_page(&url) {
                Ok(page_result) => {
                    // Add page
                    result.pages.push(page_result.page);

                    // Add new URLs to visit
                    for link in &page_result.links {
                        if !self.visited_urls.contains(&link.to_page) {
                            urls_to_visit.push(link.to_page.clone());
                        }
                    }
                    result.site_structure.extend(page_result.links);

                    // Process images
                    if self.config.download_images {
                        for image_url in page_result.images {
                            match self.download_asset(&image_url, &images_dir, "image") {
                                Ok(asset) => result.images.push(asset),
                                Err(e) => result.errors.push(e),
                            }
                        }
                    }

                    // Process CSS and extract colors/fonts
                    if self.config.download_css {
                        for css_url in page_result.stylesheets {
                            match self.download_and_analyze_css(&css_url, &css_dir) {
                                Ok((asset, new_colors, new_fonts)) => {
                                    result.stylesheets.push(asset);
                                    colors_set.extend(new_colors);
                                    fonts_set.extend(new_fonts);
                                }
                                Err(e) => result.errors.push(e),
                            }
                        }
                    }

                    // Extract text
                    if self.config.extract_text {
                        result.texts.extend(page_result.texts);
                    }

                    // Inline styles colors
                    colors_set.extend(page_result.inline_colors);
                }
                Err(e) => {
                    result.errors.push(format!("Failed to scrape {}: {}", url, e));
                }
            }
        }

        result.colors = colors_set.into_iter().collect();
        result.fonts = fonts_set.into_iter().collect();

        // Save extracted texts to file
        if !result.texts.is_empty() {
            if let Err(e) = self.save_texts(&result.texts, &texts_dir) {
                result.errors.push(format!("Failed to save texts: {}", e));
            }
        }

        Ok(result)
    }

    /// Scrape with progress callback for real-time updates
    pub fn scrape_with_callback<F>(&mut self, on_progress: &mut F) -> Result<ScrapeResult, String>
    where
        F: FnMut(ScrapeProgress),
    {
        let mut result = ScrapeResult {
            pages: Vec::new(),
            images: Vec::new(),
            stylesheets: Vec::new(),
            fonts: Vec::new(),
            colors: HashSet::new().into_iter().collect(),
            texts: Vec::new(),
            site_structure: Vec::new(),
            errors: Vec::new(),
        };

        let mut colors_set: HashSet<String> = HashSet::new();
        let mut fonts_set: HashSet<String> = HashSet::new();
        let mut urls_to_visit = vec![self.config.url.clone()];
        let max_pages = self.config.max_pages.unwrap_or(50) as usize;

        // Create output directories
        let base_output = Path::new(&self.config.output_path);
        let scraped_dir = base_output.join("scraped");
        let images_dir = scraped_dir.join("images");
        let css_dir = scraped_dir.join("css");
        let texts_dir = scraped_dir.join("texts");

        fs::create_dir_all(&images_dir).ok();
        fs::create_dir_all(&css_dir).ok();
        fs::create_dir_all(&texts_dir).ok();

        let mut images_count = 0usize;
        let mut css_count = 0usize;

        // Emit start event
        on_progress(ScrapeProgress {
            event_type: "start".to_string(),
            url: Some(self.config.url.clone()),
            title: None,
            pages_scraped: 0,
            pages_total: max_pages,
            images_downloaded: 0,
            css_downloaded: 0,
            progress_percent: 0.0,
            message: format!("Demarrage du scraping de {}", self.config.url),
        });

        while let Some(url) = urls_to_visit.pop() {
            if self.visited_urls.len() >= max_pages {
                break;
            }

            if self.visited_urls.contains(&url) {
                continue;
            }

            // Only visit pages from the same domain
            if let Ok(parsed_url) = Url::parse(&url) {
                if parsed_url.host_str() != self.base_url.host_str() {
                    continue;
                }
            }

            self.visited_urls.insert(url.clone());

            // Emit page start event
            let progress = (self.visited_urls.len() as f32 / max_pages as f32 * 100.0).min(100.0);
            on_progress(ScrapeProgress {
                event_type: "page_start".to_string(),
                url: Some(url.clone()),
                title: None,
                pages_scraped: self.visited_urls.len(),
                pages_total: max_pages,
                images_downloaded: images_count,
                css_downloaded: css_count,
                progress_percent: progress,
                message: format!("Scraping: {}", url),
            });

            match self.scrape_page(&url) {
                Ok(page_result) => {
                    let page_title = page_result.page.title.clone();
                    result.pages.push(page_result.page);

                    // Add new URLs to visit
                    for link in &page_result.links {
                        if !self.visited_urls.contains(&link.to_page) {
                            urls_to_visit.push(link.to_page.clone());
                        }
                    }
                    result.site_structure.extend(page_result.links);

                    // Process images
                    if self.config.download_images {
                        for image_url in page_result.images {
                            match self.download_asset(&image_url, &images_dir, "image") {
                                Ok(asset) => {
                                    result.images.push(asset);
                                    images_count += 1;
                                    on_progress(ScrapeProgress {
                                        event_type: "image_download".to_string(),
                                        url: Some(image_url),
                                        title: None,
                                        pages_scraped: self.visited_urls.len(),
                                        pages_total: max_pages,
                                        images_downloaded: images_count,
                                        css_downloaded: css_count,
                                        progress_percent: progress,
                                        message: format!("Image telechargee: {}", images_count),
                                    });
                                }
                                Err(e) => result.errors.push(e),
                            }
                        }
                    }

                    // Process CSS and extract colors/fonts
                    if self.config.download_css {
                        for css_url in page_result.stylesheets {
                            match self.download_and_analyze_css(&css_url, &css_dir) {
                                Ok((asset, new_colors, new_fonts)) => {
                                    result.stylesheets.push(asset);
                                    colors_set.extend(new_colors);
                                    fonts_set.extend(new_fonts);
                                    css_count += 1;
                                    on_progress(ScrapeProgress {
                                        event_type: "css_download".to_string(),
                                        url: Some(css_url),
                                        title: None,
                                        pages_scraped: self.visited_urls.len(),
                                        pages_total: max_pages,
                                        images_downloaded: images_count,
                                        css_downloaded: css_count,
                                        progress_percent: progress,
                                        message: format!("CSS telecharge: {}", css_count),
                                    });
                                }
                                Err(e) => result.errors.push(e),
                            }
                        }
                    }

                    // Extract text
                    if self.config.extract_text {
                        result.texts.extend(page_result.texts);
                    }

                    // Inline styles colors
                    colors_set.extend(page_result.inline_colors);

                    // Emit page complete event
                    on_progress(ScrapeProgress {
                        event_type: "page_complete".to_string(),
                        url: Some(url.clone()),
                        title: Some(page_title),
                        pages_scraped: self.visited_urls.len(),
                        pages_total: max_pages,
                        images_downloaded: images_count,
                        css_downloaded: css_count,
                        progress_percent: progress,
                        message: format!("Page {} / {}", self.visited_urls.len(), max_pages),
                    });
                }
                Err(e) => {
                    result.errors.push(format!("Failed to scrape {}: {}", url, e));
                    on_progress(ScrapeProgress {
                        event_type: "error".to_string(),
                        url: Some(url.clone()),
                        title: None,
                        pages_scraped: self.visited_urls.len(),
                        pages_total: max_pages,
                        images_downloaded: images_count,
                        css_downloaded: css_count,
                        progress_percent: progress,
                        message: format!("Erreur: {}", e),
                    });
                }
            }
        }

        result.colors = colors_set.into_iter().collect();
        result.fonts = fonts_set.into_iter().collect();

        // Save extracted texts to file
        if !result.texts.is_empty() {
            if let Err(e) = self.save_texts(&result.texts, &texts_dir) {
                result.errors.push(format!("Failed to save texts: {}", e));
            }
        }

        // Emit complete event
        on_progress(ScrapeProgress {
            event_type: "complete".to_string(),
            url: None,
            title: None,
            pages_scraped: result.pages.len(),
            pages_total: result.pages.len(),
            images_downloaded: images_count,
            css_downloaded: css_count,
            progress_percent: 100.0,
            message: format!(
                "Scraping termine: {} pages, {} images, {} CSS",
                result.pages.len(),
                images_count,
                css_count
            ),
        });

        Ok(result)
    }

    fn scrape_page(&self, url: &str) -> Result<PageScrapeResult, String> {
        let response = self.client.get(url).send()
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("HTTP error: {}", response.status()));
        }

        let html = response.text()
            .map_err(|e| format!("Failed to read response: {}", e))?;

        let document = Html::parse_document(&html);
        let base_url = Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;

        // Extract title
        let title_selector = Selector::parse("title").unwrap();
        let title = document
            .select(&title_selector)
            .next()
            .map(|el| el.text().collect::<String>())
            .unwrap_or_else(|| "Untitled".to_string());

        // Extract links
        let link_selector = Selector::parse("a[href]").unwrap();
        let mut links = Vec::new();
        for element in document.select(&link_selector) {
            if let Some(href) = element.value().attr("href") {
                if let Ok(absolute_url) = base_url.join(href) {
                    let link_text = element.text().collect::<String>().trim().to_string();
                    links.push(SiteLink {
                        from_page: url.to_string(),
                        to_page: absolute_url.to_string(),
                        link_text,
                    });
                }
            }
        }

        // Extract images
        let img_selector = Selector::parse("img[src]").unwrap();
        let mut images = Vec::new();
        for element in document.select(&img_selector) {
            if let Some(src) = element.value().attr("src") {
                if let Ok(absolute_url) = base_url.join(src) {
                    images.push(absolute_url.to_string());
                }
            }
        }

        // Extract stylesheets
        let css_selector = Selector::parse("link[rel='stylesheet'][href]").unwrap();
        let mut stylesheets = Vec::new();
        for element in document.select(&css_selector) {
            if let Some(href) = element.value().attr("href") {
                if let Ok(absolute_url) = base_url.join(href) {
                    stylesheets.push(absolute_url.to_string());
                }
            }
        }

        // Extract text content
        let mut texts = Vec::new();
        let text_selectors = [
            ("h1", "h1"),
            ("h2", "h2"),
            ("h3", "h3"),
            ("p", "p"),
            ("li", "li"),
        ];

        for (selector_str, element_type) in text_selectors {
            let selector = Selector::parse(selector_str).unwrap();
            for element in document.select(&selector) {
                let content: String = element.text().collect::<String>().trim().to_string();
                if !content.is_empty() && content.len() > 10 {
                    texts.push(ExtractedText {
                        page_url: url.to_string(),
                        element_type: element_type.to_string(),
                        content,
                    });
                }
            }
        }

        // Extract inline style colors
        let style_selector = Selector::parse("[style]").unwrap();
        let mut inline_colors = Vec::new();
        let color_regex_patterns = [
            r"#[0-9a-fA-F]{3,6}",
            r"rgb\s*\([^)]+\)",
            r"rgba\s*\([^)]+\)",
        ];

        for element in document.select(&style_selector) {
            if let Some(style) = element.value().attr("style") {
                for pattern in &color_regex_patterns {
                    // Simple color extraction (not full regex to avoid dependency)
                    if style.contains('#') {
                        for word in style.split([' ', ';', ':']) {
                            if word.starts_with('#') && word.len() >= 4 && word.len() <= 7 {
                                inline_colors.push(word.to_string());
                            }
                        }
                    }
                }
            }
        }

        let page_path = base_url.path().to_string();

        Ok(PageScrapeResult {
            page: ScrapedPage {
                url: url.to_string(),
                title,
                path: page_path,
            },
            links,
            images,
            stylesheets,
            texts,
            inline_colors,
        })
    }

    fn download_asset(&self, url: &str, output_dir: &Path, asset_type: &str) -> Result<ScrapedAsset, String> {
        let response = self.client.get(url).send()
            .map_err(|e| format!("Failed to download {}: {}", url, e))?;

        if !response.status().is_success() {
            return Err(format!("HTTP error downloading {}: {}", url, response.status()));
        }

        // Generate filename from URL
        let parsed_url = Url::parse(url).map_err(|e| e.to_string())?;
        let path_segments: Vec<&str> = parsed_url.path_segments()
            .map(|s| s.collect())
            .unwrap_or_default();

        let filename = path_segments.last()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("{}_{}", asset_type, self.visited_urls.len()));

        // Ensure unique filename
        let safe_filename = sanitize_filename(&filename);
        let local_path = output_dir.join(&safe_filename);

        // Don't re-download if exists
        if local_path.exists() {
            return Ok(ScrapedAsset {
                url: url.to_string(),
                local_path: local_path.to_string_lossy().to_string(),
                file_type: asset_type.to_string(),
            });
        }

        let bytes = response.bytes()
            .map_err(|e| format!("Failed to read bytes: {}", e))?;

        let mut file = File::create(&local_path)
            .map_err(|e| format!("Failed to create file: {}", e))?;

        file.write_all(&bytes)
            .map_err(|e| format!("Failed to write file: {}", e))?;

        Ok(ScrapedAsset {
            url: url.to_string(),
            local_path: local_path.to_string_lossy().to_string(),
            file_type: asset_type.to_string(),
        })
    }

    fn download_and_analyze_css(&self, url: &str, output_dir: &Path) -> Result<(ScrapedAsset, Vec<String>, Vec<String>), String> {
        let response = self.client.get(url).send()
            .map_err(|e| format!("Failed to download CSS {}: {}", url, e))?;

        if !response.status().is_success() {
            return Err(format!("HTTP error downloading CSS {}: {}", url, response.status()));
        }

        let css_content = response.text()
            .map_err(|e| format!("Failed to read CSS: {}", e))?;

        // Extract colors from CSS
        let mut colors = Vec::new();
        for word in css_content.split([' ', ';', ':', '{', '}', '\n', '\r']) {
            let trimmed = word.trim();
            // Hex colors
            if trimmed.starts_with('#') && (trimmed.len() == 4 || trimmed.len() == 7) {
                if trimmed.chars().skip(1).all(|c| c.is_ascii_hexdigit()) {
                    colors.push(trimmed.to_string());
                }
            }
        }

        // Extract fonts from CSS
        let mut fonts = Vec::new();
        let css_lower = css_content.to_lowercase();
        if css_lower.contains("font-family") {
            for line in css_content.lines() {
                if line.to_lowercase().contains("font-family") {
                    // Extract font names (simplified)
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
                                && !font_name.contains("sans-serif")
                                && !font_name.contains("serif")
                                && !font_name.contains("monospace")
                                && !font_name.contains("inherit")
                            {
                                fonts.push(font_name);
                            }
                        }
                    }
                }
            }
        }

        // Save CSS file
        let parsed_url = Url::parse(url).map_err(|e| e.to_string())?;
        let filename = parsed_url.path_segments()
            .and_then(|s| s.last())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "styles.css".to_string());

        let safe_filename = sanitize_filename(&filename);
        let local_path = output_dir.join(&safe_filename);

        let mut file = File::create(&local_path)
            .map_err(|e| format!("Failed to create CSS file: {}", e))?;

        file.write_all(css_content.as_bytes())
            .map_err(|e| format!("Failed to write CSS file: {}", e))?;

        let asset = ScrapedAsset {
            url: url.to_string(),
            local_path: local_path.to_string_lossy().to_string(),
            file_type: "stylesheet".to_string(),
        };

        Ok((asset, colors, fonts))
    }

    fn save_texts(&self, texts: &[ExtractedText], output_dir: &Path) -> Result<(), String> {
        let mut content = String::new();
        let mut current_page = String::new();

        for text in texts {
            if text.page_url != current_page {
                current_page = text.page_url.clone();
                content.push_str(&format!("\n\n=== {} ===\n\n", current_page));
            }

            match text.element_type.as_str() {
                "h1" => content.push_str(&format!("# {}\n\n", text.content)),
                "h2" => content.push_str(&format!("## {}\n\n", text.content)),
                "h3" => content.push_str(&format!("### {}\n\n", text.content)),
                _ => content.push_str(&format!("{}\n\n", text.content)),
            }
        }

        let output_path = output_dir.join("extracted_texts.md");
        let mut file = File::create(&output_path)
            .map_err(|e| format!("Failed to create texts file: {}", e))?;

        file.write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write texts file: {}", e))?;

        Ok(())
    }
}

struct PageScrapeResult {
    page: ScrapedPage,
    links: Vec<SiteLink>,
    images: Vec<String>,
    stylesheets: Vec<String>,
    texts: Vec<ExtractedText>,
    inline_colors: Vec<String>,
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

// Progress callback data
#[derive(Debug, Clone, Serialize)]
pub struct ScrapeProgress {
    pub event_type: String,  // "page_start", "page_complete", "image_download", "css_download", "complete", "error"
    pub url: Option<String>,
    pub title: Option<String>,
    pub pages_scraped: usize,
    pub pages_total: usize,
    pub images_downloaded: usize,
    pub css_downloaded: usize,
    pub progress_percent: f32,
    pub message: String,
}

// Tauri command to start scraping
pub fn scrape_website(config: ScrapeConfig) -> Result<ScrapeResult, String> {
    let mut scraper = Scraper::new(config)?;
    scraper.scrape()
}

// Scrape with progress callback for real-time updates
pub fn scrape_website_with_callback<F>(config: ScrapeConfig, mut on_progress: F) -> Result<ScrapeResult, String>
where
    F: FnMut(ScrapeProgress),
{
    let mut scraper = Scraper::new(config)?;
    scraper.scrape_with_callback(&mut on_progress)
}
