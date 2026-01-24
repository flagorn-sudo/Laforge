/**
 * Full Site Scraper Component
 * UI for downloading and analyzing entire websites
 */

import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import {
  FullScrapeConfig,
  FullScrapeResult,
  ColorInfo,
  FontInfo,
  formatBytes,
  sortColorsByBrightness,
  getPrimaryColors,
} from '../services/fullSiteScraperService';
import './FullSiteScraper.css';

interface FullSiteScraperProps {
  projectPath: string;
  initialUrl?: string;
  onComplete?: (result: FullScrapeResult) => void;
  onClose?: () => void;
}

type ScraperStep = 'config' | 'scraping' | 'results';

export const FullSiteScraper: React.FC<FullSiteScraperProps> = ({
  projectPath,
  initialUrl = '',
  onComplete,
  onClose,
}) => {
  const [step, setStep] = useState<ScraperStep>('config');
  const [url, setUrl] = useState(initialUrl);
  const [maxPages, setMaxPages] = useState(50);
  const [downloadImages, setDownloadImages] = useState(true);
  const [downloadCss, setDownloadCss] = useState(true);
  const [downloadJs, setDownloadJs] = useState(true);
  const [downloadFonts, setDownloadFonts] = useState(true);
  const [rewriteUrls, setRewriteUrls] = useState(true);
  const [generateReport, setGenerateReport] = useState(true);

  const [, setIsLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<FullScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const outputPath = `${projectPath}/References`;

  const handleStartScraping = async () => {
    if (!url) {
      setError('Veuillez entrer une URL');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStep('scraping');
    setProgress('Initialisation du scraping...');

    try {
      const config: FullScrapeConfig = {
        url: url.startsWith('http') ? url : `https://${url}`,
        outputPath,
        maxPages,
        downloadImages,
        downloadCss,
        downloadJs,
        downloadFonts,
        rewriteUrls,
        generateReport,
      };

      setProgress('Telechargement en cours...');

      const scrapeResult = await invoke<FullScrapeResult>('scrape_full_site', { config });

      setResult(scrapeResult);
      setStep('results');

      if (onComplete) {
        onComplete(scrapeResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('config');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenInBrowser = () => {
    if (result?.index_path) {
      invoke('open_in_finder', { path: result.output_path });
    }
  };

  const handleOpenReport = () => {
    if (result?.report_path) {
      invoke('open_in_finder', { path: result.report_path });
    }
  };

  return (
    <div className="full-site-scraper">
      {/* Header */}
      <div className="scraper-header">
        <h3>Telecharger le site complet</h3>
        {onClose && (
          <button className="btn-close" onClick={onClose}>
            ×
          </button>
        )}
      </div>

      {/* Configuration Step */}
      {step === 'config' && (
        <div className="scraper-config">
          <div className="form-group">
            <label>URL du site a telecharger</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="url-input"
            />
          </div>

          <div className="form-group">
            <label>Nombre maximum de pages</label>
            <input
              type="number"
              value={maxPages}
              onChange={(e) => setMaxPages(parseInt(e.target.value) || 50)}
              min={1}
              max={500}
            />
          </div>

          <div className="options-grid">
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={downloadImages}
                onChange={(e) => setDownloadImages(e.target.checked)}
              />
              <span>Telecharger les images</span>
            </label>

            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={downloadCss}
                onChange={(e) => setDownloadCss(e.target.checked)}
              />
              <span>Telecharger les CSS</span>
            </label>

            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={downloadJs}
                onChange={(e) => setDownloadJs(e.target.checked)}
              />
              <span>Telecharger les JS</span>
            </label>

            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={downloadFonts}
                onChange={(e) => setDownloadFonts(e.target.checked)}
              />
              <span>Telecharger les polices</span>
            </label>

            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={rewriteUrls}
                onChange={(e) => setRewriteUrls(e.target.checked)}
              />
              <span>Adapter les liens (local)</span>
            </label>

            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={generateReport}
                onChange={(e) => setGenerateReport(e.target.checked)}
              />
              <span>Generer un rapport</span>
            </label>
          </div>

          <div className="output-info">
            <span className="label">Dossier de sortie:</span>
            <span className="path">{outputPath}</span>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="actions">
            <button className="btn-primary" onClick={handleStartScraping} disabled={!url}>
              Demarrer le scraping
            </button>
          </div>
        </div>
      )}

      {/* Scraping in Progress */}
      {step === 'scraping' && (
        <div className="scraper-progress">
          <div className="progress-spinner"></div>
          <p className="progress-message">{progress}</p>
          <p className="progress-hint">
            Cette operation peut prendre plusieurs minutes selon la taille du site
          </p>
        </div>
      )}

      {/* Results Step */}
      {step === 'results' && result && (
        <div className="scraper-results">
          {/* Summary */}
          <div className="result-summary">
            <div className={`status-badge ${result.success ? 'success' : 'warning'}`}>
              {result.success ? 'Termine' : 'Termine avec erreurs'}
            </div>

            <div className="stats-row">
              <div className="stat">
                <span className="stat-value">{result.pages_downloaded}</span>
                <span className="stat-label">Pages</span>
              </div>
              <div className="stat">
                <span className="stat-value">{result.assets_downloaded}</span>
                <span className="stat-label">Assets</span>
              </div>
              <div className="stat">
                <span className="stat-value">{formatBytes(result.total_size_bytes)}</span>
                <span className="stat-label">Taille totale</span>
              </div>
            </div>
          </div>

          {/* Design System */}
          <div className="design-system-section">
            <h4>Charte graphique detectee</h4>

            {/* Colors */}
            {result.design_system.colors.length > 0 && (
              <div className="colors-section">
                <h5>Couleurs ({result.design_system.colors.length})</h5>
                <div className="color-palette">
                  {sortColorsByBrightness(result.design_system.colors)
                    .slice(0, 12)
                    .map((color, idx) => (
                      <ColorSwatch key={idx} color={color} />
                    ))}
                </div>

                <div className="primary-colors">
                  <span className="label">Couleurs principales:</span>
                  <div className="primary-palette">
                    {getPrimaryColors(result.design_system.colors).map((color, idx) => (
                      <ColorSwatch key={idx} color={color} showHex />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Fonts */}
            {result.design_system.fonts.length > 0 && (
              <div className="fonts-section">
                <h5>Polices ({result.design_system.fonts.length})</h5>
                <div className="fonts-list">
                  {result.design_system.fonts.map((font, idx) => (
                    <FontItem key={idx} font={font} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="warnings-section">
              <h5>Avertissements ({result.warnings.length})</h5>
              <ul className="warnings-list">
                {result.warnings.slice(0, 5).map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
                {result.warnings.length > 5 && (
                  <li className="more">+ {result.warnings.length - 5} autres</li>
                )}
              </ul>
            </div>
          )}

          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="errors-section">
              <h5>Erreurs ({result.errors.length})</h5>
              <ul className="errors-list">
                {result.errors.slice(0, 5).map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
                {result.errors.length > 5 && (
                  <li className="more">+ {result.errors.length - 5} autres</li>
                )}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="result-actions">
            <button className="btn-primary" onClick={handleOpenInBrowser}>
              Ouvrir le dossier
            </button>
            {result.report_path && (
              <button className="btn-secondary" onClick={handleOpenReport}>
                Voir le rapport
              </button>
            )}
            <button className="btn-secondary" onClick={() => setStep('config')}>
              Nouveau scraping
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Color Swatch Component
const ColorSwatch: React.FC<{ color: ColorInfo; showHex?: boolean }> = ({ color, showHex }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(color.hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`color-swatch ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
      title={`${color.hex} - ${color.occurrences} occurrences - Cliquer pour copier`}
    >
      <div className="swatch-color" style={{ backgroundColor: color.hex }} />
      {showHex && <span className="swatch-hex">{color.hex}</span>}
      {copied && <span className="copied-indicator">Copie!</span>}
    </div>
  );
};

// Font Item Component
const FontItem: React.FC<{ font: FontInfo }> = ({ font }) => {
  return (
    <div className="font-item">
      <span className="font-name" style={{ fontFamily: font.family }}>
        {font.family}
      </span>
      <span className="font-source">{font.source}</span>
      {font.weights.length > 0 && (
        <span className="font-weights">{font.weights.join(', ')}</span>
      )}
    </div>
  );
};

export default FullSiteScraper;
