import { NODE_TYPES } from '../data/constants.mjs';
import { REPLAY_STAGES } from './stages.mjs';
import { buildSourceArrivalModels } from './sourceArrival.mjs';
import { ADAPTER_DEFINITIONS, buildActiveAdapterProcessingModels } from './adapterProcessing.mjs';
import { buildGlobalNormalizationModel } from './globalNormalization.mjs';
import { buildDistortionAwareMatchingModel, classifyMatchOutcome } from './distortionAwareMatching.mjs';
import { buildConflictDetectionModel } from './conflictDetection.mjs';
import { buildAuthorityReviewModel, AUTHORITY_PRINCIPLE } from './authorityReview.mjs';
import { buildAuthoritativeCanonicalStateModel, CANONICAL_TRACE_PRINCIPLE } from './authoritativeCanonicalState.mjs';
import { buildIndividualParcelModeModel } from './individualParcelMode.mjs';

const stageIndexById = new Map(REPLAY_STAGES.map((s, i) => [s.id, i]));

// Dataset objects are immutable for the lifetime of an Evidence Graph data layer.
// Cache expensive aggregate projections by layer so returning from parcel mode or
// another dashboard does not rebuild the entire locality replay.
const runFrameCache = new WeakMap();
const cumulativeRunFrameCache = new WeakMap();
const parcelProjectionCache = new WeakMap();
const sourceNameByType = (layer) => new Map(layer.tables.sourceMetadata.map((r) => [r.source_type, r.source_name || r.source_type]));

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function idList(rows, field) { return rows.map((r) => r[field]).filter(Boolean); }
const uniq = (values) => [...new Set(values.filter(Boolean))];

function clusterNode({ stageId, key, entityType, label, subtitle = '', rows = [], recordIds = null, table, status = null, sourceId = null, canonicalParcelId = null, details = null, metric = null, count = null, derivedRelationshipIds = [] }) {
  const members = recordIds ?? rows.map((r) => r.id).filter(Boolean);
  if (!members.length) return null;
  return {
    id: `cluster:${stageId}:${key}`,
    type: 'EvidenceCluster',
    entityType,
    stageId,
    stageIndex: stageIndexById.get(stageId),
    datasetRecordId: null,
    canonicalParcelId,
    sourceId,
    timestamp: null,
    status,
    confidence: null,
    metadataRef: { table, recordId: null, field: null },
    label,
    subtitle,
    count: count ?? members.length,
    memberRecordIds: members,
    aggregate: true,
    metric,
    data: { aggregate: true, memberTable: table, memberRecordIds: members, derivedRelationshipIds, details }
  };
}

function aggregateEdge({ stageId, type, from, to, memberRecordIds, table, label = null, details = null }) {
  const members = uniq(memberRecordIds ?? []);
  if (!members.length) return null;
  return {
    id: `cluster-edge:${stageId}:${type}:${from}:${to}`,
    type,
    stageId,
    stageIndex: stageIndexById.get(stageId),
    from,
    to,
    count: members.length,
    metadataRef: { table, recordId: null, field: null },
    memberRecordIds: members,
    label,
    data: { aggregate: true, memberTable: table, memberRecordIds: members, details }
  };
}

