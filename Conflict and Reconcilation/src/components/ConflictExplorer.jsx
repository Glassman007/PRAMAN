import { useEffect, useMemo } from 'react';
import StatusBadge from './StatusBadge.jsx';
import {
  EMPTY_FILTERS,
  contextualOptionCounts,
  deriveFilterOptions,
  filterParcelCases,
  getCaseCell,
  getCaseSourceCount,
  getCaseStatus,
  sortParcelCases,
  summarizeVisibleCases,
} from '../data/conflictExplorerSelectors.js';

const PAGE_SIZE = 50;
const DEFAULT_SORT = Object.freeze({ key: 'openConflicts', direction: 'desc' });
const SORT_KEYS = new Set(['parcelId', 'openConflicts', 'severity', 'criticality', 'conflictCount', 'humanReview']);

function humanReviewLabel(value) {
  return value === 'required' ? 'Required' : 'Not required';
}

function parcelKindLabel(value) {
  if (value === 'CURRENT') return 'Current';
  if (value === 'HISTORICAL') return 'Historical';
  return value;
}

function FilterSelect({ label, filterKey, value, options, counts, onChange, formatOption = (option) => option }) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(filterKey, event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {formatOption(option)} ({counts.get(option) ?? 0})
          </option>
        ))}
      </select>
    </label>
  );
}

function SortButton({ active, direction, onClick, children }) {
  return (
    <button className={`table-sort${active ? ' table-sort--active' : ''}`} onClick={onClick} type="button">
      {children}<span aria-hidden="true">{active ? (direction === 'asc' ? ' ↑' : ' ↓') : ''}</span>
    </button>
  );
}

function sanitizeExplorerState(routeState, options) {
  const inputFilters = routeState?.filters ?? EMPTY_FILTERS;
  const filters = { ...EMPTY_FILTERS, ...inputFilters };
  for (const key of ['status', 'conflictType', 'severity', 'criticality', 'humanReview', 'sourceType', 'parcelKind', 'cell']) {
    if (filters[key] && !options[key]?.includes(filters[key])) filters[key] = '';
  }

  const inputSort = routeState?.sort ?? DEFAULT_SORT;
  const sort = {
    key: SORT_KEYS.has(inputSort.key) ? inputSort.key : DEFAULT_SORT.key,
    direction: inputSort.direction === 'asc' ? 'asc' : 'desc',
  };
  const parsedPage = Number.parseInt(routeState?.page ?? 1, 10);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  return { filters, sort, page };
}

function sameExplorerState(a, b) {
  if (!a || !b) return false;
  if (a.page !== b.page || a.sort?.key !== b.sort?.key || a.sort?.direction !== b.sort?.direction) return false;
  return Object.keys(EMPTY_FILTERS).every((key) => (a.filters?.[key] ?? '') === (b.filters?.[key] ?? ''));
}

