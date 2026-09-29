const ENV = import.meta.env || {};

export const PRAMAN_ROUTE_PATHS = Object.freeze({
  conflictExplorer: ENV.VITE_CONFLICT_EXPLORER_PATH || '/conflict-explorer',
  evidenceGraph: ENV.VITE_EVIDENCE_GRAPH_PATH || '/evidence-graph',
  unifiedSpatialView: ENV.VITE_UNIFIED_SPATIAL_VIEW_PATH || '/unified-spatial-view'
});

export function layer4ReturnPath(locationLike) {
  const location = locationLike || window.location;
  return `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
}

export function buildLayer4ContextLink(basePath, params, locationLike) {
  const location = locationLike || window.location;
  const origin = location.origin;
  const target = new URL(basePath, origin);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      target.searchParams.set(key, String(value));
    }
  });

  target.searchParams.set('returnTo', layer4ReturnPath(location));

  if (target.origin === origin) return `${target.pathname}${target.search}${target.hash}`;
  return target.href;
}

export function buildConflictExplorerLink({ parcelId, conflictId, eventId, from = 'parcel-history' } = {}, locationLike) {
  return buildLayer4ContextLink(PRAMAN_ROUTE_PATHS.conflictExplorer, {
    parcelId,
    conflictId,
    eventId,
    from
  }, locationLike);
}

export function buildEvidenceGraphLink({
  parcelId,
  eventId,
  conflictId,
  source,
  sourceRecordId,
  observationId,
  geometryId,
  parcelVersion,
  state,
  reconciliationStatus,
  lineageEventId,
  lineageEventIds,
  relationshipType,
  from = 'parcel-history'
} = {}, locationLike) {
  return buildLayer4ContextLink(PRAMAN_ROUTE_PATHS.evidenceGraph, {
    parcelId,
    eventId,
    conflictId,
    source,
    sourceRecordId,
    observationId,
    geometryId,
    parcelVersion,
    state,
    reconciliationStatus,
    lineageEventId,
    lineageEventIds,
    relationshipType,
    from
  }, locationLike);
}

export function buildUnifiedSpatialViewLink({
  parcelId,
  eventId,
  geometryId,
  geometryVersion,
  state,
  from = 'parcel-history'
} = {}, locationLike) {
  return buildLayer4ContextLink(PRAMAN_ROUTE_PATHS.unifiedSpatialView, {
    parcelId,
    eventId,
    geometryId,
    geometryVersion,
    state,
    from
  }, locationLike);
}
