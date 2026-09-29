const filterCatalogCache = new WeakMap();
const filterContextCache = new WeakMap();
const filterKey = (filters) => JSON.stringify(normalizeExplorationFilters(filters));

const clean = (value) => value === null || value === undefined || value === '' ? null : String(value);
const countBy = (rows, fn) => {
  const out = new Map();
  for (const row of rows) {
    const key = fn(row);
    if (key === null || key === undefined || key === '') continue;
    const s = String(key);
    out.set(s, (out.get(s) || 0) + 1);
  }
  return out;
};
const optionsFromCounts = (counts, label = (v) => v) => [...counts.entries()]
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([value, count]) => ({ value, label: label(value), count }));

/**
 * User-facing filters are intentionally limited to dimensions recorded in
 * PRAMAN_DATA. Adapter execution and confidence-band buckets are not filters:
 * adapter runs are not stored and confidence bands would introduce UI-created
 * thresholds that are absent from the data contract.
 */
export const EMPTY_EXPLORATION_FILTERS = Object.freeze({
  sourceId: '',
  cellId: '',
  matchStatus: '',
  conflictType: '',
  conflictStatus: '',
  authorityStatus: '',
  reviewStatus: '',
  recordStatus: '',
  lineageType: '',
  unresolvedOnly: false,
});

export function normalizeExplorationFilters(filters = {}) {
  return {
    sourceId: clean(filters.sourceId) || '',
    cellId: clean(filters.cellId) || '',
    matchStatus: clean(filters.matchStatus) || '',
    conflictType: clean(filters.conflictType) || '',
    conflictStatus: clean(filters.conflictStatus) || '',
    // Backward-compatible migration for previously persisted URLs where this
    // value was mislabeled as reconciliationStatus.
    authorityStatus: clean(filters.authorityStatus ?? filters.reconciliationStatus) || '',
    reviewStatus: clean(filters.reviewStatus) || '',
    recordStatus: clean(filters.recordStatus) || '',
    lineageType: clean(filters.lineageType) || '',
    unresolvedOnly: Boolean(filters.unresolvedOnly),
  };
}

export function hasActiveExplorationFilters(filters = {}) {
  const f = normalizeExplorationFilters(filters);
  return Object.entries(f).some(([key, value]) => key === 'unresolvedOnly' ? value === true : Boolean(value));
}

export function buildExplorationFilterCatalog(layer) {
  if (!layer?.tables) throw new Error('buildExplorationFilterCatalog requires the evidence data layer');
  const cached = filterCatalogCache.get(layer);
  if (cached) return cached;
  const { tables } = layer;

  const sourceObservationCounts = countBy(tables.sourceObservations, (r) => r.source_type);
  const sources = tables.sourceMetadata.map((r) => ({
    value: r.source_id,
    label: r.source_name || r.source_type || r.source_id,
    detail: r.source_type,
    count: sourceObservationCounts.get(String(r.source_type)) || 0,
  })).sort((a, b) => a.label.localeCompare(b.label));

  const parcelRows = [...tables.canonicalParcels, ...tables.historicalParcels];
  const cells = optionsFromCounts(countBy(parcelRows, (r) => r.cell_id));
  const matchStatuses = optionsFromCounts(countBy(tables.reconciledParcels, (r) => r.match_status), (v) => v.replaceAll('_', ' '));
  const conflictTypes = optionsFromCounts(countBy(tables.conflicts, (r) => r.conflict_type), (v) => v.replaceAll('_', ' '));
  const conflictStatuses = optionsFromCounts(countBy(tables.conflicts, (r) => r.status), (v) => v.replaceAll('_', ' '));
  const authorityStatuses = optionsFromCounts(countBy(tables.reconciledParcels, (r) => r.authoritativeState?.state), (v) => v.replaceAll('_', ' '));
  const recordStatuses = optionsFromCounts(countBy(tables.reconciledParcels, (r) => r.record_status), (v) => v.replaceAll('_', ' '));
  const lineageTypes = optionsFromCounts(countBy(tables.parcelLineage, (r) => r.event_type), (v) => v.replaceAll('_', ' '));

  const reviewCounts = countBy(tables.reconciledParcels, (r) => String(Boolean(r.requiresHumanReview)));
  const reviewStatuses = [
    { value: 'true', label: 'Human review required', count: reviewCounts.get('true') || 0 },
    { value: 'false', label: 'Not flagged for human review', count: reviewCounts.get('false') || 0 },
  ].filter((x) => x.count > 0);

  const catalogResult = {
    sources,
    cells,
    matchStatuses,
    conflictTypes,
    conflictStatuses,
    authorityStatuses,
    reviewStatuses,
    recordStatuses,
    lineageTypes,
    unresolvedCount: tables.reconciledParcels.filter((r) => r.unresolvedConflictIds?.length).length,
  };
  filterCatalogCache.set(layer, catalogResult);
  return catalogResult;
}

