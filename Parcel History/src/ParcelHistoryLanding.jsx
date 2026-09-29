import { useEffect, useMemo, useState } from 'react';
import { fetchParcelHistoryIndex } from './api';
import './parcelHistoryLanding.css';

const HISTORY_LABELS = Object.freeze({
  CONFLICT: 'Conflict',
  GEOMETRY_CHANGE: 'Geometry Change',
  MERGE: 'Merge',
  MUTATION: 'Mutation',
  OFFICIAL_APPROVAL: 'Approval',
  SPLIT: 'Split',
  SURVEY_OBSERVATION: 'Survey'
});

const STATUS_LABELS = Object.freeze({
  ACTIVE: 'Active',
  HISTORICAL: 'Historical',
  PROPOSED: 'Proposed',
  SUPERSEDED: 'Superseded'
});

const PAGE_SIZE = 60;

function readable(value) {
  if (!value) return '—';
  return String(value)
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  }).format(date);
}

function getInitialFilters() {
  const params = new URLSearchParams(window.location.search);
  return {
    query: params.get('q') || '',
    status: params.get('status') || '',
    landUse: params.get('landUse') || '',
    cell: params.get('cell') || '',
    historyType: params.get('historyType') || '',
    includeHistorical: params.get('historical') === '1'
  };
}

function useUrlSyncedFilters(filters) {
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('parcel');

    const pairs = [
      ['q', filters.query.trim()],
      ['status', filters.status],
      ['landUse', filters.landUse],
      ['cell', filters.cell],
      ['historyType', filters.historyType]
    ];

    pairs.forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    });

    if (filters.includeHistorical) url.searchParams.set('historical', '1');
    else url.searchParams.delete('historical');

    window.history.replaceState(window.history.state, '', url);
  }, [filters]);
}

function matchesQuery(parcel, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;

  const fields = [
    parcel.parcelId,
    parcel.locality,
    parcel.cellId,
    ...(parcel.sourceParcelIds || [])
  ];

  return fields.some((value) => String(value || '').toLocaleLowerCase().includes(needle));
}

function ParcelRow({ parcel, onOpen }) {
  const latest = parcel.latestMeaningfulEvent;
  const lineageTypes = parcel.lineage?.semanticTypes || [];

  return (
    <button
      type="button"
      className="history-parcel-row"
      onClick={() => onOpen(parcel.parcelId)}
      aria-label={`Open history for ${parcel.parcelId}`}
    >
      <span className="parcel-id-cell">
        <strong>{parcel.parcelId}</strong>
        <span>{parcel.locality || parcel.cellId || 'Location unavailable'}</span>
      </span>

      <span className="row-cell row-land-use">
        <span className="mobile-label">Land use</span>
        <span>{parcel.landUse ? readable(parcel.landUse) : 'Not recorded'}</span>
      </span>

      <span className="row-cell">
        <span className="mobile-label">Status</span>
        <span className={`registry-status registry-status--${String(parcel.primaryStatus || '').toLowerCase()}`}>
          {STATUS_LABELS[parcel.primaryStatus] || readable(parcel.primaryStatus)}
        </span>
      </span>

      <span className="row-cell latest-event-cell">
        <span className="mobile-label">Latest meaningful event</span>
        <strong>{latest ? (HISTORY_LABELS[latest.type] || readable(latest.type)) : 'No recorded event'}</strong>
        {latest?.subtype && <span>{readable(latest.subtype)}</span>}
      </span>

      <span className="row-cell row-date">
        <span className="mobile-label">Event date</span>
        <span>{latest ? formatDate(latest.date) : '—'}</span>
      </span>

      <span className="row-cell lineage-cell">
        <span className="mobile-label">Lineage</span>
        {parcel.lineage?.hasLineage ? (
          <span
            className="lineage-marker"
            title={`${parcel.lineage.parentCount} parent(s), ${parcel.lineage.childCount} descendant(s)`}
          >
            {lineageTypes.map((type) => HISTORY_LABELS[type] || readable(type)).join(' · ') || 'Lineage'}
          </span>
        ) : <span className="quiet-dash">—</span>}
      </span>

      <span className="row-chevron" aria-hidden="true">›</span>
    </button>
  );
}

function ParcelDirectoryLoadingSkeleton() {
  return (
    <div className="directory-skeleton" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((item) => (
        <div className="directory-skeleton-row" key={item}>
          <span className="directory-skeleton-line directory-skeleton-line--id" />
          <span className="directory-skeleton-line" />
          <span className="directory-skeleton-line directory-skeleton-line--short" />
          <span className="directory-skeleton-line" />
        </div>
      ))}
    </div>
  );
}

