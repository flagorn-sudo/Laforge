import { useState, useMemo } from 'react';
import { FolderPlus, FolderInput, Loader, Search, Filter, ChevronDown, ChevronUp, AlertCircle, Clock, DollarSign, Briefcase, TrendingUp } from 'lucide-react';
import { Project, ProjectHealth, BillingUnit, GlobalBillingSettings } from '../types';
import { ProjectCard } from './ProjectCard';
import { ProjectListRow } from './ProjectListRow';
import { FilterBar } from './FilterBar';
import { MissingProjectsModal } from './MissingProjectsModal';
import { Button } from './ui';
import { useProjectFiltering, useFilterPreferences } from '../hooks';
import { useTimeStore, formatDurationShort, calculateBillableForProject } from '../stores/timeStore';
import { useSettingsStore } from '../stores/settingsStore';

interface ProjectListProps {
  projects: Project[];
  projectErrors?: ProjectHealth[];
  loading: boolean;
  onSelect: (project: Project) => void;
  onNewProject: () => void;
  onImportProject: () => void;
  onSync?: (project: Project) => Promise<void>;
  onRefresh?: () => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}

export function ProjectList({
  projects,
  projectErrors = [],
  loading,
  onSelect,
  onNewProject,
  onImportProject,
  onSync,
  onRefresh,
  viewMode,
  onViewModeChange,
}: ProjectListProps) {
  const [showMissingProjectsModal, setShowMissingProjectsModal] = useState(false);

  // Time tracking stats
  const { sessions, getProjectStats } = useTimeStore();
  const globalBilling: GlobalBillingSettings = useSettingsStore((state) => state.billing) || {
    defaultRate: 75,
    defaultUnit: 'hour' as BillingUnit,
  };

  // Calculate global stats
  const globalStats = useMemo(() => {
    let totalSeconds = 0;
    let totalAmount = 0;

    projects.forEach((project) => {
      const stats = getProjectStats(project.id);
      totalSeconds += stats.totalSeconds;

      // Calculate billing for this project
      const billing = calculateBillableForProject(
        stats.totalSeconds,
        project.billing,
        globalBilling.defaultRate,
        globalBilling.defaultUnit
      );
      totalAmount += billing.amount;
    });

    // Count active projects (not archived, not prospect)
    const activeProjects = projects.filter(
      (p) => p.status !== 'archived' && p.status !== 'prospect'
    ).length;

    // Count projects worked on this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthlyActiveSessions = sessions.filter(
      (s) => new Date(s.startTime) >= startOfMonth
    );
    const projectsWorkedThisMonth = new Set(monthlyActiveSessions.map((s) => s.projectId)).size;

    return {
      totalSeconds,
      totalAmount,
      activeProjects,
      projectsWorkedThisMonth,
      totalProjects: projects.length,
    };
  }, [projects, sessions, getProjectStats, globalBilling]);

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

  const handleMissingProjectsRefresh = () => {
    setShowMissingProjectsModal(false);
    onRefresh?.();
  };

  return (
    <div className="project-list-container">
      {/* Missing projects banner */}
      {projectErrors.length > 0 && (
        <div className="missing-projects-banner">
          <AlertCircle size={16} />
          <span>
            {projectErrors.length === 1
              ? '1 projet introuvable'
              : `${projectErrors.length} projets introuvables`}
          </span>
          <button
            className="missing-projects-banner-btn"
            onClick={() => setShowMissingProjectsModal(true)}
          >
            Voir details
          </button>
        </div>
      )}

      {/* Dashboard Stats */}
      {projects.length > 0 && (
        <div className="dashboard-stats">
          <div className="stat-card">
            <div className="stat-icon time">
              <Clock size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{formatDurationShort(globalStats.totalSeconds)}</span>
              <span className="stat-label">Temps total</span>
            </div>
          </div>
          <div className="stat-card highlight">
            <div className="stat-icon money">
              <DollarSign size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{globalStats.totalAmount.toFixed(0)}€</span>
              <span className="stat-label">Facturable</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon projects">
              <Briefcase size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{globalStats.activeProjects}</span>
              <span className="stat-label">Projets actifs</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon activity">
              <TrendingUp size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{globalStats.projectsWorkedThisMonth}</span>
              <span className="stat-label">Ce mois</span>
            </div>
          </div>
        </div>
      )}

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

          <Button variant="secondary" onClick={onImportProject}>
            <FolderInput size={18} />
            Importer
          </Button>
          <Button variant="success" onClick={onNewProject}>
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
          <Button variant="success" onClick={onNewProject}>Créer un projet</Button>
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

      {/* Missing projects modal */}
      {showMissingProjectsModal && (
        <MissingProjectsModal
          errors={projectErrors}
          onClose={() => setShowMissingProjectsModal(false)}
          onRefresh={handleMissingProjectsRefresh}
        />
      )}
    </div>
  );
}
