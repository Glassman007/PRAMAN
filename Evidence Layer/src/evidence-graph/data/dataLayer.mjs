import { EDGE_TYPES, ENTITY_AVAILABILITY, NODE_TYPES, REQUIRED_TABLES } from './constants.mjs';
import { countBy, groupBy, indexUnique, issue, metadataRef, parseJson, splitIds, stableEdgeId, toBoolean, toNumber, unique } from './utils.mjs';

const tableName = Object.freeze({
  sourceMetadata: 'SOURCE_METADATA', sourceSchema: 'SOURCE_SPECIFIC_SCHEMA', sourceGeometries: 'SOURCE_GEOMETRIES',
  matchingInput: 'MATCHING_INPUT_VIEW', sourceObservations: 'SOURCE_OBSERVATIONS', conflicts: 'CONFLICTS',
  conflictEvidence: 'CONFLICT_EVIDENCE', conflictRejectedProvenance: 'CONFLICTS_REJECTED_PROVENANCE',
  reconciledParcels: 'RECONCILED_PARCELS', canonicalParcels: 'CANONICAL_PARCELS', geometryVersions: 'GEOMETRY_VERSIONS',
  historicalParcels: 'HISTORICAL_PARCELS', parcelLineage: 'PARCEL_LINEAGE', geogitEvents: 'GEOGIT_EVENTS'
});

const nodeId = (type, id) => `${type}:${id}`;

function baseNode({ type, datasetRecordId, canonicalParcelId = null, sourceId = null, timestamp = null, status = null, confidence = null, metadata, data }) {
  return {
    id: nodeId(type, datasetRecordId), type, datasetRecordId,
    canonicalParcelId, sourceId, timestamp, status, confidence,
    metadataRef: metadata, data
  };
}

function edge(type, from, to, metadata, data = null, qualifier = '') {
  return { id: stableEdgeId(type, from, to, qualifier), type, from, to, metadataRef: metadata, data };
}

function normalizeLineageEventType(eventType) {
  if (eventType === 'SPLIT' || eventType === 'CROSS_CELL_SPLIT') return 'SPLIT';
  if (eventType === 'MERGE' || eventType === 'CROSS_CELL_MERGE' || eventType === 'REDEVELOPMENT_CONSOLIDATION') return 'MERGE';
  return eventType;
}

function parseObservation(row) {
  return {
    ...row,
    alternateCandidateParcelIds: splitIds(row.alternate_candidate_parcel_ids),
    lineageReferences: splitIds(row.lineage_reference),
    sourceReliability: toNumber(row.source_reliability),
    geometryConfidence: toNumber(row.geometry_confidence),
    attributeConfidence: toNumber(row.attribute_confidence),
    temporalFreshness: toNumber(row.temporal_freshness),
    identifierConfidence: toNumber(row.identifier_confidence),
    positionalAccuracyM: toNumber(row.positional_accuracy_m),
    observedArea: toNumber(row.observed_area)
  };
}

function parseMatchingInput(row) {
  return {
    ...row,
    sourceReliability: toNumber(row.source_reliability),
    geometryConfidence: toNumber(row.geometry_confidence),
    attributeConfidence: toNumber(row.attribute_confidence),
    temporalFreshness: toNumber(row.temporal_freshness),
    identifierConfidence: toNumber(row.identifier_confidence),
    positionalAccuracyM: toNumber(row.positional_accuracy_m),
    observedArea: toNumber(row.observed_area)
  };
}

function parseReconciled(row) {
  return {
    ...row,
    parentParcelIds: splitIds(row.parent_parcel_ids), childParcelIds: splitIds(row.child_parcel_ids),
    matchedSourceIds: splitIds(row.matched_source_ids), unresolvedConflictIds: splitIds(row.unresolved_conflicts),
    sourceCount: toNumber(row.source_count), requiresHumanReview: toBoolean(row.requires_human_review),
    overallMatchConfidence: toNumber(row.overall_match_confidence), geometryConfidence: toNumber(row.geometry_confidence),
    ownershipConfidence: toNumber(row.ownership_confidence), landUseConfidence: toNumber(row.land_use_confidence),
    lineageConfidence: toNumber(row.lineage_confidence), reconciliationConfidence: toNumber(row.reconciliation_confidence),
    proposedState: parseJson(row.proposed_state), authoritativeState: parseJson(row.authoritative_state)
  };
}

function parseConflict(row) { return { ...row, humanReviewRequired: toBoolean(row.human_review_required) }; }
function parseGeometryVersion(row) { return { ...row, areaSqm: toNumber(row.area_sqm) }; }
function parseSourceGeometry(row) { return { ...row, observationIds: splitIds(row.observation_ids), sourceRecordIds: splitIds(row.source_record_ids), observedAreaSqm: toNumber(row.observed_area_sqm), positionalAccuracyM: toNumber(row.positional_accuracy_m) }; }

