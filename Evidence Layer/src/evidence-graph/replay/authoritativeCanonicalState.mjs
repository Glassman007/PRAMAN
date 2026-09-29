import { buildActiveAdapterProcessingModels } from './adapterProcessing.mjs';
import { buildDistortionAwareMatchingModel, classifyMatchOutcome } from './distortionAwareMatching.mjs';

const uniq = (values) => [...new Set((values ?? []).filter(Boolean))];

function countBy(rows, keyFn) {
  const out = {};
  for (const row of rows ?? []) {
    const key = String(keyFn(row) ?? 'UNSPECIFIED');
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function adapterRoutesBySourceType(layer) {
  const map = new Map();
  for (const adapter of buildActiveAdapterProcessingModels(layer)) {
    for (const sourceType of adapter.sourceTypes) {
      if (!map.has(sourceType)) map.set(sourceType, []);
      map.get(sourceType).push({ adapterId: adapter.adapterId, adapterName: adapter.adapterName });
    }
  }
  return map;
}

function parcelTraceCoverage(layer, parcelId, adaptersBySourceType, indexes) {
  const canonical = indexes.canonicalById.get(parcelId) ?? null;
  const reconciliation = indexes.reconById.get(parcelId) ?? null;
  const observations = reconciliation
    ? (reconciliation.matchedSourceIds ?? []).map((id) => indexes.obsById.get(id)).filter(Boolean)
    : [];
  const normalized = observations.map((o) => indexes.normalizedById.get(o.observation_id)).filter(Boolean);
  const sourceDatasets = observations.map((o) => indexes.sourceByType.get(o.source_type)).filter(Boolean);
  const adapterRoutes = observations.flatMap((o) => adaptersBySourceType.get(o.source_type) ?? []);
  const conflicts = indexes.conflictsByParcel.get(parcelId) ?? [];
  const missing = [];

  if (!canonical) missing.push('canonical registry row');
  if (!reconciliation) missing.push('reconciliation row');
  if (reconciliation && observations.length === 0) missing.push('source-observation membership');
  if (observations.length && normalized.length !== observations.length) missing.push('normalized observation coverage');
  if (observations.length && sourceDatasets.length !== observations.length) missing.push('source dataset provenance');
  if (observations.length && observations.some((o) => !(adaptersBySourceType.get(o.source_type)?.length))) missing.push('adapter architecture route');
  if (reconciliation && !reconciliation.authoritativeState) missing.push('authoritative-state payload');

  return {
    parcelId,
    complete: missing.length === 0,
    missing,
    canonical,
    reconciliation,
    observations,
    normalized,
    sourceDatasets,
    adapterRoutes,
    conflicts,
    conflictCheck: conflicts.length ? 'EXPLICIT_CONFLICTS_RECORDED' : 'NO_RECORDED_CONFLICT',
    matchOutcomeGroup: reconciliation ? classifyMatchOutcome(reconciliation.match_status) : null
  };
}

export const CANONICAL_TRACE_PRINCIPLE = 'CANONICAL STATE PRESERVES THE EVIDENCE CHAIN';

/**
 * Build the dataset-backed terminal replay model.
 *
 * `expectedActiveCanonicalParcels` is intentionally optional. The Evidence Graph
 * never hardcodes an expected active total. A host may pass a specification value
 * if the project stores one outside the production CSVs; otherwise internal ACTIVE
 * reconciliation coverage is used only as a consistency cross-check, not as a spec.
 */
function buildAuthoritativeCanonicalStateModelUncached(layer, { expectedActiveCanonicalParcels = null } = {}) {
  if (!layer?.tables) throw new Error('buildAuthoritativeCanonicalStateModel requires the evidence data layer');

  const matching = buildDistortionAwareMatchingModel(layer);
  const reconciled = layer.tables.reconciledParcels ?? [];
  const canonical = layer.tables.canonicalParcels ?? [];
  const historical = layer.tables.historicalParcels ?? [];
  const conflicts = layer.tables.conflicts ?? [];
  const sourceObservations = layer.tables.sourceObservations ?? [];
  const adaptersBySourceType = adapterRoutesBySourceType(layer);
  const indexes = {
    canonicalById: new Map(canonical.map((r) => [r.canonical_parcel_id, r])),
    reconById: new Map(reconciled.map((r) => [r.canonical_parcel_id, r])),
    obsById: new Map(sourceObservations.map((r) => [r.observation_id, r])),
    normalizedById: new Map((layer.tables.matchingInput ?? []).map((r) => [r.observation_id, r])),
    sourceByType: new Map((layer.tables.sourceMetadata ?? []).map((r) => [r.source_type, r])),
    conflictsByParcel: new Map()
  };
  for (const conflict of conflicts) {
    if (!indexes.conflictsByParcel.has(conflict.canonical_parcel_id)) indexes.conflictsByParcel.set(conflict.canonical_parcel_id, []);
    indexes.conflictsByParcel.get(conflict.canonical_parcel_id).push(conflict);
  }

  const traces = canonical.map((row) => parcelTraceCoverage(layer, row.canonical_parcel_id, adaptersBySourceType, indexes));
  const gaps = traces.filter((trace) => !trace.complete);
  const activeReconciliationRows = reconciled.filter((r) => r.record_status === 'ACTIVE');
  const unresolvedRows = reconciled.filter((r) => (r.unresolvedConflictIds ?? []).length > 0);
  const humanReviewRows = reconciled.filter((r) => Boolean(r.requiresHumanReview));
  const reconciledStatusRows = reconciled.filter((r) => r.match_status === 'RECONCILED');
  const explicitHumanReviewEvents = (layer.tables.geogitEvents ?? []).filter((e) => e.event_type === 'HUMAN_REVIEW');
  const openConflicts = conflicts.filter((c) => c.status === 'OPEN');
  const resolvedConflicts = conflicts.filter((c) => c.status === 'RESOLVED');
  const splitLineageRelationships = (layer.tables.parcelLineage ?? []).filter((row) => ['SPLIT', 'CROSS_CELL_SPLIT'].includes(row.event_type)).length;
  const mergeLineageRelationships = (layer.tables.parcelLineage ?? []).filter((row) => ['MERGE', 'CROSS_CELL_MERGE', 'REDEVELOPMENT_CONSOLIDATION'].includes(row.event_type)).length;

  const hasSpecificationExpectation = expectedActiveCanonicalParcels !== null
    && expectedActiveCanonicalParcels !== undefined
    && String(expectedActiveCanonicalParcels).trim() !== '';
  const specificationExpected = hasSpecificationExpectation && Number.isFinite(Number(expectedActiveCanonicalParcels))
    ? Number(expectedActiveCanonicalParcels)
    : null;
  const internalActiveDeclared = activeReconciliationRows.length;
  const registryActual = canonical.length;

  const summary = {
    activeCanonicalParcels: registryActual,
    historicalRetiredParcels: historical.length,
    sourceObservations: sourceObservations.length,
    candidateAssociations: matching.candidateAssociations.length,
    acceptedMatches: matching.outcomeGroups.ACCEPTED.count,
    ambiguousCases: matching.outcomeGroups.AMBIGUOUS.count,
    unmatchedObservationCases: matching.unmatchedObservationIds.length,
    rejectedMatches: matching.outcomeGroups.REJECTED.count,
    conflicts: conflicts.length,
    openConflicts: openConflicts.length,
    resolvedConflicts: resolvedConflicts.length,
    reconciliationRecords: reconciled.length,
    reconciledStatusCases: reconciledStatusRows.length,
    reconciledCases: reconciledStatusRows.length,
    unresolvedCases: unresolvedRows.length,
    humanReviewCases: humanReviewRows.length,
    explicitHumanReviewEvents: explicitHumanReviewEvents.length,
    splitLineageRelationships,
    mergeLineageRelationships
  };

  return {
    principle: CANONICAL_TRACE_PRINCIPLE,
    summary,
    activeParcelIds: canonical.map((r) => r.canonical_parcel_id),
    historicalParcelIds: historical.map((r) => r.canonical_parcel_id),
    activeByCell: countBy(canonical, (r) => r.cell_id || 'UNASSIGNED'),
    authoritativeStateCounts: countBy(reconciled, (r) => r.authoritativeState?.state || 'UNSPECIFIED'),
    matchStatusCounts: countBy(reconciled, (r) => r.match_status || 'UNSPECIFIED'),
    recordStatusCounts: countBy(reconciled, (r) => r.record_status || 'UNSPECIFIED'),
    traceCoverage: {
      totalActiveCanonicalParcels: canonical.length,
      complete: traces.filter((t) => t.complete).length,
      incomplete: gaps.length,
      parcelsWithExplicitConflicts: traces.filter((t) => t.conflicts.length > 0).length,
      parcelsWithNoRecordedConflict: traces.filter((t) => t.conflicts.length === 0).length,
      gaps: gaps.map((t) => ({ parcelId: t.parcelId, missing: t.missing }))
    },
    consistency: {
      activeCanonicalRegistryRows: registryActual,
      activeReconciliationRows: internalActiveDeclared,
      registryVsReconciliationDiscrepancy: registryActual !== internalActiveDeclared
        ? { expectedFromActiveReconciliationRows: internalActiveDeclared, actualCanonicalRegistryRows: registryActual, difference: registryActual - internalActiveDeclared }
        : null,
      specificationExpectedActive: specificationExpected,
      specificationDiscrepancy: specificationExpected != null && specificationExpected !== registryActual
        ? { expected: specificationExpected, actual: registryActual, difference: registryActual - specificationExpected }
        : null,
      specificationExpectationAvailable: specificationExpected != null
    }
  };
}

function buildCanonicalParcelTraceModelUncached(layer, parcelId) {
  if (!layer?.tables) throw new Error('buildCanonicalParcelTraceModel requires the evidence data layer');
  const canonical = (layer.tables.canonicalParcels ?? []).find((r) => r.canonical_parcel_id === parcelId) ?? null;
  const historical = (layer.tables.historicalParcels ?? []).find((r) => r.canonical_parcel_id === parcelId) ?? null;
  const reconciliation = (layer.tables.reconciledParcels ?? []).find((r) => r.canonical_parcel_id === parcelId) ?? null;
  if (!canonical && !historical && !reconciliation) return { found: false, parcelId };

  const observations = reconciliation
    ? (reconciliation.matchedSourceIds ?? []).map((id) => (layer.tables.sourceObservations ?? []).find((o) => o.observation_id === id)).filter(Boolean)
    : [];
  const normalizedById = new Map((layer.tables.matchingInput ?? []).map((r) => [r.observation_id, r]));
  const sourceByType = new Map((layer.tables.sourceMetadata ?? []).map((r) => [r.source_type, r]));
  const adaptersBySourceType = adapterRoutesBySourceType(layer);
  const conflicts = (layer.tables.conflicts ?? []).filter((c) => c.canonical_parcel_id === parcelId);
  const governanceEvents = (layer.tables.geogitEvents ?? []).filter((e) => e.parcel_id === parcelId && ['HUMAN_REVIEW','PROPOSAL_ACCEPTED','PROPOSAL_REJECTED'].includes(e.event_type));

  const observationTrace = observations.map((observation) => ({
    observationId: observation.observation_id,
    sourceType: observation.source_type,
    sourceRecordId: observation.source_record_id,
    sourceParcelId: observation.source_parcel_id,
    sourceDataset: sourceByType.get(observation.source_type) ?? null,
    normalizedObservation: normalizedById.get(observation.observation_id) ?? null,
    adapterRoutes: adaptersBySourceType.get(observation.source_type) ?? [],
    primaryCandidateParcelId: observation.candidate_canonical_parcel_id || null,
    alternateCandidateParcelIds: observation.alternateCandidateParcelIds ?? []
  }));

  return {
    found: true,
    parcelId,
    principle: CANONICAL_TRACE_PRINCIPLE,
    canonicalState: canonical,
    historicalState: historical,
    reconciliation: reconciliation ? {
      recordStatus: reconciliation.record_status,
      matchStatus: reconciliation.match_status,
      proposedState: reconciliation.proposedState,
      authoritativeState: reconciliation.authoritativeState,
      reconciliationConfidence: reconciliation.reconciliationConfidence,
      overallMatchConfidence: reconciliation.overallMatchConfidence,
      timestamp: reconciliation.reconciliation_timestamp,
      unresolvedConflictIds: reconciliation.unresolvedConflictIds ?? [],
      requiresHumanReview: Boolean(reconciliation.requiresHumanReview)
    } : null,
    authorityReview: {
      events: governanceEvents.map((e) => ({ eventId: e.event_id, eventType: e.event_type, actorType: e.actor_type || null, source: e.source || null, timestamp: e.timestamp || null, reason: e.reason || null })),
      resultingState: reconciliation?.authoritativeState ?? null
    },
    conflictDetection: {
      status: conflicts.length ? 'EXPLICIT_CONFLICTS_RECORDED' : 'NO_RECORDED_CONFLICT',
      conflictIds: conflicts.map((c) => c.conflict_id),
      openConflictIds: conflicts.filter((c) => c.status === 'OPEN').map((c) => c.conflict_id),
      resolvedConflictIds: conflicts.filter((c) => c.status === 'RESOLVED').map((c) => c.conflict_id)
    },
    matching: reconciliation ? {
      matchStatus: reconciliation.match_status,
      outcomeGroup: classifyMatchOutcome(reconciliation.match_status),
      overallMatchConfidence: reconciliation.overallMatchConfidence
    } : null,
    normalizedObservationIds: observationTrace.filter((x) => x.normalizedObservation).map((x) => x.observationId),
    adapterIds: uniq(observationTrace.flatMap((x) => x.adapterRoutes.map((a) => a.adapterId))),
    sourceObservationIds: observations.map((o) => o.observation_id),
    sourceDatasetIds: uniq(observationTrace.map((x) => x.sourceDataset?.source_id)),
    observations: observationTrace,
    traceComplete: Boolean(canonical || historical) && Boolean(reconciliation) && observations.length > 0
      && observationTrace.every((x) => x.normalizedObservation && x.sourceDataset && x.adapterRoutes.length > 0)
  };
}

const authoritativeCanonicalModelCache = new WeakMap();
const canonicalParcelTraceCache = new WeakMap();

export function buildAuthoritativeCanonicalStateModel(layer, { expectedActiveCanonicalParcels = null } = {}) {
  let byExpectation = authoritativeCanonicalModelCache.get(layer);
  if (!byExpectation) { byExpectation = new Map(); authoritativeCanonicalModelCache.set(layer, byExpectation); }
  const key = expectedActiveCanonicalParcels == null ? '__none__' : String(expectedActiveCanonicalParcels);
  if (!byExpectation.has(key)) byExpectation.set(key, buildAuthoritativeCanonicalStateModelUncached(layer, { expectedActiveCanonicalParcels }));
  return byExpectation.get(key);
}

export function buildCanonicalParcelTraceModel(layer, parcelId) {
  let byParcel = canonicalParcelTraceCache.get(layer);
  if (!byParcel) { byParcel = new Map(); canonicalParcelTraceCache.set(layer, byParcel); }
  if (!byParcel.has(parcelId)) byParcel.set(parcelId, buildCanonicalParcelTraceModelUncached(layer, parcelId));
  return byParcel.get(parcelId);
}
