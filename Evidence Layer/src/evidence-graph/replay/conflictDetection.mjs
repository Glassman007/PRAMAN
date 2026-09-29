import { classifyMatchOutcome } from './distortionAwareMatching.mjs';

const uniq = (values) => [...new Set(values.filter(Boolean))];

export const CONFLICT_CATEGORY_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'OWNERSHIP_PARTY', label: 'Ownership / party information',
    conflictTypes: Object.freeze(['OWNER_NAME_VARIATION', 'OWNERSHIP_DISAGREEMENT', 'GOVERNMENT_PRIVATE_OWNERSHIP'])
  }),
  Object.freeze({
    id: 'PARCEL_AREA', label: 'Parcel area',
    conflictTypes: Object.freeze(['AREA_MISMATCH'])
  }),
  Object.freeze({
    id: 'GEOMETRY_BOUNDARY', label: 'Geometry / boundary',
    conflictTypes: Object.freeze(['SHIFTED_GEOMETRY', 'PHYSICAL_OCCUPATION_VS_LEGAL_GEOMETRY', 'ROAD_WIDENING_BOUNDARY_CORRECTION', 'PARK_BOUNDARY_DISAGREEMENT', 'ENCROACHMENT_PUBLIC_LAND', 'LOCAL_SPATIAL_DISTORTION'])
  }),
  Object.freeze({
    id: 'TENURE_STATUS', label: 'Tenure / authority status',
    conflictTypes: Object.freeze(['LEGAL_APPROVAL_PENDING', 'LEGAL_APPROVAL_DECIDED_REJECTED'])
  }),
  Object.freeze({
    id: 'IDENTIFIER_IDENTITY', label: 'Identifier / identity',
    conflictTypes: Object.freeze(['HISTORICAL_ID_REFERENCE', 'DUPLICATE_PARCEL_CANDIDATE', 'AMBIGUOUS_CANDIDATE_MATCH'])
  }),
  Object.freeze({
    id: 'TEMPORAL_VERSION', label: 'Temporal / version disagreement',
    conflictTypes: Object.freeze(['TEMPORAL_VERSION_MISMATCH', 'OUTDATED_RETIRED_PARCEL_ACTIVE', 'INCORRECT_MUTATION_ROLLED_BACK'])
  }),
  Object.freeze({
    id: 'TOPOLOGY', label: 'Topology / spatial relationship',
    conflictTypes: Object.freeze(['BUILDING_FOOTPRINT_CROSSES_PARCEL'])
  }),
  Object.freeze({
    id: 'SOURCE_DISAGREEMENT', label: 'Source disagreement / coverage',
    conflictTypes: Object.freeze(['MISSING_SOURCE_RECORD', 'DDA_MUNICIPAL_LAND_USE'])
  }),
  Object.freeze({
    id: 'SURVEY_DISCREPANCY', label: 'Survey discrepancy',
    conflictTypes: Object.freeze(['GNSS_VS_OLD_CADASTRE'])
  }),
  Object.freeze({
    id: 'SPLIT_MERGE_LINEAGE', label: 'Split / merge relationship',
    conflictTypes: Object.freeze(['ONE_TO_MANY_MATCH', 'SPLIT_NOT_REFLECTED', 'MERGE_NOT_REFLECTED', 'REDEVELOPMENT_CONSOLIDATION', 'INCORRECT_PARENT_REFERENCE'])
  })
]);

const categoryByType = new Map(CONFLICT_CATEGORY_DEFINITIONS.flatMap((category) => category.conflictTypes.map((type) => [type, category])));

function countBy(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row) || 'UNSPECIFIED';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getConflictCategory(conflictOrType) {
  const type = typeof conflictOrType === 'string' ? conflictOrType : conflictOrType?.conflict_type;
  return categoryByType.get(type) ?? null;
}

