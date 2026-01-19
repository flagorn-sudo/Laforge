/**
 * Hook wrapper for scraping functionality
 * Provides simplified interface to scrapingStore
 */

import { useCallback } from 'react';
import { useScrapingStore } from '../stores/scrapingStore';
import { ScrapeResult } from '../services/documentationService';
import { Project } from '../types';

export interface ScrapingOptions {
  maxPages: number;
  downloadImages: boolean;
  downloadCss: boolean;
  extractText: boolean;
  improveTexts: boolean;
}

export const DEFAULT_SCRAPING_OPTIONS: ScrapingOptions = {
  maxPages: 10,
  downloadImages: true,
  downloadCss: true,
  extractText: true,
  improveTexts: false,
};

export interface UseScrapingResult {
  // State
  stage: string;
  progress: number;
  progressMessage: string;
  result: ScrapeResult | null;
  error: string | null;
  logs: Array<{ time: string; message: string; type: 'info' | 'success' | 'error' }>;

  // Status
  isIdle: boolean;
  isRunning: boolean;
  isComplete: boolean;
  hasError: boolean;

  // Actions
  startScraping: (params: {
    url: string;
    project: Project;
    options?: Partial<ScrapingOptions>;
    geminiApiKey?: string;
    geminiModel?: string;
    onComplete?: (result: ScrapeResult, updatedProject: Project) => void;
  }) => Promise<void>;
  reset: () => void;
}

/**
 * Hook for managing website scraping
 *
 * @param projectId - Current project ID
 * @param projectPath - Current project path
 * @param projectName - Current project name
 */
export function useScraping(
  projectId: string,
  projectPath: string,
  projectName: string
): UseScrapingResult {
  const { getScrapingState, startScraping: storeStartScraping, resetScraping } =
    useScrapingStore();

  const state = getScrapingState(projectId);

  const startScraping = useCallback(
    async (params: {
      url: string;
      project: Project;
      options?: Partial<ScrapingOptions>;
      geminiApiKey?: string;
      geminiModel?: string;
      onComplete?: (result: ScrapeResult, updatedProject: Project) => void;
    }) => {
      const options = { ...DEFAULT_SCRAPING_OPTIONS, ...params.options };

      await storeStartScraping({
        projectId,
        projectPath,
        projectName,
        url: params.url,
        project: params.project,
        options,
        geminiApiKey: params.geminiApiKey,
        geminiModel: params.geminiModel,
        onComplete: params.onComplete,
      });
    },
    [projectId, projectPath, projectName, storeStartScraping]
  );

  const reset = useCallback(() => {
    resetScraping(projectId);
  }, [projectId, resetScraping]);

  return {
    // State
    stage: state.stage,
    progress: state.progress,
    progressMessage: state.progressMessage,
    result: state.result,
    error: state.error,
    logs: state.logs,

    // Status
    isIdle: state.stage === 'idle',
    isRunning: ['scraping', 'organizing', 'generating', 'improving'].includes(state.stage),
    isComplete: state.stage === 'complete',
    hasError: state.stage === 'error',

    // Actions
    startScraping,
    reset,
  };
}
