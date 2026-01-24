import { useState, useMemo, useCallback } from 'react';
import { Project, ProjectStatus } from '../types';

export type SortBy = 'name' | 'date';

export interface UseProjectFilteringOptions {
  initialSortBy?: SortBy;
  initialSearchQuery?: string;
  statusFilters?: ProjectStatus[];
  /** Controlled sortBy - when provided, internal state is ignored */
  sortBy?: SortBy;
}

export interface UseProjectFilteringResult {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortBy: SortBy;
  setSortBy: (sort: SortBy) => void;
  filteredProjects: Project[];
  clearSearch: () => void;
  hasActiveFilter: boolean;
}

/**
 * Hook centralisé pour le filtrage et tri des projets.
 * Utilisé par Sidebar et ProjectList pour éviter la duplication de logique.
 *
 * @param projects - Liste des projets à filtrer
 * @param options - Options de configuration (tri initial, recherche initiale)
 * @returns État et setters pour la recherche/tri, ainsi que les projets filtrés
 *
 * @example
 * ```tsx
 * const { searchQuery, setSearchQuery, sortBy, setSortBy, filteredProjects } =
 *   useProjectFiltering(projects, { initialSortBy: 'name' });
 * ```
 */
export function useProjectFiltering(
  projects: Project[],
  options: UseProjectFilteringOptions = {}
): UseProjectFilteringResult {
  const {
    initialSortBy = 'name',
    initialSearchQuery = '',
    statusFilters = [],
    sortBy: controlledSortBy,
  } = options;

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [internalSortBy, setInternalSortBy] = useState<SortBy>(initialSortBy);

  // Use controlled sortBy if provided, otherwise use internal state
  const sortBy = controlledSortBy ?? internalSortBy;
  const setSortBy = setInternalSortBy;

  const filteredProjects = useMemo(() => {
    let result = projects;

    // Filtrage par statut (multi-selection)
    // Si aucun filtre n'est actif, afficher tous les projets
    if (statusFilters.length > 0) {
      result = result.filter(p => statusFilters.includes(p.status));
    }

    // Filtrage par recherche
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p =>
        (p.client || p.name).toLowerCase().includes(query)
      );
    }

    // Tri
    return [...result].sort((a, b) => {
      if (sortBy === 'name') {
        return (a.client || a.name).localeCompare(b.client || b.name);
      }
      // Tri par date (plus récent en premier)
      return new Date(b.updated || b.created).getTime() -
             new Date(a.updated || a.created).getTime();
    });
  }, [projects, searchQuery, sortBy, statusFilters]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const hasActiveFilter = searchQuery.trim().length > 0;

  return {
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    filteredProjects,
    clearSearch,
    hasActiveFilter,
  };
}
