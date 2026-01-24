import { useState, useEffect, useRef, useCallback } from 'react';
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
  Clock,
  HardDrive,
  FolderDown,
  FileCode,
  Image as ImageIcon,
  Type,
  X,
  Trash2,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button, Card, Switch } from '../../../components/ui';
import { ScrapeResult } from '../../../services/documentationService';
import { useScrapingStore } from '../../../stores';
import { Project, ScrapingRun } from '../../../types';
import { FullSiteScraper } from '../../../components/FullSiteScraper';
import { projectService } from '../../../services/projectService';
import { scrapingService } from '../../../services/scrapingService';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import './ScrapingPanel.css';

interface ScrapingPanelProps {
  project: Project;
  projectPath: string;
  projectName: string;
  initialUrl?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  onScrapingComplete?: (result: ScrapeResult, updatedProject: Project) => void;
}

interface ScrapeProgressEvent {
  project_id: string;
  event_type: string;
  url: string | null;
  title: string | null;
  pages_scraped: number;
  pages_total: number;
  images_downloaded: number;
  css_downloaded: number;
  progress: number;
  message: string;
}

interface LogEntry {
  id: number;
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'page' | 'image' | 'css';
  url?: string;
}

type ScrapingStep = 'idle' | 'config' | 'scraping' | 'results' | 'error';

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
  const [step, setStep] = useState<ScrapingStep>('idle');
  const [showFullSiteScraper, setShowFullSiteScraper] = useState(false);

  // Progress state
  const [scrapeProgress, setScrapeProgress] = useState(0);
  const [pagesScraped, setPagesScraped] = useState(0);
  const [pagesTotal, setPagesTotal] = useState(0);
  const [imagesDownloaded, setImagesDownloaded] = useState(0);
  const [cssDownloaded, setCssDownloaded] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const logIdCounter = useRef(0);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Options
  const [downloadImages, setDownloadImages] = useState(true);
  const [downloadCss, setDownloadCss] = useState(true);
  const [extractText, setExtractText] = useState(true);
  const [maxPages, setMaxPages] = useState(50);
  const [improveTextsOption, setImproveTextsOption] = useState(!!geminiApiKey);

  // Previous scraping info
  const previousScraping = project.scraping;
  const hasPreviousScraping = previousScraping?.completed && previousScraping?.stats;
  const scrapingHistory = previousScraping?.history || [];
  const hasHistory = scrapingHistory.length > 1;

  // History display state
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryRun, setSelectedHistoryRun] = useState<ScrapingRun | null>(null);

  // Store for organizing phase
  const { getScrapingState, processScrapedResult, resetScraping } = useScrapingStore();
  const scrapingState = getScrapingState(projectPath);

  // Intelligent auto-scroll: only scroll if already near bottom
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

  // Listen for scrape events
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      unlisten = await listen<ScrapeProgressEvent>('scrape-progress', (event) => {
        const data = event.payload;
        if (data.project_id !== projectPath) return;

        const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // Update progress
        setScrapeProgress(data.progress);
        setPagesScraped(data.pages_scraped);
        setPagesTotal(data.pages_total);
        setImagesDownloaded(data.images_downloaded);
        setCssDownloaded(data.css_downloaded);

        // Add log entry
        let logType: LogEntry['type'] = 'info';
        if (data.event_type === 'page_complete') logType = 'page';
        else if (data.event_type === 'image_download') logType = 'image';
        else if (data.event_type === 'css_download') logType = 'css';
        else if (data.event_type === 'complete') logType = 'success';
        else if (data.event_type === 'error') logType = 'error';

        setLogs(prev => [...prev, {
          id: logIdCounter.current++,
          time,
          message: data.message,
          type: logType,
          url: data.url || undefined,
        }]);
      });
    };

    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, [projectPath]);

  const addLog = (message: string, type: LogEntry['type'] = 'info', url?: string) => {
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
    setScrapeResult(null);
    setScrapeError(null);
    setScrapeProgress(0);
    setPagesScraped(0);
    setPagesTotal(maxPages);
    setImagesDownloaded(0);
    setCssDownloaded(0);
  };

  const handleStartScraping = async () => {
    if (!url.trim()) return;

    // Check if a scraping is already in progress
    if (scrapingService.isScrapingInProgress()) {
      addLog('Un scraping est deja en cours', 'error');
      return;
    }

    resetState();
    setStep('scraping');
    addLog(`Demarrage du scraping de ${url}`, 'info');

    try {
      const result = await scrapingService.scrapeWebsiteWithEvents(
        {
          url: url.trim(),
          outputPath: `${projectPath}/_Inbox`,
          maxPages,
          downloadImages,
          downloadCss,
          extractText,
        },
        projectPath
      );

      setScrapeResult(result);
      addLog(`Scraping termine: ${result.pages.length} pages`, 'success');

      // Now organize and generate docs using the store (without re-scraping)
      addLog('Organisation des fichiers...', 'info');

      await processScrapedResult({
        projectId: projectPath,
        projectPath,
        projectName,
        url: url.trim(),
        project,
        scrapeResult: result,
        options: {
          improveTexts: improveTextsOption,
        },
        geminiApiKey,
        geminiModel,
        onComplete: (finalResult, updatedProject) => {
          addLog('Documentation generee', 'success');
          setScrapeProgress(100);
          setStep('results');
          if (onScrapingComplete) {
            onScrapingComplete(finalResult, updatedProject);
          }
        },
      });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setScrapeError(errorMsg);
      addLog(`Erreur: ${errorMsg}`, 'error');
      setStep('error');
      // Reset scraping state in case of error
      scrapingService.cancelScraping();
    }
  };

  const handleCancel = () => {
    scrapingService.cancelScraping();
    resetScraping(projectPath);
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

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteScrapingData = async () => {
    setIsDeleting(true);
    try {
      // Optionally delete the scraped files
      if (deleteFiles) {
        const inboxScrapedPath = `${projectPath}/_Inbox/scraped`;
        const referencesImagesPath = `${projectPath}/References/images`;
        const referencesStylesPath = `${projectPath}/References/styles`;

        try {
          await invoke('delete_folder', { path: inboxScrapedPath });
        } catch (e) {
          console.log('No scraped folder to delete');
        }
        try {
          await invoke('delete_folder', { path: referencesImagesPath });
        } catch (e) {
          console.log('No references images folder to delete');
        }
        try {
          await invoke('delete_folder', { path: referencesStylesPath });
        } catch (e) {
          console.log('No references styles folder to delete');
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

      // Notify parent to refresh project
      if (onScrapingComplete) {
        onScrapingComplete({ pages: [], images: [], stylesheets: [], fonts: [], colors: [], texts: [], siteStructure: [], errors: [] }, updatedProject);
      }

      // Reset states
      setShowDeleteModal(false);
      setDeleteFiles(false);
      setStep('config');
    } catch (err) {
      console.error('Error deleting scraping data:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Format date
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
      case 'image': return <ImageIcon size={12} />;
      case 'css': return <FileCode size={12} />;
      case 'success': return <CheckCircle size={12} />;
      case 'error': return <AlertTriangle size={12} />;
      default: return <FileText size={12} />;
    }
  };

  // Determine what to show based on step
  const showConfig = step === 'config' || (step === 'idle' && !hasPreviousScraping);
  const showPreviousResults = step === 'idle' && hasPreviousScraping;

  return (
    <div className="scraping-panel">
      {/* Previous scraping results */}
      {showPreviousResults && (
        <section className="scraping-section">
          <h3 className="scraping-section-title">
            <CheckCircle size={16} className="icon-success" />
            Scraping effectue
          </h3>

          <div className="scraping-meta">
            <div className="scraping-meta-item">
              <Clock size={14} />
              <span>{formatScrapingDate(previousScraping!.scrapedAt!)}</span>
            </div>
            {previousScraping!.sourceUrl && (
              <div className="scraping-meta-item">
                <Globe size={14} />
                <a href={previousScraping!.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {previousScraping!.sourceUrl}
                </a>
              </div>
            )}
          </div>

          <div className="scraping-stats-row">
            <div className="scraping-stat-card">
              <span className="stat-value">{previousScraping!.stats!.pagesCount}</span>
              <span className="stat-label">Pages</span>
            </div>
            <div className="scraping-stat-card">
              <span className="stat-value">{previousScraping!.stats!.imagesCount}</span>
              <span className="stat-label">Images</span>
            </div>
            <div className="scraping-stat-card">
              <span className="stat-value">{previousScraping!.stats!.textsCount}</span>
              <span className="stat-label">Textes</span>
            </div>
            <div className="scraping-stat-card">
              <span className="stat-value">{previousScraping!.stats!.colorsCount}</span>
              <span className="stat-label">Couleurs</span>
            </div>
          </div>

          {previousScraping!.stats!.colors.length > 0 && (
            <div className="scraping-colors">
              <div className="scraping-colors-label">
                <Palette size={14} />
                Couleurs detectees
              </div>
              <div className="scraping-colors-grid">
                {[...new Set(previousScraping!.stats!.colors)].slice(0, 20).map((color, i) => (
                  <div
                    key={i}
                    className="scraping-color-swatch"
                    style={{ background: color }}
                    title={`${color} - Cliquez pour copier`}
                    onClick={() => navigator.clipboard.writeText(color)}
                  />
                ))}
              </div>
            </div>
          )}

          {previousScraping!.stats!.fonts && previousScraping!.stats!.fonts.length > 0 && (
            <div className="scraping-fonts">
              <div className="scraping-fonts-label">
                <Type size={14} />
                Polices detectees
              </div>
              <div className="scraping-fonts-list">
                {previousScraping!.stats!.fonts.slice(0, 10).map((font, i) => (
                  <span key={i} className="scraping-font-tag">{font}</span>
                ))}
              </div>
            </div>
          )}

          {/* History section */}
          {hasHistory && (
            <div className="scraping-history">
              <button
                className="scraping-history-toggle"
                onClick={() => setShowHistory(!showHistory)}
              >
                <History size={14} />
                <span>Historique ({scrapingHistory.length} scrapings)</span>
                {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showHistory && (
                <div className="scraping-history-list">
                  {scrapingHistory.map((run, index) => (
                    <div
                      key={run.id}
                      className={`scraping-history-item ${selectedHistoryRun?.id === run.id ? 'selected' : ''} ${index === 0 ? 'latest' : ''}`}
                      onClick={() => setSelectedHistoryRun(selectedHistoryRun?.id === run.id ? null : run)}
                    >
                      <div className="history-item-header">
                        <span className="history-item-date">
                          {index === 0 && <span className="history-badge">Dernier</span>}
                          {formatScrapingDate(run.scrapedAt)}
                        </span>
                        <span className="history-item-url" title={run.sourceUrl}>
                          {run.sourceUrl.replace(/^https?:\/\//, '').split('/')[0]}
                        </span>
                      </div>
                      <div className="history-item-stats">
                        <span>{run.stats.pagesCount} pages</span>
                        <span>{run.stats.imagesCount} images</span>
                        <span>{run.stats.colorsCount} couleurs</span>
                      </div>

                      {selectedHistoryRun?.id === run.id && (
                        <div className="history-item-details">
                          <div className="history-detail-row">
                            <Globe size={12} />
                            <a href={run.sourceUrl} target="_blank" rel="noopener noreferrer">
                              {run.sourceUrl}
                            </a>
                          </div>
                          {run.stats.colors.length > 0 && (
                            <div className="history-colors">
                              {run.stats.colors.slice(0, 10).map((color, i) => (
                                <div
                                  key={i}
                                  className="history-color-swatch"
                                  style={{ background: color }}
                                  title={color}
                                />
                              ))}
                            </div>
                          )}
                          {run.errors && run.errors.length > 0 && (
                            <div className="history-errors">
                              <AlertTriangle size={12} />
                              <span>{run.errors.length} erreur(s)</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="scraping-actions">
            <Button variant="secondary" onClick={handleNewScraping}>
              <RefreshCw size={16} />
              Relancer un scraping
            </Button>
            <Button variant="ghost" onClick={() => setShowDeleteModal(true)} className="btn-danger">
              <Trash2 size={16} />
              Supprimer
            </Button>
          </div>
        </section>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="scraping-delete-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">
              <Trash2 size={18} />
              Supprimer les donnees de scraping
            </h3>
            <p className="modal-description">
              Cette action va reinitialiser les informations de scraping du projet.
            </p>
            <div className="delete-option">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={deleteFiles}
                  onChange={(e) => setDeleteFiles(e.target.checked)}
                />
                <span>Supprimer aussi les fichiers telecharges</span>
              </label>
              <span className="delete-option-hint">
                Supprime les dossiers _Inbox/scraped, References/images et References/styles
              </span>
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

      {/* Configuration form */}
      {showConfig && (
        <section className="scraping-section">
          <div className="scraping-section-header">
            <h3 className="scraping-section-title">
              <Globe size={16} />
              {hasPreviousScraping ? 'Nouveau scraping' : 'Scraper un site'}
            </h3>
            {hasPreviousScraping && step === 'config' && (
              <Button variant="ghost" onClick={handleBackToIdle} className="btn-sm">
                <X size={14} />
                Annuler
              </Button>
            )}
          </div>

          <div className="scraping-url-input">
            <input
              className="form-input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://exemple.com"
              onKeyDown={(e) => e.key === 'Enter' && url.trim() && handleStartScraping()}
            />
            <Button variant="primary" onClick={handleStartScraping} disabled={!url.trim()}>
              <Download size={16} />
              Scraper
            </Button>
          </div>

          <div className="scraping-options">
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
                  <Sparkles size={14} className="inline-icon" />
                  Ameliorer les textes avec Gemini
                </span>
                <Switch checked={improveTextsOption} onChange={setImproveTextsOption} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Progress section (during scraping) */}
      {step === 'scraping' && (
        <section className="scraping-section scraping-progress-section">
          <h3 className="scraping-section-title">
            <Loader size={16} className="spinner" />
            Scraping en cours
          </h3>

          {/* Stepper */}
          <div className="scraping-stepper">
            <div className={`stepper-step ${scrapeProgress >= 0 ? 'active' : ''} ${scrapeProgress >= 40 ? 'completed' : ''}`}>
              <div className="stepper-icon">
                {scrapeProgress >= 40 ? <CheckCircle size={16} /> : <Download size={16} />}
              </div>
              <span className="stepper-label">Scraping</span>
            </div>
            <div className="stepper-connector">
              <div className="stepper-connector-fill" style={{ width: scrapeProgress < 40 ? '0%' : scrapeProgress < 60 ? '50%' : '100%' }} />
            </div>
            <div className={`stepper-step ${scrapeProgress >= 40 ? 'active' : ''} ${scrapeProgress >= 70 ? 'completed' : ''}`}>
              <div className="stepper-icon">
                {scrapeProgress >= 70 ? <CheckCircle size={16} /> : <FolderDown size={16} />}
              </div>
              <span className="stepper-label">Organisation</span>
            </div>
            <div className="stepper-connector">
              <div className="stepper-connector-fill" style={{ width: scrapeProgress < 70 ? '0%' : scrapeProgress < 85 ? '50%' : '100%' }} />
            </div>
            <div className={`stepper-step ${scrapeProgress >= 70 ? 'active' : ''} ${scrapeProgress >= 85 ? 'completed' : ''}`}>
              <div className="stepper-icon">
                {scrapeProgress >= 85 ? <CheckCircle size={16} /> : <Sparkles size={16} />}
              </div>
              <span className="stepper-label">Amelioration</span>
            </div>
            <div className="stepper-connector">
              <div className="stepper-connector-fill" style={{ width: scrapeProgress < 85 ? '0%' : scrapeProgress < 100 ? '50%' : '100%' }} />
            </div>
            <div className={`stepper-step ${scrapeProgress >= 85 ? 'active' : ''} ${scrapeProgress >= 100 ? 'completed' : ''}`}>
              <div className="stepper-icon">
                {scrapeProgress >= 100 ? <CheckCircle size={16} /> : <FileText size={16} />}
              </div>
              <span className="stepper-label">Documentation</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="scraping-progress">
            <div className="scraping-progress-bar">
              <div
                className="scraping-progress-fill"
                style={{ width: `${scrapeProgress}%` }}
              />
            </div>
            <div className="scraping-progress-text">
              <span>{scrapeProgress.toFixed(0)}%</span>
              <span>{scrapingState.progressMessage || 'En cours...'}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="scraping-stats-row">
            <div className="scraping-stat-card">
              <Globe size={18} className="stat-icon" />
              <span className="stat-value">{pagesScraped}{pagesTotal > 0 ? ` / ${pagesTotal}` : ''}</span>
              <span className="stat-label">Pages</span>
            </div>
            <div className="scraping-stat-card">
              <ImageIcon size={18} className="stat-icon" />
              <span className="stat-value">{imagesDownloaded}</span>
              <span className="stat-label">Images</span>
            </div>
            <div className="scraping-stat-card">
              <FileCode size={18} className="stat-icon" />
              <span className="stat-value">{cssDownloaded}</span>
              <span className="stat-label">CSS</span>
            </div>
          </div>

          {/* Logs */}
          <div className="scraping-logs-section">
            <h4 className="scraping-logs-title">
              <FileText size={14} />
              Journal
            </h4>
            <div className="scraping-logs" ref={logsContainerRef}>
              {logs.map((log) => (
                <div key={log.id} className={`scraping-log-item ${log.type}`}>
                  <span className="log-icon">{getLogIcon(log.type)}</span>
                  <span className="log-time">{log.time}</span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="scraping-actions">
            <Button variant="secondary" onClick={handleCancel}>
              <X size={16} />
              Annuler
            </Button>
          </div>
        </section>
      )}

      {/* Results section */}
      {step === 'results' && scrapeResult && (
        <section className="scraping-section scraping-results-section">
          <h3 className="scraping-section-title">
            <CheckCircle size={16} className="icon-success" />
            Scraping termine
          </h3>

          <div className="scraping-stats-row">
            <div className="scraping-stat-card">
              <span className="stat-value">{scrapeResult.pages.length}</span>
              <span className="stat-label">Pages</span>
            </div>
            <div className="scraping-stat-card">
              <span className="stat-value">{scrapeResult.images.length}</span>
              <span className="stat-label">Images</span>
            </div>
            <div className="scraping-stat-card">
              <span className="stat-value">{scrapeResult.colors.length}</span>
              <span className="stat-label">Couleurs</span>
            </div>
            <div className="scraping-stat-card">
              <span className="stat-value">{scrapeResult.fonts.length}</span>
              <span className="stat-label">Polices</span>
            </div>
          </div>

          {scrapeResult.colors.length > 0 && (
            <div className="scraping-colors">
              <div className="scraping-colors-label">
                <Palette size={14} />
                Couleurs detectees
              </div>
              <div className="scraping-colors-grid">
                {[...new Set(scrapeResult.colors)].slice(0, 20).map((color, i) => (
                  <div
                    key={i}
                    className="scraping-color-swatch"
                    style={{ background: color }}
                    title={`${color} - Cliquez pour copier`}
                    onClick={() => navigator.clipboard.writeText(color)}
                  />
                ))}
              </div>
            </div>
          )}

          {scrapeResult.fonts.length > 0 && (
            <div className="scraping-fonts">
              <div className="scraping-fonts-label">
                <Type size={14} />
                Polices detectees
              </div>
              <div className="scraping-fonts-list">
                {scrapeResult.fonts.slice(0, 10).map((font, i) => (
                  <span key={i} className="scraping-font-tag">{font}</span>
                ))}
              </div>
            </div>
          )}

          <div className="scraping-actions">
            <Button variant="primary" onClick={handleNewScraping}>
              <RefreshCw size={16} />
              Nouveau scraping
            </Button>
          </div>
        </section>
      )}

      {/* Error section */}
      {step === 'error' && (
        <section className="scraping-section scraping-error-section">
          <h3 className="scraping-section-title">
            <AlertTriangle size={16} className="icon-error" />
            Erreur
          </h3>
          <p className="scraping-error-message">{scrapeError}</p>
          <div className="scraping-actions">
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

      {/* Full Site Download Section - visible when not scraping */}
      {step !== 'scraping' && (
        <section className="scraping-section">
          <h3 className="scraping-section-title">
            <HardDrive size={16} />
            Telecharger le site complet
          </h3>
          {!showFullSiteScraper ? (
            <>
              <p className="scraping-section-description">
                Telecharge l'integralite du site pour une utilisation locale avec extraction de la charte graphique.
              </p>
              <Button variant="secondary" onClick={() => setShowFullSiteScraper(true)} disabled={!initialUrl}>
                <FolderDown size={16} />
                Telecharger le site
              </Button>
            </>
          ) : (
            <FullSiteScraper
              projectPath={projectPath}
              initialUrl={initialUrl}
              onComplete={(result) => {
                if (result.success && result.design_system && onScrapingComplete) {
                  const newColors = result.design_system.colors.map(c => c.hex);
                  const newFonts = result.design_system.fonts.map(f => f.family);
                  const updatedProject: Project = {
                    ...project,
                    colors: [...new Set([...project.colors, ...newColors])],
                    fonts: [...new Set([...project.fonts, ...newFonts])],
                    updated: new Date().toISOString(),
                  };
                  onScrapingComplete({ pages: [], images: [], stylesheets: [], fonts: newFonts, colors: newColors, texts: [], siteStructure: [], errors: result.errors }, updatedProject);
                }
              }}
              onClose={() => setShowFullSiteScraper(false)}
            />
          )}
        </section>
      )}

      {/* Workflow info - only when idle/config */}
      {(step === 'idle' || step === 'config') && (
        <Card title="Workflow de scraping">
          <div className="scraping-workflow-info">
            <p><strong>1.</strong> Fichiers telecharges dans <code>_Inbox/scraped/</code></p>
            <p><strong>2.</strong> Organisation automatique dans les dossiers</p>
            <p><strong>3.</strong> Documentation generee dans <code>Documentation/</code></p>
          </div>
        </Card>
      )}
    </div>
  );
}