function sourceSide(layer, sourceLabel, observationId) {
  const observation = observationId
    ? layer.tables.sourceObservations.find((row) => row.observation_id === observationId) ?? null
    : null;
  const sourceType = observation?.source_type || sourceLabel || null;
  const source = layer.tables.sourceMetadata.find((row) => row.source_type === sourceType) ?? null;
  const geometry = observation?.geometry_id
    ? layer.tables.sourceGeometries.find((row) => row.geometry_id === observation.geometry_id) ?? null
    : null;
  return {
    sourceLabel: sourceLabel || sourceType,
    sourceType,
    sourceId: source?.source_id ?? null,
    sourceName: source?.source_name ?? null,
    authority: source?.authority ?? null,
    observationId: observation?.observation_id ?? observationId ?? null,
    sourceRecordId: observation?.source_record_id ?? null,
    sourceParcelId: observation?.source_parcel_id ?? null,
    observationDate: observation?.observation_date ?? null,
    reliability: observation?.sourceReliability ?? asNumber(source?.reliability),
    geometryConfidence: observation?.geometryConfidence ?? null,
    attributeConfidence: observation?.attributeConfidence ?? null,
    temporalFreshness: observation?.temporalFreshness ?? null,
    identifierConfidence: observation?.identifierConfidence ?? null,
    positionalAccuracyM: observation?.positionalAccuracyM ?? geometry?.positionalAccuracyM ?? null,
    geometry: geometry ? {
      geometryId: geometry.geometry_id,
      originalCrs: geometry.original_crs || null,
      normalizedCrs: geometry.normalized_crs || null,
      geometryQualityFlag: geometry.geometry_quality_flag || null,
      normalizationMethod: geometry.normalization_method || null,
      observedAreaSqm: geometry.observedAreaSqm,
      normalizedGeometryWkt: geometry.normalized_geometry_wkt || null
    } : null
  };
}

function geometryRelevant(conflict, category) {
  if (['GEOMETRY_BOUNDARY', 'TOPOLOGY', 'SURVEY_DISCREPANCY', 'SPLIT_MERGE_LINEAGE'].includes(category?.id)) return true;
  return /geometry|boundary|footprint|occupation|lineage/i.test(`${conflict.attribute_or_geometry || ''} ${conflict.conflict_type || ''}`);
}

function buildConflictDetectionModelUncached(layer) {
  if (!layer?.tables) throw new Error('buildConflictDetectionModel requires the evidence data layer');
  const reconciledByParcel = new Map(layer.tables.reconciledParcels.map((row) => [row.canonical_parcel_id, row]));
  const categoryRows = new Map(CONFLICT_CATEGORY_DEFINITIONS.map((category) => [category.id, []]));
  const unknownRows = [];

  for (const conflict of layer.tables.conflicts) {
    const category = getConflictCategory(conflict);
    if (category) categoryRows.get(category.id).push(conflict);
    else unknownRows.push(conflict);
  }

  const categories = CONFLICT_CATEGORY_DEFINITIONS.map((definition) => {
    const rows = categoryRows.get(definition.id) ?? [];
    if (!rows.length) return null;
    const parcelIds = uniq(rows.map((row) => row.canonical_parcel_id));
    return {
      ...definition,
      conflictIds: rows.map((row) => row.conflict_id),
      count: rows.length,
      parcelIds,
      parcelCount: parcelIds.length,
      conflictTypeCounts: countBy(rows, (row) => row.conflict_type),
      statusCounts: countBy(rows, (row) => row.status),
      severityCounts: countBy(rows, (row) => row.severity),
      criticalityCounts: countBy(rows, (row) => row.criticality),
      humanReviewRequired: rows.filter((row) => row.humanReviewRequired).length,
      byMatchOutcome: countBy(rows, (row) => classifyMatchOutcome(reconciledByParcel.get(row.canonical_parcel_id)?.match_status))
    };
  }).filter(Boolean);

  return {
    conflicts: layer.tables.conflicts.length,
    conflictIds: layer.tables.conflicts.map((row) => row.conflict_id),
    conflictEvidenceRecords: layer.tables.conflictEvidence.length,
    conflictedParcelIds: uniq(layer.tables.conflicts.map((row) => row.canonical_parcel_id)),
    categories,
    unknownConflictIds: unknownRows.map((row) => row.conflict_id),
    unknownConflictTypes: uniq(unknownRows.map((row) => row.conflict_type)),
    statusCounts: countBy(layer.tables.conflicts, (row) => row.status),
    criticalityCounts: countBy(layer.tables.conflicts, (row) => row.criticality),
    matchOutcomeCounts: countBy(layer.tables.conflicts, (row) => classifyMatchOutcome(reconciledByParcel.get(row.canonical_parcel_id)?.match_status)),
    principle: 'MATCHING DETERMINES IDENTITY → CONFLICT DETECTION DETERMINES DISAGREEMENT'
  };
}