function buildFilterContext(layer, catalog, filters) {
  let byFilter = filterContextCache.get(layer);
  if (!byFilter) {
    byFilter = new Map();
    filterContextCache.set(layer, byFilter);
  }
  const cacheKey = filterKey(filters);
  if (byFilter.has(cacheKey)) return byFilter.get(cacheKey);

  const { tables } = layer;
  const f = normalizeExplorationFilters(filters);
  const sourceById = new Map(tables.sourceMetadata.map((r) => [String(r.source_id), r]));
  const sourceByType = new Map(tables.sourceMetadata.map((r) => [String(r.source_type), r]));
  const reconByParcel = new Map(tables.reconciledParcels.map((r) => [String(r.canonical_parcel_id), r]));
  const activeByParcel = new Map(tables.canonicalParcels.map((r) => [String(r.canonical_parcel_id), r]));
  const historicalByParcel = new Map(tables.historicalParcels.map((r) => [String(r.canonical_parcel_id), r]));

  const conflictsByParcel = new Map();
  for (const c of tables.conflicts) {
    const id = String(c.canonical_parcel_id);
    if (!conflictsByParcel.has(id)) conflictsByParcel.set(id, []);
    conflictsByParcel.get(id).push(c);
  }

  const lineageByParcel = new Map();
  for (const l of tables.parcelLineage) {
    for (const id of [l.parent_parcel_id, l.child_parcel_id].filter(Boolean).map(String)) {
      if (!lineageByParcel.has(id)) lineageByParcel.set(id, []);
      lineageByParcel.get(id).push(l);
    }
  }

  const geogitById = new Map(tables.geogitEvents.map((r) => [String(r.event_id), r]));
  const geometryById = new Map(tables.geometryVersions.map((r) => [String(r.geometry_id), r]));
  const lineageById = new Map(tables.parcelLineage.map((r) => [String(r.lineage_event_id), r]));
  const conflictById = new Map(tables.conflicts.map((r) => [String(r.conflict_id), r]));
  const observationById = new Map(tables.sourceObservations.map((r) => [String(r.observation_id), r]));
  const normalizedById = new Map(tables.matchingInput.map((r) => [String(r.observation_id), r]));

  const observationParcel = new Map();
  for (const r of tables.reconciledParcels) {
    for (const id of r.matchedSourceIds || []) observationParcel.set(String(id), String(r.canonical_parcel_id));
  }

  const selectedSource = sourceById.get(f.sourceId) || null;

  const parcelMatches = (parcelId) => {
    const id = String(parcelId || '');
    if (!id) return false;
    const recon = reconByParcel.get(id);
    const registry = activeByParcel.get(id) || historicalByParcel.get(id);
    if (!recon && !registry) return false;
    if (f.cellId && String(registry?.cell_id || '') !== f.cellId) return false;
    if (f.matchStatus && String(recon?.match_status || '') !== f.matchStatus) return false;
    if (f.recordStatus && String(recon?.record_status || '') !== f.recordStatus) return false;
    if (f.authorityStatus && String(recon?.authoritativeState?.state || '') !== f.authorityStatus) return false;
    if (f.reviewStatus && String(Boolean(recon?.requiresHumanReview)) !== f.reviewStatus) return false;
    if (f.unresolvedOnly && !(recon?.unresolvedConflictIds?.length > 0)) return false;

    const conflicts = conflictsByParcel.get(id) || [];
    if (f.conflictType && !conflicts.some((c) => c.conflict_type === f.conflictType)) return false;
    if (f.conflictStatus && !conflicts.some((c) => c.status === f.conflictStatus && (!f.conflictType || c.conflict_type === f.conflictType))) return false;
    if (f.lineageType && !(lineageByParcel.get(id) || []).some((l) => l.event_type === f.lineageType)) return false;

    if (selectedSource) {
      const observations = (recon?.matchedSourceIds || []).map((oid) => observationById.get(String(oid))).filter(Boolean);
      if (!observations.some((o) => o.source_type === selectedSource.source_type)) return false;
    }
    return true;
  };

  const parcelIds = new Set([...reconByParcel.keys(), ...activeByParcel.keys(), ...historicalByParcel.keys()].filter(parcelMatches));

  const observationIds = new Set();
  for (const [oid, parcelId] of observationParcel) {
    if (!parcelIds.has(parcelId)) continue;
    const obs = observationById.get(oid);
    if (!obs) continue;
    if (selectedSource && obs.source_type !== selectedSource.source_type) continue;
    observationIds.add(oid);
  }

  const conflictIds = new Set(tables.conflicts.filter((c) => {
    if (!parcelIds.has(String(c.canonical_parcel_id))) return false;
    if (f.conflictType && c.conflict_type !== f.conflictType) return false;
    if (f.conflictStatus && c.status !== f.conflictStatus) return false;
    return true;
  }).map((c) => String(c.conflict_id)));

  const lineageIds = new Set(tables.parcelLineage.filter((l) => {
    if (f.lineageType && l.event_type !== f.lineageType) return false;
    return parcelIds.has(String(l.parent_parcel_id)) || parcelIds.has(String(l.child_parcel_id));
  }).map((l) => String(l.lineage_event_id)));

  const sourceIds = new Set();
  for (const oid of observationIds) {
    const obs = observationById.get(oid);
    const src = sourceByType.get(String(obs?.source_type || ''));
    if (src) sourceIds.add(String(src.source_id));
  }

  const context = {
    f,
    parcelIds,
    observationIds,
    conflictIds,
    lineageIds,
    sourceIds,
    observationParcel,
    observationById,
    normalizedById,
    reconByParcel,
    conflictsByParcel,
    lineageByParcel,
    geogitById,
    geometryById,
    lineageById,
    conflictById,
    selectedSource,
  };
  byFilter.set(cacheKey, context);
  return context;
}

