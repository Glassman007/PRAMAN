import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchGeometryVersion, fetchParcelHistoryDetail } from './api';
import { buildUnifiedSpatialViewLink } from './layer4DeepLinks';
import {
  areaDifference,
  boundsForRings,
  mergeBounds,
  parsePolygonWkt,
  ringsToSvgPath,
  selectGeometryRefFromParcelDetail
} from './spatialGeometry';
import './spatialHistory.css';

function readable(value) {
  if (!value) return 'Not recorded';
  return String(value).toLowerCase().split('_').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function formatMoment(value) {
  if (!value) return 'Date not recorded';
  const normalized = String(value).includes('T') ? value : String(value).replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatArea(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(number)} m²`;
}

function useLazyGeometry(geometryId) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null });

  useEffect(() => {
    setState({ status: 'idle', data: null, error: null });
  }, [geometryId]);

  const load = async () => {
    if (!geometryId || state.status === 'loading' || state.status === 'loaded') return state.data;
    setState({ status: 'loading', data: null, error: null });
    try {
      const data = await fetchGeometryVersion(geometryId);
      setState({ status: 'loaded', data, error: null });
      return data;
    } catch (error) {
      setState({ status: 'error', data: null, error });
      return null;
    }
  };

  return { ...state, load };
}

function GeometrySvg({ items, className = '', ariaLabel = 'Parcel geometry' }) {
  const parsed = useMemo(() => items.map((item) => ({
    ...item,
    rings: parsePolygonWkt(item.geometry?.geometryWkt)
  })).filter((item) => item.rings.length), [items]);

  const bounds = useMemo(() => mergeBounds(parsed.map((item) => boundsForRings(item.rings))), [parsed]);
  if (!parsed.length || !bounds) return <div className="geometry-unavailable-inline">Geometry coordinates unavailable</div>;

  return (
    <svg className={`geometry-svg ${className}`} viewBox="0 0 320 180" role="img" aria-label={ariaLabel}>
      <rect x="0" y="0" width="320" height="180" rx="10" className="geometry-svg-bg" />
      {parsed.map((item, index) => (
        <path
          key={`${item.geometry.geometryId}-${index}`}
          d={ringsToSvgPath(item.rings, bounds)}
          className={`geometry-shape geometry-shape--${item.role || 'default'}`}
          fillRule="evenodd"
        />
      ))}
    </svg>
  );
}

function GeometryModal({ title, items, onClose, note, actionHref = null }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const keydown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', keydown);
    requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.removeEventListener('keydown', keydown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [onClose]);

  return (
    <div className="geometry-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="geometry-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="geometry-modal-header">
          <div><span>Spatial history</span><h3>{title}</h3></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close geometry viewer" title="Close geometry viewer">×</button>
        </div>
        <GeometrySvg items={items} className="geometry-svg--expanded" ariaLabel={title} />
        {note && <p className="geometry-modal-note">{note}</p>}
        {actionHref && (
          <a className="spatial-context-link" href={actionHref}>OPEN IN UNIFIED SPATIAL VIEW <span aria-hidden="true">↗</span></a>
        )}
      </section>
    </div>
  );
}

export function LazyGeometryCard({
  label,
  geometryRef,
  tone = 'official',
  sublabel = null,
  badge = null,
  parcelId = null,
  spatialState = null,
  unavailableText = 'Geometry version unavailable for this historical event'
}) {
  const geometryId = geometryRef?.geometryId;
  const lazy = useLazyGeometry(geometryId);
  const [expanded, setExpanded] = useState(false);

  if (!geometryId) {
    return (
      <section className={`geometry-card geometry-card--${tone}`}>
        <div className="geometry-card-heading"><span>{label}</span>{badge && <strong>{badge}</strong>}</div>
        <p className="geometry-card-unavailable">{unavailableText}</p>
      </section>
    );
  }

  const versionLabel = [geometryRef.version, geometryRef.geometryStatus ? readable(geometryRef.geometryStatus) : null].filter(Boolean).join(' · ');
  const spatialHref = parcelId ? buildUnifiedSpatialViewLink({
    parcelId,
    geometryId,
    geometryVersion: geometryRef.version,
    state: spatialState,
    from: 'parcel-history'
  }, window.location) : null;

  return (
    <section className={`geometry-card geometry-card--${tone}`}>
      <div className="geometry-card-heading">
        <div><span>{label}</span><strong>{geometryId}</strong></div>
        {badge && <em>{badge}</em>}
      </div>
      <div className="geometry-card-meta">
        {versionLabel && <span>{versionLabel}</span>}
        {geometryRef.effectiveDate && <span>{formatMoment(geometryRef.effectiveDate)}</span>}
        {sublabel && <span>{sublabel}</span>}
      </div>

      {lazy.status === 'idle' && (
        <button type="button" className="geometry-load-button" onClick={lazy.load}>Load geometry preview</button>
      )}
      {lazy.status === 'loading' && <div className="geometry-loading">Loading geometry…</div>}
      {lazy.status === 'error' && <div className="geometry-card-unavailable">Geometry could not be loaded from current records.</div>}
      {lazy.status === 'loaded' && lazy.data && (
        <button type="button" className="geometry-thumbnail-button" onClick={() => setExpanded(true)} aria-label={`Expand ${label.toLowerCase()}`}>
          <GeometrySvg items={[{ geometry: lazy.data, role: tone }]} ariaLabel={`${label} ${geometryId}`} />
          <span>Expand geometry</span>
        </button>
      )}

      {expanded && lazy.data && (
        <GeometryModal
          title={label}
          items={[{ geometry: lazy.data, role: tone }]}
          onClose={() => setExpanded(false)}
          note={`${geometryId}${geometryRef.crs ? ` · ${geometryRef.crs}` : ''}`}
          actionHref={spatialHref}
        />
      )}
    </section>
  );
}

export function GeometryChangeSpatialInspector({ event }) {
  const [requested, setRequested] = useState(false);
  const [viewMode, setViewMode] = useState('side');
  const before = useLazyGeometry(event.geometry_before?.geometryId || event.geometry_version_before);
  const after = useLazyGeometry(event.geometry_after?.geometryId || event.geometry_version_after);
  const difference = areaDifference(event.area_before_sqm, event.area_after_sqm);

  useEffect(() => {
    if (!requested) return;
    before.load();
    after.load();
    // IDs are the stable trigger; load functions intentionally remain local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, event.geometry_version_before, event.geometry_version_after]);

  if (!requested) {
    return <button type="button" className="spatial-inspect-button" onClick={() => setRequested(true)}>View spatial change</button>;
  }

  const unavailable = before.status === 'error' || after.status === 'error';
  const loaded = before.status === 'loaded' && after.status === 'loaded' && before.data && after.data;

  return (
    <section className="spatial-event-viewer">
      <div className="spatial-event-heading">
        <div><span>Spatial change</span><strong>BEFORE → AFTER</strong></div>
        {loaded && (
          <div className="geometry-view-toggle" aria-label="Geometry comparison mode">
            <button type="button" className={viewMode === 'side' ? 'active' : ''} onClick={() => setViewMode('side')}>Side by side</button>
            <button type="button" className={viewMode === 'overlay' ? 'active' : ''} onClick={() => setViewMode('overlay')}>Overlay</button>
          </div>
        )}
      </div>

      {!loaded && !unavailable && <div className="geometry-loading">Loading requested geometry versions…</div>}
      {unavailable && <p className="geometry-card-unavailable">Geometry version unavailable for this historical event</p>}

      {loaded && viewMode === 'side' && (
        <div className="geometry-side-by-side">
          <div><span>BEFORE · {before.data.version || event.geometry_version_before}</span><GeometrySvg items={[{ geometry: before.data, role: 'before' }]} /></div>
          <div className="geometry-change-arrow" aria-hidden="true">→</div>
          <div><span>AFTER · {after.data.version || event.geometry_version_after}</span><GeometrySvg items={[{ geometry: after.data, role: 'after' }]} /></div>
        </div>
      )}

      {loaded && viewMode === 'overlay' && (
        <div className="geometry-overlay-view">
          <GeometrySvg items={[{ geometry: before.data, role: 'before' }, { geometry: after.data, role: 'after' }]} ariaLabel="Before and after geometry overlay" />
          <div className="geometry-legend"><span className="before">Before</span><span className="after">After</span></div>
        </div>
      )}

      <div className="geometry-area-delta">
        <div><span>Area before</span><strong>{formatArea(event.area_before_sqm) || 'Not recorded'}</strong></div>
        <div><span>Area after</span><strong>{formatArea(event.area_after_sqm) || 'Not recorded'}</strong></div>
        <div><span>Area difference</span><strong>{difference === null ? 'Not recorded' : `${difference > 0 ? '+' : ''}${formatArea(difference)}`}</strong></div>
      </div>
      <a
        className="spatial-context-link"
        href={buildUnifiedSpatialViewLink({
          parcelId: event.parcel_id,
          eventId: event.adapter_event_key || event.event_id,
          geometryId: event.geometry_after?.geometryId || event.geometry_version_after,
          geometryVersion: event.geometry_after?.version || event.geometry_version_after,
          state: 'history-event',
          from: 'parcel-history'
        }, window.location)}
      >OPEN IN UNIFIED SPATIAL VIEW <span aria-hidden="true">↗</span></a>
    </section>
  );
}

async function loadRelationshipGeometry(parcelId, eventDate) {
  try {
    const detail = await fetchParcelHistoryDetail(parcelId);
    const reference = selectGeometryRefFromParcelDetail(detail, eventDate);
    if (!reference?.geometryId) return { parcelId, reference: null, geometry: null };
    const geometry = await fetchGeometryVersion(reference.geometryId);
    return { parcelId, reference, geometry };
  } catch {
    return { parcelId, reference: null, geometry: null };
  }
}

function RelationshipGroup({ title, records, role }) {
  if (!records.length) return <div className="lineage-geometry-missing">No geometry available for {title.toLowerCase()}.</div>;
  const available = records.filter((record) => record.geometry);
  return (
    <div className="lineage-geometry-group">
      <span>{title}</span>
      {available.length ? <GeometrySvg items={available.map((record) => ({ geometry: record.geometry, role }))} ariaLabel={title} /> : <div className="lineage-geometry-missing">Geometry version unavailable for this historical event</div>}
      <div className="lineage-geometry-ids">
        {records.map((record) => <small key={record.parcelId}>{record.parcelId}{record.reference?.version ? ` · ${record.reference.version}` : ''}</small>)}
      </div>
    </div>
  );
}

export function LineageSpatialInspector({ event }) {
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parents, setParents] = useState([]);
  const [children, setChildren] = useState([]);

  const parentIds = useMemo(() => [...new Set(event.related_parent_parcels || [])], [event.related_parent_parcels]);
  const childIds = useMemo(() => [...new Set(event.related_child_parcels || [])], [event.related_child_parcels]);

  const request = async () => {
    setRequested(true);
    setLoading(true);
    const eventDate = event.effective_date || event.recorded_date || null;
    const [parentRecords, childRecords] = await Promise.all([
      Promise.all(parentIds.map((id) => loadRelationshipGeometry(id, eventDate))),
      Promise.all(childIds.map((id) => loadRelationshipGeometry(id, eventDate)))
    ]);
    setParents(parentRecords);
    setChildren(childRecords);
    setLoading(false);
  };

  if (!requested) {
    return <button type="button" className="spatial-inspect-button" onClick={request}>View relationship geometry</button>;
  }

  if (loading) return <div className="geometry-loading">Loading related parcel geometry…</div>;

  const split = event.event_type === 'SPLIT';
  return (
    <section className="spatial-event-viewer spatial-event-viewer--lineage">
      <div className="spatial-event-heading"><div><span>Spatial lineage</span><strong>{split ? 'ONE PARENT → MULTIPLE CHILDREN' : 'MULTIPLE PARENTS → ONE RESULT'}</strong></div></div>
      <div className="lineage-geometry-flow">
        <RelationshipGroup title={split ? 'PARENT' : 'PARENTS'} records={parents} role="lineage-parent" />
        <div className="geometry-change-arrow" aria-hidden="true">→</div>
        <RelationshipGroup title={split ? 'CHILDREN' : 'RESULT'} records={children} role="lineage-child" />
      </div>
      <a
        className="spatial-context-link"
        href={buildUnifiedSpatialViewLink({
          parcelId: event.parcel_id,
          eventId: event.adapter_event_key || event.event_id,
          state: split ? 'split-history' : 'merge-history',
          from: 'parcel-history'
        }, window.location)}
      >OPEN IN UNIFIED SPATIAL VIEW <span aria-hidden="true">↗</span></a>
    </section>
  );
}