export function createEvidenceGraphDataLayer(rawTables, { strict = false } = {}) {
  const diagnostics = [];
  for (const key of REQUIRED_TABLES) {
    if (!Array.isArray(rawTables[key])) diagnostics.push(issue('ERROR', 'MISSING_TABLE', tableName[key] ?? key, null, `Required table '${key}' is missing`));
  }
  if (strict && diagnostics.some((d) => d.severity === 'ERROR')) throw new Error(diagnostics.map((d) => d.message).join('; '));

  const tables = {
    sourceMetadata: rawTables.sourceMetadata ?? [],
    sourceSchema: rawTables.sourceSchema ?? [],
    sourceGeometries: (rawTables.sourceGeometries ?? []).map(parseSourceGeometry),
    matchingInput: (rawTables.matchingInput ?? []).map(parseMatchingInput),
    sourceObservations: (rawTables.sourceObservations ?? []).map(parseObservation),
    conflicts: (rawTables.conflicts ?? []).map(parseConflict),
    conflictEvidence: rawTables.conflictEvidence ?? [],
    conflictRejectedProvenance: rawTables.conflictRejectedProvenance ?? [],
    reconciledParcels: (rawTables.reconciledParcels ?? []).map(parseReconciled),
    canonicalParcels: rawTables.canonicalParcels ?? [],
    geometryVersions: (rawTables.geometryVersions ?? []).map(parseGeometryVersion),
    historicalParcels: rawTables.historicalParcels ?? [],
    parcelLineage: rawTables.parcelLineage ?? [],
    geogitEvents: rawTables.geogitEvents ?? []
  };

  const idx = {
    sourceById: indexUnique(tables.sourceMetadata, 'source_id', diagnostics, 'SOURCE_METADATA'),
    sourceByType: indexUnique(tables.sourceMetadata, 'source_type', diagnostics, 'SOURCE_METADATA'),
    schemaByType: indexUnique(tables.sourceSchema, 'source_type', diagnostics, 'SOURCE_SPECIFIC_SCHEMA'),
    sourceGeometryById: indexUnique(tables.sourceGeometries, 'geometry_id', diagnostics, 'SOURCE_GEOMETRIES'),
    matchingInputByObservation: indexUnique(tables.matchingInput, 'observation_id', diagnostics, 'MATCHING_INPUT_VIEW'),
    observationById: indexUnique(tables.sourceObservations, 'observation_id', diagnostics, 'SOURCE_OBSERVATIONS'),
    conflictById: indexUnique(tables.conflicts, 'conflict_id', diagnostics, 'CONFLICTS'),
    conflictEvidenceById: indexUnique(tables.conflictEvidence, 'conflict_evidence_id', diagnostics, 'CONFLICT_EVIDENCE'),
    reconciledByParcel: indexUnique(tables.reconciledParcels, 'canonical_parcel_id', diagnostics, 'RECONCILED_PARCELS'),
    canonicalByParcel: indexUnique(tables.canonicalParcels, 'canonical_parcel_id', diagnostics, 'CANONICAL_PARCELS'),
    geometryVersionById: indexUnique(tables.geometryVersions, 'geometry_id', diagnostics, 'GEOMETRY_VERSIONS'),
    historicalByParcel: indexUnique(tables.historicalParcels, 'canonical_parcel_id', diagnostics, 'HISTORICAL_PARCELS'),
    lineageById: indexUnique(tables.parcelLineage, 'lineage_event_id', diagnostics, 'PARCEL_LINEAGE'),
    geogitById: indexUnique(tables.geogitEvents, 'event_id', diagnostics, 'GEOGIT_EVENTS')
  };

  idx.conflictsByParcel = groupBy(tables.conflicts, (r) => r.canonical_parcel_id);
  idx.conflictEvidenceByConflict = groupBy(tables.conflictEvidence, (r) => r.conflict_id);
  idx.geometryVersionsByParcel = groupBy(tables.geometryVersions, (r) => r.canonical_parcel_id);
  idx.lineageByParent = groupBy(tables.parcelLineage, (r) => r.parent_parcel_id);
  idx.lineageByChild = groupBy(tables.parcelLineage, (r) => r.child_parcel_id);
  idx.geogitByParcel = groupBy(tables.geogitEvents, (r) => r.parcel_id);
  idx.observationsByCandidate = groupBy(tables.sourceObservations, (r) => r.candidate_canonical_parcel_id);

  const parcelUniverse = new Set([...idx.reconciledByParcel.keys(), ...idx.canonicalByParcel.keys(), ...idx.historicalByParcel.keys()]);
  validateReferences(tables, idx, parcelUniverse, diagnostics);

  const rejectedProvenanceByConflict = groupBy(tables.conflictRejectedProvenance, (r) => r.conflict_id);
  const parcelEvidenceCache = new Map();
  const parcelLineageCache = new Map();

  function sourceDatasetNode(row) {
    return baseNode({ type: NODE_TYPES.SourceDataset, datasetRecordId: row.source_id, sourceId: row.source_id,
      timestamp: row.acquisition_date || null, status: row.temporal_currency || null,
      confidence: { reliability: toNumber(row.reliability), nominalAccuracy: row.nominal_accuracy || null },
      metadata: metadataRef('SOURCE_METADATA', row.source_id), data: row });
  }

  function sourceSchemaNode(row) {
    return baseNode({ type: NODE_TYPES.SourceSchemaProfile, datasetRecordId: row.source_type,
      sourceId: idx.sourceByType.get(row.source_type)?.source_id ?? null, status: 'SCHEMA_PROFILE', confidence: null,
      metadata: metadataRef('SOURCE_SPECIFIC_SCHEMA', row.source_type), data: row });
  }

  function sourceGeometryNode(row) {
    return baseNode({ type: NODE_TYPES.SourceGeometry, datasetRecordId: row.geometry_id,
      sourceId: idx.sourceByType.get(row.source_type)?.source_id ?? null, status: row.geometry_quality_flag || null,
      confidence: { positionalAccuracyM: row.positionalAccuracyM },
      metadata: metadataRef('SOURCE_GEOMETRIES', row.geometry_id), data: row });
  }

  function sourceObservationNode(row) {
    const source = idx.sourceByType.get(row.source_type);
    return baseNode({ type: NODE_TYPES.SourceObservation, datasetRecordId: row.observation_id,
      canonicalParcelId: row.candidate_canonical_parcel_id || null, sourceId: source?.source_id ?? null,
      timestamp: row.observation_date || null, status: row.record_status || null,
      confidence: { sourceReliability: row.sourceReliability, geometry: row.geometryConfidence, attribute: row.attributeConfidence,
        temporalFreshness: row.temporalFreshness, identifier: row.identifierConfidence, positionalAccuracyM: row.positionalAccuracyM },
      metadata: metadataRef('SOURCE_OBSERVATIONS', row.observation_id), data: row });
  }

  function normalizedObservationNode(row) {
    const source = idx.sourceByType.get(row.source_type);
    return baseNode({ type: NODE_TYPES.NormalizedObservation, datasetRecordId: row.observation_id,
      sourceId: source?.source_id ?? null, timestamp: row.observation_date || null, status: 'NORMALIZED_INPUT',
      confidence: { sourceReliability: row.sourceReliability, geometry: row.geometryConfidence, attribute: row.attributeConfidence,
        temporalFreshness: row.temporalFreshness, identifier: row.identifierConfidence, positionalAccuracyM: row.positionalAccuracyM },
      metadata: metadataRef('MATCHING_INPUT_VIEW', row.observation_id), data: row });
  }

  function matchCandidateNode(observation, parcelId, role, ordinal = 0) {
    const id = `${observation.observation_id}:${parcelId}:${role}:${ordinal}`;
    return baseNode({ type: NODE_TYPES.MatchCandidate, datasetRecordId: id, canonicalParcelId: parcelId,
      sourceId: idx.sourceByType.get(observation.source_type)?.source_id ?? null,
      timestamp: observation.observation_date || null,
      status: role === 'PRIMARY' ? 'RECORDED_PRIMARY_CANDIDATE' : 'RECORDED_ALTERNATE_CANDIDATE', confidence: null,
      metadata: metadataRef('SOURCE_OBSERVATIONS', observation.observation_id, role === 'PRIMARY' ? 'candidate_canonical_parcel_id' : 'alternate_candidate_parcel_ids'),
      data: { observationId: observation.observation_id, parcelId, role, pairwiseScoreAvailable: false, pairwiseDecisionAvailable: false,
        observationConfidenceContext: sourceObservationNode(observation).confidence } });
  }

  function matchDecisionNode(row) {
    return baseNode({ type: NODE_TYPES.MatchDecision, datasetRecordId: row.canonical_parcel_id,
      canonicalParcelId: row.canonical_parcel_id, timestamp: row.reconciliation_timestamp || null, status: row.match_status || null,
      confidence: { overallMatch: row.overallMatchConfidence, geometry: row.geometryConfidence, ownership: row.ownershipConfidence,
        landUse: row.landUseConfidence, lineage: row.lineageConfidence, reconciliation: row.reconciliationConfidence },
      metadata: metadataRef('RECONCILED_PARCELS', row.canonical_parcel_id),
      data: { parcelLevelOnly: true, requiresHumanReview: row.requiresHumanReview, criticalityLevel: row.criticality_level,
        criticalityReason: row.criticality_reason, unresolvedConflictIds: row.unresolvedConflictIds, matchedSourceIds: row.matchedSourceIds } });
  }

  function conflictNode(row) {
    return baseNode({ type: NODE_TYPES.Conflict, datasetRecordId: row.conflict_id, canonicalParcelId: row.canonical_parcel_id,
      status: row.status || null, confidence: null, metadata: metadataRef('CONFLICTS', row.conflict_id),
      data: { ...row, restoredProvenance: rejectedProvenanceByConflict.get(row.conflict_id) ?? [] } });
  }

  function conflictEvidenceNode(row) {
    const conflict = idx.conflictById.get(row.conflict_id);
    return baseNode({ type: NODE_TYPES.ConflictEvidence, datasetRecordId: row.conflict_evidence_id,
      canonicalParcelId: conflict?.canonical_parcel_id ?? null, sourceId: idx.sourceByType.get(row.source_type)?.source_id ?? null,
      status: row.supports_or_contradicts || row.evidence_role || null, confidence: null,
      metadata: metadataRef('CONFLICT_EVIDENCE', row.conflict_evidence_id), data: row });
  }

  function proposalNode(row) {
    return baseNode({ type: NODE_TYPES.ReconciliationProposal, datasetRecordId: row.canonical_parcel_id,
      canonicalParcelId: row.canonical_parcel_id, timestamp: row.reconciliation_timestamp || null,
      status: row.proposedState?.state ?? row.match_status ?? null, confidence: { reconciliation: row.reconciliationConfidence },
      metadata: metadataRef('RECONCILED_PARCELS', row.canonical_parcel_id, 'proposed_state'), data: row.proposedState });
  }

  function authorityNode(row) {
    return baseNode({ type: NODE_TYPES.AuthoritativeState, datasetRecordId: row.canonical_parcel_id,
      canonicalParcelId: row.canonical_parcel_id, timestamp: row.reconciliation_timestamp || null,
      status: row.authoritativeState?.state ?? null, confidence: null,
      metadata: metadataRef('RECONCILED_PARCELS', row.canonical_parcel_id, 'authoritative_state'), data: row.authoritativeState });
  }

  function canonicalNode(row) {
    return baseNode({ type: NODE_TYPES.CanonicalParcel, datasetRecordId: row.canonical_parcel_id, canonicalParcelId: row.canonical_parcel_id,
      status: row.parcel_status || null, confidence: null, metadata: metadataRef('CANONICAL_PARCELS', row.canonical_parcel_id), data: row });
  }
  function historicalNode(row) {
    return baseNode({ type: NODE_TYPES.HistoricalParcel, datasetRecordId: row.canonical_parcel_id, canonicalParcelId: row.canonical_parcel_id,
      timestamp: row.retired_date || null, status: row.record_status || null, confidence: null,
      metadata: metadataRef('HISTORICAL_PARCELS', row.canonical_parcel_id), data: row });
  }
  function geometryNode(row) {
    return baseNode({ type: NODE_TYPES.GeometryVersion, datasetRecordId: row.geometry_id, canonicalParcelId: row.canonical_parcel_id,
      timestamp: row.effective_date || null, status: row.geometry_status || null, confidence: null,
      metadata: metadataRef('GEOMETRY_VERSIONS', row.geometry_id), data: row });
  }
  function lineageNode(row) {
    return baseNode({ type: NODE_TYPES.LineageEvent, datasetRecordId: row.lineage_event_id, canonicalParcelId: row.parent_parcel_id,
      timestamp: row.effective_date || null, status: row.accepted_status || null, confidence: null,
      metadata: metadataRef('PARCEL_LINEAGE', row.lineage_event_id), data: row });
  }
  function geogitNode(row) {
    return baseNode({ type: NODE_TYPES.GeoGitEvent, datasetRecordId: row.event_id, canonicalParcelId: row.parcel_id,
      timestamp: row.timestamp || null, status: row.event_type || null, confidence: null,
      metadata: metadataRef('GEOGIT_EVENTS', row.event_id), data: { ...row, relatedParcelIds: splitIds(row.related_parcel_ids) } });
  }
  function reviewEventNode(row) {
    return baseNode({ type: NODE_TYPES.ReviewEvent, datasetRecordId: row.event_id, canonicalParcelId: row.parcel_id,
      timestamp: row.timestamp || null, status: row.event_type, confidence: null,
      metadata: metadataRef('GEOGIT_EVENTS', row.event_id), data: row });
  }
  function reviewDecisionNode(row) {
    return baseNode({ type: NODE_TYPES.ReviewDecision, datasetRecordId: row.event_id, canonicalParcelId: row.parcel_id,
      timestamp: row.timestamp || null, status: row.event_type === 'PROPOSAL_ACCEPTED' ? 'ACCEPTED' : 'REJECTED', confidence: null,
      metadata: metadataRef('GEOGIT_EVENTS', row.event_id), data: row });
  }

  function parcelNode(parcelId) {
    if (idx.canonicalByParcel.has(parcelId)) return canonicalNode(idx.canonicalByParcel.get(parcelId));
    if (idx.historicalByParcel.has(parcelId)) return historicalNode(idx.historicalByParcel.get(parcelId));
    return null;
  }

  function typedEvidenceTarget(row) {
    const id = row.evidence_id;
    switch (row.source_table) {
      case 'SOURCE_OBSERVATIONS':
        // SOURCE_COVERAGE_STATE explicitly represents an absent expected source record.
        // Its evidence_id is a parcel ID, so there is intentionally no observation target.
        if (row.evidence_type === 'SOURCE_COVERAGE_STATE') return null;
        return idx.observationById.has(id) ? sourceObservationNode(idx.observationById.get(id)) : null;
      case 'CANONICAL_PARCELS':
        if (idx.canonicalByParcel.has(id)) return canonicalNode(idx.canonicalByParcel.get(id));
        // Some canonical-state evidence points to parcels that are now retired. Preserve the
        // explicit ID but resolve it to the historical registry rather than inventing a live row.
        return idx.historicalByParcel.has(id) ? historicalNode(idx.historicalByParcel.get(id)) : null;
      case 'PARCEL_LINEAGE': return idx.lineageById.has(id) ? lineageNode(idx.lineageById.get(id)) : null;
      case 'RECONCILED_PARCELS': return idx.reconciledByParcel.has(id) ? matchDecisionNode(idx.reconciledByParcel.get(id)) : null;
      case 'GEOGIT_EVENTS': return idx.geogitById.has(id) ? geogitNode(idx.geogitById.get(id)) : null;
      default: return null;
    }
  }

  function findLineageGeoGitEvent(lineage) {
    const normalized = normalizeLineageEventType(lineage.event_type);
    return tables.geogitEvents.filter((e) => e.parcel_id === lineage.parent_parcel_id
      && normalizeLineageEventType(e.event_type) === normalized
      && splitIds(e.related_parcel_ids).includes(lineage.child_parcel_id));
  }

  function getEvidenceRunSummary() {
    const candidateStats = candidateAssociations();
    return {
      sources: tables.sourceMetadata.length,
      sourceSchemas: tables.sourceSchema.length,
      sourceGeometries: tables.sourceGeometries.length,
      sourceObservations: tables.sourceObservations.length,
      normalizedObservations: tables.matchingInput.length,
      candidateAssociations: candidateStats,
      adapterExecutionRecords: 0,
      pairwiseMatchDecisionRecords: 0,
      conflicts: { total: tables.conflicts.length, byStatus: countBy(tables.conflicts, (r) => r.status), evidenceRecords: tables.conflictEvidence.length },
      reconciliationRecords: tables.reconciledParcels.length,
      canonicalParcels: tables.canonicalParcels.length,
      historicalParcels: tables.historicalParcels.length,
      geometryVersions: tables.geometryVersions.length,
      lineageEvents: tables.parcelLineage.length,
      geogitEvents: tables.geogitEvents.length,
      reviewEvents: tables.geogitEvents.filter((e) => e.event_type === 'HUMAN_REVIEW').length,
      reviewDecisions: tables.geogitEvents.filter((e) => e.event_type === 'PROPOSAL_ACCEPTED' || e.event_type === 'PROPOSAL_REJECTED').length,
      diagnostics: diagnosticSummary()
    };
  }

  function getSourceSummary(sourceTypeOrId = null) {
    const sourceRows = sourceTypeOrId
      ? tables.sourceMetadata.filter((s) => s.source_type === sourceTypeOrId || s.source_id === sourceTypeOrId)
      : tables.sourceMetadata;
    return sourceRows.map((source) => {
      const observations = tables.sourceObservations.filter((o) => o.source_type === source.source_type);
      const normalized = tables.matchingInput.filter((o) => o.source_type === source.source_type);
      const geometries = tables.sourceGeometries.filter((g) => g.source_type === source.source_type);
      return {
        sourceId: source.source_id, sourceType: source.source_type, sourceName: source.source_name, authority: source.authority,
        reliability: toNumber(source.reliability), acquisitionDate: source.acquisition_date, temporalCurrency: source.temporal_currency,
        observationCount: observations.length, normalizedObservationCount: normalized.length, sourceGeometryCount: geometries.length,
        observationStatusCounts: countBy(observations, (o) => o.record_status)
      };
    });
  }

  function getAdapterSummary() {
    return {
      executionRecordsAvailable: false,
      executionCount: 0,
      sourceOfTruth: ['SOURCE_SPECIFIC_SCHEMA', 'MATCHING_INPUT_VIEW'],
      caution: ENTITY_AVAILABILITY.AdapterExecution.reason,
      profiles: tables.sourceSchema.map((schema) => ({
        sourceType: schema.source_type,
        sourceId: idx.sourceByType.get(schema.source_type)?.source_id ?? null,
        purpose: schema.purpose,
        requiredKeys: splitIds(schema.required_keys),
        sourceSpecificKeys: splitIds(schema.source_specific_keys),
        lifecycleMetadataFields: splitIds(schema.lifecycle_metadata_fields),
        normalizedObservationCount: tables.matchingInput.filter((r) => r.source_type === schema.source_type).length
      }))
    };
  }

  function candidateAssociations() {
    let primary = 0, alternate = 0, observationsWithAlternates = 0;
    for (const o of tables.sourceObservations) {
      if (o.candidate_canonical_parcel_id) primary += 1;
      alternate += o.alternateCandidateParcelIds.length;
      if (o.alternateCandidateParcelIds.length) observationsWithAlternates += 1;
    }
    return { total: primary + alternate, primary, alternate, observationsWithAlternates, pairwiseScoresAvailable: false, pairwiseDecisionsAvailable: false };
  }

  function getMatchingSummary() {
    return {
      observations: tables.sourceObservations.length,
      observationRecordStatusCounts: countBy(tables.sourceObservations, (r) => r.record_status),
      candidates: candidateAssociations(),
      parcelLevelMatchStatusCounts: countBy(tables.reconciledParcels, (r) => r.match_status),
      confidenceFields: ['source_reliability', 'geometry_confidence', 'attribute_confidence', 'temporal_freshness', 'identifier_confidence', 'positional_accuracy_m'],
      limitations: [ENTITY_AVAILABILITY.PairwiseMatchDecision.reason, ENTITY_AVAILABILITY.PairwiseMatchScore.reason]
    };
  }

  function getConflictSummary() {
    return {
      total: tables.conflicts.length,
      byStatus: countBy(tables.conflicts, (r) => r.status),
      byType: countBy(tables.conflicts, (r) => r.conflict_type),
      bySeverity: countBy(tables.conflicts, (r) => r.severity),
      byCriticality: countBy(tables.conflicts, (r) => r.criticality),
      humanReviewRequired: countBy(tables.conflicts, (r) => String(r.humanReviewRequired)),
      evidenceRecords: tables.conflictEvidence.length,
      restoredProvenanceRows: tables.conflictRejectedProvenance.length
    };
  }

  function getReconciliationSummary() {
    const unresolvedIds = unique(tables.reconciledParcels.flatMap((r) => r.unresolvedConflictIds));
    return {
      total: tables.reconciledParcels.length,
      recordStatusCounts: countBy(tables.reconciledParcels, (r) => r.record_status),
      matchStatusCounts: countBy(tables.reconciledParcels, (r) => r.match_status),
      lineageStatusCounts: countBy(tables.reconciledParcels, (r) => r.lineage_status),
      criticalityCounts: countBy(tables.reconciledParcels, (r) => r.criticality_level),
      requiresHumanReview: countBy(tables.reconciledParcels, (r) => String(r.requiresHumanReview)),
      unresolvedConflictMembershipCount: unresolvedIds.length,
      proposalCount: tables.reconciledParcels.filter((r) => r.proposedState).length,
      authoritativeStateCount: tables.reconciledParcels.filter((r) => r.authoritativeState).length
    };
  }

  function getCanonicalSummary() {
    return {
      active: tables.canonicalParcels.length,
      historicalRetired: tables.historicalParcels.length,
      totalParcelUniverse: parcelUniverse.size,
      activeByCell: countBy(tables.canonicalParcels, (r) => r.cell_id),
      currentGeometryReferences: tables.canonicalParcels.filter((r) => r.current_geometry_id).length,
      geometryStatusCounts: countBy(tables.geometryVersions, (r) => r.geometry_status),
      geometryAcceptanceCounts: countBy(tables.geometryVersions, (r) => r.accepted_status)
    };
  }

  function getParcelSourceObservations(parcelId) {
    const recon = idx.reconciledByParcel.get(parcelId);
    const ids = recon ? recon.matchedSourceIds : [];
    return ids.map((id) => idx.observationById.get(id)).filter(Boolean);
  }

  function getParcelMatchCandidates(parcelId) {
    const out = [];
    for (const observation of tables.sourceObservations) {
      if (observation.candidate_canonical_parcel_id === parcelId) out.push(matchCandidateNode(observation, parcelId, 'PRIMARY', 0));
      observation.alternateCandidateParcelIds.forEach((alt, i) => { if (alt === parcelId) out.push(matchCandidateNode(observation, parcelId, 'ALTERNATE', i)); });
    }
    return out;
  }

  function getParcelConflicts(parcelId) {
    return (idx.conflictsByParcel.get(parcelId) ?? []).map((conflict) => ({
      conflict,
      evidence: idx.conflictEvidenceByConflict.get(conflict.conflict_id) ?? [],
      restoredProvenance: rejectedProvenanceByConflict.get(conflict.conflict_id) ?? []
    }));
  }

  function getParcelLineage(parcelId) {
    if (parcelLineageCache.has(parcelId)) return parcelLineageCache.get(parcelId);
    const directParentEvents = idx.lineageByChild.get(parcelId) ?? [];
    const directChildEvents = idx.lineageByParent.get(parcelId) ?? [];
    const traverse = (start, direction) => {
      const seen = new Set([start]);
      const result = [];
      const queue = [start];
      while (queue.length) {
        const current = queue.shift();
        const events = direction === 'up' ? (idx.lineageByChild.get(current) ?? []) : (idx.lineageByParent.get(current) ?? []);
        for (const e of events) {
          const next = direction === 'up' ? e.parent_parcel_id : e.child_parcel_id;
          result.push({ event: e, parcelId: next });
          if (!seen.has(next)) { seen.add(next); queue.push(next); }
        }
      }
      return result;
    };
    const directEvents = unique([...directParentEvents, ...directChildEvents].map((e) => e.lineage_event_id)).map((id) => idx.lineageById.get(id));
    const result = {
      parcelId,
      directParents: directParentEvents.map((e) => e.parent_parcel_id),
      directChildren: directChildEvents.map((e) => e.child_parcel_id),
      directEvents,
      ancestors: traverse(parcelId, 'up'),
      descendants: traverse(parcelId, 'down'),
      geogitMappings: directEvents.map((e) => ({ lineageEventId: e.lineage_event_id, geogitEvents: findLineageGeoGitEvent(e) }))
    };
    parcelLineageCache.set(parcelId, result);
    return result;
  }

  function getParcelEvidence(parcelId) {
    if (parcelEvidenceCache.has(parcelId)) return parcelEvidenceCache.get(parcelId);
    if (!parcelUniverse.has(parcelId)) return { parcelId, found: false, nodes: [], edges: [], diagnostics: [issue('ERROR', 'UNKNOWN_PARCEL', null, parcelId, `Unknown parcel ${parcelId}`)] };

    const nodes = new Map();
    const edges = new Map();
    const addNode = (n) => { if (n) nodes.set(n.id, n); return n; };
    const addEdge = (e) => { if (e) edges.set(e.id, e); return e; };

    const parcel = addNode(parcelNode(parcelId));
    const recon = idx.reconciledByParcel.get(parcelId);
    if (recon) {
      const md = addNode(matchDecisionNode(recon));
      addEdge(edge(EDGE_TYPES.DECISION_FOR, md.id, parcel.id, metadataRef('RECONCILED_PARCELS', parcelId, 'match_status')));
      const proposal = addNode(proposalNode(recon));
      const authority = addNode(authorityNode(recon));
      addEdge(edge(EDGE_TYPES.PROPOSED_STATE, md.id, proposal.id, metadataRef('RECONCILED_PARCELS', parcelId, 'proposed_state')));
      addEdge(edge(EDGE_TYPES.AUTHORITY_STATE, authority.id, parcel.id, metadataRef('RECONCILED_PARCELS', parcelId, 'authoritative_state')));

      for (const obsId of recon.matchedSourceIds) {
        const o = idx.observationById.get(obsId);
        if (!o) continue;
        const on = addNode(sourceObservationNode(o));
        addEdge(edge(EDGE_TYPES.EVIDENCE_MEMBER_OF, on.id, md.id, metadataRef('RECONCILED_PARCELS', parcelId, 'matched_source_ids'), null, obsId));
        const source = idx.sourceByType.get(o.source_type);
        if (source) {
          const sn = addNode(sourceDatasetNode(source));
          addEdge(edge(EDGE_TYPES.OBSERVED_FROM, on.id, sn.id, metadataRef('SOURCE_OBSERVATIONS', o.observation_id, 'source_type')));
        }
        const norm = idx.matchingInputByObservation.get(obsId);
        if (norm) {
          const nn = addNode(normalizedObservationNode(norm));
          addEdge(edge(EDGE_TYPES.NORMALIZED_TO, on.id, nn.id, metadataRef('MATCHING_INPUT_VIEW', obsId)));
          const schema = idx.schemaByType.get(o.source_type);
          if (schema) {
            const sch = addNode(sourceSchemaNode(schema));
            addEdge(edge(EDGE_TYPES.CONFORMS_TO_SCHEMA, nn.id, sch.id, metadataRef('SOURCE_SPECIFIC_SCHEMA', o.source_type)));
          }
        }
        const sg = idx.sourceGeometryById.get(o.geometry_id);
        if (sg) {
          const gn = addNode(sourceGeometryNode(sg));
          addEdge(edge(EDGE_TYPES.HAS_SOURCE_GEOMETRY, on.id, gn.id, metadataRef('SOURCE_OBSERVATIONS', o.observation_id, 'geometry_id')));
        }
        if (o.candidate_canonical_parcel_id) {
          const cn = addNode(matchCandidateNode(o, o.candidate_canonical_parcel_id, 'PRIMARY', 0));
          addEdge(edge(EDGE_TYPES.HAS_CANDIDATE, on.id, cn.id, metadataRef('SOURCE_OBSERVATIONS', o.observation_id, 'candidate_canonical_parcel_id'), null, cn.datasetRecordId));
          const target = addNode(parcelNode(o.candidate_canonical_parcel_id));
          if (target) addEdge(edge(EDGE_TYPES.CANDIDATE_FOR, cn.id, target.id, metadataRef('SOURCE_OBSERVATIONS', o.observation_id, 'candidate_canonical_parcel_id'), null, cn.datasetRecordId));
        }
        o.alternateCandidateParcelIds.forEach((alt, i) => {
          const cn = addNode(matchCandidateNode(o, alt, 'ALTERNATE', i));
          addEdge(edge(EDGE_TYPES.HAS_CANDIDATE, on.id, cn.id, metadataRef('SOURCE_OBSERVATIONS', o.observation_id, 'alternate_candidate_parcel_ids'), null, cn.datasetRecordId));
          const target = addNode(parcelNode(alt));
          if (target) addEdge(edge(EDGE_TYPES.CANDIDATE_FOR, cn.id, target.id, metadataRef('SOURCE_OBSERVATIONS', o.observation_id, 'alternate_candidate_parcel_ids'), null, cn.datasetRecordId));
        });
      }
    }

    // Also include candidate relations that point *to* this parcel even when the
    // originating observation belongs to another reconciliation evidence set.
    // This is necessary for a complete candidate story and uses only the explicit
    // primary/alternate candidate fields from SOURCE_OBSERVATIONS.
    for (const candidate of getParcelMatchCandidates(parcelId)) {
      const o = idx.observationById.get(candidate.data.observationId);
      if (!o) continue;
      const on = addNode(sourceObservationNode(o));
      const cn = addNode(candidate);
      addEdge(edge(EDGE_TYPES.HAS_CANDIDATE, on.id, cn.id, candidate.metadataRef, null, cn.datasetRecordId));
      addEdge(edge(EDGE_TYPES.CANDIDATE_FOR, cn.id, parcel.id, candidate.metadataRef, null, cn.datasetRecordId));

      const source = idx.sourceByType.get(o.source_type);
      if (source) {
        const sn = addNode(sourceDatasetNode(source));
        addEdge(edge(EDGE_TYPES.OBSERVED_FROM, on.id, sn.id, metadataRef('SOURCE_OBSERVATIONS', o.observation_id, 'source_type')));
      }
      const norm = idx.matchingInputByObservation.get(o.observation_id);
      if (norm) {
        const nn = addNode(normalizedObservationNode(norm));
        addEdge(edge(EDGE_TYPES.NORMALIZED_TO, on.id, nn.id, metadataRef('MATCHING_INPUT_VIEW', o.observation_id)));
        const schema = idx.schemaByType.get(o.source_type);
        if (schema) {
          const sch = addNode(sourceSchemaNode(schema));
          addEdge(edge(EDGE_TYPES.CONFORMS_TO_SCHEMA, nn.id, sch.id, metadataRef('SOURCE_SPECIFIC_SCHEMA', o.source_type)));
        }
      }
      const sg = idx.sourceGeometryById.get(o.geometry_id);
      if (sg) {
        const gn = addNode(sourceGeometryNode(sg));
        addEdge(edge(EDGE_TYPES.HAS_SOURCE_GEOMETRY, on.id, gn.id, metadataRef('SOURCE_OBSERVATIONS', o.observation_id, 'geometry_id')));
      }
    }

    for (const c of idx.conflictsByParcel.get(parcelId) ?? []) {
      const cn = addNode(conflictNode(c));
      addEdge(edge(EDGE_TYPES.HAS_CONFLICT, parcel.id, cn.id, metadataRef('CONFLICTS', c.conflict_id)));
      if (c.source_a_observation_id && c.source_b_observation_id) {
        const a = idx.observationById.get(c.source_a_observation_id), b = idx.observationById.get(c.source_b_observation_id);
        if (a && b) {
          const an = addNode(sourceObservationNode(a)), bn = addNode(sourceObservationNode(b));
          addEdge(edge(EDGE_TYPES.CONFLICTS_WITH, an.id, bn.id, metadataRef('CONFLICTS', c.conflict_id), { conflictId: c.conflict_id }, c.conflict_id));
        }
      }
      for (const ce of idx.conflictEvidenceByConflict.get(c.conflict_id) ?? []) {
        const cen = addNode(conflictEvidenceNode(ce));
        addEdge(edge(EDGE_TYPES.SUPPORTED_BY, cn.id, cen.id, metadataRef('CONFLICT_EVIDENCE', ce.conflict_evidence_id)));
        const target = addNode(typedEvidenceTarget(ce));
        if (target) addEdge(edge(EDGE_TYPES.REFERENCES_EVIDENCE, cen.id, target.id, metadataRef('CONFLICT_EVIDENCE', ce.conflict_evidence_id, 'evidence_id')));
      }
    }

    for (const g of idx.geometryVersionsByParcel.get(parcelId) ?? []) {
      const gn = addNode(geometryNode(g));
      addEdge(edge(EDGE_TYPES.VERSION_OF, gn.id, parcel.id, metadataRef('GEOMETRY_VERSIONS', g.geometry_id, 'canonical_parcel_id')));
      if (g.supersedes_geometry_id) {
        const prev = idx.geometryVersionById.get(g.supersedes_geometry_id);
        if (prev) {
          const pn = addNode(geometryNode(prev));
          addEdge(edge(EDGE_TYPES.SUPERSEDES, gn.id, pn.id, metadataRef('GEOMETRY_VERSIONS', g.geometry_id, 'supersedes_geometry_id')));
        }
      }
    }

    const lineage = getParcelLineage(parcelId);
    for (const l of lineage.directEvents) {
      const ln = addNode(lineageNode(l));
      const parent = addNode(parcelNode(l.parent_parcel_id));
      const child = addNode(parcelNode(l.child_parcel_id));
      if (parent) addEdge(edge(EDGE_TYPES.PARTICIPATES_IN_LINEAGE, parent.id, ln.id, metadataRef('PARCEL_LINEAGE', l.lineage_event_id)));
      if (child) addEdge(edge(EDGE_TYPES.PARTICIPATES_IN_LINEAGE, child.id, ln.id, metadataRef('PARCEL_LINEAGE', l.lineage_event_id), null, 'child'));
      if (parent && child) {
        if (normalizeLineageEventType(l.event_type) === 'SPLIT') addEdge(edge(EDGE_TYPES.SPLIT_INTO, parent.id, child.id, metadataRef('PARCEL_LINEAGE', l.lineage_event_id), { lineageEventId: l.lineage_event_id }, l.lineage_event_id));
        else addEdge(edge(EDGE_TYPES.MERGED_FROM, child.id, parent.id, metadataRef('PARCEL_LINEAGE', l.lineage_event_id), { lineageEventId: l.lineage_event_id }, l.lineage_event_id));
      }
      for (const ge of findLineageGeoGitEvent(l)) {
        const gen = addNode(geogitNode(ge));
        addEdge(edge(EDGE_TYPES.RECORDED_IN_GEOGIT, ln.id, gen.id, metadataRef('GEOGIT_EVENTS', ge.event_id), null, ge.event_id));
      }
    }

    for (const ge of idx.geogitByParcel.get(parcelId) ?? []) {
      const gen = addNode(geogitNode(ge));
      addEdge(edge(EDGE_TYPES.HAS_GEOGIT_EVENT, parcel.id, gen.id, metadataRef('GEOGIT_EVENTS', ge.event_id)));
      if (ge.event_type === 'HUMAN_REVIEW') {
        const rn = addNode(reviewEventNode(ge));
        addEdge(edge(EDGE_TYPES.HAS_REVIEW_EVENT, parcel.id, rn.id, metadataRef('GEOGIT_EVENTS', ge.event_id)));
      } else if (ge.event_type === 'PROPOSAL_ACCEPTED' || ge.event_type === 'PROPOSAL_REJECTED') {
        const rn = addNode(reviewDecisionNode(ge));
        addEdge(edge(EDGE_TYPES.HAS_REVIEW_DECISION, parcel.id, rn.id, metadataRef('GEOGIT_EVENTS', ge.event_id)));
      }
    }

    const result = { parcelId, found: true, nodes: [...nodes.values()], edges: [...edges.values()], diagnostics: diagnosticsForParcel(parcelId) };
    parcelEvidenceCache.set(parcelId, result);
    return result;
  }

  function* iterateEvidenceRunNodes() {
    for (const r of tables.sourceMetadata) yield sourceDatasetNode(r);
    for (const r of tables.sourceSchema) yield sourceSchemaNode(r);
    for (const r of tables.sourceGeometries) yield sourceGeometryNode(r);
    for (const r of tables.sourceObservations) yield sourceObservationNode(r);
    for (const r of tables.matchingInput) yield normalizedObservationNode(r);
    for (const o of tables.sourceObservations) {
      if (o.candidate_canonical_parcel_id) yield matchCandidateNode(o, o.candidate_canonical_parcel_id, 'PRIMARY', 0);
      o.alternateCandidateParcelIds.forEach(() => {});
      for (let i = 0; i < o.alternateCandidateParcelIds.length; i += 1) yield matchCandidateNode(o, o.alternateCandidateParcelIds[i], 'ALTERNATE', i);
    }
    for (const r of tables.reconciledParcels) { yield matchDecisionNode(r); yield proposalNode(r); yield authorityNode(r); }
    for (const r of tables.conflicts) yield conflictNode(r);
    for (const r of tables.conflictEvidence) yield conflictEvidenceNode(r);
    for (const r of tables.canonicalParcels) yield canonicalNode(r);
    for (const r of tables.historicalParcels) yield historicalNode(r);
    for (const r of tables.geometryVersions) yield geometryNode(r);
    for (const r of tables.parcelLineage) yield lineageNode(r);
    for (const r of tables.geogitEvents) {
      yield geogitNode(r);
      if (r.event_type === 'HUMAN_REVIEW') yield reviewEventNode(r);
      if (r.event_type === 'PROPOSAL_ACCEPTED' || r.event_type === 'PROPOSAL_REJECTED') yield reviewDecisionNode(r);
    }
  }

  function* iterateEvidenceRunEdges() {
    const seen = new Set();
    for (const parcelId of parcelUniverse) {
      const graph = getParcelEvidence(parcelId);
      for (const e of graph.edges) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        yield e;
      }
    }
  }

  function diagnosticSummary() { return countBy(diagnostics, (d) => d.severity); }
  function diagnosticsForParcel(parcelId) { return diagnostics.filter((d) => d.recordId === parcelId || d.details?.parcelId === parcelId || d.details?.canonicalParcelId === parcelId); }
  function getDiagnostics({ severity = null, code = null } = {}) { return diagnostics.filter((d) => (!severity || d.severity === severity) && (!code || d.code === code)); }

  return {
    getEvidenceRunSummary, getSourceSummary, getAdapterSummary, getMatchingSummary, getConflictSummary,
    getReconciliationSummary, getCanonicalSummary, getParcelEvidence, getParcelLineage,
    getParcelSourceObservations, getParcelConflicts, getParcelMatchCandidates, getDiagnostics,
    iterateEvidenceRunNodes, iterateEvidenceRunEdges,
    entityAvailability: ENTITY_AVAILABILITY,
    tables
  };
}

