import { JOB_STATUSES, STATUS_LABELS } from '../api/types';

interface FiltersState {
  searchQuery: string;
  statusFilter: string;
  minScore: number;
}

interface FiltersPanelProps {
  filters: FiltersState;
  onFiltersChange: (partial: Partial<FiltersState>) => void;
  showStatusFilter: boolean;
  onBatchDelete: () => void;
  filteredCount: number;
}

export default function FiltersPanel({
  filters,
  onFiltersChange,
  showStatusFilter,
  onBatchDelete,
  filteredCount,
}: FiltersPanelProps) {
  const isFilterActive =
    filters.searchQuery.trim() !== '' ||
    (showStatusFilter && filters.statusFilter !== 'all') ||
    filters.minScore > 0;

  return (
    <div className="filters-panel">
      <div className="filter-group">
        <label htmlFor="filter-search">Search Text</label>
        <input
          id="filter-search"
          type="text"
          placeholder="Filter by title, company, stack..."
          value={filters.searchQuery}
          onChange={(e) => onFiltersChange({ searchQuery: e.target.value })}
        />
      </div>

      {showStatusFilter && (
        <div className="filter-group">
          <label htmlFor="filter-status">Status</label>
          <select
            id="filter-status"
            value={filters.statusFilter}
            onChange={(e) => onFiltersChange({ statusFilter: e.target.value })}
          >
            <option value="all">All Jobs</option>
            {JOB_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="filter-group">
        <label htmlFor="filter-score">Min Match Score</label>
        <div className="score-slider-container">
          <input
            id="filter-score"
            type="range"
            min="0"
            max="100"
            value={filters.minScore}
            onChange={(e) => onFiltersChange({ minScore: Number(e.target.value) })}
          />
          <span className="score-value">{filters.minScore}%</span>
        </div>
      </div>

      {isFilterActive && filteredCount > 0 && (
        <button
          type="button"
          className="btn btn-danger"
          onClick={onBatchDelete}
          style={{ height: '42px', marginTop: 'auto' }}
        >
          Delete Matching ({filteredCount})
        </button>
      )}
    </div>
  );
}