function buildRunFrames(layer) {
  const frames = REPLAY_STAGES.map((stage, index) => ({ stage, index, nodes: [], edges: [], notes: [], metrics: {} }));
  const frame = (id) => frames[stageIndexById.get(id)];
  const sourceNames = sourceNameByType(layer);
  const observationsBySource = groupBy(layer.tables.sourceObservations, (r) => r.source_type);
  const normalizedBySource = groupBy(layer.tables.matchingInput, (r) => r.source_type);
  const reconByParcel = new Map(layer.tables.reconciledParcels.map((r) => [r.canonical_parcel_id, r]));
  const reconByStatus = groupBy(layer.tables.reconciledParcels, (r) => r.match_status || 'UNKNOWN');
  const canonicalByParcel = new Map(layer.tables.canonicalParcels.map((r) => [r.canonical_parcel_id, r]));

  // 1. Sources — one locality-scale cluster per real source dataset.
  // Each cluster is anchored to SOURCE_METADATA and carries the exact SOURCE_OBSERVATIONS IDs it represents.
  const sourceArrivalModels = buildSourceArrivalModels(layer);
  for (const model of sourceArrivalModels) {
    const sourceNode = {
      id: `cluster:sources:${model.sourceId}`,
      type: NODE_TYPES.SourceDataset,
      entityType: NODE_TYPES.SourceDataset,
      stageId: 'sources',
      stageIndex: stageIndexById.get('sources'),
      datasetRecordId: model.sourceId,
      canonicalParcelId: null,
      sourceId: model.sourceId,
      timestamp: model.acquisitionDate,
      status: model.temporalCurrency,
      confidence: { reliability: model.reliability, nominalAccuracy: model.nominalAccuracy },
      metadataRef: { table: 'SOURCE_METADATA', recordId: model.sourceId, field: null },
      label: model.sourceName,
      subtitle: `${model.sourceType} · ${model.spatialNature}`,
      count: model.observationCount,
      memberRecordIds: model.observationIds.length ? model.observationIds : [model.sourceId],
      aggregate: true,
      metric: { label: 'SOURCE OBSERVATIONS', value: model.observationCount },
      data: { aggregate: true, memberTable: 'SOURCE_OBSERVATIONS', memberRecordIds: model.observationIds, details: model }
    };
    frame('sources').nodes.push(sourceNode);
  }
  frame('sources').metrics = {
    sourceDatasets: layer.tables.sourceMetadata.length,
    sourceObservations: layer.tables.sourceObservations.length,
    spatiallyReferencedSources: sourceArrivalModels.filter((m) => m.spatialNature === 'Spatially referenced').length
  };

  // 2. Adapters — conceptual PRAMAN adapter families routed from real source datasets.
  // No adapter-run log exists, so counts represent deterministic architecture routing coverage, not executions.
  const adapterModels = buildActiveAdapterProcessingModels(layer);
  for (const model of adapterModels) {
    const node = clusterNode({
      stageId: 'adapters', key: model.adapterId, entityType: NODE_TYPES.AdapterConcept,
      label: model.adapterName,
      subtitle: `${model.sourceCount} source dataset${model.sourceCount === 1 ? '' : 's'} · ${model.successfulOutputs.toLocaleString('en-IN')} normalized outputs available`,
      recordIds: model.observationIds, table: 'SOURCE_OBSERVATIONS', status: 'ACTIVE_ARCHITECTURE_ROUTE',
      details: model, metric: { label: 'RECORDS PROCESSED', value: model.recordsProcessed }
    });
    if (!node) continue;
    frame('adapters').nodes.push(node);

    for (const source of model.sources) {
      const edge = aggregateEdge({
        stageId: 'adapters', type: 'ROUTED_TO_ADAPTER',
        from: `cluster:sources:${source.sourceId}`, to: node.id,
        memberRecordIds: source.observationIds, table: 'SOURCE_OBSERVATIONS',
        details: { adapterId: model.adapterId, sourceType: source.sourceType, architectureRoute: true }
      });
      if (edge) frame('adapters').edges.push(edge);
    }
  }
  const inactiveAdapters = ADAPTER_DEFINITIONS.filter((definition) => !adapterModels.some((model) => model.adapterId === definition.id));
  frame('adapters').notes.push(layer.entityAvailability.AdapterExecution.reason);
  if (inactiveAdapters.length) {
    frame('adapters').notes.push(`${inactiveAdapters.map((a) => a.name).join(', ')} ${inactiveAdapters.length === 1 ? 'is' : 'are'} defined in the PRAMAN adapter architecture but not exercised by any source in this dataset, so no locality-scale adapter node is rendered.`);
  }
  frame('adapters').notes.push('Adapter record counts are routed source-observation coverage. Multi-adapter source records can therefore appear under more than one adapter and must not be summed as unique input records.');
  frame('adapters').metrics = {
    adapterFamiliesDefined: ADAPTER_DEFINITIONS.length,
    activeAdapterFamilies: adapterModels.length,
    sourceAdapterRoutes: adapterModels.reduce((sum, model) => sum + model.sourceCount, 0),
    uniqueSourceObservations: layer.tables.sourceObservations.length,
    routedRecordTouches: adapterModels.reduce((sum, model) => sum + model.recordsProcessed, 0),
    normalizedOutputTouches: adapterModels.reduce((sum, model) => sum + model.successfulOutputs, 0),
    adapterExecutionRecords: 0
  };

  // 3. Global Normalization — converge all real normalized/pre-match observations into one
  // comparable evidence space while leaving original source clusters visible from prior lifecycle operations.
  const normalizationModel = buildGlobalNormalizationModel(layer);
  const normalizedSpace = clusterNode({
    stageId: 'normalization', key: 'global-evidence-space', entityType: NODE_TYPES.NormalizedObservation,
    label: normalizationModel.label,
    subtitle: `${normalizationModel.normalizedObservationCount.toLocaleString('en-IN')} comparable observations · source provenance preserved`,
    recordIds: normalizationModel.normalizedObservationIds, table: 'MATCHING_INPUT_VIEW', status: 'NORMALIZED_EVIDENCE_SPACE',
    details: normalizationModel, metric: { label: 'NORMALIZED OBSERVATIONS', value: normalizationModel.normalizedObservationCount }
  });
  if (normalizedSpace) {
    normalizedSpace.data.normalizationSpace = true;
    frame('normalization').nodes.push(normalizedSpace);
    for (const adapter of adapterModels) {
      const edge = aggregateEdge({
        stageId: 'normalization', type: 'NORMALIZED_TO',
        from: `cluster:adapters:${adapter.adapterId}`, to: normalizedSpace.id,
        memberRecordIds: adapter.successfulOutputIds, table: 'MATCHING_INPUT_VIEW',
        details: { adapterId: adapter.adapterId, normalizedEvidenceSpace: true }
      });
      if (edge) frame('normalization').edges.push(edge);
    }
  }
  frame('normalization').notes.push('Normalization makes heterogeneous evidence comparable; it does not make source evidence identical or delete the source state.');
  frame('normalization').notes.push('Raw per-source record files are not supplied, so only dataset-backed source-side state and explicit normalization metadata are shown in observation inspection.');
  frame('normalization').metrics = {
    normalizedObservations: normalizationModel.normalizedObservationCount,
    sourceObservationCoverage: normalizationModel.sourceObservationCoverageCount,
    sourceDatasets: normalizationModel.sourceDatasetCount,
    crsChangedObservations: normalizationModel.crsChangedObservationCount,
    geometryChangedObservations: normalizationModel.geometryChangedObservationCount
  };

  // 4. Distortion-aware parcel matching — project the recorded matching lifecycle without
  // recomputing a second matcher for the UI. Candidate associations come from SOURCE_OBSERVATIONS;
  // parcel-level assignment outcomes come from RECONCILED_PARCELS.
  const matchingModel = buildDistortionAwareMatchingModel(layer);

  const candidateGeneration = clusterNode({
    stageId: 'matching', key: 'candidate-generation', entityType: NODE_TYPES.MatchCandidate,
    label: 'Recorded candidate relationships',
    subtitle: `${matchingModel.candidateAssociations.length.toLocaleString('en-IN')} primary + alternate relationships derived from SOURCE_OBSERVATIONS candidate fields`,
    recordIds: matchingModel.pairEvidenceObservationIds, table: 'SOURCE_OBSERVATIONS', status: 'RECORDED_CANDIDATES',
    count: matchingModel.candidateAssociations.length,
    derivedRelationshipIds: matchingModel.candidateAssociationIds,
    details: {
      matchingPhase: 'CANDIDATE_GENERATION',
      primaryCandidates: matchingModel.primaryCandidateAssociationIds.length,
      alternateCandidates: matchingModel.alternateCandidateAssociationIds.length,
      observationsWithAlternates: matchingModel.observationsWithAlternates.length,
      derivation: 'SOURCE_OBSERVATIONS.candidate_canonical_parcel_id + alternate_candidate_parcel_ids',
      pairwiseScoresAvailable: false,
      pairwiseDecisionsAvailable: false,
      order: 1
    },
    metric: { label: 'CANDIDATE RELATIONSHIPS', value: matchingModel.candidateAssociations.length }
  });
  if (candidateGeneration) {
    candidateGeneration.data.matchingRole = 'candidate-generation';
    candidateGeneration.data.order = 1;
    frame('matching').nodes.push(candidateGeneration);
    const fromNormalized = aggregateEdge({
      stageId: 'matching', type: 'HAS_CANDIDATE',
      from: 'cluster:normalization:global-evidence-space', to: candidateGeneration.id,
      memberRecordIds: matchingModel.normalizedObservationIds, table: 'SOURCE_OBSERVATIONS',
      details: { candidateAssociations: matchingModel.candidateAssociations.length }
    });
    if (fromNormalized) frame('matching').edges.push(fromNormalized);
  }

  const pairEvidence = clusterNode({
    stageId: 'matching', key: 'pair-evidence', entityType: NODE_TYPES.PairEvidence,
    label: 'Recorded matching evidence',
    subtitle: `${matchingModel.pairEvidenceObservationIds.length.toLocaleString('en-IN')} observations · recorded evidence dimensions only`,
    recordIds: matchingModel.pairEvidenceObservationIds, table: 'SOURCE_OBSERVATIONS', status: 'RECORDED_MATCHING_EVIDENCE',
    details: {
      matchingPhase: 'RECORDED_MATCHING_EVIDENCE',
      evidenceDimensions: matchingModel.evidenceDimensions,
      classifierProbabilityAvailable: false,
      pairwiseScoreAvailable: false,
      order: 2
    },
    metric: { label: 'EVIDENCE OBSERVATIONS', value: matchingModel.pairEvidenceObservationIds.length }
  });
  if (pairEvidence) {
    pairEvidence.data.matchingRole = 'recorded-evidence';
    pairEvidence.data.order = 2;
    frame('matching').nodes.push(pairEvidence);
    const edge = aggregateEdge({
      stageId: 'matching', type: 'PAIR_EVIDENCE_FOR',
      from: candidateGeneration?.id, to: pairEvidence.id,
      memberRecordIds: matchingModel.pairEvidenceObservationIds, table: 'SOURCE_OBSERVATIONS'
    });
    if (edge) frame('matching').edges.push(edge);
  }

  // No standalone distortion node is rendered because PRAMAN_DATA contains no structured matching-distortion output.
  // Raw observation notes and reconciliation criticality_reason remain inspectable as recorded narrative fields only.

  const globalAssignment = clusterNode({
    stageId: 'matching', key: 'recorded-outcomes', entityType: NODE_TYPES.MatchDecision,
    label: 'Recorded parcel match outcomes',
    subtitle: `${matchingModel.assignmentParcelIds.length.toLocaleString('en-IN')} parcel-level recorded outcomes · solver internals unavailable`,
    recordIds: matchingModel.assignmentParcelIds, table: 'RECONCILED_PARCELS', status: 'PARCEL_LEVEL_MATCH_OUTCOMES',
    details: {
      matchingPhase: 'PARCEL_MATCH_OUTCOMES',
      matchStatusCounts: matchingModel.matchStatusCounts,
      solverCostAvailable: false,
      vetoFlagsAvailable: false,
      pairwiseDecisionAvailable: false,
      order: 4
    },
    metric: { label: 'PARCEL OUTCOMES', value: matchingModel.assignmentParcelIds.length }
  });
  if (globalAssignment) {
    globalAssignment.data.matchingRole = 'recorded-outcomes';
    globalAssignment.data.order = 4;
    frame('matching').nodes.push(globalAssignment);
    const edge = aggregateEdge({
      stageId: 'matching', type: 'RECORDED_MATCH_OUTCOME',
      from: pairEvidence?.id, to: globalAssignment.id,
      memberRecordIds: matchingModel.assignmentParcelIds, table: 'RECONCILED_PARCELS',
      details: { parcelLevelOnly: true, solverInternalsAvailable: false }
    });
    if (edge) frame('matching').edges.push(edge);
  }

  const outcomeOrder = { ACCEPTED: 5, AMBIGUOUS: 6, UNMATCHED: 7, REJECTED: 8, OTHER: 9 };
  for (const group of ['ACCEPTED', 'AMBIGUOUS', 'UNMATCHED', 'REJECTED', 'OTHER']) {
    const outcome = matchingModel.outcomeGroups[group];
    if (!outcome || !outcome.count) continue;
    const node = clusterNode({
      stageId: 'matching', key: `outcome:${group}`, entityType: NODE_TYPES.MatchDecision,
      label: `${group[0]}${group.slice(1).toLowerCase()} relationships`,
      subtitle: `${outcome.count.toLocaleString('en-IN')} parcel-level outcomes`,
      recordIds: outcome.parcelIds, table: 'RECONCILED_PARCELS', status: group,
      details: {
        matchingPhase: 'OUTCOME_GROUP', outcomeGroup: group,
        statusCounts: outcome.statusCounts, order: outcomeOrder[group]
      },
      metric: { label: 'PARCEL OUTCOMES', value: outcome.count }
    });
    if (!node) continue;
    node.data.matchingRole = 'outcome-group';
    node.data.order = outcomeOrder[group];
    frame('matching').nodes.push(node);
    const edge = aggregateEdge({
      stageId: 'matching', type: 'ASSIGNED_AS', from: globalAssignment.id, to: node.id,
      memberRecordIds: outcome.parcelIds, table: 'RECONCILED_PARCELS',
      details: { outcomeGroup: group, statusCounts: outcome.statusCounts }
    });
    if (edge) frame('matching').edges.push(edge);
  }

  frame('matching').notes.push(
    'The dataset records candidate relationships and parcel-level outcomes; no structured matching-distortion output or solver execution log is fabricated. Identity remains separate from later geometry-history corrections.',
    layer.entityAvailability.PairwiseMatchDecision.reason,
    layer.entityAvailability.PairwiseMatchScore.reason,
    'Neighbourhood/adjacency and topology feature vectors are not stored at pair level in the supplied matching tables, so the UI does not invent them.',
    matchingModel.unmatchedObservationIds.length
      ? `${matchingModel.unmatchedObservationIds.length} source observations have no recorded primary candidate.`
      : 'No unmatched source-observation cluster is rendered because every supplied source observation has a recorded primary candidate.'
  );
  frame('matching').metrics = {
    candidateAssociations: matchingModel.candidateAssociations.length,
    primaryCandidateAssociations: matchingModel.primaryCandidateAssociationIds.length,
    alternateCandidateAssociations: matchingModel.alternateCandidateAssociationIds.length,
    observationsWithAlternateCandidates: matchingModel.observationsWithAlternates.length,
    pairEvidenceObservations: matchingModel.pairEvidenceObservationIds.length,
    parcelMatchDecisions: matchingModel.assignmentParcelIds.length,
    acceptedRelationships: matchingModel.outcomeGroups.ACCEPTED.count,
    ambiguousRelationships: matchingModel.outcomeGroups.AMBIGUOUS.count,
    unmatchedObservations: matchingModel.unmatchedObservationIds.length,
    rejectedRelationships: matchingModel.outcomeGroups.REJECTED.count,
    structuredDistortionOutputs: 0
  };

  // Conflict Detection — identity is already established by matching. This operation projects
  // only explicit CONFLICTS rows and groups them by dataset-backed disagreement category.
  const conflictModel = buildConflictDetectionModel(layer);

  for (const category of conflictModel.categories) {
    const node = clusterNode({
      stageId: 'conflict-detection', key: `category:${category.id}`, entityType: NODE_TYPES.Conflict,
      label: category.label,
      subtitle: `${category.count.toLocaleString('en-IN')} conflict cases · ${category.parcelCount.toLocaleString('en-IN')} parcels`,
      recordIds: category.conflictIds, table: 'CONFLICTS', status: 'CONFLICT_CATEGORY',
      details: {
        conflictRole: 'category', categoryId: category.id, categoryLabel: category.label,
        conflictTypeCounts: category.conflictTypeCounts, statusCounts: category.statusCounts,
        severityCounts: category.severityCounts, criticalityCounts: category.criticalityCounts,
        humanReviewRequired: category.humanReviewRequired, parcelCount: category.parcelCount,
        byMatchOutcome: category.byMatchOutcome
      },
      metric: { label: 'CONFLICT CASES', value: category.count }
    });
    if (!node) continue;
    node.data.conflictRole = 'category';
    node.data.categoryId = category.id;
    frame('conflict-detection').nodes.push(node);

    // The incoming edge preserves the matching identity result. A conflict category is not a
    // rematch; it is the disagreement found within parcels already assigned to that outcome group.
    for (const group of ['ACCEPTED', 'AMBIGUOUS', 'REJECTED', 'OTHER']) {
      const members = layer.tables.conflicts
        .filter((conflict) => category.conflictIds.includes(conflict.conflict_id)
          && classifyMatchOutcome(reconByParcel.get(conflict.canonical_parcel_id)?.match_status) === group)
        .map((conflict) => conflict.conflict_id);
      const edge = aggregateEdge({
        stageId: 'conflict-detection', type: 'GENERATED_CONFLICT',
        from: `cluster:matching:outcome:${group}`, to: node.id, memberRecordIds: members, table: 'CONFLICTS',
        details: { categoryId: category.id, semantics: 'identity fixed; disagreement detected afterward' }
      });
      if (edge) frame('conflict-detection').edges.push(edge);
    }
  }

  // A clean conflict check is still a real conflict-detection result, but it is represented as a
  // dataset-backed transition rather than a fabricated conflict node. This keeps conflict detection limited
  // to explicit conflict-category nodes while allowing clean parcels to remain traceable through
  // the conflict-detection checkpoint when reconciliation becomes visible.
  const conflictedParcelSet = new Set(conflictModel.conflictedParcelIds);
  const noConflictRows = layer.tables.reconciledParcels.filter((row) => !conflictedParcelSet.has(row.canonical_parcel_id));
  for (const [status, rows] of reconByStatus) {
    const members = rows.filter((row) => !conflictedParcelSet.has(row.canonical_parcel_id)).map((row) => row.canonical_parcel_id);
    const edge = aggregateEdge({
      stageId: 'conflict-detection', type: 'CONFLICT_CHECK_CLEAR',
      from: `cluster:matching:outcome:${classifyMatchOutcome(status)}`, to: `cluster:reconciliation:proposal:${status}`,
      memberRecordIds: members, table: 'RECONCILED_PARCELS',
      details: { semantics: 'conflict detection found no explicit CONFLICTS row; no fabricated conflict case created' }
    });
    if (edge) frame('conflict-detection').edges.push(edge);
  }

  frame('conflict-detection').notes.push(
    conflictModel.principle,
    'Conflict categories are deterministic groupings of explicit CONFLICTS.conflict_type values; no conflict record is generated by the visualization.',
    conflictModel.unknownConflictIds.length
      ? `${conflictModel.unknownConflictIds.length} recorded conflicts use currently unmapped conflict types and remain visible only in parcel-level evidence until categorized.`
      : 'Every conflict_type present in this dataset is covered by a displayed conflict category.'
  );
  frame('conflict-detection').metrics = {
    conflicts: conflictModel.conflicts,
    conflictedParcels: conflictModel.conflictedParcelIds.length,
    conflictCategories: conflictModel.categories.length,
    conflictEvidence: conflictModel.conflictEvidenceRecords,
    openConflicts: Number(conflictModel.statusCounts.OPEN || 0),
    resolvedConflicts: Number(conflictModel.statusCounts.RESOLVED || 0)
  };

  // 6. Reconciliation — one proposal cluster per recorded match status.
  for (const [status, rows] of reconByStatus) {
    const node = clusterNode({ stageId: 'reconciliation', key: `proposal:${status}`, entityType: NODE_TYPES.ReconciliationProposal,
      label: `${status.replaceAll('_', ' ')} proposals`, subtitle: `${rows.length.toLocaleString('en-IN')} proposed parcel states`, rows,
      recordIds: idList(rows, 'canonical_parcel_id'), table: 'RECONCILED_PARCELS', status,
      details: { proposalField: 'proposed_state' } });
    frame('reconciliation').nodes.push(node);
    const direct = aggregateEdge({ stageId: 'reconciliation', type: 'PROPOSED_STATE', from: `cluster:matching:outcome:${classifyMatchOutcome(status)}`, to: node.id,
      memberRecordIds: idList(rows, 'canonical_parcel_id'), table: 'RECONCILED_PARCELS' });
    if (direct) frame('reconciliation').edges.push(direct);
    for (const category of conflictModel.categories) {
      const members = layer.tables.conflicts.filter((c) => category.conflictIds.includes(c.conflict_id) && reconByParcel.get(c.canonical_parcel_id)?.match_status === status).map((c) => c.conflict_id);
      const e = aggregateEdge({ stageId: 'reconciliation', type: 'RECONCILED_WITH', from: `cluster:conflict-detection:category:${category.id}`, to: node.id,
        memberRecordIds: members, table: 'CONFLICTS', details: { categoryId: category.id } });
      if (e) frame('reconciliation').edges.push(e);
    }
  }
  frame('reconciliation').metrics = { reconciliationRecords: layer.tables.reconciledParcels.length, proposals: layer.tables.reconciledParcels.filter((r) => r.proposedState).length };

  // 7. Authority / Review — governance is deliberately independent of AI confidence.
  // The visual sequence is: System inference -> Proposed state -> Policy gate -> authorized/reviewer action -> authoritative state.
  const authorityModel = buildAuthorityReviewModel(layer);
  const allParcelIds = idList(layer.tables.reconciledParcels, 'canonical_parcel_id');
  const systemInferenceNode = clusterNode({ stageId: 'authority-review', key: 'system-inference', entityType: NODE_TYPES.SystemInference,
    label: 'System inference', subtitle: `${layer.tables.reconciledParcels.length.toLocaleString('en-IN')} parcel-level inference records`,
    recordIds: allParcelIds, table: 'RECONCILED_PARCELS', status: 'SYSTEM_INFERENCE',
    details: { authorityRole: 'system-inference', principle: AUTHORITY_PRINCIPLE, matchStatusCounts: authorityModel.matchStatusCounts,
      reviewRequirementCounts: authorityModel.reviewRequirementCounts, confidenceAuthorityCrosscheck: authorityModel.confidenceAuthorityCrosscheck,
      note: 'Confidence and inference status are decision-support evidence, not legal authority.' }, metric: { value: allParcelIds.length, label: 'inferences' } });
  const proposedStateNode = clusterNode({ stageId: 'authority-review', key: 'proposed-state', entityType: NODE_TYPES.ReconciliationProposal,
    label: 'Proposed state', subtitle: `${authorityModel.proposedParcelIds.length.toLocaleString('en-IN')} proposed parcel states`,
    recordIds: authorityModel.proposedParcelIds, table: 'RECONCILED_PARCELS', status: 'PROPOSED',
    details: { authorityRole: 'proposed-state', field: 'proposed_state', principle: AUTHORITY_PRINCIPLE,
      note: 'A proposed state remains a system proposal until governance/authority state says otherwise.' }, metric: { value: authorityModel.proposedParcelIds.length, label: 'proposals' } });
  const policyGateNode = clusterNode({ stageId: 'authority-review', key: 'governance-path', entityType: NODE_TYPES.PolicyGate,
    label: 'Governance / review decision path', subtitle: `${authorityModel.governanceEvents.length.toLocaleString('en-IN')} explicit governance events`,
    recordIds: authorityModel.governanceEvents.map((e) => e.event_id), table: 'GEOGIT_EVENTS', status: 'RECORDED_GOVERNANCE_EVENTS',
    details: { authorityRole: 'governance-path', principle: AUTHORITY_PRINCIPLE, eventSourceCounts: authorityModel.eventSourceCounts,
      eventActorCounts: authorityModel.eventActorCounts, explicitParcelCoverage: authorityModel.gateParcelIds.length,
      parcelsWithoutExplicitGovernanceEvent: authorityModel.withoutExplicitGovernanceEvent.length,
      reviewRelevantMatchStatuses: Object.fromEntries(Object.entries(authorityModel.matchStatusCounts).filter(([k]) => ['HUMAN_REVIEW_REQUIRED','NEEDS_ADDITIONAL_EVIDENCE','TENTATIVE'].includes(k))) },
    metric: { value: authorityModel.governanceEvents.length, label: 'events' } });
  frame('authority-review').nodes.push(systemInferenceNode, proposedStateNode, policyGateNode);

  // Preserve a continuous replay spine from reconciliation into governance. These edges are backed by
  // the same RECONCILED_PARCELS records represented by the reconciliation proposal clusters.
  for (const [status, rows] of reconByStatus) {
    const bridge = aggregateEdge({ stageId: 'authority-review', type: 'RECONCILIATION_TO_GOVERNANCE',
      from: `cluster:reconciliation:proposal:${status}`, to: systemInferenceNode.id,
      memberRecordIds: idList(rows, 'canonical_parcel_id'), table: 'RECONCILED_PARCELS',
      details: { matchStatus: status, semantics: 'reconciliation result enters governance without becoming authoritative automatically' } });
    if (bridge) frame('authority-review').edges.push(bridge);
  }

  let gateEdge = aggregateEdge({ stageId: 'authority-review', type: 'PROPOSED_STATE', from: systemInferenceNode.id, to: proposedStateNode.id,
    memberRecordIds: authorityModel.proposedParcelIds, table: 'RECONCILED_PARCELS', label: 'system proposal' });
  if (gateEdge) frame('authority-review').edges.push(gateEdge);
  gateEdge = aggregateEdge({ stageId: 'authority-review', type: 'ENTERS_GOVERNANCE_PATH', from: proposedStateNode.id, to: policyGateNode.id,
    memberRecordIds: authorityModel.governanceEvents.map((e) => e.event_id), table: 'GEOGIT_EVENTS', label: 'explicit governance path' });
  if (gateEdge) frame('authority-review').edges.push(gateEdge);

  const eventGroups = [
    ['HUMAN_REVIEW', authorityModel.reviewEvents, NODE_TYPES.ReviewEvent, 'Human / authorized review'],
    ['PROPOSAL_ACCEPTED', authorityModel.acceptedEvents, NODE_TYPES.ReviewDecision, 'Proposal accepted'],
    ['PROPOSAL_REJECTED', authorityModel.rejectedEvents, NODE_TYPES.ReviewDecision, 'Proposal rejected']
  ];
  for (const [eventType, rows, entityType, label] of eventGroups) {
    const node = clusterNode({ stageId: 'authority-review', key: `event:${eventType}`, entityType, label,
      subtitle: `${rows.length.toLocaleString('en-IN')} explicit GeoGit event${rows.length === 1 ? '' : 's'}`,
      recordIds: idList(rows, 'event_id'), table: 'GEOGIT_EVENTS', status: eventType,
      details: { authorityRole: eventType === 'HUMAN_REVIEW' ? 'human-review' : 'authorized-decision', principle: AUTHORITY_PRINCIPLE,
        eventType, actorTypes: Object.fromEntries(Object.entries(authorityModel.eventActorCounts).filter(() => true)),
        note: eventType === 'HUMAN_REVIEW' ? 'This is a recorded review event, not itself an acceptance.' : 'Decision is taken from the explicit GeoGit proposal event.' } });
    if (node) {
      frame('authority-review').nodes.push(node);
      const e = aggregateEdge({ stageId: 'authority-review', type: 'GOVERNANCE_OUTCOME', from: policyGateNode.id, to: node.id,
        memberRecordIds: idList(rows, 'event_id'), table: 'GEOGIT_EVENTS', label: eventType });
      if (e) frame('authority-review').edges.push(e);
    }
  }

  const authorityGroups = groupBy(layer.tables.reconciledParcels, (r) => r.authoritativeState?.state || 'UNSPECIFIED');
  for (const [state, rows] of authorityGroups) {
    const node = clusterNode({ stageId: 'authority-review', key: `state:${state}`, entityType: NODE_TYPES.AuthoritativeState,
      label: `${state.replaceAll('_', ' ')} state`, subtitle: `${rows.length.toLocaleString('en-IN')} parcel authority records`,
      recordIds: idList(rows, 'canonical_parcel_id'), table: 'RECONCILED_PARCELS', status: state,
      details: { authorityRole: 'authoritative-state', field: 'authoritative_state', principle: AUTHORITY_PRINCIPLE,
        note: state === 'AUTHORITATIVE' ? 'Dataset marks these records authoritative.' : 'Dataset preserves the prior authoritative state while the proposal remains pending.' } });
    frame('authority-review').nodes.push(node);
  }

  const eventRowsByType = new Map(eventGroups.map(([type, rows]) => [type, rows]));
  for (const [eventType] of eventGroups) {
    const rows = eventRowsByType.get(eventType) ?? [];
    for (const [state] of authorityGroups) {
      const members = rows.filter((e) => (reconByParcel.get(e.parcel_id)?.authoritativeState?.state || 'UNSPECIFIED') === state).map((e) => e.event_id);
      const e = aggregateEdge({ stageId: 'authority-review', type: 'AUTHORITY_STATE', from: `cluster:authority-review:event:${eventType}`,
        to: `cluster:authority-review:state:${state}`, memberRecordIds: members, table: 'GEOGIT_EVENTS',
        details: { principle: AUTHORITY_PRINCIPLE } });
      if (e) frame('authority-review').edges.push(e);
    }
  }

  // Historical/retired reconciliation rows may carry an authoritative_state without one of the
  // three explicit proposal-governance event types. Preserve that valid optional path directly
  // from the recorded proposed/reconciliation state to the recorded authority state.
  const withoutGovernance = new Set(authorityModel.withoutExplicitGovernanceEvent);
  for (const [state, rows] of authorityGroups) {
    const members = rows.filter((row) => withoutGovernance.has(row.canonical_parcel_id)).map((row) => row.canonical_parcel_id);
    const e = aggregateEdge({ stageId: 'authority-review', type: 'AUTHORITY_STATE_WITHOUT_EXPLICIT_GOVERNANCE_EVENT',
      from: proposedStateNode.id, to: `cluster:authority-review:state:${state}`,
      memberRecordIds: members, table: 'RECONCILED_PARCELS',
      details: { principle: AUTHORITY_PRINCIPLE, explicitGovernanceEvent: false,
        semantics: 'recorded authoritative_state retained without inventing an absent HUMAN_REVIEW / PROPOSAL_ACCEPTED / PROPOSAL_REJECTED event' } });
    if (e) frame('authority-review').edges.push(e);
  }
  frame('authority-review').metrics = {
    systemInferences: layer.tables.reconciledParcels.length,
    proposedStates: authorityModel.proposedParcelIds.length,
    governanceEvents: authorityModel.governanceEvents.length,
    humanReviewEvents: authorityModel.reviewEvents.length,
    proposalAcceptedEvents: authorityModel.acceptedEvents.length,
    proposalRejectedEvents: authorityModel.rejectedEvents.length,
    authoritativeStateCounts: authorityModel.authorityStateCounts,
    geometryAuthorityCounts: authorityModel.geometryAuthorityCounts,
    principle: AUTHORITY_PRINCIPLE
  };
  frame('authority-review').notes.push(`${AUTHORITY_PRINCIPLE}. Confidence values remain attached to system inference; authority comes only from recorded governance and authoritative-state fields.`);

  // 8. Authoritative Canonical State — converge governed evidence into the active registry
  // while preserving the entire cumulative evidence chain behind it.
  const canonicalModel = buildAuthoritativeCanonicalStateModel(layer);
  const registryNode = clusterNode({
    stageId: 'canonical-state', key: 'registry', entityType: NODE_TYPES.CanonicalRegistry,
    label: 'Authoritative Canonical Parcel Registry',
    subtitle: `${canonicalModel.summary.activeCanonicalParcels.toLocaleString('en-IN')} active parcels · evidence chain preserved`,
    recordIds: canonicalModel.activeParcelIds, table: 'CANONICAL_PARCELS', status: 'ACTIVE_REGISTRY',
    details: {
      canonicalRole: 'registry', principle: CANONICAL_TRACE_PRINCIPLE,
      finalSummary: canonicalModel.summary, traceCoverage: canonicalModel.traceCoverage,
      consistency: canonicalModel.consistency, authoritativeStateCounts: canonicalModel.authoritativeStateCounts,
      order: 1
    },
    metric: { label: 'ACTIVE CANONICAL PARCELS', value: canonicalModel.summary.activeCanonicalParcels }
  });
  if (registryNode) {
    registryNode.data.canonicalRole = 'registry';
    registryNode.data.order = 1;
    frame('canonical-state').nodes.push(registryNode);
  }

  const canonicalByCell = groupBy(layer.tables.canonicalParcels, (r) => r.cell_id || 'UNASSIGNED');
  let canonicalOrder = 2;
  for (const [cell, rows] of canonicalByCell) {
    const cellNode = clusterNode({ stageId: 'canonical-state', key: `cell:${cell}`, entityType: NODE_TYPES.CanonicalParcel,
      label: cell, subtitle: `${rows.length.toLocaleString('en-IN')} active canonical parcels`, rows, recordIds: idList(rows, 'canonical_parcel_id'),
      table: 'CANONICAL_PARCELS', status: 'ACTIVE', details: { canonicalRole: 'cell', cellId: cell, order: canonicalOrder++ } });
    if (cellNode) {
      cellNode.data.canonicalRole = 'cell';
      cellNode.data.order = cellNode.data.details.order;
      frame('canonical-state').nodes.push(cellNode);
      const membership = aggregateEdge({ stageId: 'canonical-state', type: 'REGISTRY_MEMBER', from: registryNode.id, to: cellNode.id,
        memberRecordIds: idList(rows, 'canonical_parcel_id'), table: 'CANONICAL_PARCELS', details: { cellId: cell } });
      if (membership) frame('canonical-state').edges.push(membership);
    }
  }

  // A recorded authoritative-state payload may be AUTHORITATIVE or UNCHANGED_PENDING. Both can
  // point to the currently materialized registry state; this edge is deliberately not named
  // "accepted" so a pending proposal is never misrepresented as approval.
  for (const [state, authorityRows] of authorityGroups) {
    const members = authorityRows.map((r) => canonicalByParcel.get(r.canonical_parcel_id)).filter(Boolean).map((p) => p.canonical_parcel_id);
    const e = aggregateEdge({ stageId: 'canonical-state', type: 'MATERIALIZED_IN_REGISTRY', from: `cluster:authority-review:state:${state}`,
      to: registryNode.id, memberRecordIds: members, table: 'CANONICAL_PARCELS',
      details: { authorityState: state, semantics: state === 'AUTHORITATIVE' ? 'authoritative state materialized in current registry' : 'current registry state retained while proposal remains pending' } });
    if (e) frame('canonical-state').edges.push(e);
  }

  frame('canonical-state').notes.push(
    `${CANONICAL_TRACE_PRINCIPLE}. Canonical parcels are added as a governed registry projection; source, adapter, normalized, matching, conflict-check, reconciliation and authority nodes remain visible in the cumulative replay.`,
    canonicalModel.consistency.registryVsReconciliationDiscrepancy
      ? `ACTIVE registry discrepancy: ${canonicalModel.consistency.activeCanonicalRegistryRows} CANONICAL_PARCELS rows vs ${canonicalModel.consistency.activeReconciliationRows} ACTIVE reconciliation rows.`
      : `ACTIVE registry count agrees with the dataset's ${canonicalModel.consistency.activeReconciliationRows.toLocaleString('en-IN')} ACTIVE reconciliation rows.`,
    canonicalModel.traceCoverage.incomplete
      ? `${canonicalModel.traceCoverage.incomplete} active canonical parcels have a traceability coverage gap; see the registry inspector.`
      : `All ${canonicalModel.traceCoverage.complete.toLocaleString('en-IN')} active canonical parcels retain a dataset-backed trace to source observations through the supported lifecycle operations.`
  );
  frame('canonical-state').metrics = {
    activeCanonicalParcels: canonicalModel.summary.activeCanonicalParcels,
    cells: canonicalByCell.size,
    finalSummary: canonicalModel.summary,
    traceCoverage: canonicalModel.traceCoverage,
    consistency: canonicalModel.consistency
  };

  // 9. History / Lineage — supported directly by four real production tables.
  const historical = clusterNode({ stageId: 'history-lineage', key: 'historical-parcels', entityType: NODE_TYPES.HistoricalParcel,
    label: 'Historical parcels', subtitle: `${layer.tables.historicalParcels.length.toLocaleString('en-IN')} retired parcel records`,
    rows: layer.tables.historicalParcels, recordIds: idList(layer.tables.historicalParcels, 'canonical_parcel_id'), table: 'HISTORICAL_PARCELS', status: 'HISTORICAL_RETIRED' });
  const geometry = clusterNode({ stageId: 'history-lineage', key: 'geometry-versions', entityType: NODE_TYPES.GeometryVersion,
    label: 'Geometry versions', subtitle: `${layer.tables.geometryVersions.length.toLocaleString('en-IN')} geometry lifecycle records`,
    rows: layer.tables.geometryVersions, recordIds: idList(layer.tables.geometryVersions, 'geometry_id'), table: 'GEOMETRY_VERSIONS' });
  const lineage = clusterNode({ stageId: 'history-lineage', key: 'lineage-events', entityType: NODE_TYPES.LineageEvent,
    label: 'Split / merge lineage', subtitle: `${layer.tables.parcelLineage.length.toLocaleString('en-IN')} explicit lineage edges`,
    rows: layer.tables.parcelLineage, recordIds: idList(layer.tables.parcelLineage, 'lineage_event_id'), table: 'PARCEL_LINEAGE' });
  const geogit = clusterNode({ stageId: 'history-lineage', key: 'geogit-events', entityType: NODE_TYPES.GeoGitEvent,
    label: 'GeoGit events', subtitle: `${layer.tables.geogitEvents.length.toLocaleString('en-IN')} version/audit events`,
    rows: layer.tables.geogitEvents, recordIds: idList(layer.tables.geogitEvents, 'event_id'), table: 'GEOGIT_EVENTS' });
  frame('history-lineage').nodes.push(...[historical, geometry, lineage, geogit].filter(Boolean));

  const historicalIds = new Set(layer.tables.historicalParcels.map((r) => r.canonical_parcel_id));
  const historicalGeometryIds = layer.tables.geometryVersions.filter((g) => historicalIds.has(g.canonical_parcel_id)).map((g) => g.geometry_id);
  let e = aggregateEdge({ stageId: 'history-lineage', type: 'VERSION_OF', from: geometry.id, to: historical.id,
    memberRecordIds: historicalGeometryIds, table: 'GEOMETRY_VERSIONS' });
  if (e) frame('history-lineage').edges.push(e);
  const lineageInvolvingHistorical = layer.tables.parcelLineage.filter((l) => historicalIds.has(l.parent_parcel_id) || historicalIds.has(l.child_parcel_id)).map((l) => l.lineage_event_id);
  e = aggregateEdge({ stageId: 'history-lineage', type: 'PARTICIPATES_IN_LINEAGE', from: historical.id, to: lineage.id,
    memberRecordIds: lineageInvolvingHistorical, table: 'PARCEL_LINEAGE' });
  if (e) frame('history-lineage').edges.push(e);
  // The audit guarantees one deterministic GeoGit split/merge mapping for every lineage row; keep this relation separate from geometry history.
  e = aggregateEdge({ stageId: 'history-lineage', type: 'RECORDED_IN_GEOGIT', from: lineage.id, to: geogit.id,
    memberRecordIds: idList(layer.tables.parcelLineage, 'lineage_event_id'), table: 'PARCEL_LINEAGE',
    details: { deterministicJoin: 'parent parcel + related child + normalized split/merge event type' } });
  if (e) frame('history-lineage').edges.push(e);
  for (const [cell, rows] of canonicalByCell) {
    const ids = new Set(rows.map((r) => r.canonical_parcel_id));
    const eventIds = layer.tables.geogitEvents.filter((ev) => ids.has(ev.parcel_id)).map((ev) => ev.event_id);
    const ge = aggregateEdge({ stageId: 'history-lineage', type: 'HAS_GEOGIT_EVENT', from: `cluster:canonical-state:cell:${cell}`, to: geogit.id,
      memberRecordIds: eventIds, table: 'GEOGIT_EVENTS' });
    if (ge) frame('history-lineage').edges.push(ge);
  }
  frame('history-lineage').notes.push('GeoGit events are not directly joined to geometry versions because GEOGIT_EVENTS contains no geometry_id foreign key.');
  frame('history-lineage').metrics = { historicalParcels: layer.tables.historicalParcels.length, geometryVersions: layer.tables.geometryVersions.length,
    lineageEvents: layer.tables.parcelLineage.length, geogitEvents: layer.tables.geogitEvents.length };

  return frames;
}

