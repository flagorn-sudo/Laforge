import { ArrowUpAZ, Calendar, LayoutGrid, List, RotateCcw } from 'lucide-react';
import { ProjectStatus, PROJECT_STATUS_CONFIG } from '../types';
import './FilterBar.css';

interface FilterBarProps {
  isOpen: boolean;
  statusFilters: ProjectStatus[];
  onStatusToggle: (status: ProjectStatus) => void;
  sortBy: 'name' | 'date';
  onSortChange: (sort: 'name' | 'date') => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onReset: () => void;
}

export function FilterBar({
  isOpen,
  statusFilters,
  onStatusToggle,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  onReset,
}: FilterBarProps) {
  const allStatuses = Object.keys(PROJECT_STATUS_CONFIG) as ProjectStatus[];

  // Check if a status is active (selected)
  // If no filters are selected, all are considered "active" (showing all)
  const isStatusActive = (status: ProjectStatus) => {
    if (statusFilters.length === 0) return true;
    return statusFilters.includes(status);
  };

  const hasActiveFilters = statusFilters.length > 0;

  return (
    <div className={`filter-bar-container ${isOpen ? 'open' : ''}`}>
      <div className="filter-bar">
        <div className="filter-section">
          <span className="filter-label">Statut:</span>
          <div className="status-chips">
            {allStatuses.map((status) => {
              const config = PROJECT_STATUS_CONFIG[status];
              const active = isStatusActive(status);
              const selected = statusFilters.includes(status);

              return (
                <button
                  key={status}
                  className={`status-chip ${active ? 'active' : ''} ${selected ? 'selected' : ''}`}
                  onClick={() => onStatusToggle(status)}
                  style={{ '--status-color': config.color } as React.CSSProperties}
                >
                  <span className="chip-dot" />
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="filter-actions">
          <div className="filter-group">
            <span className="filter-label">Tri:</span>
            <div className="filter-buttons">
              <button
                className={sortBy === 'name' ? 'active' : ''}
                onClick={() => onSortChange('name')}
                title="Trier par nom"
              >
                <ArrowUpAZ size={14} />
              </button>
              <button
                className={sortBy === 'date' ? 'active' : ''}
                onClick={() => onSortChange('date')}
                title="Trier par date"
              >
                <Calendar size={14} />
              </button>
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-label">Vue:</span>
            <div className="filter-buttons">
              <button
                className={viewMode === 'grid' ? 'active' : ''}
                onClick={() => onViewModeChange('grid')}
                title="Vue grille"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => onViewModeChange('list')}
                title="Vue liste"
              >
                <List size={14} />
              </button>
            </div>
          </div>

          <button
            className={`reset-btn ${hasActiveFilters ? 'has-filters' : ''}`}
            onClick={onReset}
            title="Reinitialiser les filtres"
          >
            <RotateCcw size={14} />
            Reinitialiser
          </button>
        </div>
      </div>
    </div>
  );
}
