import { REPLAY_STAGES } from '../replay/stages.mjs';

export const PRAMAN_DASHBOARD_PATHS = Object.freeze({
  unifiedSpatialView: '/unified-spatial-view',
  conflictExplorer: '/conflict-explorer',
  reconciliation: '/conflict-explorer',
  sourceSchemaMapping: '/source-schema-mapping',
  parcelHistoryLineage: '/layer4',
  evidenceGraph: '/evidence-graph',
});

const STAGE_IDS = new Set(REPLAY_STAGES.map((s) => s.id));
const clean = (value) => value === null || value === undefined || value === '' ? null : String(value);

function toUrl(path, origin = 'http://praman.local') {
  return new URL(path || '/', origin);
}

function relativeUrl(url) {
  return `${url.pathname}${url.search}${url.hash}`;
}

export function mergeDashboardPaths(overrides = {}) {
  return { ...PRAMAN_DASHBOARD_PATHS, ...(overrides || {}) };
}

export function buildEvidenceGraphState(snapshot, {
  selectedParcelId = null,
  search = '',
  selectedNodeId = null,
  searchOpen = false,
  filters = null,
} = {}) {
  if (!snapshot) return {
    mode: selectedParcelId ? 'parcel' : 'run', parcelId: clean(selectedParcelId), stageId: null,
    timelinePosition: 0, playbackSpeed: 1, selectedNodeId: clean(selectedNodeId), search: String(search || ''), searchOpen: Boolean(searchOpen), filters: filters || {}
  };
  return {
    mode: snapshot.mode === 'parcel' ? 'parcel' : 'run',
    parcelId: clean(selectedParcelId || snapshot.parcelId),
    stageId: clean(snapshot.currentStage?.id),
    timelinePosition: Number.isFinite(Number(snapshot.timelinePosition)) ? Number(snapshot.timelinePosition) : 0,
    playbackSpeed: Number.isFinite(Number(snapshot.playbackSpeed)) ? Number(snapshot.playbackSpeed) : 1,
    selectedNodeId: clean(selectedNodeId || snapshot.selectedNodeId),
    search: String(search || ''),
    searchOpen: Boolean(searchOpen),
    filters: filters || snapshot.filters || {},
  };
}

export function writeEvidenceGraphStateToUrl(state, href = '/evidence-graph', { origin = 'http://praman.local' } = {}) {
  const url = toUrl(href, origin);
  const p = url.searchParams;
  const setOrDelete = (key, value) => value === null || value === undefined || value === '' ? p.delete(key) : p.set(key, String(value));
  setOrDelete('egMode', state?.mode || null);
  setOrDelete('parcel', state?.parcelId || null);
  setOrDelete('egStage', state?.stageId || null);
  setOrDelete('egPosition', Number.isFinite(Number(state?.timelinePosition)) ? Number(state.timelinePosition).toFixed(3).replace(/0+$/,'').replace(/\.$/,'') : null);
  setOrDelete('egSpeed', Number.isFinite(Number(state?.playbackSpeed)) ? state.playbackSpeed : null);
  setOrDelete('egNode', state?.selectedNodeId || null);
  setOrDelete('egSearch', state?.search || null);
  setOrDelete('egSearchOpen', state?.searchOpen ? '1' : null);
  const activeFilters = state?.filters && Object.values(state.filters).some((v) => v === true || (v !== false && v !== null && v !== undefined && v !== ''));
  setOrDelete('egFilters', activeFilters ? encodeURIComponent(JSON.stringify(state.filters)) : null);
  return relativeUrl(url);
}