function buildConflictInspectionModelUncached(layer, conflictId) {
  if (!layer?.tables) throw new Error('buildConflictInspectionModel requires the evidence data layer');
  const conflict = layer.tables.conflicts.find((row) => row.conflict_id === conflictId) ?? null;
  if (!conflict) return { found: false, conflictId };
  const category = getConflictCategory(conflict);
  const reconciliation = layer.tables.reconciledParcels.find((row) => row.canonical_parcel_id === conflict.canonical_parcel_id) ?? null;
  const evidence = layer.tables.conflictEvidence.filter((row) => row.conflict_id === conflictId);
  const sourceA = sourceSide(layer, conflict.source_a, conflict.source_a_observation_id);
  const sourceB = sourceSide(layer, conflict.source_b, conflict.source_b_observation_id);
  const unresolved = Boolean(reconciliation?.unresolvedConflictIds?.includes(conflictId));

  return {
    found: true,
    conflictId,
    category: category ? { id: category.id, label: category.label } : null,
    parcelId: conflict.canonical_parcel_id,
    conflict: {
      conflictType: conflict.conflict_type,
      conflictingField: conflict.attribute_or_geometry,
      sourceAValue: conflict.source_a_value,
      sourceBValue: conflict.source_b_value,
      explanation: conflict.explanation,
      status: conflict.status,
      severity: conflict.severity,
      criticality: conflict.criticality,
      humanReviewRequired: conflict.humanReviewRequired,
      recommendedNextEvidence: conflict.recommended_next_evidence || null
    },
    provenance: { sourceA, sourceB },
    evidence: evidence.map((row) => ({
      conflictEvidenceId: row.conflict_evidence_id,
      evidenceRole: row.evidence_role,
      evidenceType: row.evidence_type,
      sourceType: row.source_type,
      sourceTable: row.source_table,
      evidenceId: row.evidence_id,
      observationId: row.observation_id || null,
      attributeName: row.attribute_name || null,
      observedValue: row.observed_value || null,
      geometryId: row.geometry_id || null,
      temporalRole: row.temporal_role || null,
      supportsOrContradicts: row.supports_or_contradicts || null,
      notes: row.notes || null
    })),
    geometryContext: {
      relevant: geometryRelevant(conflict, category),
      sourceA: sourceA.geometry,
      sourceB: sourceB.geometry
    },
    reconciliation: reconciliation ? {
      matchStatus: reconciliation.match_status,
      reconciliationConfidence: reconciliation.reconciliationConfidence,
      overallMatchConfidence: reconciliation.overallMatchConfidence,
      geometryConfidence: reconciliation.geometryConfidence,
      ownershipConfidence: reconciliation.ownershipConfidence,
      landUseConfidence: reconciliation.landUseConfidence,
      lineageConfidence: reconciliation.lineageConfidence,
      requiresHumanReview: reconciliation.requiresHumanReview,
      conflictIsUnresolved: unresolved,
      authoritativeState: reconciliation.authoritativeState,
      proposedState: reconciliation.proposedState,
      reconciliationTimestamp: reconciliation.reconciliation_timestamp || null
    } : null
  };
}

const conflictDetectionModelCache = new WeakMap();
export function buildConflictDetectionModel(layer) {
  if (conflictDetectionModelCache.has(layer)) return conflictDetectionModelCache.get(layer);
  const value = buildConflictDetectionModelUncached(layer);
  conflictDetectionModelCache.set(layer, value);
  return value;
}

const conflictInspectionCache = new WeakMap();
export function buildConflictInspectionModel(layer, conflictId) {
  let byId = conflictInspectionCache.get(layer);
  if (!byId) { byId = new Map(); conflictInspectionCache.set(layer, byId); }
  if (!byId.has(conflictId)) byId.set(conflictId, buildConflictInspectionModelUncached(layer, conflictId));
  return byId.get(conflictId);
}