export default function ConflictExplorer({ model, explorerState, onExplorerStateChange, onSelectCase }) {
  const cases = model.parcelConflictCases;
  const options = useMemo(() => deriveFilterOptions(cases), [cases]);
  const resolvedState = useMemo(() => sanitizeExplorerState(explorerState, options), [explorerState, options]);
  const { filters, sort, page } = resolvedState;

  const filteredCases = useMemo(() => filterParcelCases(cases, filters), [cases, filters]);
  const sortedCases = useMemo(() => sortParcelCases(filteredCases, sort), [filteredCases, sort]);
  const visibleSummary = useMemo(() => summarizeVisibleCases(filteredCases), [filteredCases]);
  const pageCount = Math.max(1, Math.ceil(sortedCases.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageCases = sortedCases.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const counts = useMemo(() => Object.fromEntries(
    Object.entries(options).map(([key, values]) => [key, contextualOptionCounts(cases, filters, key, values)])
  ), [cases, filters, options]);

  useEffect(() => {
    const normalized = safePage === resolvedState.page ? resolvedState : { ...resolvedState, page: safePage };
    if (!sameExplorerState(normalized, explorerState)) onExplorerStateChange(normalized);
  }, [explorerState, onExplorerStateChange, resolvedState, safePage]);

  const updateState = (patch) => {
    onExplorerStateChange({
      filters,
      sort,
      page: safePage,
      ...patch,
    });
  };

  const setFilter = (key, value) => {
    updateState({ filters: { ...filters, [key]: value }, page: 1 });
  };

  const updateSort = (key) => {
    const nextSort = sort.key === key
      ? { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: key === 'parcelId' ? 'asc' : 'desc' };
    updateState({ sort: nextSort, page: 1 });
  };

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key !== 'search' && value).length + (filters.search ? 1 : 0);
  const aggregates = model.aggregates;

  return (
    <section className="workspace" aria-labelledby="conflict-explorer-title">
      <div className="workspace-heading">
        <div>
          <div className="eyebrow">Conflict management</div>
          <h1 id="conflict-explorer-title">Conflict Explorer</h1>
          <p>Find parcels with conflicting evidence, inspect every conflict on the case, then decide whether to enter reconciliation.</p>
        </div>
        <div className="dataset-meta" title="Values are calculated from the currently loaded production dataset">
          <span className="dataset-dot" aria-hidden="true" /> Runtime dataset
        </div>
      </div>

      <div className="summary-strip" aria-label="Conflict dataset summary">
        <div className="summary-item"><span>Open conflicts</span><strong>{aggregates.openConflictRecords.toLocaleString()}</strong></div>
        <div className="summary-item"><span>Affected parcels</span><strong>{aggregates.affectedParcelCases.toLocaleString()}</strong></div>
        <div className="summary-item"><span>Human review required</span><strong>{aggregates.parcelsRequiringHumanReview.toLocaleString()}</strong></div>
        <div className="summary-item"><span>Resolved conflicts</span><strong>{aggregates.resolvedConflictRecords.toLocaleString()}</strong></div>
      </div>

      <div className="filter-panel">
        <div className="search-row">
          <label className="search-field">
            <span className="sr-only">Search conflict cases</span>
            <input
              type="search"
              value={filters.search}
              onChange={(event) => setFilter('search', event.target.value)}
              placeholder="Search parcel, conflict ID, locality, conflict type, or source…"
            />
          </label>
          {activeFilterCount > 0 && (
            <button className="text-button" type="button" onClick={() => updateState({ filters: { ...EMPTY_FILTERS }, page: 1 })}>
              Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
            </button>
          )}
        </div>

        <div className="filter-grid">
          <FilterSelect label="Conflict status" filterKey="status" value={filters.status} options={options.status} counts={counts.status} onChange={setFilter} />
          <FilterSelect label="Conflict type" filterKey="conflictType" value={filters.conflictType} options={options.conflictType} counts={counts.conflictType} onChange={setFilter} />
          <FilterSelect label="Severity" filterKey="severity" value={filters.severity} options={options.severity} counts={counts.severity} onChange={setFilter} />
          <FilterSelect label="Criticality" filterKey="criticality" value={filters.criticality} options={options.criticality} counts={counts.criticality} onChange={setFilter} />
          <FilterSelect label="Human review" filterKey="humanReview" value={filters.humanReview} options={options.humanReview} counts={counts.humanReview} onChange={setFilter} formatOption={humanReviewLabel} />
          <FilterSelect label="Source type" filterKey="sourceType" value={filters.sourceType} options={options.sourceType} counts={counts.sourceType} onChange={setFilter} />
          <FilterSelect label="Parcel state" filterKey="parcelKind" value={filters.parcelKind} options={options.parcelKind} counts={counts.parcelKind} onChange={setFilter} formatOption={parcelKindLabel} />
          <FilterSelect label="Cell" filterKey="cell" value={filters.cell} options={options.cell} counts={counts.cell} onChange={setFilter} />
        </div>
      </div>

      <div className="table-toolbar">
        <div>
          <strong>{visibleSummary.cases.toLocaleString()}</strong> parcel cases · <strong>{visibleSummary.conflicts.toLocaleString()}</strong> conflict records in current view
        </div>
        <div>{visibleSummary.openConflicts.toLocaleString()} open · {visibleSummary.resolvedConflicts.toLocaleString()} resolved · {visibleSummary.humanReviewCases.toLocaleString()} review cases</div>
      </div>

      <div className="case-table-wrap">
        <table className="case-table">
          <thead>
            <tr>
              <th><SortButton active={sort.key === 'parcelId'} direction={sort.direction} onClick={() => updateSort('parcelId')}>Parcel ID</SortButton></th>
              <th>State</th>
              <th><SortButton active={sort.key === 'openConflicts'} direction={sort.direction} onClick={() => updateSort('openConflicts')}>Open</SortButton></th>
              <th><SortButton active={sort.key === 'conflictCount'} direction={sort.direction} onClick={() => updateSort('conflictCount')}>Total</SortButton></th>
              <th>Conflict types</th>
              <th><SortButton active={sort.key === 'severity'} direction={sort.direction} onClick={() => updateSort('severity')}>Severity</SortButton></th>
              <th><SortButton active={sort.key === 'criticality'} direction={sort.direction} onClick={() => updateSort('criticality')}>Criticality</SortButton></th>
              <th><SortButton active={sort.key === 'humanReview'} direction={sort.direction} onClick={() => updateSort('humanReview')}>Human review</SortButton></th>
              <th>Sources</th>
              <th>Case status</th>
            </tr>
          </thead>
          <tbody>
            {pageCases.map((parcelCase) => {
              const caseStatus = getCaseStatus(parcelCase);
              const conflictTypes = parcelCase.conflictTypes;
              return (
                <tr key={parcelCase.parcelId}>
                  <td>
                    <button type="button" className="parcel-link" onClick={() => onSelectCase(parcelCase.parcelId)}>
                      {parcelCase.parcelId}
                    </button>
                    <span className="cell-label">{getCaseCell(parcelCase) ?? '—'}</span>
                  </td>
                  <td><StatusBadge compact value={parcelCase.parcelKind}>{parcelKindLabel(parcelCase.parcelKind)}</StatusBadge></td>
                  <td className="numeric-cell">{parcelCase.openConflicts.length}</td>
                  <td className="numeric-cell">{parcelCase.conflicts.length}</td>
                  <td>
                    <div className="chip-row" title={conflictTypes.join(', ')}>
                      {conflictTypes.slice(0, 2).map((type) => <span className="data-chip" key={type}>{type}</span>)}
                      {conflictTypes.length > 2 && <span className="data-chip data-chip--more">+{conflictTypes.length - 2}</span>}
                    </div>
                  </td>
                  <td><StatusBadge compact value={parcelCase.highestSeverity}>{parcelCase.highestSeverity ?? '—'}</StatusBadge></td>
                  <td><StatusBadge compact value={parcelCase.highestCriticality}>{parcelCase.highestCriticality ?? '—'}</StatusBadge></td>
                  <td><span className={parcelCase.humanReviewRequired ? 'review-yes' : 'review-no'}>{parcelCase.humanReviewRequired ? 'Required' : 'No'}</span></td>
                  <td className="numeric-cell" title={parcelCase.sourceTypes.join(', ')}>{getCaseSourceCount(parcelCase)}</td>
                  <td><StatusBadge compact value={caseStatus}>{caseStatus}</StatusBadge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {pageCases.length === 0 && <div className="empty-state">No parcel conflict cases match the current filters.</div>}
      </div>

      {pageCount > 1 && (
        <div className="pagination" aria-label="Conflict case pages">
          <button type="button" disabled={safePage <= 1} onClick={() => updateState({ page: Math.max(1, safePage - 1) })}>Previous</button>
          <span>Page {safePage} of {pageCount}</span>
          <button type="button" disabled={safePage >= pageCount} onClick={() => updateState({ page: Math.min(pageCount, safePage + 1) })}>Next</button>
        </div>
      )}
    </section>
  );
}