function memberMatches(id, ctx) {
  const raw = String(id ?? '');
  if (!raw) return false;
  if (ctx.parcelIds.has(raw) || ctx.observationIds.has(raw) || ctx.sourceIds.has(raw)) return true;
  if (ctx.conflictById.has(raw)) {
    return ctx.f.conflictType || ctx.f.conflictStatus ? ctx.conflictIds.has(raw) : ctx.parcelIds.has(String(ctx.conflictById.get(raw).canonical_parcel_id));
  }
  if (ctx.lineageById.has(raw)) {
    if (ctx.f.lineageType) return ctx.lineageIds.has(raw);
    const lin = ctx.lineageById.get(raw);
    return ctx.parcelIds.has(String(lin.parent_parcel_id)) || ctx.parcelIds.has(String(lin.child_parcel_id));
  }
  if (ctx.conflictIds.has(raw) || ctx.lineageIds.has(raw)) return true;

  const obsPart = raw.split(':')[0];
  if (ctx.observationIds.has(obsPart)) return true;
  const event = ctx.geogitById.get(raw);
  if (event) return ctx.parcelIds.has(String(event.parcel_id));
  const geom = ctx.geometryById.get(raw);
  if (geom) return ctx.parcelIds.has(String(geom.canonical_parcel_id));
  return false;
}

