import { invoke } from '@tauri-apps/api/tauri';
import { geminiService } from './geminiService';

interface WebpageContent {
  html: string;
  css: string | null;
}

export interface WebsiteAnalysis {
  colors: string[];
  fonts: string[];
  structure?: string;
  technologies?: string[];
}

export interface ExtractedTexts {
  title: string;
  metaDescription: string;
  headings: string[];
  paragraphs: string[];
  allTexts: string[];
}

export const scrapingService = {
  /**
   * Fetch webpage content via Tauri (bypasses CORS)
   */
  async fetchWebpage(url: string): Promise<WebpageContent> {
    return await invoke('fetch_webpage', { url });
  },

  /**
   * Extract key texts from HTML content
   */
  extractTextsFromHtml(html: string): ExtractedTexts {
    // Create a DOM parser (works in browser context)
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract title
    const title = doc.querySelector('title')?.textContent?.trim() || '';

    // Extract meta description
    const metaDescription =
      doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';

    // Extract headings (h1-h3)
    const headings: string[] = [];
    doc.querySelectorAll('h1, h2, h3').forEach((el) => {
      const text = el.textContent?.trim();
      if (text && text.length > 2 && text.length < 200) {
        headings.push(text);
      }
    });

    // Extract paragraphs
    const paragraphs: string[] = [];
    doc.querySelectorAll('p').forEach((el) => {
      const text = el.textContent?.trim();
      if (text && text.length > 20 && text.length < 1000) {
        paragraphs.push(text);
      }
    });

    // Extract all meaningful texts (limited to avoid noise)
    const allTexts: string[] = [title, metaDescription, ...headings, ...paragraphs.slice(0, 10)];

    return {
      title,
      metaDescription,
      headings: headings.slice(0, 10),
      paragraphs: paragraphs.slice(0, 15),
      allTexts: allTexts.filter(t => t.length > 0),
    };
  },

  /**
   * Fetch and extract texts from a website URL
   */
  async fetchAndExtractTexts(url: string): Promise<ExtractedTexts> {
    const content = await this.fetchWebpage(url);
    return this.extractTextsFromHtml(content.html);
  },

  /**
   * Analyze a website and extract colors, fonts, etc.
   */
  async analyzeWebsite(
    url: string,
    apiKey: string,
    model?: string
  ): Promise<WebsiteAnalysis> {
    // Fetch the webpage content
    const content = await this.fetchWebpage(url);

    // Use Gemini to analyze
    const analysis = await geminiService.analyzeWebsite(
      content.html,
      content.css,
      apiKey,
      model
    );

    return {
      colors: analysis.colors || [],
      fonts: analysis.fonts || [],
      structure: analysis.structure,
      technologies: analysis.technologies,
    };
  },
};
