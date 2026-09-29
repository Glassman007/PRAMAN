import { buildConflictInvestigation } from './conflictInvestigation.js';
import { deriveParcelTopologyImpact } from './spatialConflictAnalysis.js';

function present(value) {
  return value !== null && value !== undefined && value !== '';
}

function deepEqual(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function currentValueForKey(parcelCase, reconciliation, key) {
  const authoritative = reconciliation?.authoritative_state ?? {};
  if (Object.prototype.hasOwnProperty.call(authoritative, key)) {
    return { value: authoritative[key], source: 'RECONCILED_PARCELS.authoritative_state' };
  }

  const canonical = parcelCase?.canonicalParcel ?? null;
  const historical = parcelCase?.historicalParcel ?? null;
  const aliases = {
    owner: canonical?.owner_entity ?? historical?.former_owner,
    land_use: canonical?.land_use,
    geometry_id: canonical?.current_geometry_id ?? historical?.historical_geometry_id,
    area_sqm: canonical?.area_sqm,
    record_status: historical?.record_status ?? canonical?.parcel_status,
    children: reconciliation?.child_parcel_ids?.length ? reconciliation.child_parcel_ids : null,
    parents: reconciliation?.parent_parcel_ids?.length ? reconciliation.parent_parcel_ids : null,
    state: authoritative?.state,
  };

  if (Object.prototype.hasOwnProperty.call(aliases, key) && present(aliases[key])) {
    return {
      value: aliases[key],
      source: canonical ? 'CANONICAL_PARCELS' : historical ? 'HISTORICAL_PARCELS' : 'RECONCILED_PARCELS',
    };
  }

  return { value: null, source: null };
}

function buildProposalComparison(parcelCase, reconciliation) {
  const proposed = reconciliation?.proposed_state && typeof reconciliation.proposed_state === 'object'
    ? reconciliation.proposed_state
    : {};

  return Object.entries(proposed).map(([field, proposedValue]) => {
    const current = currentValueForKey(parcelCase, reconciliation, field);
    return {
      field,
      currentValue: current.value,
      currentSource: current.source,
      proposedValue,
      changed: !deepEqual(current.value, proposedValue),
    };
  });
}

function resolveGeometry(model, geometryId) {
  if (!geometryId) return null;
  const version = model.geometryVersionById.get(geometryId) ?? null;
  if (version?.geometry) {
    return {
      geometryId,
      geometry: version.geometry,
      crs: version.crs ?? null,
      sourceType: version.source_type ?? null,
      detail: version.geometry_status ?? version.version_label ?? null,
      sourceRecord: version,
      sourceTable: 'GEOMETRY_VERSIONS',
    };
  }

  const source = model.geometryById.get(geometryId) ?? null;
  if (source?.normalizedGeometry) {
    return {
      geometryId,
      geometry: source.normalizedGeometry,
      crs: source.normalized_crs ?? null,
      sourceType: source.source_type ?? null,
      detail: 'Source geometry',
      sourceRecord: source,
      sourceTable: 'SOURCE_GEOMETRIES',
    };
  }

  return null;
}

function uniqueGeometryEntries(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    if (!entry?.geometry || !entry.geometryId) continue;
    const key = `${entry.role}:${entry.geometryId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...entry, key });
  }
  return result;
}

function buildSpatialComparison(model, parcelCase, reconciliation, investigations) {
  const entries = [];
  const current = parcelCase.currentGeometry ?? parcelCase.historicalGeometry ?? null;
  if (current?.geometry) {
    entries.push({
      geometryId: current.geometry_id,
      label: parcelCase.isHistorical ? 'Historical parcel geometry' : 'Current authoritative geometry',
      detail: current.geometry_status ?? current.version_label ?? 'Current parcel geometry',
      role: parcelCase.isHistorical ? 'historical' : 'authoritative',
      geometry: current.geometry,
      crs: current.crs ?? null,
      sourceType: current.source_type ?? null,
    });
  }

  for (const investigation of investigations) {
    for (const entry of investigation.geometryEntries ?? []) {
      if (entry.role === 'authoritative' || entry.role === 'historical') continue;
      entries.push({ ...entry, label: entry.label ?? entry.sourceType ?? 'Source evidence' });
    }
  }

  const proposedGeometryId = reconciliation?.proposed_state?.geometry_id ?? null;
  const proposed = resolveGeometry(model, proposedGeometryId);
  if (proposed) {
    entries.push({
      ...proposed,
      label: 'Proposed geometry',
      detail: proposed.detail ?? 'Reconciliation proposal',
      role: 'proposed',
    });
  }

  return {
    entries: uniqueGeometryEntries(entries),
    currentGeometryId: current?.geometry_id ?? null,
    proposedGeometryId,
    proposedGeometryResolved: Boolean(proposed),
  };
}

function resolveMatchedObservations(model, reconciliation) {
  return (reconciliation?.matched_source_ids ?? []).map((observationId) => ({
    observationId,
    observation: model.observationById.get(observationId) ?? null,
  }));
}

export function buildReconciliationWorkspace(model, parcelId, selectedConflictId = null) {
  const parcelCase = model.parcelConflictCaseByParcelId.get(parcelId) ?? null;
  if (!parcelCase) {
    return { valid: false, reason: 'PARCEL_CASE_NOT_FOUND', parcelId };
  }

  const reconciliation = model.reconciliationByParcelId.get(parcelId) ?? null;
  if (!reconciliation) {
    return { valid: false, reason: 'RECONCILIATION_NOT_FOUND', parcelId, parcelCase };
  }

  if (!selectedConflictId) {
    return { valid: false, reason: 'CONFLICT_CONTEXT_REQUIRED', parcelId, parcelCase, reconciliation };
  }

  const selectedConflict = parcelCase.conflicts.find((conflict) => conflict.conflict_id === selectedConflictId) ?? null;
  if (!selectedConflict) {
    return {
      valid: false,
      reason: 'CONFLICT_NOT_FOUND_FOR_PARCEL',
      parcelId,
      selectedConflictId,
      parcelCase,
      reconciliation,
    };
  }



  const selectedConflictIsOpen = parcelCase.openConflicts.some((conflict) => conflict.conflict_id === selectedConflictId);
  if (!selectedConflictIsOpen) {
    return {
      valid: false,
      reason: 'SELECTED_CONFLICT_NOT_OPEN',
      parcelId,
      selectedConflictId,
      parcelCase,
      reconciliation,
      selectedConflict,
    };
  }

  const unresolvedConflicts = (reconciliation.unresolved_conflicts ?? []).map((conflictId) => ({
    conflictId,
    conflict: model.conflictById.get(conflictId) ?? null,
  }));

  const investigations = parcelCase.conflicts.map((conflict) => buildConflictInvestigation(model, parcelCase, conflict));
  const selectedInvestigation = selectedConflict
    ? investigations.find((item) => item?.conflict?.conflict_id === selectedConflict.conflict_id) ?? null
    : null;
  const spatialConflictIds = new Set([
    selectedConflict?.conflict_id,
    ...unresolvedConflicts.map((item) => item.conflictId),
  ].filter(Boolean));
  const spatialInvestigations = investigations.filter((item) => spatialConflictIds.has(item?.conflict?.conflict_id));

  const matchedObservations = resolveMatchedObservations(model, reconciliation);
  const comparison = buildProposalComparison(parcelCase, reconciliation);
  const spatial = buildSpatialComparison(model, parcelCase, reconciliation, spatialInvestigations);
  const topologyImpact = deriveParcelTopologyImpact(model, parcelCase);

  return {
    valid: true,
    reason: null,
    parcelId,
    parcelCase,
    reconciliation,
    selectedConflict,
    selectedInvestigation,
    conflicts: parcelCase.conflicts,
    openConflicts: parcelCase.openConflicts,
    unresolvedConflicts,
    matchedObservations,
    proposalComparison: comparison,
    proposalDifferences: comparison.filter((item) => item.changed),
    currentParcel: parcelCase.canonicalParcel ?? parcelCase.historicalParcel ?? null,
    geometryVersions: parcelCase.geometryVersions,
    geoGitEvents: parcelCase.geoGitEvents,
    lineageReferences: parcelCase.lineageReferences,
    spatial,
    topologyImpact,
  };
}

export function formatConfidence(value) {
  if (!Number.isFinite(value)) return null;
  return {
    display: `${(value * 100).toFixed(1)}%`,
    raw: String(value),
  };
}
