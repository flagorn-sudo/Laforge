/**
 * Unified Scraping Page Component
 * Combines ScrapingPanel and FullSiteScraper functionality
 * with real-time progress tracking and beautiful UI
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import {
  ArrowLeft,
  Globe,
  Download,
  FileText,
  Palette,
  Loader,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Clock,
  HardDrive,
  FolderDown,
  FolderOpen,
  FileCode,
  Image as ImageIcon,
  Type,
  X,
  Trash2,
  Check,
  ExternalLink,
} from 'lucide-react';
import { Button, Switch } from './ui';
import { Project } from '../types';
import { projectService } from '../services/projectService';
import {
  FullScrapeConfig,
  FullScrapeResult,
  FullScrapeProgress,
  ColorInfo,
  FontInfo,
  formatBytes,
  sortColorsByBrightness,
  getPrimaryColors,
  scrapeFullSiteWithEvents,
  cancelFullSiteScrape,
} from '../services/fullSiteScraperService';
import './ScrapingPage.css';

interface ScrapingPageProps {
  project: Project;
  projectPath: string;
  geminiApiKey?: string;
  geminiModel?: string;
  /** If provided, shows as full page with back button. If not, shows as embedded content. */
  onBack?: () => void;
  onComplete?: (result: FullScrapeResult, updatedProject: Project) => void;
  /** Whether to show as embedded content without page header */
  embedded?: boolean;
}

interface LogEntry {
  id: number;
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'page' | 'asset' | 'warning';
  url?: string;
}

type ScrapingStep = 'idle' | 'config' | 'scraping' | 'results' | 'error';