function filterNode(node, ctx) {
  if (node.entityType === 'SourceDataset' || node.type === 'SourceDataset') {
    if (ctx.f.sourceId && String(node.sourceId || node.datasetRecordId) !== ctx.f.sourceId) return null;
  }

  const members = Array.isArray(node.memberRecordIds) ? node.memberRecordIds : [];
  if (members.length) {
    const kept = members.filter((id) => memberMatches(id, ctx));
    if (!kept.length) return null;
    return {
      ...node,
      memberRecordIds: kept,
      count: kept.length,
      data: { ...(node.data || {}), filteredMemberCount: kept.length, unfilteredMemberCount: members.length },
    };
  }
  if (node.canonicalParcelId && !ctx.parcelIds.has(String(node.canonicalParcelId))) return null;
  if (node.sourceId && ctx.f.sourceId && String(node.sourceId) !== ctx.f.sourceId) return null;
  return node;
}

export function applyEvidenceExplorationFilters(snapshot, layer, filters, catalog = null) {
  const normalized = normalizeExplorationFilters(filters);
  if (!hasActiveExplorationFilters(normalized)) {
    return { ...snapshot, filters: normalized, filterSummary: { active: false, visibleParcels: null } };
  }

  const resolvedCatalog = catalog || buildExplorationFilterCatalog(layer);
  const ctx = buildFilterContext(layer, resolvedCatalog, normalized);
  const candidates = [];
  for (const node of snapshot.visibleNodes || []) {
    const filtered = filterNode(node, ctx);
    if (filtered) candidates.push(filtered);
  }

  let ids = new Set(candidates.map((n) => n.id));

  // Preserve structural connector nodes between retained evidence even when a
  // connector has no direct member IDs of its own.
  const originalById = new Map((snapshot.visibleNodes || []).map((n) => [n.id, n]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of snapshot.visibleEdges || []) {
      if (ids.has(edge.from) && !ids.has(edge.to)) {
        const n = originalById.get(edge.to);
        if (n && !(Array.isArray(n.memberRecordIds) && n.memberRecordIds.length)) {
          candidates.push(n);
          ids.add(n.id);
          changed = true;
        }
      } else if (ids.has(edge.to) && !ids.has(edge.from)) {
        const n = originalById.get(edge.from);
        if (n && !(Array.isArray(n.memberRecordIds) && n.memberRecordIds.length)) {
          candidates.push(n);
          ids.add(n.id);
          changed = true;
        }
      }
    }
  }

  const nodeById = new Map(candidates.map((n) => [n.id, n]));
  const edges = (snapshot.visibleEdges || []).filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => {
    if (!Number.isFinite(Number(e.count))) return e;
    const fromCount = Number(nodeById.get(e.from)?.count);
    const toCount = Number(nodeById.get(e.to)?.count);
    const possible = [Number(e.count), fromCount, toCount].filter(Number.isFinite);
    return {
      ...e,
      count: possible.length ? Math.min(...possible) : e.count,
      data: { ...(e.data || {}), filtered: true },
    };
  });

  const selectedNode = snapshot.selectedNodeId ? candidates.find((n) => n.id === snapshot.selectedNodeId) || null : null;
  const activeFilterCount = Object.entries(normalized).filter(([k, v]) => k === 'unresolvedOnly' ? v : Boolean(v)).length;
  return {
    ...snapshot,
    visibleNodes: candidates,
    visibleEdges: edges,
    selectedNode,
    selectedNodeId: selectedNode?.id ?? null,
    filters: normalized,
    filterSummary: {
      active: true,
      activeFilterCount,
      visibleParcels: ctx.parcelIds.size,
      visibleObservations: ctx.observationIds.size,
      visibleConflicts: ctx.conflictIds.size,
      visibleSources: ctx.sourceIds.size,
      selectedParcelMatches: snapshot.mode === 'parcel' && snapshot.parcelId ? ctx.parcelIds.has(String(snapshot.parcelId)) : null,
      unfilteredNodeCount: snapshot.visibleNodes?.length || 0,
      filteredNodeCount: candidates.length,
    },
  };
}
