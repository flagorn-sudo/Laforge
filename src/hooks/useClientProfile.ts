/**
 * Hook for client profile generation
 * Extracts AI profile generation logic from ProjectDetail
 */

import { useState, useCallback } from 'react';
import { Project } from '../types';
import { geminiService } from '../services/geminiService';
import { scrapingService } from '../services/scrapingService';
import { projectService } from '../services/projectService';
import { useNotification } from './useNotification';

export interface ClientProfileResult {
  description: string;
  themeTags: string[];
}

export interface UseClientProfileResult {
  // State
  generating: boolean;
  error: string | null;

  // Actions
  generateProfile: (
    project: Project,
    siteUrl: string,
    geminiApiKey: string,
    geminiModel?: string
  ) => Promise<ClientProfileResult | null>;
  saveProfile: (
    project: Project,
    description: string,
    themeTags: string[]
  ) => Promise<Project | null>;
}

/**
 * Hook for generating and managing client profiles
 *
 * @param onUpdate - Callback when project is updated
 */
export function useClientProfile(
  onUpdate?: (project: Project) => void
): UseClientProfileResult {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { info, success, error: notifyError } = useNotification();

  const generateProfile = useCallback(
    async (
      project: Project,
      siteUrl: string,
      geminiApiKey: string,
      geminiModel?: string
    ): Promise<ClientProfileResult | null> => {
      if (!siteUrl || !geminiApiKey) {
        notifyError('URL du site et clé API Gemini requis');
        return null;
      }

      setGenerating(true);
      setError(null);

      try {
        // Fetch and extract texts from the client's website
        info('Analyse du site en cours...');
        const extractedTexts = await scrapingService.fetchAndExtractTexts(siteUrl);

        const result = await geminiService.generateClientProfile(
          project.name,
          project.client,
          siteUrl,
          extractedTexts.allTexts,
          project.colors || [],
          project.fonts || [],
          geminiApiKey,
          geminiModel
        );

        success('Profil client généré');
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        setError(errorMessage);
        notifyError(`Erreur lors de la génération: ${errorMessage}`);
        console.error('Profile generation error:', err);
        return null;
      } finally {
        setGenerating(false);
      }
    },
    [info, success, notifyError]
  );

  const saveProfile = useCallback(
    async (
      project: Project,
      description: string,
      themeTags: string[]
    ): Promise<Project | null> => {
      try {
        const updated: Project = {
          ...project,
          clientDescription: description,
          themeTags,
          themeTagsGeneratedAt: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        await projectService.saveProject(updated);
        onUpdate?.(updated);
        success('Profil client enregistré');
        return updated;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        notifyError(`Erreur lors de l'enregistrement: ${errorMessage}`);
        console.error('Profile save error:', err);
        return null;
      }
    },
    [onUpdate, success, notifyError]
  );

  return {
    generating,
    error,
    generateProfile,
    saveProfile,
  };
}