function buildParcelProjection(layer, parcelId) {
  const model = buildIndividualParcelModeModel(layer, parcelId);
  if (!model.found) throw new Error(`Unknown parcel ${parcelId}`);
  return model;
}

function cumulativeFrame(frames, stageIndex) {
  const nodes = [], edges = [], notes = [], metrics = {};
  const seenNodes = new Set(), seenEdges = new Set();
  for (let i = 0; i <= stageIndex; i += 1) {
    for (const node of frames[i].nodes) if (node && !seenNodes.has(node.id)) { seenNodes.add(node.id); nodes.push(node); }
    for (const edge of frames[i].edges) if (edge && !seenEdges.has(edge.id)) { seenEdges.add(edge.id); edges.push(edge); }
    notes.push(...frames[i].notes.map((note) => ({ stageId: frames[i].stage.id, note })));
    Object.assign(metrics, frames[i].metrics);
  }
  const visibleIds = new Set(nodes.map((n) => n.id));
  return { nodes, edges: edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to)), notes, metrics };
}

function cachedRunFrames(layer) {
  let frames = runFrameCache.get(layer);
  if (!frames) {
    frames = buildRunFrames(layer);
    runFrameCache.set(layer, frames);
  }
  return frames;
}

function cachedCumulativeRunFrames(layer) {
  let cumulative = cumulativeRunFrameCache.get(layer);
  if (!cumulative) {
    const frames = cachedRunFrames(layer);
    cumulative = REPLAY_STAGES.map((_, index) => cumulativeFrame(frames, index));
    cumulativeRunFrameCache.set(layer, cumulative);
  }
  return cumulative;
}

