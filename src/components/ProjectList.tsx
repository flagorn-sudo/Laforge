import { FolderPlus, Loader, Search, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { Project } from '../types';
import { ProjectCard } from './ProjectCard';
import { ProjectListRow } from './ProjectListRow';
import { FilterBar } from './FilterBar';
import { Button } from './ui';
import { useProjectFiltering, useFilterPreferences } from '../hooks';

interface ProjectListProps {
  projects: Project[];
  loading: boolean;
  onSelect: (project: Project) => void;
  onNewProject: () => void;
  onSync?: (project: Project) => Promise<void>;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}

export function ProjectList({
  projects,
  loading,
  onSelect,
  onNewProject,
  onSync,
  viewMode,
  onViewModeChange,
}: ProjectListProps) {
  // Filter preferences with persistence
  const {
    filterBarOpen,
    statusFilters,
    sortBy,
    activeFiltersCount,
    toggleFilterBar,
    toggleStatus,
    setSortBy,
    resetFilters,
  } = useFilterPreferences();

  // Use the filtering hook with status filters and controlled sortBy
  const {
    searchQuery,
    setSearchQuery,
    filteredProjects,
    hasActiveFilter,
  } = useProjectFiltering(projects, {
    sortBy,
    statusFilters,
  });

  const hasStatusFilter = statusFilters.length > 0;
  const hasAnyFilter = hasActiveFilter || hasStatusFilter;

  if (loading) {
    return (
      <div className="loading">
        <Loader className="spinner" size={32} />
      </div>
    );
  }

  return (
    <div className="project-list-container">
      <div className="content-header">
        <h1 className="content-header-title">Projets</h1>

        <div className="content-header-controls">
          <div className="search-input">
            <Search size={16} />
            <input
              type="text"
              placeholder="Rechercher un projet..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            className={`filter-toggle-btn ${filterBarOpen ? 'open' : ''} ${activeFiltersCount > 0 ? 'has-filters' : ''}`}
            onClick={toggleFilterBar}
            title="Afficher/masquer les filtres"
          >
            <Filter size={14} />
            <span>Filtres</span>
            {activeFiltersCount > 0 && (
              <span className="filter-badge">{activeFiltersCount}</span>
            )}
            {filterBarOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <Button onClick={onNewProject}>
            <FolderPlus size={18} />
            Nouveau
          </Button>
        </div>
      </div>

      <FilterBar
        isOpen={filterBarOpen}
        statusFilters={statusFilters}
        onStatusToggle={toggleStatus}
        sortBy={sortBy}
        onSortChange={setSortBy}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        onReset={resetFilters}
      />

      {projects.length === 0 ? (
        <div className="empty-state">
          <FolderPlus size={48} />
          <h3>Aucun projet</h3>
          <p>Créez votre premier projet ou configurez le dossier de travail dans les paramètres.</p>
          <Button onClick={onNewProject}>Créer un projet</Button>
        </div>
      ) : filteredProjects.length === 0 && hasAnyFilter ? (
        <div className="empty-state">
          <Search size={48} />
          <h3>Aucun resultat</h3>
          <p>
            {hasActiveFilter && hasStatusFilter
              ? `Aucun projet ne correspond a "${searchQuery}" avec les statuts selectionnes.`
              : hasActiveFilter
              ? `Aucun projet ne correspond a votre recherche "${searchQuery}".`
              : `Aucun projet avec les statuts selectionnes.`}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="project-grid">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => onSelect(project)}
              onSync={onSync}
            />
          ))}
        </div>
      ) : (
        <div className="project-list-view">
          {filteredProjects.map((project) => (
            <ProjectListRow
              key={project.id}
              project={project}
              onClick={() => onSelect(project)}
              onSync={onSync}
            />
          ))}
        </div>
      )}
    </div>
  );
}
