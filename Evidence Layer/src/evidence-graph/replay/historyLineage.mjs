const uniq = (values) => [...new Set((values ?? []).filter(Boolean))];
const splitIds = (value) => String(value ?? '').split(';').map((v) => v.trim()).filter(Boolean);

const HISTORY_GEOGIT_EVENT_TYPES = Object.freeze([
  'PARCEL_CREATED',
  'CANONICAL_STATE_UPDATED',
  'SPLIT',
  'MERGE',
  'MUTATION_RECORDED',
  'ROLLBACK'
]);

export const HISTORY_ARCHITECTURE_PRINCIPLE = 'EVIDENCE GRAPH ≠ GEOGIT';

function normalizeLineageType(eventType) {
  if (eventType === 'SPLIT' || eventType === 'CROSS_CELL_SPLIT') return 'SPLIT';
  if (eventType === 'MERGE' || eventType === 'CROSS_CELL_MERGE' || eventType === 'REDEVELOPMENT_CONSOLIDATION') return 'MERGE';
  return eventType || 'UNKNOWN';
}

function lineageSignature(row) {
  const type = normalizeLineageType(row.event_type);
  const anchor = type === 'SPLIT' ? row.parent_parcel_id : row.child_parcel_id;
  return [type, anchor, row.effective_date || '', row.source || '', row.reason || ''].join('|');
}

function parcelRecord(layer, parcelId) {
  const active = layer.tables.canonicalParcels.find((r) => r.canonical_parcel_id === parcelId);
  if (active) return { parcelId, registry: 'ACTIVE', record: active, status: active.parcel_status || 'ACTIVE' };
  const historical = layer.tables.historicalParcels.find((r) => r.canonical_parcel_id === parcelId);
  if (historical) return { parcelId, registry: 'HISTORICAL', record: historical, status: historical.record_status || 'HISTORICAL_RETIRED' };
  return { parcelId, registry: 'UNKNOWN', record: null, status: 'UNKNOWN' };
}

function classifyGeometryHistory(row, currentGeometryId = null) {
  const reason = String(row.change_reason || '').toLowerCase();
  const classifications = [];
  if (row.geometry_id === currentGeometryId) classifications.push('CURRENT_GEOMETRY');
  if (reason.includes('resurvey')) classifications.push('RESURVEY');
  if (reason.includes('boundary correction') || reason.includes('road widening')) classifications.push('BOUNDARY_CORRECTION');
  if (row.geometry_status === 'SUPERSEDED' || row.accepted_status === 'SUPERSEDED') classifications.push('SUPERSEDED_GEOMETRY');
  if (row.geometry_status === 'PROPOSED' || row.accepted_status === 'PENDING_HUMAN_APPROVAL') classifications.push('PROPOSED_GEOMETRY');
  if (row.geometry_status === 'REJECTED' || row.accepted_status === 'REJECTED') classifications.push('REJECTED_GEOMETRY');
  if (!classifications.length) classifications.push('GEOMETRY_VERSION');
  return classifications;
}

function lineageGeoGitEvents(layer, transaction) {
  const type = transaction.type;
  const children = new Set(transaction.childParcelIds);
  return layer.tables.geogitEvents.filter((event) => {
    if (normalizeLineageType(event.event_type) !== type) return false;
    if (!transaction.parentParcelIds.includes(event.parcel_id)) return false;
    const related = splitIds(event.related_parcel_ids);
    return related.some((id) => children.has(id));
  });
}

