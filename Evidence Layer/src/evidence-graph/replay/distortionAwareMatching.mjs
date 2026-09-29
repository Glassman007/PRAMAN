
export const MATCH_OUTCOME_GROUPS = Object.freeze({
  ACCEPTED: Object.freeze(['AUTO_MATCHED', 'MATCHED_WITH_MINOR_CONFLICT', 'RECONCILED']),
  AMBIGUOUS: Object.freeze(['HUMAN_REVIEW_REQUIRED', 'TENTATIVE', 'NEEDS_ADDITIONAL_EVIDENCE']),
  REJECTED: Object.freeze(['REJECTED_MATCH'])
});

function countBy(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row) || 'UNSPECIFIED';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function groupForStatus(status) {
  for (const [group, statuses] of Object.entries(MATCH_OUTCOME_GROUPS)) {
    if (statuses.includes(status)) return group;
  }
  return 'OTHER';
}

function percentageDelta(observed, candidate) {
  const a = Number(observed), b = Number(candidate);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return ((a - b) / b) * 100;
}

function canonicalAreaForParcel(layer, parcelId, reconciled) {
  const current = layer.tables.canonicalParcels.find((row) => row.canonical_parcel_id === parcelId);
  if (current && Number.isFinite(Number(current.area_sqm))) return Number(current.area_sqm);
  const proposed = reconciled?.proposedState?.area_sqm;
  if (Number.isFinite(Number(proposed))) return Number(proposed);
  const authoritative = reconciled?.authoritativeState?.area_sqm;
  if (Number.isFinite(Number(authoritative))) return Number(authoritative);
  const historical = layer.tables.historicalParcels.find((row) => row.canonical_parcel_id === parcelId);
  if (historical) {
    const geometry = layer.tables.geometryVersions.find((row) => row.geometry_id === historical.historical_geometry_id);
    if (geometry && Number.isFinite(Number(geometry.areaSqm))) return Number(geometry.areaSqm);
  }
  return null;
}

function evidenceAvailability() {
  return [
    {
      key: 'geometry', label: 'Geometry relationship', available: true,
      evidence: 'SOURCE_OBSERVATIONS.geometry_confidence + SOURCE_GEOMETRIES.geometry_quality_flag + positional_accuracy_m',
      limitation: 'No stored pairwise geometry-relation class or pair-specific geometry score exists.'
    },
    {
      key: 'area', label: 'Area comparison', available: true,
      evidence: 'SOURCE_OBSERVATIONS.observed_area + candidate parcel area where available',
      limitation: 'Observed/candidate area delta is a deterministic inspection value, not a recorded classifier similarity score.'
    },
    {
      key: 'identifier', label: 'Identifier evidence', available: true,
      evidence: 'SOURCE_OBSERVATIONS.identifier_confidence + source_record_id/source_parcel_id',
      limitation: null
    },
    {
      key: 'neighbourhood', label: 'Neighbourhood / adjacency evidence', available: false,
      evidence: null,
      limitation: 'No pair-level adjacency/neighbourhood feature vector is stored in the supplied production tables.'
    },
    {
      key: 'topology', label: 'Topology evidence', available: false,
      evidence: null,
      limitation: 'No pair-level topology feature/vector is stored in the supplied matching tables.'
    },
    {
      key: 'temporal', label: 'Temporal compatibility', available: true,
      evidence: 'SOURCE_OBSERVATIONS.temporal_freshness + observation_date',
      limitation: 'No separate pairwise temporal-compatibility score is stored.'
    },
    {
      key: 'source-quality', label: 'Source quality', available: true,
      evidence: 'SOURCE_OBSERVATIONS.source_reliability + SOURCE_METADATA authority/accuracy metadata',
      limitation: null
    },
    {
      key: 'uncertainty', label: 'Uncertainty / positional accuracy', available: true,
      evidence: 'SOURCE_OBSERVATIONS.positional_accuracy_m + geometry_confidence',
      limitation: 'No covariance matrix or Mahalanobis distance is stored per candidate pair.'
    },
    {
      key: 'distortion', label: 'Structured distortion-model output', available: false,
      evidence: null,
      limitation: 'No structured matching-distortion output is stored. Raw SOURCE_OBSERVATIONS.notes and RECONCILED_PARCELS.criticality_reason remain inspectable without being reclassified into inferred distortion signals.'
    }
  ];
}