export function ScrapingPage({
  project,
  projectPath,
  geminiApiKey: _geminiApiKey,
  geminiModel: _geminiModel,
  onBack,
  onComplete,
  embedded = false,
}: ScrapingPageProps) {
  // Silence unused variable warnings - these are available for future Gemini integration
  void _geminiApiKey;
  void _geminiModel;
  // URL and step state
  const [url, setUrl] = useState(project.urls.currentSite || '');
  const [step, setStep] = useState<ScrapingStep>('idle');

  // Configuration options
  const [maxPages, setMaxPages] = useState(50);
  const [downloadImages, setDownloadImages] = useState(true);
  const [downloadCss, setDownloadCss] = useState(true);
  const [downloadJs, setDownloadJs] = useState(true);
  const [downloadFonts, setDownloadFonts] = useState(true);
  const [rewriteUrls, setRewriteUrls] = useState(true);
  const [generateReport, setGenerateReport] = useState(true);

  // Progress state
  const [progress, setProgress] = useState<FullScrapeProgress | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<FullScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logIdCounter = useRef(0);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Previous scraping info
  const previousScraping = project.scraping;
  const hasPreviousScraping = previousScraping?.completed && previousScraping?.stats;

  // Output path
  const outputPath = `${projectPath}/References`;

  // Auto-scroll logs
  const scrollToBottom = useCallback(() => {
    if (!logsContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    if (isNearBottom) {
      logsContainerRef.current.scrollTop = scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [logs, scrollToBottom]);

  // Listen for full scrape progress events
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      unlisten = await listen<FullScrapeProgress>('full-scrape-progress', (event) => {
        const data = event.payload;
        if (data.project_id !== projectPath) return;

        setProgress(data);

        // Add log entry based on event type
        const time = new Date().toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        let logType: LogEntry['type'] = 'info';
        if (data.event_type === 'page_complete') logType = 'page';
        else if (data.event_type === 'asset_download') logType = 'asset';
        else if (data.event_type === 'complete') logType = 'success';
        else if (data.event_type === 'error') logType = 'error';

        // Only add meaningful log entries
        if (['page_start', 'page_complete', 'asset_download', 'complete', 'error', 'analyzing', 'rewriting'].includes(data.event_type)) {
          setLogs(prev => [...prev, {
            id: logIdCounter.current++,
            time,
            message: data.message,
            type: logType,
            url: data.current_url || undefined,
          }]);
        }
      });
    };

    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, [projectPath]);

  const addLog = (message: string, type: LogEntry['type'] = 'info', url?: string) => {
    const time = new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    setLogs(prev => [...prev, {
      id: logIdCounter.current++,
      time,
      message,
      type,
      url,
    }]);
  };

  const resetState = () => {
    setLogs([]);
    setResult(null);
    setError(null);
    setProgress(null);
  };

  const handleStartScraping = async () => {
    if (!url.trim()) return;

    resetState();
    setStep('scraping');
    addLog(`Demarrage du scraping de ${url}`, 'info');

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

      const scrapeResult = await scrapeFullSiteWithEvents(config, projectPath);

      setResult(scrapeResult);
      setStep('results');
      addLog('Scraping termine avec succes', 'success');

      // Update project with extracted design system
      if (scrapeResult.success && scrapeResult.design_system && onComplete) {
        const newColors = scrapeResult.design_system.colors.map(c => c.hex);
        const newFonts = scrapeResult.design_system.fonts.map(f => f.family);

        const updatedProject: Project = {
          ...project,
          colors: [...new Set([...project.colors, ...newColors])],
          fonts: [...new Set([...project.fonts, ...newFonts])],
          scraping: {
            completed: true,
            scrapedAt: new Date().toISOString(),
            sourceUrl: config.url,
            stats: {
              pagesCount: scrapeResult.pages_downloaded,
              imagesCount: scrapeResult.assets_downloaded,
              textsCount: 0,
              colorsCount: newColors.length,
              fontsCount: newFonts.length,
              colors: newColors,
              fonts: newFonts,
            },
          },
          updated: new Date().toISOString(),
        };

        await projectService.saveProject(updatedProject);
        onComplete(scrapeResult, updatedProject);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      addLog(`Erreur: ${errorMsg}`, 'error');
      setStep('error');
    }
  };

  const handleCancel = async () => {
    await cancelFullSiteScrape(projectPath);
    resetState();
    setStep('idle');
  };

  const handleNewScraping = () => {
    resetState();
    setStep('config');
  };

  const handleBackToIdle = () => {
    resetState();
    setStep('idle');
  };

  const handleOpenFolder = () => {
    if (result?.output_path) {
      invoke('open_in_finder', { path: result.output_path });
    }
  };

  const handleOpenReport = () => {
    if (result?.report_path) {
      invoke('open_in_finder', { path: result.report_path });
    }
  };

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteScrapingData = async () => {
    setIsDeleting(true);
    try {
      if (deleteFiles) {
        const referencesPath = `${projectPath}/References`;
        try {
          await invoke('delete_folder', { path: referencesPath, recursive: true });
        } catch (e) {
          console.log('No references folder to delete');
        }
      }

      const updatedProject: Project = {
        ...project,
        scraping: { completed: false },
        colors: deleteFiles ? [] : project.colors,
        fonts: deleteFiles ? [] : project.fonts,
        updated: new Date().toISOString(),
      };
      await projectService.saveProject(updatedProject);

      if (onComplete) {
        onComplete({
          success: true,
          pages_downloaded: 0,
          assets_downloaded: 0,
          total_size_bytes: 0,
          output_path: '',
          index_path: '',
          design_system: { colors: [], fonts: [], typography: { base_font_size: null, headings: {}, body_line_height: null }, spacing: [], breakpoints: [] },
          report_path: null,
          errors: [],
          warnings: [],
        }, updatedProject);
      }

      setShowDeleteModal(false);
      setDeleteFiles(false);
      setStep('config');
    } catch (err) {
      console.error('Error deleting scraping data:', err);
    } finally {
      setIsDeleting(false);
    }
  };

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

  const getLogIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'page': return <Globe size={12} />;
      case 'asset': return <ImageIcon size={12} />;
      case 'success': return <CheckCircle size={12} />;
      case 'error': return <AlertTriangle size={12} />;
      case 'warning': return <AlertTriangle size={12} />;
      default: return <FileText size={12} />;
    }
  };

  const showConfig = step === 'config' || (step === 'idle' && !hasPreviousScraping);
  const showPreviousResults = step === 'idle' && hasPreviousScraping;

  return (
    <div className={`scraping-page ${embedded ? 'scraping-page-embedded' : ''}`}>
      {/* Header - only show when not embedded */}
      {!embedded && onBack && (
        <div className="scraping-page-header">
          <button className="back-button" onClick={onBack}>
            <ArrowLeft size={20} />
          </button>
          <div className="header-info">
            <h1>Analyse du site</h1>
            <span className="project-name">{project.name}</span>
          </div>
        </div>
      )}

      <div className={`scraping-page-content ${embedded ? 'scraping-page-content-embedded' : ''}`}>
        {/* Previous scraping results */}
        {showPreviousResults && (
          <section className="scraping-section scraping-previous">
            <div className="section-header">
              <h2>
                <CheckCircle size={20} className="icon-success" />
                Analyse effectuee
              </h2>
            </div>

            <div className="scraping-meta">
              <div className="meta-item">
                <Clock size={16} />
                <span>{formatScrapingDate(previousScraping!.scrapedAt!)}</span>
              </div>
              {previousScraping!.sourceUrl && (
                <div className="meta-item">
                  <Globe size={16} />
                  <a href={previousScraping!.sourceUrl} target="_blank" rel="noopener noreferrer">
                    {previousScraping!.sourceUrl}
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-value">{previousScraping!.stats!.pagesCount}</span>
                <span className="stat-label">Pages</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{previousScraping!.stats!.imagesCount}</span>
                <span className="stat-label">Assets</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{previousScraping!.stats!.colorsCount}</span>
                <span className="stat-label">Couleurs</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{previousScraping!.stats!.fonts?.length || 0}</span>
                <span className="stat-label">Polices</span>
              </div>
            </div>

            {/* Colors */}
            {previousScraping!.stats!.colors && previousScraping!.stats!.colors.length > 0 && (
              <div className="design-section">
                <h3>
                  <Palette size={16} />
                  Couleurs detectees
                </h3>
                <div className="color-palette">
                  {[...new Set(previousScraping!.stats!.colors)].slice(0, 20).map((color, i) => (
                    <ColorSwatch key={i} hex={color} />
                  ))}
                </div>
              </div>
            )}

            {/* Fonts */}
            {previousScraping!.stats!.fonts && previousScraping!.stats!.fonts.length > 0 && (
              <div className="design-section">
                <h3>
                  <Type size={16} />
                  Polices detectees
                </h3>
                <div className="fonts-list">
                  {previousScraping!.stats!.fonts.slice(0, 10).map((font, i) => (
                    <span key={i} className="font-tag">{font}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="section-actions">
              <Button variant="secondary" onClick={handleNewScraping}>
                <RefreshCw size={16} />
                Relancer une analyse
              </Button>
              <Button variant="ghost" onClick={() => setShowDeleteModal(true)} className="btn-danger">
                <Trash2 size={16} />
                Supprimer
              </Button>
            </div>
          </section>
        )}

        {/* Configuration form */}
        {showConfig && (
          <section className="scraping-section scraping-config">
            <div className="section-header">
              <h2>
                <Globe size={20} />
                {hasPreviousScraping ? 'Nouvelle analyse' : 'Analyser le site'}
              </h2>
              {hasPreviousScraping && step === 'config' && (
                <Button variant="ghost" onClick={handleBackToIdle} className="btn-sm">
                  <X size={14} />
                  Annuler
                </Button>
              )}
            </div>

            <div className="url-input-group">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://exemple.com"
                className="url-input"
                onKeyDown={(e) => e.key === 'Enter' && url.trim() && handleStartScraping()}
              />
              <Button variant="primary" onClick={handleStartScraping} disabled={!url.trim()}>
                <Download size={16} />
                Analyser
              </Button>
            </div>

            <div className="options-grid">
              <div className="option-group">
                <h4>Elements a telecharger</h4>
                <div className="option-row">
                  <span>Images</span>
                  <Switch checked={downloadImages} onChange={setDownloadImages} />
                </div>
                <div className="option-row">
                  <span>Feuilles de style (CSS)</span>
                  <Switch checked={downloadCss} onChange={setDownloadCss} />
                </div>
                <div className="option-row">
                  <span>Scripts (JavaScript)</span>
                  <Switch checked={downloadJs} onChange={setDownloadJs} />
                </div>
                <div className="option-row">
                  <span>Polices</span>
                  <Switch checked={downloadFonts} onChange={setDownloadFonts} />
                </div>
              </div>

              <div className="option-group">
                <h4>Options</h4>
                <div className="option-row">
                  <span>Adapter les URLs (local)</span>
                  <Switch checked={rewriteUrls} onChange={setRewriteUrls} />
                </div>
                <div className="option-row">
                  <span>Generer un rapport</span>
                  <Switch checked={generateReport} onChange={setGenerateReport} />
                </div>
                <div className="option-row number-option">
                  <span>Pages maximum</span>
                  <input
                    type="number"
                    value={maxPages}
                    onChange={(e) => setMaxPages(parseInt(e.target.value) || 50)}
                    min={1}
                    max={500}
                  />
                </div>
              </div>
            </div>

            <div className="output-info">
              <FolderOpen size={14} />
              <span>Dossier de sortie: <code>{outputPath}</code></span>
            </div>
          </section>
        )}

        {/* Progress section */}
        {step === 'scraping' && (
          <section className="scraping-section scraping-progress">
            <div className="section-header">
              <h2>
                <Loader size={20} className="spinner" />
                Analyse en cours
              </h2>
            </div>

            {/* Stepper */}
            <div className="progress-stepper">
              <div className={`step ${progress && progress.progress_percent >= 0 ? 'active' : ''} ${progress && progress.progress_percent >= 60 ? 'completed' : ''}`}>
                <div className="step-icon">
                  {progress && progress.progress_percent >= 60 ? <CheckCircle size={16} /> : <Download size={16} />}
                </div>
                <span>Telechargement</span>
              </div>
              <div className="step-connector">
                <div className="connector-fill" style={{ width: progress ? `${Math.min(100, (progress.progress_percent / 60) * 100)}%` : '0%' }} />
              </div>
              <div className={`step ${progress && progress.progress_percent >= 60 ? 'active' : ''} ${progress && progress.progress_percent >= 85 ? 'completed' : ''}`}>
                <div className="step-icon">
                  {progress && progress.progress_percent >= 85 ? <CheckCircle size={16} /> : <FileCode size={16} />}
                </div>
                <span>Reecriture</span>
              </div>
              <div className="step-connector">
                <div className="connector-fill" style={{ width: progress && progress.progress_percent >= 60 ? `${Math.min(100, ((progress.progress_percent - 60) / 25) * 100)}%` : '0%' }} />
              </div>
              <div className={`step ${progress && progress.progress_percent >= 85 ? 'active' : ''} ${progress && progress.progress_percent >= 100 ? 'completed' : ''}`}>
                <div className="step-icon">
                  {progress && progress.progress_percent >= 100 ? <CheckCircle size={16} /> : <Sparkles size={16} />}
                </div>
                <span>Analyse</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="progress-bar-container">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress?.progress_percent || 0}%` }}
                />
              </div>
              <div className="progress-text">
                <span>{(progress?.progress_percent || 0).toFixed(0)}%</span>
                <span>{progress?.current_step || 'Initialisation...'}</span>
              </div>
            </div>

            {/* Stats */}
            <div className="stats-grid compact">
              <div className="stat-card">
                <Globe size={18} />
                <div className="stat-info">
                  <span className="stat-value">
                    {progress?.pages_downloaded || 0}
                    {progress?.pages_total ? ` / ${progress.pages_total}` : ''}
                  </span>
                  <span className="stat-label">Pages</span>
                </div>
              </div>
              <div className="stat-card">
                <HardDrive size={18} />
                <div className="stat-info">
                  <span className="stat-value">{progress?.assets_downloaded || 0}</span>
                  <span className="stat-label">Assets</span>
                </div>
              </div>
              <div className="stat-card">
                <FolderDown size={18} />
                <div className="stat-info">
                  <span className="stat-value">{formatBytes(progress?.bytes_downloaded || 0)}</span>
                  <span className="stat-label">Telecharge</span>
                </div>
              </div>
            </div>

            {/* Logs */}
            <div className="logs-container">
              <h4>
                <FileText size={14} />
                Journal
              </h4>
              <div className="logs-scroll" ref={logsContainerRef}>
                {logs.map((log) => (
                  <div key={log.id} className={`log-entry ${log.type}`}>
                    <span className="log-icon">{getLogIcon(log.type)}</span>
                    <span className="log-time">{log.time}</span>
                    <span className="log-message">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="section-actions">
              <Button variant="secondary" onClick={handleCancel}>
                <X size={16} />
                Annuler
              </Button>
            </div>
          </section>
        )}

        {/* Results section */}
        {step === 'results' && result && (
          <section className="scraping-section scraping-results">
            <div className="section-header">
              <h2>
                <CheckCircle size={20} className="icon-success" />
                Analyse terminee
              </h2>
            </div>

            <div className="result-status">
              <span className={`status-badge ${result.success ? 'success' : 'warning'}`}>
                {result.success ? 'Succes' : 'Termine avec avertissements'}
              </span>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-value">{result.pages_downloaded}</span>
                <span className="stat-label">Pages</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{result.assets_downloaded}</span>
                <span className="stat-label">Assets</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{formatBytes(result.total_size_bytes)}</span>
                <span className="stat-label">Taille totale</span>
              </div>
            </div>

            {/* Design System */}
            {result.design_system && (
              <div className="design-system">
                <h3>Charte graphique detectee</h3>

                {/* Colors */}
                {result.design_system.colors.length > 0 && (
                  <div className="design-section">
                    <h4>
                      <Palette size={16} />
                      Couleurs ({result.design_system.colors.length})
                    </h4>
                    <div className="color-palette">
                      {sortColorsByBrightness(result.design_system.colors)
                        .slice(0, 16)
                        .map((color, idx) => (
                          <ColorSwatchFull key={idx} color={color} />
                        ))}
                    </div>
                    <div className="primary-colors">
                      <span className="label">Couleurs principales:</span>
                      <div className="primary-palette">
                        {getPrimaryColors(result.design_system.colors).map((color, idx) => (
                          <ColorSwatchFull key={idx} color={color} showHex />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Fonts */}
                {result.design_system.fonts.length > 0 && (
                  <div className="design-section">
                    <h4>
                      <Type size={16} />
                      Polices ({result.design_system.fonts.length})
                    </h4>
                    <div className="fonts-grid">
                      {result.design_system.fonts.map((font, idx) => (
                        <FontCard key={idx} font={font} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="warnings-section">
                <h4>
                  <AlertTriangle size={16} />
                  Avertissements ({result.warnings.length})
                </h4>
                <ul>
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
                <h4>
                  <AlertTriangle size={16} />
                  Erreurs ({result.errors.length})
                </h4>
                <ul>
                  {result.errors.slice(0, 5).map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                  {result.errors.length > 5 && (
                    <li className="more">+ {result.errors.length - 5} autres</li>
                  )}
                </ul>
              </div>
            )}

            <div className="section-actions">
              <Button variant="primary" onClick={handleOpenFolder}>
                <FolderOpen size={16} />
                Ouvrir le dossier
              </Button>
              {result.report_path && (
                <Button variant="secondary" onClick={handleOpenReport}>
                  <FileText size={16} />
                  Voir le rapport
                </Button>
              )}
              <Button variant="secondary" onClick={handleNewScraping}>
                <RefreshCw size={16} />
                Nouvelle analyse
              </Button>
            </div>
          </section>
        )}

        {/* Error section */}
        {step === 'error' && (
          <section className="scraping-section scraping-error">
            <div className="section-header">
              <h2>
                <AlertTriangle size={20} className="icon-error" />
                Erreur
              </h2>
            </div>
            <p className="error-message">{error}</p>
            <div className="section-actions">
              <Button variant="secondary" onClick={handleBackToIdle}>
                Retour
              </Button>
              <Button variant="primary" onClick={handleStartScraping}>
                <RefreshCw size={16} />
                Reessayer
              </Button>
            </div>
          </section>
        )}

        {/* Delete confirmation modal */}
        {showDeleteModal && (
          <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
              <h3>
                <Trash2 size={18} />
                Supprimer les donnees d'analyse
              </h3>
              <p>Cette action va reinitialiser les informations d'analyse du projet.</p>
              <div className="delete-option">
                <label>
                  <input
                    type="checkbox"
                    checked={deleteFiles}
                    onChange={(e) => setDeleteFiles(e.target.checked)}
                  />
                  <span>Supprimer aussi les fichiers telecharges</span>
                </label>
                <span className="hint">Supprime le dossier References/</span>
              </div>
              <div className="modal-actions">
                <Button variant="secondary" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>
                  Annuler
                </Button>
                <Button variant="primary" onClick={handleDeleteScrapingData} disabled={isDeleting} className="btn-danger-solid">
                  {isDeleting ? (
                    <>
                      <Loader size={16} className="spinner" />
                      Suppression...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      Supprimer
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Color Swatch Components
function ColorSwatch({ hex }: { hex: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`color-swatch ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
      title={`${hex} - Cliquer pour copier`}
    >
      <div className="swatch-color" style={{ backgroundColor: hex }} />
      {copied && <Check size={10} className="copied-icon" />}
    </div>
  );
}

function ColorSwatchFull({ color, showHex }: { color: ColorInfo; showHex?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(color.hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`color-swatch-full ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
      title={`${color.hex} - ${color.occurrences} occurrences - Cliquer pour copier`}
    >
      <div className="swatch-color" style={{ backgroundColor: color.hex }} />
      {showHex && <span className="swatch-hex">{color.hex}</span>}
      {copied && <span className="copied-indicator">Copie!</span>}
    </div>
  );
}

function FontCard({ font }: { font: FontInfo }) {
  return (
    <div className="font-card">
      <span className="font-name" style={{ fontFamily: font.family }}>
        {font.family}
      </span>
      <span className="font-source">{font.source}</span>
      {font.weights.length > 0 && (
        <span className="font-weights">{font.weights.join(', ')}</span>
      )}
    </div>
  );
}

export default ScrapingPage;