function buildParcelHistoryLineageModelUncached(layer, parcelId) {
  if (!layer?.tables) throw new Error('buildParcelHistoryLineageModel requires the evidence data layer');
  const selected = parcelRecord(layer, parcelId);
  if (!selected.record) return { found: false, parcelId };

  const direct = layer.getParcelLineage(parcelId);
  const signatures = uniq((direct.directEvents ?? []).map(lineageSignature));
  const transactions = signatures.map((signature) => {
    const rows = layer.tables.parcelLineage.filter((row) => lineageSignature(row) === signature);
    const type = normalizeLineageType(rows[0]?.event_type);
    const parentParcelIds = uniq(rows.map((r) => r.parent_parcel_id));
    const childParcelIds = uniq(rows.map((r) => r.child_parcel_id));
    const transaction = {
      id: `lineage-transaction:${encodeURIComponent(signature)}`,
      signature,
      type,
      rawEventTypes: uniq(rows.map((r) => r.event_type)),
      effectiveDate: rows[0]?.effective_date || null,
      reason: rows[0]?.reason || null,
      source: rows[0]?.source || null,
      acceptedStatuses: uniq(rows.map((r) => r.accepted_status)),
      memberLineageEventIds: rows.map((r) => r.lineage_event_id),
      parentParcelIds,
      childParcelIds,
      selectedRole: parentParcelIds.includes(parcelId) && childParcelIds.includes(parcelId) ? 'BOTH' : parentParcelIds.includes(parcelId) ? 'PARENT' : 'CHILD',
      rows
    };
    transaction.geogitEvents = lineageGeoGitEvents(layer, transaction);
    return transaction;
  });

  const relatedParcelIds = uniq(transactions.flatMap((t) => [...t.parentParcelIds, ...t.childParcelIds])).filter((id) => id !== parcelId);
  const relatedParcels = relatedParcelIds.map((id) => {
    const info = parcelRecord(layer, id);
    const roles = [];
    for (const transaction of transactions) {
      if (transaction.parentParcelIds.includes(id)) roles.push(`${transaction.type}_PARENT`);
      if (transaction.childParcelIds.includes(id)) roles.push(`${transaction.type}_CHILD`);
    }
    return { ...info, roles: uniq(roles) };
  });

  const currentGeometryId = selected.registry === 'ACTIVE'
    ? selected.record.current_geometry_id
    : selected.record.historical_geometry_id;
  const geometryVersions = layer.tables.geometryVersions
    .filter((g) => g.canonical_parcel_id === parcelId)
    .sort((a, b) => String(a.effective_date || '').localeCompare(String(b.effective_date || '')))
    .map((row) => ({
      ...row,
      isCurrent: row.geometry_id === currentGeometryId,
      isCurrentCanonicalGeometry: selected.registry === 'ACTIVE' && row.geometry_id === currentGeometryId,
      historyKinds: classifyGeometryHistory(row, currentGeometryId),
      visualTone: selected.registry === 'ACTIVE' && row.geometry_id === currentGeometryId ? 'current' : 'historical'
    }));

  const transactionGeoGit = transactions.flatMap((t) => t.geogitEvents);
  const selectedGeoGit = layer.tables.geogitEvents.filter((event) => event.parcel_id === parcelId && HISTORY_GEOGIT_EVENT_TYPES.includes(event.event_type));
  const geogitEvents = [...new Map([...selectedGeoGit, ...transactionGeoGit].map((e) => [e.event_id, e])).values()]
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')))
    .map((event) => ({
      ...event,
      relatedParcelIds: splitIds(event.related_parcel_ids),
      supportingHistoricalEvidence: true,
      evidenceGraphDependency: false,
      historyKind: event.event_type === 'MUTATION_RECORDED' ? 'MUTATION'
        : event.event_type === 'ROLLBACK' ? 'ROLLBACK'
          : event.event_type === 'CANONICAL_STATE_UPDATED' ? 'NEW_CANONICAL_VERSION'
            : event.event_type
    }));

  const eventTypeCounts = {};
  for (const event of geogitEvents) eventTypeCounts[event.event_type] = (eventTypeCounts[event.event_type] || 0) + 1;
  const geometryKindCounts = {};
  for (const version of geometryVersions) for (const kind of version.historyKinds) geometryKindCounts[kind] = (geometryKindCounts[kind] || 0) + 1;

  return {
    found: true,
    parcelId,
    selectedParcel: selected,
    currentGeometryId: currentGeometryId || null,
    geometryVersions,
    transactions,
    relatedParcels,
    geogitEvents,
    directParents: direct.directParents ?? [],
    directChildren: direct.directChildren ?? [],
    ancestors: direct.ancestors ?? [],
    descendants: direct.descendants ?? [],
    geometryKindCounts,
    geogitEventTypeCounts: eventTypeCounts,
    hasSplit: transactions.some((t) => t.type === 'SPLIT'),
    hasMerge: transactions.some((t) => t.type === 'MERGE'),
    hasResurvey: geometryVersions.some((g) => g.historyKinds.includes('RESURVEY')),
    hasBoundaryCorrection: geometryVersions.some((g) => g.historyKinds.includes('BOUNDARY_CORRECTION')),
    hasMutation: geogitEvents.some((e) => e.event_type === 'MUTATION_RECORDED'),
    hasRollback: geogitEvents.some((e) => e.event_type === 'ROLLBACK'),
    hasSupersededGeometry: geometryVersions.some((g) => g.historyKinds.includes('SUPERSEDED_GEOMETRY')),
    hasNewCanonicalVersion: geogitEvents.some((e) => e.event_type === 'CANONICAL_STATE_UPDATED'),
    architecturePrinciple: HISTORY_ARCHITECTURE_PRINCIPLE,
    directGeoGitGeometryLinkAvailable: false
  };
}

const parcelHistoryLineageCache = new WeakMap();
export function buildParcelHistoryLineageModel(layer, parcelId) {
  let byParcel = parcelHistoryLineageCache.get(layer);
  if (!byParcel) { byParcel = new Map(); parcelHistoryLineageCache.set(layer, byParcel); }
  if (!byParcel.has(parcelId)) byParcel.set(parcelId, buildParcelHistoryLineageModelUncached(layer, parcelId));
  return byParcel.get(parcelId);
}