function buildDistortionAwareMatchingModelUncached(layer) {
  if (!layer?.tables) throw new Error('buildDistortionAwareMatchingModel requires the evidence data layer');

  const observations = layer.tables.sourceObservations;
  const reconciled = layer.tables.reconciledParcels;
  const candidateAssociations = [];
  for (const observation of observations) {
    if (observation.candidate_canonical_parcel_id) {
      candidateAssociations.push({
        id: `${observation.observation_id}:${observation.candidate_canonical_parcel_id}:PRIMARY:0`,
        observationId: observation.observation_id,
        parcelId: observation.candidate_canonical_parcel_id,
        role: 'PRIMARY', ordinal: 0
      });
    }
    observation.alternateCandidateParcelIds.forEach((parcelId, ordinal) => {
      candidateAssociations.push({
        id: `${observation.observation_id}:${parcelId}:ALTERNATE:${ordinal}`,
        observationId: observation.observation_id,
        parcelId, role: 'ALTERNATE', ordinal
      });
    });
  }

  const outcomeGroups = {};
  for (const group of ['ACCEPTED', 'AMBIGUOUS', 'UNMATCHED', 'REJECTED', 'OTHER']) outcomeGroups[group] = [];
  for (const row of reconciled) outcomeGroups[groupForStatus(row.match_status)].push(row);

  // The supplied matching tables contain a primary candidate for every observation. There is
  // therefore no explicit unmatched-observation population in this run.
  const unmatchedObservationIds = observations.filter((row) => !row.candidate_canonical_parcel_id).map((row) => row.observation_id);

  return {
    label: 'Distortion-aware parcel matching',
    normalizedObservationIds: layer.tables.matchingInput.map((row) => row.observation_id),
    candidateAssociations,
    candidateAssociationIds: candidateAssociations.map((row) => row.id),
    primaryCandidateAssociationIds: candidateAssociations.filter((row) => row.role === 'PRIMARY').map((row) => row.id),
    alternateCandidateAssociationIds: candidateAssociations.filter((row) => row.role === 'ALTERNATE').map((row) => row.id),
    observationsWithAlternates: observations.filter((row) => row.alternateCandidateParcelIds.length > 0).map((row) => row.observation_id),
    pairEvidenceObservationIds: observations.map((row) => row.observation_id),
    assignmentParcelIds: reconciled.map((row) => row.canonical_parcel_id),
    matchStatusCounts: countBy(reconciled, (row) => row.match_status),
    outcomeGroups: Object.fromEntries(Object.entries(outcomeGroups).map(([group, rows]) => [group, {
      group,
      parcelIds: rows.map((row) => row.canonical_parcel_id),
      count: rows.length,
      statusCounts: countBy(rows, (row) => row.match_status)
    }])),
    unmatchedObservationIds,
    distortion: {
      structuredOutputAvailable: false,
      observationIds: [],
      parcelIds: [],
      correctionAppliedBeforeIdentity: false,
      principle: 'IDENTITY FIRST → CORRECTION SECOND',
      limitation: 'No structured matching-distortion record exists in the supplied PRAMAN_DATA; raw notes remain inspectable without phrase-based classification.'
    },
    evidenceDimensions: evidenceAvailability(),
    limitations: {
      pairwiseClassifierProbabilityAvailable: false,
      pairwiseScoreAvailable: false,
      solverCostAvailable: false,
      vetoFlagsAvailable: false,
      pairwiseAcceptanceDecisionAvailable: false,
      neighbourhoodFeatureVectorAvailable: false,
      topologyFeatureVectorAvailable: false
    }
  };
}

