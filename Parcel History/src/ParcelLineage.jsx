import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchParcelHistoryDetail, TIMELINE_MESSAGES } from './api';
import { buildEvidenceGraphLink } from './layer4DeepLinks';
import {
  LINEAGE_MODES,
  allLineageEdges,
  buildGraphLayout,
  crossCellEdge,
  defaultLineageMode,
  nodeArea,
  nodePeriod,
  nodeState,
  relationshipSummary,
  visibleLineageEdges
} from './lineageGraph';
import './parcelLineage.css';

const NODE_WIDTH = 222;
const NODE_HEIGHT = 126;

function readable(value) {
  if (!value) return 'Not recorded';
  return String(value)
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatArea(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(number)} m²`;
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(String(value).includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function periodLabel(detail) {
  const period = nodePeriod(detail);
  if (!period.start && !period.end) return 'Period not recorded';
  if (period.start && period.end) return `${formatDate(period.start)} → ${formatDate(period.end)}`;
  if (period.start && nodeState(detail).key === 'current') return `Effective ${formatDate(period.start)}`;
  return formatDate(period.start || period.end);
}

function relationLabel(edge) {
  if (!edge) return 'Relationship';
  const subtype = edge.eventSubtype || edge.semanticType || 'Relationship';
  return readable(subtype);
}

function LineageNode({ detail, selected, onClick, style }) {
  const state = nodeState(detail);
  const area = nodeArea(detail);
  const cell = detail?.parcel?.cellId || null;
  return (
    <button
      type="button"
      className={`lineage-node lineage-node--${state.key}${selected ? ' lineage-node--selected' : ''}`}
      style={style}
      onClick={onClick}
      aria-label={`Inspect ${detail.parcel.parcelId}, ${state.label}`}
    >
      <span className="lineage-node-state">{state.label}</span>
      <strong>{detail.parcel.parcelId}</strong>
      <span className="lineage-node-meta">{area !== null ? formatArea(area) : 'Area not recorded'}</span>
      <span className="lineage-node-period">{periodLabel(detail)}</span>
      {cell && <span className="lineage-node-cell">{cell}</span>}
    </button>
  );
}

function NodeInspector({ detail, onClose, onOpenHistory }) {
  if (!detail) return null;
  const state = nodeState(detail);
  const area = nodeArea(detail);
  const relation = relationshipSummary(detail);
  const period = nodePeriod(detail);
  const lineageEdges = detail.lineage?.edges || [];
  const lineageEventIds = [...new Set(lineageEdges.map((edge) => edge.lineageEventId).filter(Boolean))];
  const relationshipTypes = [...new Set(lineageEdges.map((edge) => edge.eventSubtype || edge.semanticType).filter(Boolean))];

  return (
    <aside className={`lineage-node-inspector lineage-node-inspector--${state.key}`} aria-label="Parcel lineage node inspector">
      <div className="lineage-node-inspector-head">
        <div>
          <span>LINEAGE NODE</span>
          <strong>{detail.parcel.parcelId}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close node inspector">×</button>
      </div>
      <div className="lineage-node-inspector-status">{state.label}</div>
      <dl>
        <div><dt>Period</dt><dd>{period.start || period.end ? periodLabel(detail) : 'Not recorded'}</dd></div>
        <div><dt>Area</dt><dd>{area !== null ? formatArea(area) : 'Not recorded'}</dd></div>
        <div><dt>Cell</dt><dd>{detail.parcel.cellId || 'Not recorded'}</dd></div>
        <div><dt>How it originated</dt><dd>{relation.originated}</dd></div>
        <div><dt>How it ended</dt><dd>{relation.ended}</dd></div>
        <div><dt>Parents</dt><dd>{relation.parents.length ? relation.parents.join(', ') : 'None recorded'}</dd></div>
        <div><dt>Children</dt><dd>{relation.children.length ? relation.children.join(', ') : 'None recorded'}</dd></div>
      </dl>
      <div className="lineage-node-actions">
        <a
          className="lineage-supporting-evidence"
          href={buildEvidenceGraphLink({
            parcelId: detail.parcel.parcelId,
            state: state.key === 'current' ? 'current-authoritative' : state.key,
            lineageEventId: lineageEventIds.length === 1 ? lineageEventIds[0] : null,
            lineageEventIds: lineageEventIds.length > 1 ? lineageEventIds.join(',') : null,
            relationshipType: relationshipTypes.length === 1 ? relationshipTypes[0] : null,
            from: 'parcel-lineage'
          }, window.location)}
        >
          VIEW SUPPORTING EVIDENCE <span aria-hidden="true">↗</span>
        </a>
        <button type="button" className="lineage-open-history" onClick={() => onOpenHistory(detail.parcel.parcelId)}>
          OPEN FULL HISTORY
        </button>
      </div>
    </aside>
  );
}

function axisCaption(mode) {
  if (mode === LINEAGE_MODES.FULL) return 'LATER DESCENDANTS ↑   SELECTED PARCEL   ↓ EARLIER ANCESTRY';
  if (mode === LINEAGE_MODES.DESCENDANTS) return 'SELECTED PARCEL ↓ LATER DESCENDANTS';
  return 'CURRENT / SELECTED PARCEL ↓ EARLIER ANCESTRY';
}

export default function ParcelLineage({ parcelId, onBackToHistory, onBackToParcels, onOpenHistory }) {
  const [details, setDetails] = useState({});
  const [visibleIds, setVisibleIds] = useState(new Set([parcelId]));
  const [expandedEarlier, setExpandedEarlier] = useState(new Set());
  const [expandedLater, setExpandedLater] = useState(new Set());
  const [mode, setMode] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fitScale, setFitScale] = useState(1);
  const graphViewportRef = useRef(null);
  const loadPromises = useRef(new Map());

  const loadDetail = useCallback(async (id) => {
    if (!id) return null;
    if (details[id]) return details[id];
    if (!loadPromises.current.has(id)) {
      loadPromises.current.set(id, fetchParcelHistoryDetail(id).finally(() => loadPromises.current.delete(id)));
    }
    const detail = await loadPromises.current.get(id);
    setDetails((current) => current[id] ? current : { ...current, [id]: detail });
    return detail;
  }, [details]);

  const loadMany = useCallback(async (ids) => {
    const unique = [...new Set(ids.filter(Boolean))];
    const loaded = await Promise.all(unique.map((id) => loadDetail(id).catch(() => null)));
    return loaded.filter(Boolean);
  }, [loadDetail]);

  const initialize = useCallback(async (nextMode, selectedDetail) => {
    const parents = selectedDetail?.lineage?.parents || [];
    const children = selectedDetail?.lineage?.children || [];
    const firstIds = [parcelId];
    const earlier = new Set();
    const later = new Set();

    if (nextMode === LINEAGE_MODES.ANCESTORS || nextMode === LINEAGE_MODES.FULL) {
      firstIds.push(...parents);
      if (parents.length) earlier.add(parcelId);
    }
    if (nextMode === LINEAGE_MODES.DESCENDANTS || nextMode === LINEAGE_MODES.FULL) {
      firstIds.push(...children);
      if (children.length) later.add(parcelId);
    }

    await loadMany(firstIds);
    setVisibleIds(new Set(firstIds));
    setExpandedEarlier(earlier);
    setExpandedLater(later);
    setSelectedNodeId(null);
    setFitScale(1);
  }, [loadMany, parcelId]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    setDetails({});
    setVisibleIds(new Set([parcelId]));
    setSelectedNodeId(null);
    setMode(null);

    fetchParcelHistoryDetail(parcelId)
      .then(async (detail) => {
        if (ignore) return;
        setDetails({ [parcelId]: detail });
        const initialMode = defaultLineageMode(detail.parcel);
        setMode(initialMode);
        await initialize(initialMode, detail);
      })
      .catch((requestError) => {
        if (ignore) return;
        setError(requestError?.code === 'PARCEL_NOT_FOUND' ? TIMELINE_MESSAGES.notFound : 'Unable to load parcel lineage.');
      })
      .finally(() => { if (!ignore) setLoading(false); });

    return () => { ignore = true; };
  }, [parcelId]); // initialize intentionally derives from the selected parcel only.

  const selectedDetail = details[parcelId] || null;
  const visibleEdges = useMemo(() => visibleLineageEdges(details, visibleIds), [details, visibleIds]);
  const allEdges = useMemo(() => allLineageEdges(details), [details]);
  const layout = useMemo(
    () => buildGraphLayout(parcelId, details, visibleIds, mode || LINEAGE_MODES.ANCESTORS, { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT }),
    [parcelId, details, visibleIds, mode]
  );

  const earlierFrontier = useMemo(() => [...visibleIds].filter((id) => {
    if (expandedEarlier.has(id)) return false;
    return (details[id]?.lineage?.parents || []).length > 0;
  }), [visibleIds, expandedEarlier, details]);

  const laterFrontier = useMemo(() => [...visibleIds].filter((id) => {
    if (expandedLater.has(id)) return false;
    return (details[id]?.lineage?.children || []).length > 0;
  }), [visibleIds, expandedLater, details]);

  const expandEarlier = async () => {
    const frontier = earlierFrontier;
    const parentIds = [...new Set(frontier.flatMap((id) => details[id]?.lineage?.parents || []))];
    await loadMany(parentIds);
    setVisibleIds((current) => new Set([...current, ...parentIds]));
    setExpandedEarlier((current) => new Set([...current, ...frontier]));
    setFitScale(1);
  };

  const expandLater = async () => {
    const frontier = laterFrontier;
    const childIds = [...new Set(frontier.flatMap((id) => details[id]?.lineage?.children || []))];
    await loadMany(childIds);
    setVisibleIds((current) => new Set([...current, ...childIds]));
    setExpandedLater((current) => new Set([...current, ...frontier]));
    setFitScale(1);
  };

  const changeMode = async (nextMode) => {
    if (!selectedDetail || nextMode === mode) return;
    setMode(nextMode);
    await initialize(nextMode, selectedDetail);
  };

  const reset = async () => {
    if (!selectedDetail) return;
    const initial = defaultLineageMode(selectedDetail.parcel);
    setMode(initial);
    await initialize(initial, selectedDetail);
  };

  const fitGraph = () => {
    const viewport = graphViewportRef.current;
    if (!viewport) return;
    const availableWidth = Math.max(260, viewport.clientWidth - 30);
    const availableHeight = Math.max(280, viewport.clientHeight - 30);
    const nextScale = Math.min(1, availableWidth / layout.width, availableHeight / layout.height);
    const readableScale = Math.max(0.84, nextScale);
    setFitScale(Number.isFinite(readableScale) && readableScale > 0 ? readableScale : 1);
    viewport.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <main className="parcel-lineage-page parcel-lineage-page--loading" aria-busy="true" aria-label="Loading parcel lineage">
        <div className="parcel-lineage-shell">
          <div className="lineage-skeleton lineage-skeleton--back" />
          <div className="lineage-skeleton lineage-skeleton--title" />
          <div className="lineage-skeleton lineage-skeleton--toolbar" />
          <div className="lineage-skeleton lineage-skeleton--graph">
            <span className="lineage-skeleton-node lineage-skeleton-node--current" />
            <span className="lineage-skeleton-edge" />
            <span className="lineage-skeleton-node lineage-skeleton-node--history" />
          </div>
        </div>
        <span className="sr-only">Loading parcel lineage…</span>
      </main>
    );
  }

  if (error || !selectedDetail) {
    return (
      <main className="parcel-lineage-page">
        <div className="lineage-page-state lineage-page-state--error">
          <strong>{error || 'Parcel lineage unavailable.'}</strong>
          <button type="button" onClick={onBackToHistory}>← Parcel History</button>
        </div>
      </main>
    );
  }

  const selectedState = nodeState(selectedDetail);
  const selectedInspector = selectedNodeId ? details[selectedNodeId] : null;
  const modeAllowsEarlier = mode === LINEAGE_MODES.ANCESTORS || mode === LINEAGE_MODES.FULL;
  const modeAllowsLater = mode === LINEAGE_MODES.DESCENDANTS || mode === LINEAGE_MODES.FULL;

  return (
    <main className="parcel-lineage-page">
      <div className="parcel-lineage-shell">
        <header className="parcel-lineage-header">
          <div className="lineage-back-row">
            <button type="button" onClick={onBackToHistory}>← Parcel History</button>
            <button type="button" onClick={onBackToParcels}>All Parcels</button>
          </div>
          <div className="lineage-title-row">
            <div>
              <span className="lineage-kicker">Parcel History &amp; Lineage</span>
              <h1>Parcel Lineage</h1>
              <p>Which parcels led to this parcel, and what did this parcel become?</p>
            </div>
            <div className={`lineage-selected-summary lineage-selected-summary--${selectedState.key}`}>
              <span>{selectedState.label}</span>
              <strong>{selectedDetail.parcel.parcelId}</strong>
              <small>{selectedDetail.parcel.cellId || 'Cell not recorded'}</small>
            </div>
          </div>
        </header>

        <section className="lineage-toolbar" aria-label="Lineage graph controls">
          <div className="lineage-mode-switch" aria-label="Lineage scope">
            <button type="button" className={mode === LINEAGE_MODES.ANCESTORS ? 'is-active' : ''} onClick={() => changeMode(LINEAGE_MODES.ANCESTORS)}>Ancestors</button>
            <button type="button" className={mode === LINEAGE_MODES.FULL ? 'is-active' : ''} onClick={() => changeMode(LINEAGE_MODES.FULL)}>Full Lineage</button>
            <button type="button" className={mode === LINEAGE_MODES.DESCENDANTS ? 'is-active' : ''} onClick={() => changeMode(LINEAGE_MODES.DESCENDANTS)}>Descendants</button>
          </div>
          <div className="lineage-action-controls">
            {modeAllowsEarlier && <button type="button" disabled={!earlierFrontier.length} onClick={expandEarlier}>Expand Earlier</button>}
            {modeAllowsLater && <button type="button" disabled={!laterFrontier.length} onClick={expandLater}>Expand Descendants</button>}
            <button type="button" onClick={fitGraph} title="Fit visible lineage without shrinking labels below readable scale">Fit Graph</button>
            <button type="button" onClick={reset}>Reset</button>
          </div>
        </section>

        <div className="lineage-orientation-label">{axisCaption(mode)}</div>

        {visibleEdges.length === 0 && (selectedDetail.lineage?.edges || []).length === 0 && (
          <section className="lineage-empty lineage-empty--inline">
            <strong>No parcel identity-changing lineage recorded</strong>
            <span>The current dataset contains no explicit split, merge, consolidation, or cross-cell lineage edge for this parcel. The selected parcel remains visible below.</span>
          </section>
        )}

        <section className="lineage-workspace">
            <div className="lineage-graph-viewport" ref={graphViewportRef}>
              <div
                className="lineage-scaled-stage"
                style={{ width: layout.width * fitScale, height: layout.height * fitScale }}
              >
                <div
                  className="lineage-graph-stage"
                  style={{ width: layout.width, height: layout.height, transform: `scale(${fitScale})` }}
                >
                  <svg className="lineage-edge-layer" width={layout.width} height={layout.height} aria-hidden="true">
                    {visibleEdges.map((edge) => {
                      const parent = layout.positions[edge.parentParcelId];
                      const child = layout.positions[edge.childParcelId];
                      if (!parent || !child) return null;
                      const parentCenter = { x: parent.x + NODE_WIDTH / 2, y: parent.y + NODE_HEIGHT / 2 };
                      const childCenter = { x: child.x + NODE_WIDTH / 2, y: child.y + NODE_HEIGHT / 2 };
                      const from = childCenter.y < parentCenter.y ? childCenter : parentCenter;
                      const to = childCenter.y < parentCenter.y ? parentCenter : childCenter;
                      const bend = (from.y + to.y) / 2;
                      const key = `${edge.lineageEventId}-${edge.parentParcelId}-${edge.childParcelId}`;
                      const isCrossCell = crossCellEdge(edge, details) || String(edge.eventSubtype || '').startsWith('CROSS_CELL_');
                      return (
                        <g key={key} className={`lineage-edge lineage-edge--${String(edge.semanticType || '').toLowerCase()}${isCrossCell ? ' lineage-edge--cross-cell' : ''}`}>
                          <path d={`M ${from.x} ${from.y} C ${from.x} ${bend}, ${to.x} ${bend}, ${to.x} ${to.y}`} />
                          <text x={(from.x + to.x) / 2} y={bend - 8} textAnchor="middle">{relationLabel(edge)}</text>
                        </g>
                      );
                    })}
                  </svg>

                  {Object.entries(layout.positions).map(([id, position]) => {
                    const detail = details[id];
                    if (!detail) return null;
                    return (
                      <LineageNode
                        key={id}
                        detail={detail}
                        selected={id === parcelId}
                        onClick={() => setSelectedNodeId(id)}
                        style={{ left: position.x, top: position.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {selectedInspector && (
              <NodeInspector
                detail={selectedInspector}
                onClose={() => setSelectedNodeId(null)}
                onOpenHistory={onOpenHistory}
              />
            )}
          </section>

        <footer className="lineage-footnote">
          <span>{visibleIds.size} parcel node{visibleIds.size === 1 ? '' : 's'} currently shown</span>
          <span>{visibleEdges.length} explicit relationship edge{visibleEdges.length === 1 ? '' : 's'} shown</span>
          <span>{allEdges.length} loaded relationship edge{allEdges.length === 1 ? '' : 's'} in current graph context</span>
        </footer>
      </div>
    </main>
  );
}
