export const TABLE_DEFINITIONS = Object.freeze({
  sourceMetadata: {
    path: '1 Source_inputs/SOURCE_METADATA.csv',
    numberFields: ['reliability'],
  },
  sourceSpecificSchema: {
    path: '1 Source_inputs/SOURCE_SPECIFIC_SCHEMA.csv',
    listFields: ['source_specific_keys', 'required_keys', 'historical_nullable_keys', 'lifecycle_metadata_fields'],
  },
  sourceGeometries: {
    path: '2 Source_geometry/SOURCE_GEOMETRIES.csv',
    numberFields: ['observed_area_sqm', 'positional_accuracy_m'],
    listFields: ['observation_ids', 'source_record_ids'],
  },
  sourceObservations: {
    path: '4 Matching/SOURCE_OBSERVATIONS.csv',
    numberFields: [
      'observed_area',
      'source_reliability',
      'geometry_confidence',
      'attribute_confidence',
      'temporal_freshness',
      'identifier_confidence',
      'positional_accuracy_m',
    ],
    jsonFields: ['source_specific_details'],
    listFields: ['alternate_candidate_parcel_ids', 'lineage_reference'],
  },
  conflicts: {
    path: '5 Conflicts/CONFLICTS.csv',
    booleanFields: ['human_review_required'],
    listFields: ['benchmark_case_ids'],
  },
  conflictEvidence: {
    path: '5 Conflicts/CONFLICT_EVIDENCE.csv',
  },
  conflictsRejectedProvenance: {
    path: '5 Conflicts/CONFLICTS_REJECTED_PROVENANCE.csv',
    booleanFields: ['human_review_required'],
    listFields: ['benchmark_case_ids'],
  },
  reconciledParcels: {
    path: '6 Reconciliation/RECONCILED_PARCELS.csv',
    numberFields: [
      'source_count',
      'overall_match_confidence',
      'geometry_confidence',
      'ownership_confidence',
      'land_use_confidence',
      'lineage_confidence',
      'reconciliation_confidence',
    ],
    booleanFields: ['requires_human_review'],
    jsonFields: ['proposed_state', 'authoritative_state'],
    listFields: [
      'parent_parcel_ids',
      'child_parcel_ids',
      'matched_source_ids',
      'unresolved_conflicts',
      'benchmark_case_ids',
    ],
  },
  canonicalParcels: {
    path: '7 Authoritative_state/CANONICAL_PARCELS.csv',
    numberFields: [
      'parcel_number',
      'area_sqm',
      'built_up_area_sqm',
      'building_count',
      'floor_count',
      'latitude_centroid',
      'longitude_centroid',
    ],
  },
  geometryVersions: {
    path: '7 Authoritative_state/GEOMETRY_VERSIONS.csv',
    numberFields: ['area_sqm'],
  },
  historicalParcels: {
    path: '8 History/HISTORICAL_PARCELS.csv',
    numberFields: ['parcel_number'],
  },
  parcelLineage: {
    path: '8 History/PARCEL_LINEAGE.csv',
  },
  geoGitEvents: {
    path: '8 History/GEOGIT_EVENTS.csv',
    listFields: ['related_parcel_ids'],
  },
});

export const REQUIRED_PRODUCTION_PATHS = Object.freeze(
  Object.values(TABLE_DEFINITIONS).map((definition) => definition.path)
);