function validateReferences(tables, idx, parcelUniverse, diagnostics) {
  const add = (sev, code, table, recordId, message, details) => diagnostics.push(issue(sev, code, table, recordId, message, details));

  for (const o of tables.sourceObservations) {
    if (!idx.sourceByType.has(o.source_type)) add('ERROR', 'MISSING_SOURCE_METADATA', 'SOURCE_OBSERVATIONS', o.observation_id, `Unknown source_type ${o.source_type}`);
    if (!idx.schemaByType.has(o.source_type)) add('WARNING', 'MISSING_SOURCE_SCHEMA', 'SOURCE_OBSERVATIONS', o.observation_id, `No schema profile for ${o.source_type}`);
    if (!idx.sourceGeometryById.has(o.geometry_id)) add('ERROR', 'MISSING_SOURCE_GEOMETRY', 'SOURCE_OBSERVATIONS', o.observation_id, `Missing source geometry ${o.geometry_id}`);
    if (!idx.matchingInputByObservation.has(o.observation_id)) add('ERROR', 'MISSING_NORMALIZED_OBSERVATION', 'SOURCE_OBSERVATIONS', o.observation_id, 'No MATCHING_INPUT_VIEW row with same observation_id');
    if (o.candidate_canonical_parcel_id && !parcelUniverse.has(o.candidate_canonical_parcel_id)) add('ERROR', 'MISSING_CANDIDATE_PARCEL', 'SOURCE_OBSERVATIONS', o.observation_id, `Unknown candidate parcel ${o.candidate_canonical_parcel_id}`);
    for (const alt of o.alternateCandidateParcelIds) if (!parcelUniverse.has(alt)) add('ERROR', 'MISSING_ALTERNATE_CANDIDATE_PARCEL', 'SOURCE_OBSERVATIONS', o.observation_id, `Unknown alternate candidate ${alt}`);
  }

  for (const m of tables.matchingInput) if (!idx.observationById.has(m.observation_id)) add('ERROR', 'ORPHAN_NORMALIZED_OBSERVATION', 'MATCHING_INPUT_VIEW', m.observation_id, 'No SOURCE_OBSERVATIONS row with same observation_id');

  for (const g of tables.sourceGeometries) {
    for (const obsId of g.observationIds) {
      const o = idx.observationById.get(obsId);
      if (!o) add('WARNING', 'SOURCE_GEOMETRY_REVERSE_UNKNOWN_OBSERVATION', 'SOURCE_GEOMETRIES', g.geometry_id, `Reverse observation_ids references missing ${obsId}`);
      else if (o.geometry_id !== g.geometry_id) add('WARNING', 'SOURCE_GEOMETRY_REVERSE_LINK_MISMATCH', 'SOURCE_GEOMETRIES', g.geometry_id, `Reverse observation ${obsId} points forward to ${o.geometry_id}`, { observationId: obsId, forwardGeometryId: o.geometry_id });
    }
  }

  for (const c of tables.conflicts) {
    if (!parcelUniverse.has(c.canonical_parcel_id)) add('ERROR', 'MISSING_CONFLICT_PARCEL', 'CONFLICTS', c.conflict_id, `Unknown parcel ${c.canonical_parcel_id}`);
    for (const field of ['source_a_observation_id', 'source_b_observation_id']) if (c[field] && !idx.observationById.has(c[field])) add('ERROR', 'MISSING_CONFLICT_OBSERVATION', 'CONFLICTS', c.conflict_id, `Unknown ${field} ${c[field]}`);
  }

  const typedLookup = {
    SOURCE_OBSERVATIONS: idx.observationById,
    CANONICAL_PARCELS: idx.canonicalByParcel,
    PARCEL_LINEAGE: idx.lineageById,
    RECONCILED_PARCELS: idx.reconciledByParcel,
    GEOGIT_EVENTS: idx.geogitById
  };
  for (const ce of tables.conflictEvidence) {
    if (!idx.conflictById.has(ce.conflict_id)) add('ERROR', 'MISSING_CONFLICT_FOR_EVIDENCE', 'CONFLICT_EVIDENCE', ce.conflict_evidence_id, `Unknown conflict ${ce.conflict_id}`);
    const lookup = typedLookup[ce.source_table];
    if (!lookup) {
      add('WARNING', 'UNKNOWN_EVIDENCE_SOURCE_TABLE', 'CONFLICT_EVIDENCE', ce.conflict_evidence_id, `Unsupported source_table ${ce.source_table}`);
    } else if (ce.evidence_id && !lookup.has(ce.evidence_id)) {
      if (ce.source_table === 'SOURCE_OBSERVATIONS' && ce.evidence_type === 'SOURCE_COVERAGE_STATE' && parcelUniverse.has(ce.evidence_id)) {
        add('WARNING', 'NEGATIVE_EVIDENCE_HAS_NO_OBSERVATION_TARGET', 'CONFLICT_EVIDENCE', ce.conflict_evidence_id,
          `Coverage evidence deliberately records absence of an expected source observation for parcel ${ce.evidence_id}; no observation node is linked`,
          { parcelId: ce.evidence_id, evidenceType: ce.evidence_type });
      } else if (ce.source_table === 'CANONICAL_PARCELS' && idx.historicalByParcel.has(ce.evidence_id)) {
        add('WARNING', 'CANONICAL_EVIDENCE_TARGET_IS_HISTORICAL', 'CONFLICT_EVIDENCE', ce.conflict_evidence_id,
          `Canonical-state evidence refers to retired parcel ${ce.evidence_id}; resolved to HISTORICAL_PARCELS`,
          { parcelId: ce.evidence_id, fallbackTable: 'HISTORICAL_PARCELS' });
      } else {
        add('ERROR', 'MISSING_TYPED_EVIDENCE_TARGET', 'CONFLICT_EVIDENCE', ce.conflict_evidence_id, `Missing ${ce.source_table} record ${ce.evidence_id}`);
      }
    }
  }

  const observationMembership = new Map();
  for (const r of tables.reconciledParcels) {
    if (!parcelUniverse.has(r.canonical_parcel_id)) add('ERROR', 'MISSING_RECONCILED_PARCEL', 'RECONCILED_PARCELS', r.canonical_parcel_id, 'Reconciled parcel is outside parcel universe');
    for (const obsId of r.matchedSourceIds) {
      if (!idx.observationById.has(obsId)) add('ERROR', 'MISSING_RECONCILIATION_OBSERVATION', 'RECONCILED_PARCELS', r.canonical_parcel_id, `Unknown matched_source_id ${obsId}`);
      if (!observationMembership.has(obsId)) observationMembership.set(obsId, []);
      observationMembership.get(obsId).push(r.canonical_parcel_id);
      const obs = idx.observationById.get(obsId);
      if (obs && obs.candidate_canonical_parcel_id !== r.canonical_parcel_id) add('WARNING', 'OBSERVATION_RECONCILIATION_PARCEL_MISMATCH', 'RECONCILED_PARCELS', r.canonical_parcel_id, `${obsId} primary candidate is ${obs.candidate_canonical_parcel_id}`, { observationId: obsId, parcelId: r.canonical_parcel_id });
    }
    for (const conflictId of r.unresolvedConflictIds) {
      const c = idx.conflictById.get(conflictId);
      if (!c) add('ERROR', 'MISSING_UNRESOLVED_CONFLICT', 'RECONCILED_PARCELS', r.canonical_parcel_id, `Unknown unresolved conflict ${conflictId}`);
      else if (c.status !== 'OPEN') add('WARNING', 'UNRESOLVED_CONFLICT_NOT_OPEN', 'RECONCILED_PARCELS', r.canonical_parcel_id, `${conflictId} is ${c.status}`, { conflictId, parcelId: r.canonical_parcel_id });
    }
  }
  for (const o of tables.sourceObservations) {
    const memberships = observationMembership.get(o.observation_id) ?? [];
    if (memberships.length === 0) add('WARNING', 'OBSERVATION_NOT_IN_RECONCILIATION_SET', 'SOURCE_OBSERVATIONS', o.observation_id, 'Observation is not referenced by any matched_source_ids');
    if (memberships.length > 1) add('ERROR', 'OBSERVATION_IN_MULTIPLE_RECONCILIATION_SETS', 'SOURCE_OBSERVATIONS', o.observation_id, `Observation appears in ${memberships.length} reconciliation records`, { parcels: memberships });
  }

  for (const p of tables.canonicalParcels) if (p.current_geometry_id && !idx.geometryVersionById.has(p.current_geometry_id)) add('ERROR', 'MISSING_CURRENT_GEOMETRY', 'CANONICAL_PARCELS', p.canonical_parcel_id, `Missing geometry ${p.current_geometry_id}`, { parcelId: p.canonical_parcel_id });
  for (const p of tables.historicalParcels) if (p.historical_geometry_id && !idx.geometryVersionById.has(p.historical_geometry_id)) add('ERROR', 'MISSING_HISTORICAL_GEOMETRY', 'HISTORICAL_PARCELS', p.canonical_parcel_id, `Missing geometry ${p.historical_geometry_id}`, { parcelId: p.canonical_parcel_id });
  for (const g of tables.geometryVersions) {
    if (!parcelUniverse.has(g.canonical_parcel_id)) add('ERROR', 'MISSING_GEOMETRY_PARCEL', 'GEOMETRY_VERSIONS', g.geometry_id, `Unknown parcel ${g.canonical_parcel_id}`);
    if (g.supersedes_geometry_id && !idx.geometryVersionById.has(g.supersedes_geometry_id)) add('ERROR', 'MISSING_SUPERSEDED_GEOMETRY', 'GEOMETRY_VERSIONS', g.geometry_id, `Missing superseded geometry ${g.supersedes_geometry_id}`);
  }
  for (const l of tables.parcelLineage) {
    if (!parcelUniverse.has(l.parent_parcel_id)) add('ERROR', 'MISSING_LINEAGE_PARENT', 'PARCEL_LINEAGE', l.lineage_event_id, `Unknown parent ${l.parent_parcel_id}`);
    if (!parcelUniverse.has(l.child_parcel_id)) add('ERROR', 'MISSING_LINEAGE_CHILD', 'PARCEL_LINEAGE', l.lineage_event_id, `Unknown child ${l.child_parcel_id}`);
    const n = normalizeLineageEventType(l.event_type);
    const matches = tables.geogitEvents.filter((e) => e.parcel_id === l.parent_parcel_id && normalizeLineageEventType(e.event_type) === n && splitIds(e.related_parcel_ids).includes(l.child_parcel_id));
    if (matches.length !== 1) add(matches.length === 0 ? 'WARNING' : 'ERROR', 'LINEAGE_GEOGIT_MAPPING_NOT_UNIQUE', 'PARCEL_LINEAGE', l.lineage_event_id, `Expected 1 GeoGit lineage event; found ${matches.length}`, { parcelId: l.parent_parcel_id, childParcelId: l.child_parcel_id });
  }
  for (const e of tables.geogitEvents) {
    if (!parcelUniverse.has(e.parcel_id)) add('ERROR', 'MISSING_GEOGIT_PARCEL', 'GEOGIT_EVENTS', e.event_id, `Unknown parcel ${e.parcel_id}`);
    for (const related of splitIds(e.related_parcel_ids)) if (!parcelUniverse.has(related)) add('WARNING', 'MISSING_GEOGIT_RELATED_PARCEL', 'GEOGIT_EVENTS', e.event_id, `Unknown related parcel ${related}`);
  }
}