export function readEvidenceGraphStateFromUrl(href, { origin = 'http://praman.local' } = {}) {
  const url = toUrl(href || '/evidence-graph', origin);
  const p = url.searchParams;
  const stageId = p.get('egStage');
  const positionRaw = p.get('egPosition');
  const speedRaw = p.get('egSpeed');
  const position = positionRaw === null ? Number.NaN : Number(positionRaw);
  const speed = speedRaw === null ? Number.NaN : Number(speedRaw);
  let filters = {};
  const encodedFilters = p.get('egFilters');
  if (encodedFilters) { try { filters = JSON.parse(decodeURIComponent(encodedFilters)); } catch { filters = {}; } }
  return {
    mode: p.get('egMode') === 'parcel' || p.get('parcel') ? 'parcel' : 'run',
    parcelId: clean(p.get('parcel')),
    stageId: STAGE_IDS.has(stageId) ? stageId : null,
    timelinePosition: Number.isFinite(position) ? position : null,
    playbackSpeed: Number.isFinite(speed) && speed > 0 ? speed : null,
    selectedNodeId: clean(p.get('egNode')),
    search: p.get('egSearch') || '',
    searchOpen: p.get('egSearchOpen') === '1',
    filters,
    inboundContext: {
      conflictId: clean(p.get('conflict')),
      sourceId: clean(p.get('source') || p.get('ssm_source')),
      versionId: clean(p.get('version')),
      eventId: clean(p.get('event')),
    },
  };
}


function addContext(url, context, keys) {
  for (const [param, field] of keys) {
    const value = context?.[field];
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(param, String(value));
  }
}

export function buildDashboardHref(target, context = {}, {
  paths = PRAMAN_DASHBOARD_PATHS,
  returnTo = null,
  origin = 'http://praman.local',
} = {}) {
  const p = mergeDashboardPaths(paths);
  let path;
  if (target === 'unified-spatial-view') path = p.unifiedSpatialView;
  else if (target === 'conflict-explorer') path = p.conflictExplorer;
  else if (target === 'reconciliation') path = p.reconciliation;
  else if (target === 'source-schema-mapping') path = p.sourceSchemaMapping;
  else if (target === 'parcel-history-lineage') path = p.parcelHistoryLineage;
  else throw new Error(`Unknown PRAMAN dashboard target: ${target}`);

  const url = toUrl(path, origin);
  if (target === 'unified-spatial-view') {
    addContext(url, context, [['parcel','parcelId'], ['geometry','geometryId'], ['version','versionId'], ['source','sourceId']]);
  } else if (target === 'conflict-explorer') {
    url.searchParams.set('view', 'conflicts');
    addContext(url, context, [['parcel','parcelId'], ['conflict','conflictId']]);
  } else if (target === 'reconciliation') {
    // Existing Conflict Explorer owns the downstream reconciliation workspace.
    // Its verified route contract is view=reconcile + parcel + selected conflict.
    url.searchParams.set('view', 'reconcile');
    addContext(url, context, [['parcel','parcelId'], ['conflict','conflictId']]);
    const openConflictIds = Array.isArray(context?.openConflictIds) ? context.openConflictIds.filter(Boolean) : [];
    if (openConflictIds.length) url.searchParams.set('open_conflicts', openConflictIds.join(','));
    if (context?.parcelId && context?.conflictId) url.searchParams.set('context', 'parcel-conflict-case');
  } else if (target === 'source-schema-mapping') {
    // Source & Schema Mapping already persists selection under ssm_source.
    addContext(url, context, [['ssm_source','sourceId']]);
  } else if (target === 'parcel-history-lineage') {
    addContext(url, context, [['parcel','parcelId']]);
    url.searchParams.set('view', 'lineage');
    addContext(url, context, [['event','eventId'], ['version','versionId']]);
  }
  if (returnTo) url.searchParams.set('returnTo', returnTo);
  return relativeUrl(url);
}

function sourceIdForType(layer, sourceType) {
  return layer?.tables?.sourceMetadata?.find((r) => r.source_type === sourceType)?.source_id || null;
}

