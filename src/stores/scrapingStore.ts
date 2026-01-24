import { create } from 'zustand';
import {
  documentationService,
  ScrapeResult,
  ScrapeConfig,
} from '../services/documentationService';
import { fileSystemService } from '../services/fileSystemService';
import { geminiService } from '../services/geminiService';
import { projectService } from '../services/projectService';
import { Project, ScrapingStats } from '../types';

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
    project: Project; // Projet pour sauvegarde des stats
    options: {
      maxPages: number;
      downloadImages: boolean;
      downloadCss: boolean;
      extractText: boolean;
      improveTexts: boolean;
    };
    geminiApiKey?: string;
    geminiModel?: string;
    onComplete?: (result: ScrapeResult, updatedProject: Project) => void;
  }) => Promise<void>;
  // Process an already-scraped result (organize, improve, generate docs)
  processScrapedResult: (params: {
    projectId: string;
    projectPath: string;
    projectName: string;
    url: string;
    project: Project;
    scrapeResult: ScrapeResult;
    options: {
      improveTexts: boolean;
    };
    geminiApiKey?: string;
    geminiModel?: string;
    onComplete?: (result: ScrapeResult, updatedProject: Project) => void;
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
    project,
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

        // Limit texts to improve to avoid timeouts (max 50 texts)
        const maxTextsToImprove = 50;
        const textsToProcess = scrapeResult.texts.slice(0, maxTextsToImprove);

        if (scrapeResult.texts.length > maxTextsToImprove) {
          addLog(`Limitation a ${maxTextsToImprove} textes (sur ${scrapeResult.texts.length})`, 'info');
        }

        addLog(`Amelioration de ${textsToProcess.length} textes avec Gemini...`, 'info');

        try {
          const textsToImprove = textsToProcess.map((t) => ({
            elementType: t.elementType || 'p',
            content: t.content,
          }));

          const improved = await geminiService.improveTexts(
            textsToImprove,
            { siteName: projectName },
            geminiApiKey,
            geminiModel
          );

          // Only use improved texts if we got results
          if (improved && improved.length > 0) {
            textsForDoc = improved.map((t) => ({
              original: t.original,
              improved: t.improved,
            }));
            addLog(`${improved.length} textes ameliores`, 'success');
          } else {
            addLog('Aucun texte ameliore retourne', 'info');
          }
        } catch (geminiError) {
          console.error('Gemini improvement error:', geminiError);
          const errorMessage = geminiError instanceof Error ? geminiError.message : 'Erreur inconnue';
          addLog(`Erreur Gemini: ${errorMessage.substring(0, 100)}`, 'error');
          addLog('Les textes originaux seront utilises', 'info');
        }
        updateState({ progress: 80 });
      } else {
        if (options.improveTexts && !geminiApiKey) {
          addLog('Cle API Gemini manquante - amelioration ignoree', 'info');
        }
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

      // Sauvegarder les statistiques dans le projet
      const scrapingStats: ScrapingStats = {
        pagesCount: scrapeResult.pages.length,
        imagesCount: scrapeResult.images.length,
        textsCount: scrapeResult.texts.length,
        colorsCount: scrapeResult.colors.length,
        fontsCount: scrapeResult.fonts.length,
        colors: scrapeResult.colors,
        fonts: scrapeResult.fonts,
      };

      const updatedProject: Project = {
        ...project,
        scraping: {
          completed: true,
          sourceUrl: url,
          scrapedAt: new Date().toISOString(),
          stats: scrapingStats,
        },
        // Mettre à jour les couleurs et polices du projet si pas déjà définies
        colors: project.colors?.length ? project.colors : scrapeResult.colors,
        fonts: project.fonts?.length ? project.fonts : scrapeResult.fonts,
        updated: new Date().toISOString(),
      };

      try {
        await projectService.saveProject(updatedProject);
        addLog('Statistiques sauvegardees dans le projet', 'success');
      } catch (saveError) {
        console.error('Error saving scraping stats:', saveError);
        addLog('Erreur lors de la sauvegarde des statistiques', 'error');
      }

      updateState({ progress: 100, stage: 'complete', progressMessage: 'Scraping termine !' });

      onComplete?.(scrapeResult, updatedProject);
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

  processScrapedResult: async ({
    projectId,
    projectPath,
    projectName,
    url,
    project,
    scrapeResult,
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

    // Initialize state - skip scraping phase since we already have results
    updateState({
      stage: 'organizing',
      progress: 50,
      progressMessage: 'Organisation des fichiers...',
      result: scrapeResult,
      error: null,
      logs: [],
    });

    try {
      // Organize files
      addLog('Organisation des fichiers...', 'info');
      await documentationService.organizeScrapedFiles(projectPath, scrapeResult);
      addLog('Fichiers organises dans les dossiers projet', 'success');
      updateState({ progress: 60 });

      // Improve texts with Gemini if option is enabled
      let textsForDoc: { original: string; improved: string }[] | undefined;

      if (options.improveTexts && geminiApiKey && scrapeResult.texts.length > 0) {
        updateState({ stage: 'improving', progressMessage: 'Amelioration des textes avec Gemini...', progress: 70 });

        const maxTextsToImprove = 50;
        const textsToProcess = scrapeResult.texts.slice(0, maxTextsToImprove);

        if (scrapeResult.texts.length > maxTextsToImprove) {
          addLog(`Limitation a ${maxTextsToImprove} textes (sur ${scrapeResult.texts.length})`, 'info');
        }

        addLog(`Amelioration de ${textsToProcess.length} textes avec Gemini...`, 'info');

        try {
          const textsToImprove = textsToProcess.map((t) => ({
            elementType: t.elementType || 'p',
            content: t.content,
          }));

          const improved = await geminiService.improveTexts(
            textsToImprove,
            { siteName: projectName },
            geminiApiKey,
            geminiModel
          );

          if (improved && improved.length > 0) {
            textsForDoc = improved.map((t) => ({
              original: t.original,
              improved: t.improved,
            }));
            addLog(`${improved.length} textes ameliores`, 'success');
          } else {
            addLog('Aucun texte ameliore retourne', 'info');
          }
        } catch (geminiError) {
          console.error('Gemini improvement error:', geminiError);
          const errorMessage = geminiError instanceof Error ? geminiError.message : 'Erreur inconnue';
          addLog(`Erreur Gemini: ${errorMessage.substring(0, 100)}`, 'error');
          addLog('Les textes originaux seront utilises', 'info');
        }
        updateState({ progress: 80 });
      } else {
        if (options.improveTexts && !geminiApiKey) {
          addLog('Cle API Gemini manquante - amelioration ignoree', 'info');
        }
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

      // Save stats to project
      const scrapingStats: ScrapingStats = {
        pagesCount: scrapeResult.pages.length,
        imagesCount: scrapeResult.images.length,
        textsCount: scrapeResult.texts.length,
        colorsCount: scrapeResult.colors.length,
        fontsCount: scrapeResult.fonts.length,
        colors: scrapeResult.colors,
        fonts: scrapeResult.fonts,
      };

      const updatedProject: Project = {
        ...project,
        scraping: {
          completed: true,
          sourceUrl: url,
          scrapedAt: new Date().toISOString(),
          stats: scrapingStats,
        },
        colors: project.colors?.length ? project.colors : scrapeResult.colors,
        fonts: project.fonts?.length ? project.fonts : scrapeResult.fonts,
        updated: new Date().toISOString(),
      };

      try {
        await projectService.saveProject(updatedProject);
        addLog('Statistiques sauvegardees dans le projet', 'success');
      } catch (saveError) {
        console.error('Error saving scraping stats:', saveError);
        addLog('Erreur lors de la sauvegarde des statistiques', 'error');
      }

      updateState({ progress: 100, stage: 'complete', progressMessage: 'Traitement termine !' });

      onComplete?.(scrapeResult, updatedProject);
    } catch (err) {
      console.error('Processing error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      updateState({ error: errorMessage, stage: 'error' });
      addLog(errorMessage, 'error');
    }
  },
}));
