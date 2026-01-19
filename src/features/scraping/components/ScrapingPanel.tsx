import { useState } from 'react';
import {
  Globe,
  Download,
  FileText,
  Palette,
  Loader,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  X,
  Clock,
  Type,
} from 'lucide-react';
import { Button, Card, Switch } from '../../../components/ui';
import { ScrapeResult } from '../../../services/documentationService';
import { useScrapingStore } from '../../../stores';
import { Project } from '../../../types';
import { ScrapingProgress } from './ScrapingProgress';

interface ScrapingPanelProps {
  project: Project;
  projectPath: string;
  projectName: string;
  initialUrl?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  onScrapingComplete?: (result: ScrapeResult, updatedProject: Project) => void;
}

export function ScrapingPanel({
  project,
  projectPath,
  projectName,
  initialUrl = '',
  geminiApiKey,
  geminiModel,
  onScrapingComplete,
}: ScrapingPanelProps) {
  const [url, setUrl] = useState(initialUrl);
  const [showNewScraping, setShowNewScraping] = useState(false);

  // Récupérer les stats de scraping précédent depuis le projet
  const previousScraping = project.scraping;
  const hasPreviousScraping = previousScraping?.completed && previousScraping?.stats;

  // Options (local state - doesn't need to persist)
  const [downloadImages, setDownloadImages] = useState(true);
  const [downloadCss, setDownloadCss] = useState(true);
  const [extractText, setExtractText] = useState(true);
  const [maxPages, setMaxPages] = useState(50);
  const [improveTextsOption, setImproveTextsOption] = useState(!!geminiApiKey);

  // Use global scraping store
  const { getScrapingState, startScraping, resetScraping } = useScrapingStore();
  const scrapingState = getScrapingState(projectPath);
  const { stage, progress, progressMessage, result, error, logs } = scrapingState;

  const handleStartScraping = async () => {
    if (!url.trim()) return;

    await startScraping({
      projectId: projectPath,
      projectPath,
      projectName,
      url: url.trim(),
      project,
      options: {
        maxPages,
        downloadImages,
        downloadCss,
        extractText,
        improveTexts: improveTextsOption,
      },
      geminiApiKey,
      geminiModel,
      onComplete: onScrapingComplete,
    });

    // Masquer le formulaire après le lancement
    setShowNewScraping(false);
  };

  const handleReset = () => {
    resetScraping(projectPath);
  };

  const isRunning = stage !== 'idle' && stage !== 'complete' && stage !== 'error';

  // Formater la date de scraping
  const formatScrapingDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="scraping-panel">
      {/* Section: Scraping précédent */}
      {hasPreviousScraping && !showNewScraping && stage === 'idle' && (
        <div className="scraping-section">
          <h3 className="scraping-section-title">
            <CheckCircle size={16} style={{ color: 'var(--success)' }} />
            Scraping effectue
          </h3>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13, marginBottom: 8 }}>
              <Clock size={14} />
              <span>{formatScrapingDate(previousScraping.scrapedAt!)}</span>
            </div>
            {previousScraping.sourceUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                <Globe size={14} />
                <a
                  href={previousScraping.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)', textDecoration: 'none' }}
                >
                  {previousScraping.sourceUrl}
                </a>
              </div>
            )}
          </div>

          <div className="scraping-results-grid">
            <div className="scraping-result-item">
              <span className="scraping-result-value">{previousScraping.stats!.pagesCount}</span>
              <span className="scraping-result-label">Pages</span>
            </div>
            <div className="scraping-result-item">
              <span className="scraping-result-value">{previousScraping.stats!.imagesCount}</span>
              <span className="scraping-result-label">Images</span>
            </div>
            <div className="scraping-result-item">
              <span className="scraping-result-value">{previousScraping.stats!.textsCount}</span>
              <span className="scraping-result-label">Textes</span>
            </div>
            <div className="scraping-result-item">
              <span className="scraping-result-value">{previousScraping.stats!.colorsCount}</span>
              <span className="scraping-result-label">Couleurs</span>
            </div>
            <div className="scraping-result-item">
              <span className="scraping-result-value">{previousScraping.stats!.fontsCount}</span>
              <span className="scraping-result-label">Polices</span>
            </div>
          </div>

          {/* Aperçu couleurs */}
          {previousScraping.stats!.colors.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Palette size={14} />
                Couleurs detectees
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {[...new Set(previousScraping.stats!.colors)].slice(0, 20).map((color, i) => (
                  <div
                    key={i}
                    style={{
                      width: 24,
                      height: 24,
                      background: color,
                      borderRadius: 4,
                      border: '2px solid var(--border)',
                      cursor: 'pointer',
                    }}
                    title={`${color} - Cliquez pour copier`}
                    onClick={() => navigator.clipboard.writeText(color)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Aperçu polices */}
          {previousScraping.stats!.fonts.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Type size={14} />
                Polices detectees
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[...new Set(previousScraping.stats!.fonts)].map((font, i) => (
                  <span
                    key={i}
                    style={{
                      padding: '4px 8px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >
                    {font}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setShowNewScraping(true)}>
              <RefreshCw size={16} />
              Relancer un scraping
            </Button>
          </div>
        </div>
      )}

      {/* URL Input Section - visible si pas de scraping précédent ou si on veut relancer */}
      {(!hasPreviousScraping || showNewScraping || stage !== 'idle') && (
      <div className="scraping-section">
        <h3 className="scraping-section-title">
          <Globe size={16} />
          {hasPreviousScraping ? 'Nouveau scraping' : 'Scraper un site'}
        </h3>

        {hasPreviousScraping && showNewScraping && stage === 'idle' && (
          <div style={{ marginBottom: 16 }}>
            <Button variant="ghost" onClick={() => setShowNewScraping(false)} style={{ padding: '4px 8px', fontSize: 13 }}>
              <X size={14} />
              Annuler
            </Button>
          </div>
        )}

        <div className="scraping-url-input">
          <input
            className="form-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://exemple.com"
            disabled={isRunning}
          />
          {isRunning ? (
            <>
              <Button variant="primary" disabled>
                <Loader size={16} className="spinner" />
                Veuillez patienter...
              </Button>
              <Button variant="secondary" onClick={handleReset}>
                <X size={16} />
                Annuler
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              onClick={handleStartScraping}
              disabled={!url.trim() || isRunning}
            >
              <Download size={16} />
              Scraper
            </Button>
          )}
        </div>

        {/* Options */}
        {stage === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="switch-container">
              <span className="switch-label">Telecharger les images</span>
              <Switch checked={downloadImages} onChange={setDownloadImages} />
            </div>
            <div className="switch-container">
              <span className="switch-label">Telecharger les CSS</span>
              <Switch checked={downloadCss} onChange={setDownloadCss} />
            </div>
            <div className="switch-container">
              <span className="switch-label">Extraire les textes</span>
              <Switch checked={extractText} onChange={setExtractText} />
            </div>
            <div className="form-field">
              <label className="form-label">Pages maximum</label>
              <input
                className="form-input"
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(parseInt(e.target.value) || 50)}
                min={1}
                max={200}
                style={{ width: 100 }}
              />
            </div>
            {geminiApiKey && (
              <div className="switch-container">
                <span className="switch-label">
                  <Sparkles size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Ameliorer les textes avec Gemini
                </span>
                <Switch checked={improveTextsOption} onChange={setImproveTextsOption} />
              </div>
            )}
          </div>
        )}

        {/* Progress - Enhanced visual indicator */}
        {(isRunning || stage === 'complete') && (
          <ScrapingProgress
            stage={stage}
            progress={progress}
            progressMessage={progressMessage}
            showImproving={improveTextsOption && !!geminiApiKey}
          />
        )}

        {/* Warning message during scraping */}
        {isRunning && (
          <div className="scraping-patience-message" style={{ marginTop: 16 }}>
            <AlertTriangle size={14} />
            Cette operation peut prendre plusieurs minutes selon la taille du site.
            Ne fermez pas l'application.
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: 'rgba(232, 76, 76, 0.1)',
              borderRadius: 8,
              color: 'var(--error)',
            }}
          >
            <AlertTriangle size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            {error}
          </div>
        )}

        {/* Complete state actions */}
        {stage === 'complete' && (
          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <Button variant="secondary" onClick={handleReset}>
              <RefreshCw size={16} />
              Nouveau scraping
            </Button>
          </div>
        )}
      </div>
      )}

      {/* Results Section */}
      {result && (
        <div className="scraping-section">
          <h3 className="scraping-section-title">
            <CheckCircle size={16} style={{ color: 'var(--success)' }} />
            Resultats
          </h3>

          <div className="scraping-results-grid">
            <div className="scraping-result-item">
              <span className="scraping-result-value">{result.pages.length}</span>
              <span className="scraping-result-label">Pages</span>
            </div>
            <div className="scraping-result-item">
              <span className="scraping-result-value">{result.images.length}</span>
              <span className="scraping-result-label">Images</span>
            </div>
            <div className="scraping-result-item">
              <span className="scraping-result-value">{result.texts.length}</span>
              <span className="scraping-result-label">Textes</span>
            </div>
            <div className="scraping-result-item">
              <span className="scraping-result-value">{result.colors.length}</span>
              <span className="scraping-result-label">Couleurs</span>
            </div>
            <div className="scraping-result-item">
              <span className="scraping-result-value">{result.fonts.length}</span>
              <span className="scraping-result-label">Polices</span>
            </div>
          </div>

          {/* Colors preview */}
          {result.colors.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Palette size={14} />
                Couleurs detectees ({result.colors.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {[...new Set(result.colors)].map((color, i) => (
                  <div
                    key={i}
                    style={{
                      width: 24,
                      height: 24,
                      background: color,
                      borderRadius: 4,
                      border: '2px solid var(--border)',
                      cursor: 'pointer',
                    }}
                    title={`${color} - Cliquez pour copier`}
                    onClick={() => navigator.clipboard.writeText(color)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Fonts preview */}
          {result.fonts.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                }}
              >
                Polices detectees
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[...new Set(result.fonts)].map((font, i) => (
                  <span
                    key={i}
                    style={{
                      padding: '4px 8px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >
                    {font}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Log Section */}
      {logs.length > 0 && (
        <div className="scraping-section">
          <h3 className="scraping-section-title">
            <FileText size={16} />
            Journal
          </h3>
          <div className="scraping-log">
            {logs.map((log, i) => (
              <div key={i} className="scraping-log-entry">
                <span className="scraping-log-time">{log.time}</span>
                <span className={`scraping-log-message ${log.type}`}>{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info about workflow */}
      <Card title="Workflow de scraping">
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          <p style={{ marginBottom: 8 }}>
            <strong>1. Scraping →</strong> Les fichiers sont telecharges dans <code>_Inbox/scraped/</code>
          </p>
          <p style={{ marginBottom: 8 }}>
            <strong>2. Organisation →</strong> L'IA trie les fichiers :
          </p>
          <ul style={{ marginLeft: 20, marginBottom: 8 }}>
            <li>Images → <code>References/images/</code></li>
            <li>CSS → <code>References/styles/</code></li>
            <li>Textes → <code>Documentation/textes/</code></li>
          </ul>
          <p style={{ marginBottom: 8 }}>
            <strong>3. Documentation →</strong> <code>documentation.md</code> est genere dans <code>Documentation/</code>
          </p>
          <p style={{ color: 'var(--warning)' }}>
            <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Le dossier <code>www/</code> reste vide - c'est pour le <strong>nouveau</strong> site uniquement !
          </p>
        </div>
      </Card>
    </div>
  );
}