function buildMatchingObservationModelUncached(layer, observationId) {
  if (!layer?.tables) throw new Error('buildMatchingObservationModel requires the evidence data layer');
  const observation = layer.tables.sourceObservations.find((row) => row.observation_id === observationId) ?? null;
  if (!observation) return { found: false, observationId };
  const normalized = layer.tables.matchingInput.find((row) => row.observation_id === observationId) ?? null;
  const geometry = layer.tables.sourceGeometries.find((row) => row.geometry_id === observation.geometry_id) ?? null;
  const source = layer.tables.sourceMetadata.find((row) => row.source_type === observation.source_type) ?? null;

  const candidates = [
    ...(observation.candidate_canonical_parcel_id ? [{ parcelId: observation.candidate_canonical_parcel_id, role: 'PRIMARY', ordinal: 0 }] : []),
    ...observation.alternateCandidateParcelIds.map((parcelId, ordinal) => ({ parcelId, role: 'ALTERNATE', ordinal }))
  ].map((candidate) => {
    const reconciliation = layer.tables.reconciledParcels.find((row) => row.canonical_parcel_id === candidate.parcelId) ?? null;
    const candidateArea = canonicalAreaForParcel(layer, candidate.parcelId, reconciliation);
    const observedArea = observation.observedArea;
    const delta = Number.isFinite(Number(observedArea)) && Number.isFinite(Number(candidateArea)) ? Number(observedArea) - Number(candidateArea) : null;
    return {
      ...candidate,
      matchStatus: reconciliation?.match_status ?? null,
      outcomeGroup: reconciliation ? groupForStatus(reconciliation.match_status) : null,
      overallMatchConfidence: reconciliation?.overallMatchConfidence ?? null,
      observedAreaSqm: Number.isFinite(Number(observedArea)) ? Number(observedArea) : null,
      candidateAreaSqm: candidateArea,
      areaDeltaSqm: Number.isFinite(delta) ? delta : null,
      areaDeltaPercent: percentageDelta(observedArea, candidateArea),
      areaComparisonIsDerived: true,
      pairwiseScore: null,
      pairwiseDecision: null
    };
  });

  const primaryReconciliation = candidates[0]?.parcelId
    ? layer.tables.reconciledParcels.find((row) => row.canonical_parcel_id === candidates[0].parcelId) ?? null
    : null;
  return {
    found: true,
    observationId,
    source: {
      sourceId: source?.source_id ?? null,
      sourceName: source?.source_name ?? null,
      sourceType: observation.source_type,
      authority: source?.authority ?? null,
      sourceRecordId: observation.source_record_id,
      sourceParcelId: observation.source_parcel_id
    },
    normalized: normalized ? {
      geometryId: normalized.geometry_id,
      observationDate: normalized.observation_date,
      observedAreaSqm: normalized.observedArea,
      landUse: normalized.land_use,
      ownerName: normalized.owner_name
    } : null,
    candidates,
    evidence: {
      geometry: {
        geometryConfidence: observation.geometryConfidence,
        geometryQualityFlag: geometry?.geometry_quality_flag ?? null,
        positionalAccuracyM: observation.positionalAccuracyM,
        originalCrs: geometry?.original_crs ?? null,
        normalizedCrs: geometry?.normalized_crs ?? null,
        recordedPairwiseGeometryRelation: null
      },
      area: {
        observedAreaSqm: observation.observedArea,
        primaryCandidateComparison: candidates.find((row) => row.role === 'PRIMARY') ?? null,
        recordedAreaSimilarityScore: null
      },
      identifier: {
        identifierConfidence: observation.identifierConfidence,
        sourceRecordId: observation.source_record_id,
        sourceParcelId: observation.source_parcel_id
      },
      temporal: {
        temporalFreshness: observation.temporalFreshness,
        observationDate: observation.observation_date,
        recordedPairwiseTemporalCompatibility: null
      },
      sourceQuality: {
        sourceReliability: observation.sourceReliability,
        authority: source?.authority ?? null,
        nominalAccuracy: source?.nominal_accuracy ?? null
      },
      uncertainty: {
        positionalAccuracyM: observation.positionalAccuracyM,
        geometryConfidence: observation.geometryConfidence,
        covarianceAvailable: false
      },
      neighbourhoodAdjacency: { available: false, reason: 'No pair-level adjacency/neighbourhood feature vector is stored.' },
      topology: { available: false, reason: 'No pair-level topology feature/vector is stored.' },
      distortion: {
        structuredOutputAvailable: false,
        observationNotes: observation.notes || null,
        parcelCriticalityReason: primaryReconciliation?.criticality_reason || null,
        geometryCorrectionAppliedAtMatching: false,
        principle: 'IDENTITY FIRST → CORRECTION SECOND',
        limitation: 'Raw narrative fields are displayed as recorded context only; they are not converted into a fabricated distortion classification.'
      }
    },
    limitations: {
      pairwiseClassifierProbabilityAvailable: false,
      perAlternativeScoreAvailable: false,
      pairwiseAcceptanceDecisionAvailable: false,
      solverCostAvailable: false,
      vetoFlagsAvailable: false
    }
  };
}

export function classifyMatchOutcome(status) { return groupForStatus(status); }

const distortionAwareMatchingModelCache = new WeakMap();
export function buildDistortionAwareMatchingModel(layer) {
  if (distortionAwareMatchingModelCache.has(layer)) return distortionAwareMatchingModelCache.get(layer);
  const value = buildDistortionAwareMatchingModelUncached(layer);
  distortionAwareMatchingModelCache.set(layer, value);
  return value;
}

const matchingObservationCache = new WeakMap();
export function buildMatchingObservationModel(layer, observationId) {
  let byId = matchingObservationCache.get(layer);
  if (!byId) { byId = new Map(); matchingObservationCache.set(layer, byId); }
  if (!byId.has(observationId)) byId.set(observationId, buildMatchingObservationModelUncached(layer, observationId));
  return byId.get(observationId);
}
