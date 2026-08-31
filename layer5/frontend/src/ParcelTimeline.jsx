import React, { useEffect, useMemo, useState } from 'react';
import { fetchParcelTimeline, TIMELINE_MESSAGES } from './api';
import './parcelTimeline.css';

const TYPE_LABELS = {
  creation: 'Created',
  ownership: 'Ownership',
  geometry: 'Geometry',
  merge: 'Merge',
  administrative: 'Administrative',
  risk: 'Risk',
  revenue: 'Revenue',
  registration: 'Registration',
  survey: 'Survey',
  ulb: 'ULB',
  planning: 'Planning'
};

function present(value, emptyText = '—') {
  return value === null || value === undefined || value === '' ? emptyText : value;
}

function hasNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function formatArea(value) {
  return hasNumber(value) ? `${Number(value).toLocaleString('en-IN')} m²` : 'Area unavailable';
}

function confidenceLabel(value) {
  return hasNumber(value) ? `${Math.round(Number(value) * 100)}%` : 'Unavailable';
}

function fieldValue(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  return /area/i.test(field) && hasNumber(value) ? formatArea(value) : value;
}

function EventNode({ event, selected, onClick }) {
  const eventType = event?.type;
  const eventMeta = [
    event?.source,
    event?.parcelId ? `applies to ${event.parcelId}` : null
  ].filter(Boolean);

  return (
    <button
      type="button"
      className={`timeline-event ${selected ? 'is-selected' : ''}`}
      onClick={() => onClick(event)}
      aria-pressed={selected}
    >
      <span className={`event-dot${eventType ? ` event-dot--${eventType}` : ''}`} aria-hidden="true" />
      <span className="event-copy">
        <span className="event-year">{present(event.dateLabel || event.date || event.year, 'Date unavailable')}</span>
        <span className="event-title-row">
          <span className="event-title">{present(event.title || event.eventType, 'Event')}</span>
          {eventType && (
            <span className={`type-badge type-badge--${eventType}`}>
              {TYPE_LABELS[eventType] || eventType}
            </span>
          )}
        </span>
        {eventMeta.length > 0 && <span className="event-source">{eventMeta.join(' · ')}</span>}
      </span>
    </button>
  );
}

function ParcelLineage({ lineage, selectedParcelId, onSelectParcel }) {
  const members = Array.isArray(lineage?.members)
    ? lineage.members.filter((parcel) => parcel?.id)
    : [];

  if (lineage?.type !== 'merge' || members.length === 0) return null;

  return (
    <section className="lineage-overview" aria-label="Dataset-recorded merge lineage">
      <div className="lineage-overview__heading">
        <div>
          <span>Merge evidence</span>
          {lineage.groupId && <strong>{lineage.groupId}</strong>}
        </div>
        <p>Only parcels sharing the supplied merge group are shown.</p>
      </div>
      <div className="merge-flow">
        <div className="merge-members">
          {members.map((parcel, index) => {
            const details = [
              hasNumber(parcel.areaSqM) ? formatArea(parcel.areaSqM) : null,
              parcel.status
            ].filter(Boolean);

            return (
            <React.Fragment key={parcel.id}>
              {index > 0 && <span className="merge-plus" aria-hidden="true">+</span>}
              <button
                type="button"
                className={`lineage-parcel ${parcel.id === selectedParcelId ? 'is-current' : ''}`}
                onClick={() => onSelectParcel(parcel.id)}
                aria-current={parcel.id === selectedParcelId ? 'true' : undefined}
              >
                <strong>{parcel.id}</strong>
                {parcel.sourceParcelId && <span>{parcel.sourceParcelId}</span>}
                {details.length > 0 && <span>{details.join(' · ')}</span>}
              </button>
            </React.Fragment>
            );
          })}
        </div>
        {lineage.groupId && <span className="merge-arrow" aria-hidden="true">→</span>}
        {lineage.groupId && (
          <div className="merge-group-result">
            <span>Dataset merge group</span>
            <strong>{lineage.groupId}</strong>
          </div>
        )}
      </div>
    </section>
  );
}

function EvidenceRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function EventDetail({ event, hasEvents }) {
  if (!event) {
    return (
      <section className="detail-panel empty-detail">
        <p>{hasEvents ? 'Select an event to inspect its evidence and field-level changes.' : TIMELINE_MESSAGES.empty}</p>
      </section>
    );
  }

  const attributes = Array.isArray(event.attributes)
    ? event.attributes.filter((item) => item?.field && present(item.value, '') !== '')
    : [];
  const changes = Array.isArray(event.changes)
    ? event.changes.filter((change) => (
      change?.field
      && (present(change.from, '') !== '' || present(change.to, '') !== '')
    ))
    : [];
  const geometryMetrics = [
    event.geometry?.previousAreaSqM !== null && event.geometry?.previousAreaSqM !== undefined
      ? { label: 'Previous area', value: formatArea(event.geometry.previousAreaSqM) }
      : null,
    event.geometry?.newAreaSqM !== null && event.geometry?.newAreaSqM !== undefined
      ? { label: 'New area', value: formatArea(event.geometry.newAreaSqM) }
      : null,
    event.geometry?.deltaSqM !== null && event.geometry?.deltaSqM !== undefined
      ? { label: 'Delta', value: `${event.geometry.deltaSqM > 0 ? '+' : ''}${event.geometry.deltaSqM} m²` }
      : null
  ].filter(Boolean);

  return (
    <aside className="detail-panel">
      <div className="detail-kicker">Event details</div>
      <h2>{present(event.title || event.eventType, 'Event')}</h2>
      <div className="detail-date">
        {[
          event.dateLabel || event.date || event.year || 'Date unavailable',
          event.parcelId
        ].filter(Boolean).join(' · ')}
      </div>
      {event.summary && <p className="detail-summary">{event.summary}</p>}

      {attributes.length > 0 && (
        <div className="detail-section">
          <div className="section-heading">Recorded values</div>
          <dl className="attribute-list">
            {attributes.map((item, index) => (
              <div key={`${item.field}-${index}`}>
                <dt>{item.field}</dt>
                <dd>{fieldValue(item.field, item.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {changes.length > 0 && (
        <div className="detail-section">
          <div className="section-heading">Recorded changes</div>
          <div className="change-list">
            {changes.map((change, index) => {
              const hasFrom = present(change.from, '') !== '';
              const hasTo = present(change.to, '') !== '';

              return (
                <div className="change-card" key={`${change.field}-${index}`}>
                  <div className="change-field">{change.field}</div>
                  <div className={`change-values${hasFrom && hasTo ? '' : ' change-values--single'}`}>
                    {hasFrom && (
                      <div>
                        <span className="change-label">From</span>
                        <strong>{fieldValue(change.field, change.from)}</strong>
                      </div>
                    )}
                    {hasFrom && hasTo && <span className="change-arrow" aria-hidden="true">→</span>}
                    {hasTo && (
                      <div>
                        <span className="change-label">To</span>
                        <strong>{fieldValue(change.field, change.to)}</strong>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {geometryMetrics.length > 0 && (
        <div className="detail-section geometry-summary">
          <div className="section-heading">Geometry / area evidence</div>
          <div className="metric-row">
            {geometryMetrics.map((metric) => (
              <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>
            ))}
          </div>
          {typeof event.geometry?.shapeChanged === 'boolean' && (
            <p className="shape-note">Supplied geometry: {event.geometry.shapeChanged ? 'changed' : 'unchanged'}</p>
          )}
        </div>
      )}

      <div className="detail-section evidence-block">
        <div className="section-heading">Source evidence</div>
        <dl>
          <EvidenceRow label="Source" value={event.source} />
          <EvidenceRow label="Record ID" value={event.recordId} />
          <EvidenceRow label="Record" value={event.evidence?.recordType} />
          <EvidenceRow label="Verification" value={event.evidence?.verificationState} />
          <EvidenceRow label="Coordinates" value={event.evidence?.coordinateSystem} />
          <EvidenceRow label="Conflict" value={event.evidence?.conflictType} />
          <EvidenceRow label="Confidence" value={hasNumber(event.confidence) ? confidenceLabel(event.confidence) : null} />
        </dl>
      </div>
    </aside>
  );
}

export default function ParcelTimeline({ parcels, parcelId, onSelectParcel }) {
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;

    async function loadTimeline() {
      setLoading(true);
      setError('');
      setData(null);
      setActiveFilter('all');

      try {
        const payload = await fetchParcelTimeline(parcelId);
        if (ignore) return;
        setData(payload);
        setSelectedId(payload.events.at(-1)?.id || null);
      } catch (err) {
        if (!ignore) {
          setError(
            err?.message === TIMELINE_MESSAGES.notFound
              ? TIMELINE_MESSAGES.notFound
              : TIMELINE_MESSAGES.error
          );
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadTimeline();
    return () => { ignore = true; };
  }, [parcelId]);

  const filteredEvents = useMemo(() => {
    if (!data?.events) return [];
    if (activeFilter === 'all') return data.events;
    return data.events.filter((event) => event.type === activeFilter);
  }, [data, activeFilter]);

  const selectedEvent = useMemo(() => {
    return data?.events?.find((event) => event.id === selectedId) || null;
  }, [data, selectedId]);

  const filters = useMemo(() => (
    ['all', ...new Set((data?.events || []).map((event) => event.type).filter(Boolean))]
  ), [data]);

  if (loading) {
    return <main className="parcel-timeline-page"><div className="state-card">{TIMELINE_MESSAGES.loading}</div></main>;
  }

  if (error) {
    return <main className="parcel-timeline-page"><div className="state-card state-card--error">{error}</div></main>;
  }

  if (!data) return null;

  const parcel = data.parcel || {};
  const events = Array.isArray(data.events) ? data.events : [];

  return (
    <main className="parcel-timeline-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Full Parcel Lifecycle</div>
          <h1>Parcel Timeline</h1>
          <p>Trace supplied parcel history and departmental records without replacing source-attributed evidence.</p>
        </div>
        <div className="header-controls">
          <label className="parcel-selector" htmlFor="parcelSelector">
            <span>Select parcel / owner</span>
            <select
              id="parcelSelector"
              value={parcelId}
              onChange={(event) => onSelectParcel(event.target.value)}
            >
              {parcels.map((parcel) => (
                <option value={parcel.parcelId} key={parcel.parcelId}>{parcel.displayName}</option>
              ))}
            </select>
          </label>
          <div className="current-state">
            <span className="current-state-label">Current canonical parcel</span>
            <strong>{present(parcel.canonicalId, parcelId)}</strong>
            {(parcel.currentOwner || hasNumber(parcel.currentAreaSqM)) && (
              <span>
                {[
                  parcel.currentOwner,
                  hasNumber(parcel.currentAreaSqM) ? formatArea(parcel.currentAreaSqM) : null
                ].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        </div>
      </header>

      <section className="summary-strip" aria-label="Parcel summary">
        <div><span>Canonical parcel</span><strong>{present(parcel.canonicalId, parcelId)}</strong></div>
        {parcel.id && <div><span>Source parcel</span><strong>{parcel.id}</strong></div>}
        {parcel.currentOwner && <div><span>Owner</span><strong>{parcel.currentOwner}</strong></div>}
        {hasNumber(parcel.currentAreaSqM) && <div><span>Area</span><strong>{formatArea(parcel.currentAreaSqM)}</strong></div>}
        {parcel.status && <div><span>Status</span><strong>{parcel.status}</strong></div>}
        {hasNumber(parcel.confidence) && <div><span>Confidence</span><strong>{confidenceLabel(parcel.confidence)}</strong></div>}
        <div><span>Events</span><strong>{events.length}</strong></div>
      </section>

      <ParcelLineage lineage={data.lineage} selectedParcelId={parcel.canonicalId} onSelectParcel={onSelectParcel} />

      <section className="timeline-toolbar">
        <div className="filter-group" role="group" aria-label="Filter timeline events">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={activeFilter === filter ? 'filter-chip is-active' : 'filter-chip'}
              onClick={() => setActiveFilter(filter)}
            >
              {filter === 'all' ? 'All events' : TYPE_LABELS[filter] || filter}
            </button>
          ))}
        </div>
        <span className="history-note">Dates retain the precision supplied by each Dataset record.</span>
      </section>

      <div className="timeline-layout">
        <section className={`timeline-panel ${filteredEvents.length ? '' : 'timeline-panel--empty'}`}>
          {filteredEvents.length > 0 && <div className="timeline-rail" aria-hidden="true" />}
          {filteredEvents.map((event, index) => (
            <div className="timeline-item" key={event.id || `${event.eventType || 'event'}-${index}`}>
              <EventNode
                event={event}
                selected={event.id === selectedId}
                onClick={(nextEvent) => setSelectedId(nextEvent.id)}
              />
            </div>
          ))}

          {filteredEvents.length === 0 && (
            <div className="empty-filter">{events.length ? 'No events match this filter.' : TIMELINE_MESSAGES.empty}</div>
          )}
        </section>

        <EventDetail event={selectedEvent} hasEvents={events.length > 0} />
      </div>
    </main>
  );
}