export function resolveEvidenceNodeContext(node, layer, {
  parcelId = null,
  conflictId = null,
  authorityRecordId = null,
  canonicalParcelId = null,
} = {}) {
  if (!node) return { parcelId: clean(parcelId) };
  let resolvedParcel = clean(parcelId || canonicalParcelId || node.canonicalParcelId || node.data?.parcelId || node.data?.details?.parcelId);
  let resolvedConflict = clean(conflictId || (node.entityType === 'Conflict' ? node.datasetRecordId : null));
  let resolvedSource = clean(node.sourceId);
  let geometryId = null;
  let versionId = null;
  let eventId = null;

  if (node.entityType === 'SourceDataset') resolvedSource ||= clean(node.datasetRecordId);
  const recordId = clean(node.datasetRecordId);

  if (!resolvedSource && ['SourceObservation','NormalizedObservation'].includes(node.entityType) && recordId) {
    const obs = layer?.tables?.sourceObservations?.find((r) => r.observation_id === recordId)
      || layer?.tables?.matchingInput?.find((r) => r.observation_id === recordId);
    if (obs) resolvedSource = sourceIdForType(layer, obs.source_type);
  }

  if (resolvedConflict) {
    const conflictRow = layer?.tables?.conflicts?.find((r) => r.conflict_id === resolvedConflict) ?? null;
    if (!resolvedParcel) resolvedParcel = clean(conflictRow?.canonical_parcel_id);
    else if (conflictRow && clean(conflictRow.canonical_parcel_id) !== resolvedParcel) resolvedConflict = null;
  }

  if (node.entityType === 'GeometryVersion' && recordId) {
    geometryId = recordId;
    versionId = clean(node.data?.details?.version_label || node.data?.details?.versionLabel || node.data?.version_label || node.data?.versionLabel || recordId);
  }
  if (node.entityType === 'GeoGitEvent' && recordId) {
    eventId = recordId;
    versionId = clean(node.data?.details?.resulting_version || node.data?.details?.resultingVersion || node.data?.resulting_version || node.data?.resultingVersion);
  }
  if (node.entityType === 'CanonicalParcel' && recordId) resolvedParcel ||= recordId;
  if (node.entityType === 'HistoricalParcel' && recordId) resolvedParcel ||= recordId;

  if (!geometryId && resolvedParcel) {
    const active = layer?.tables?.canonicalParcels?.find((r) => r.canonical_parcel_id === resolvedParcel);
    const historical = layer?.tables?.historicalParcels?.find((r) => r.canonical_parcel_id === resolvedParcel);
    geometryId = clean(active?.current_geometry_id || historical?.historical_geometry_id);
    versionId ||= clean(active?.canonical_state_version || active?.authoritative_version || null);
  }

  if (authorityRecordId && !eventId) {
    const event = layer?.tables?.geogitEvents?.find((e) => e.event_id === authorityRecordId);
    if (event) { eventId = event.event_id; resolvedParcel ||= clean(event.parcel_id); versionId ||= clean(event.resulting_version); }
  }

  const reconciliation = resolvedParcel
    ? layer?.tables?.reconciledParcels?.find((r) => r.canonical_parcel_id === resolvedParcel)
    : null;
  const openConflictIds = Array.isArray(reconciliation?.unresolved_conflicts)
    ? reconciliation.unresolved_conflicts.filter(Boolean).map(String)
    : [];

  return {
    parcelId: resolvedParcel,
    conflictId: resolvedConflict,
    sourceId: resolvedSource,
    geometryId,
    versionId,
    eventId,
    openConflictIds,
    nodeId: clean(node.id),
    stageId: clean(node.stageId),
  };
}

export function buildContextualDashboardActions(context, options = {}) {
  const actions = [];
  const returnTo = options.returnTo || null;
  const link = (id, label, target) => actions.push({ id, label, target, href: buildDashboardHref(target, context, { ...options, returnTo }) });
  if (context?.parcelId) link('unified-spatial-view', 'View on Unified Spatial View', 'unified-spatial-view');
  if (context?.conflictId) link('conflict-explorer', 'Open Conflict Explorer', 'conflict-explorer');
  // The existing reconciliation workspace requires an explicit parcel + conflict context.
  if (context?.parcelId && context?.conflictId) link('reconciliation', 'Open Reconciliation', 'reconciliation');
  if (context?.sourceId) link('source-schema-mapping', 'View Source & Schema Mapping', 'source-schema-mapping');
  if (context?.parcelId) link('parcel-history-lineage', 'View Parcel History & Lineage', 'parcel-history-lineage');
  return actions;
}
