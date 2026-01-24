import { useSettingsStore } from '../stores/settingsStore';
import { ProjectStatus, FilterPreferences } from '../types';

export type { FilterPreferences };

export interface UseFilterPreferencesResult {
  filterBarOpen: boolean;
  statusFilters: ProjectStatus[];
  sortBy: 'name' | 'date';
  activeFiltersCount: number;
  toggleFilterBar: () => void;
  toggleStatus: (status: ProjectStatus) => void;
  setSortBy: (sort: 'name' | 'date') => void;
  resetFilters: () => void;
}

const DEFAULT_FILTER_PREFERENCES: FilterPreferences = {
  filterBarOpen: false,
  statusFilters: [],
  sortBy: 'name',
};

/**
 * Hook for managing filter preferences with persistence.
 * Preferences are stored in settings and restored on app launch.
 */
export function useFilterPreferences(): UseFilterPreferencesResult {
  const { filterPreferences, updateSettings } = useSettingsStore();

  const prefs = filterPreferences ?? DEFAULT_FILTER_PREFERENCES;

  const toggleFilterBar = () => {
    updateSettings({
      filterPreferences: {
        ...prefs,
        filterBarOpen: !prefs.filterBarOpen,
      },
    });
  };

  const toggleStatus = (status: ProjectStatus) => {
    const current = prefs.statusFilters || [];
    const newFilters = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];

    updateSettings({
      filterPreferences: {
        ...prefs,
        statusFilters: newFilters,
      },
    });
  };

  const setSortBy = (sort: 'name' | 'date') => {
    updateSettings({
      filterPreferences: {
        ...prefs,
        sortBy: sort,
      },
    });
  };

  const resetFilters = () => {
    updateSettings({
      filterPreferences: DEFAULT_FILTER_PREFERENCES,
    });
  };

  // Count active filters (status filters only, not sort)
  const activeFiltersCount = prefs.statusFilters.length;

  return {
    filterBarOpen: prefs.filterBarOpen,
    statusFilters: prefs.statusFilters,
    sortBy: prefs.sortBy,
    activeFiltersCount,
    toggleFilterBar,
    toggleStatus,
    setSortBy,
    resetFilters,
  };
}
