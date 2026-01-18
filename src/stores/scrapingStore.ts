import { create } from 'zustand';
import {
  documentationService,
  ScrapeResult,
  ScrapeConfig,
} from '../services/documentationService';
import { fileSystemService } from '../services/fileSystemService';
import { geminiService } from '../services/geminiService';

type ScrapingStage =
  | 'idle'
  | 'scraping'
  | 'organizing'
  | 'generating'
  | 'improving'
  | 'complete'
  | 'error';

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

interface ScrapingState {
  stage: ScrapingStage;
  progress: number;
  progressMessage: string;
  result: ScrapeResult | null;
  error: string | null;
  logs: LogEntry[];
  projectId: string | null; // Track which project is being scraped
}

interface ScrapingStore {
  // State per project (keyed by project path)
  scrapingStates: Record<string, ScrapingState>;

  // Actions
  getScrapingState: (projectId: string) => ScrapingState;
  startScraping: (params: {
    projectId: string;
    projectPath: string;
    projectName: string;
    url: string;
    options: {
      maxPages: number;
      downloadImages: boolean;
      downloadCss: boolean;
      extractText: boolean;
      improveTexts: boolean;
    };
    geminiApiKey?: string;
    geminiModel?: string;
    onComplete?: (result: ScrapeResult) => void;
  }) => Promise<void>;
  resetScraping: (projectId: string) => void;
}

const defaultState: ScrapingState = {
  stage: 'idle',
  progress: 0,
  progressMessage: '',
  result: null,
  error: null,
  logs: [],
  projectId: null,
};

export const useScrapingStore = create<ScrapingStore>((set, get) => ({
  scrapingStates: {},

  getScrapingState: (projectId: string) => {
    return get().scrapingStates[projectId] || defaultState;
  },

  startScraping: async ({
    projectId,
    projectPath,
    projectName,
    url,
    options,
    geminiApiKey,
    geminiModel,
    onComplete,
  }) => {
    const addLog = (message: string, type: LogEntry['type'] = 'info') => {
      const time = new Date().toLocaleTimeString('fr-FR');
      set((state) => ({
        scrapingStates: {
          ...state.scrapingStates,
          [projectId]: {
            ...state.scrapingStates[projectId],
            logs: [...(state.scrapingStates[projectId]?.logs || []), { time, message, type }],
          },
        },
      }));
    };

    const updateState = (updates: Partial<ScrapingState>) => {
      set((state) => ({
        scrapingStates: {
          ...state.scrapingStates,
          [projectId]: {
            ...(state.scrapingStates[projectId] || defaultState),
            ...updates,
            projectId,
          },
        },
      }));
    };

    // Initialize state
    updateState({
      stage: 'scraping',
      progress: 0,
      progressMessage: 'Analyse du site en cours...',
      result: null,
      error: null,
      logs: [],
    });

    const inboxPath = fileSystemService.joinPath(projectPath, '_Inbox');

    try {
      // Ensure _Inbox exists
      await fileSystemService.createFolder(inboxPath);

      addLog(`Demarrage du scraping de ${url}`, 'info');
      updateState({ progress: 10 });

      // Scrape the website
      const config: ScrapeConfig = {
        url: url.trim(),
        outputPath: inboxPath,
        maxPages: options.maxPages,
        downloadImages: options.downloadImages,
        downloadCss: options.downloadCss,
        extractText: options.extractText,
      };

      const scrapeResult = await documentationService.scrapeWebsite(config);
      updateState({ result: scrapeResult, progress: 40 });

      addLog(`${scrapeResult.pages.length} pages analysees`, 'success');
      addLog(`${scrapeResult.images.length} images trouvees`, 'info');
      addLog(`${scrapeResult.texts.length} blocs de texte extraits`, 'info');

      if (scrapeResult.errors.length > 0) {
        for (const err of scrapeResult.errors.slice(0, 5)) {
          addLog(err, 'error');
        }
      }

      // Organize files
      updateState({ stage: 'organizing', progressMessage: 'Organisation des fichiers...', progress: 50 });

      await documentationService.organizeScrapedFiles(projectPath, scrapeResult);
      addLog('Fichiers organises dans les dossiers projet', 'success');
      updateState({ progress: 60 });

      // Improve texts with Gemini if option is enabled
      let textsForDoc: { original: string; improved: string }[] | undefined;

      if (options.improveTexts && geminiApiKey && scrapeResult.texts.length > 0) {
        updateState({ stage: 'improving', progressMessage: 'Amelioration des textes avec Gemini...', progress: 70 });
        addLog(`Amelioration de ${scrapeResult.texts.length} textes avec Gemini...`, 'info');

        try {
          const textsToImprove = scrapeResult.texts.map((t) => ({
            elementType: t.elementType || 'p',
            content: t.content,
          }));

          const improved = await geminiService.improveTexts(
            textsToImprove,
            { siteName: projectName },
            geminiApiKey,
            geminiModel
          );

          textsForDoc = improved.map((t) => ({
            original: t.original,
            improved: t.improved,
          }));

          addLog(`${improved.length} textes ameliores`, 'success');
        } catch (geminiError) {
          console.error('Gemini improvement error:', geminiError);
          addLog('Erreur lors de l\'amelioration des textes', 'error');
        }
        updateState({ progress: 80 });
      } else {
        updateState({ progress: 75 });
      }

      // Generate documentation
      updateState({ stage: 'generating', progressMessage: 'Generation de la documentation...', progress: 85 });

      const docPath = await documentationService.generateDocumentation({
        projectName,
        projectPath,
        siteUrl: url,
        scrapeResult,
        improvedTexts: textsForDoc,
      });

      addLog(`Documentation generee: ${docPath}`, 'success');
      updateState({ progress: 100, stage: 'complete', progressMessage: 'Scraping termine !' });

      onComplete?.(scrapeResult);
    } catch (err) {
      console.error('Scraping error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      updateState({ error: errorMessage, stage: 'error' });
      addLog(errorMessage, 'error');
    }
  },

  resetScraping: (projectId: string) => {
    set((state) => ({
      scrapingStates: {
        ...state.scrapingStates,
        [projectId]: defaultState,
      },
    }));
  },
}));