function cachedParcelProjection(layer, parcelId) {
  let byParcel = parcelProjectionCache.get(layer);
  if (!byParcel) { byParcel = new Map(); parcelProjectionCache.set(layer, byParcel); }
  if (!byParcel.has(parcelId)) byParcel.set(parcelId, buildParcelProjection(layer, parcelId));
  return byParcel.get(parcelId);
}

export function createReplayProjector(layer, { mode = 'run', parcelId = null } = {}) {
  if (!layer) throw new Error('createReplayProjector requires an evidence data layer');
  if (mode !== 'run' && mode !== 'parcel') throw new Error(`Unsupported replay mode: ${mode}`);
  const cumulativeRun = mode === 'run' ? cachedCumulativeRunFrames(layer) : null;
  // Parcel detail remains lazy: no per-parcel graph is built while browsing the
  // locality replay or autocomplete list. It is materialized only when parcel mode
  // is actually requested, then retained for replay/re-entry.
  const parcel = mode === 'parcel' ? cachedParcelProjection(layer, parcelId) : null;
  const parcelStageCache = new Map();

  return {
    mode,
    parcelId: mode === 'parcel' ? parcelId : null,
    project(stageIndex) {
      const index = Math.max(0, Math.min(REPLAY_STAGES.length - 1, Number(stageIndex) || 0));
      if (mode === 'run') return cumulativeRun[index];
      if (parcelStageCache.has(index)) return parcelStageCache.get(index);
      const visibleNodes = parcel.nodes.filter((n) => n.stageIndex <= index);
      const ids = new Set(visibleNodes.map((n) => n.id));
      const visibleEdges = parcel.edges.filter((e) => e.stageIndex <= index && ids.has(e.from) && ids.has(e.to));
      const currentStage = REPLAY_STAGES[index];
      const notes = [];
      if (currentStage.limitation) notes.push({ stageId: currentStage.id, note: currentStage.limitation });
      if (parcel.omittedStageNotes?.[currentStage.id]) notes.push({ stageId: currentStage.id, note: parcel.omittedStageNotes[currentStage.id] });
      const projected = {
        nodes: visibleNodes, edges: visibleEdges, notes,
        metrics: {
          parcelId, diagnostics: parcel.diagnostics.length, parcelStory: parcel.story,
          applicableStages: parcel.applicableStages, currentStageApplicable: parcel.applicableStages.includes(currentStage.id)
        }
      };
      parcelStageCache.set(index, projected);
      return projected;
    }
  };
}