export default function ParcelHistoryLanding({ onOpenParcel }) {
  const [index, setIndex] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(getInitialFilters);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useUrlSyncedFilters(filters);

  useEffect(() => {
    let cancelled = false;
    fetchParcelHistoryIndex()
      .then((payload) => {
        if (!cancelled) setIndex(payload);
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load parcel history index.');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filters]);

  const filteredParcels = useMemo(() => {
    if (!index?.parcels) return [];

    return index.parcels.filter((parcel) => {
      if (!filters.includeHistorical && parcel.identityClass === 'HISTORICAL_RETIRED') return false;
      if (!matchesQuery(parcel, filters.query)) return false;
      if (filters.status && !(parcel.stateMarkers || []).includes(filters.status)) return false;
      if (filters.landUse && parcel.landUse !== filters.landUse) return false;
      if (filters.cell && parcel.cellId !== filters.cell) return false;
      if (filters.historyType && !(parcel.historyTypes || []).includes(filters.historyType)) return false;
      return true;
    });
  }, [index, filters]);

  const visibleParcels = filteredParcels.slice(0, visibleCount);
  const hasActiveFilters = Boolean(
    filters.query || filters.status || filters.landUse || filters.cell || filters.historyType || filters.includeHistorical
  );

  const updateFilter = (key, value) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === 'status' && value === 'HISTORICAL') next.includeHistorical = true;
      if (key === 'includeHistorical' && value === false && current.status === 'HISTORICAL') next.status = '';
      return next;
    });
  };

  const resetFilters = () => {
    setFilters({
      query: '',
      status: '',
      landUse: '',
      cell: '',
      historyType: '',
      includeHistorical: false
    });
  };

  return (
    <main className="history-landing-page">
      <div className="history-landing-shell">
        <header className="history-landing-header">
          <div className="history-kicker">PRAMAN · Layer 4</div>
          <h1>Parcel History &amp; Lineage</h1>
          <p>Trace the recorded evolution and ancestry of canonical parcels.</p>
        </header>

        <section className="history-search-section" aria-label="Find parcel history">
          <label className="history-search-label" htmlFor="parcelHistorySearch">Find parcel</label>
          <div className="history-search-wrap">
            <span className="history-search-icon" aria-hidden="true">⌕</span>
            <input
              id="parcelHistorySearch"
              type="search"
              autoComplete="off"
              value={filters.query}
              onChange={(event) => updateFilter('query', event.target.value)}
              placeholder="Search canonical ID, source / legacy ID, locality or cell"
            />
            {filters.query && (
              <button type="button" className="clear-search" onClick={() => updateFilter('query', '')}>
                Clear
              </button>
            )}
          </div>
          <p className="search-scope-note">Search is limited to identifiers and location fields present in the Layer 4 dataset.</p>
        </section>

        <details className="history-filters">
          <summary>
            <span>Filters</span>
            {hasActiveFilters && <span className="filter-active-note">Active</span>}
          </summary>
          <div className="filter-grid">
            <label>
              <span>Status</span>
              <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
                <option value="">All dataset states</option>
                {(index?.facets?.statuses || []).map((status) => (
                  <option key={status} value={status}>{STATUS_LABELS[status] || readable(status)}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Land Use</span>
              <select value={filters.landUse} onChange={(event) => updateFilter('landUse', event.target.value)}>
                <option value="">All land uses</option>
                {(index?.facets?.landUses || []).map((landUse) => (
                  <option key={landUse} value={landUse}>{readable(landUse)}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Cell</span>
              <select value={filters.cell} onChange={(event) => updateFilter('cell', event.target.value)}>
                <option value="">All cells</option>
                {(index?.facets?.cells || []).map((cell) => (
                  <option key={cell} value={cell}>{cell}</option>
                ))}
              </select>
            </label>

            <label>
              <span>History Type</span>
              <select value={filters.historyType} onChange={(event) => updateFilter('historyType', event.target.value)}>
                <option value="">All history types</option>
                {(index?.facets?.historyTypes || []).map((type) => (
                  <option key={type} value={type}>{HISTORY_LABELS[type] || readable(type)}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="filter-footer">
            <div className="filter-footer-copy">
              <label className="historical-toggle">
                <input
                  type="checkbox"
                  checked={filters.includeHistorical}
                  onChange={(event) => updateFilter('includeHistorical', event.target.checked)}
                />
                <span>Include historical / superseded parcel records</span>
              </label>
              <span className="state-separation-note">Proposed and superseded markers never replace the row’s authoritative current status.</span>
            </div>
            {hasActiveFilters && <button type="button" className="reset-filters" onClick={resetFilters}>Reset filters</button>}
          </div>
        </details>

        <section className="parcel-results" aria-live="polite">
          <div className="results-meta">
            {index && !error ? (
              <span>
                {filteredParcels.length.toLocaleString('en-IN')} matching parcel {filteredParcels.length === 1 ? 'identity' : 'identities'}
                {!filters.includeHistorical && ` · ${index.counts.currentCanonical.toLocaleString('en-IN')} current canonical parcels available`}
              </span>
            ) : <span>Loading parcel identities…</span>}
          </div>

          {!index && !error && <ParcelDirectoryLoadingSkeleton />}
          {error && <div className="history-state history-state--error">{error}</div>}

          {!error && index && filteredParcels.length === 0 && (
            <div className="history-state">
              <strong>No parcels match this search.</strong>
              <span>Try a canonical/source ID, locality, cell, or clear one of the filters.</span>
            </div>
          )}

          {!error && visibleParcels.length > 0 && (
            <>
              <div className="parcel-list-head" aria-hidden="true">
                <span>Parcel</span>
                <span>Land use</span>
                <span>Status</span>
                <span>Latest meaningful event</span>
                <span>Date</span>
                <span>Lineage</span>
                <span />
              </div>
              <div className="history-parcel-list">
                {visibleParcels.map((parcel) => (
                  <ParcelRow key={parcel.parcelId} parcel={parcel} onOpen={onOpenParcel} />
                ))}
              </div>

              {visibleCount < filteredParcels.length && (
                <button
                  type="button"
                  className="load-more-parcels"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                >
                  Show more parcels
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
