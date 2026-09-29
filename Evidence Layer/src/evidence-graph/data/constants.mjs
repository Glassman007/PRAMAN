export const TABLE_FILES = Object.freeze({
  sourceMetadata: '1 Source_inputs/SOURCE_METADATA.csv',
  sourceSchema: '1 Source_inputs/SOURCE_SPECIFIC_SCHEMA.csv',
  sourceGeometries: '2 Source_geometry/SOURCE_GEOMETRIES.csv',
  matchingInput: '3 Adapter/MATCHING_INPUT_VIEW.csv',
  sourceObservations: '4 Matching/SOURCE_OBSERVATIONS.csv',
  conflicts: '5 Conflicts/CONFLICTS.csv',
  conflictEvidence: '5 Conflicts/CONFLICT_EVIDENCE.csv',
  conflictRejectedProvenance: '5 Conflicts/CONFLICTS_REJECTED_PROVENANCE.csv',
  reconciledParcels: '6 Reconciliation/RECONCILED_PARCELS.csv',
  canonicalParcels: '7 Authoritative_state/CANONICAL_PARCELS.csv',
  geometryVersions: '7 Authoritative_state/GEOMETRY_VERSIONS.csv',
  historicalParcels: '8 History/HISTORICAL_PARCELS.csv',
  parcelLineage: '8 History/PARCEL_LINEAGE.csv',
  geogitEvents: '8 History/GEOGIT_EVENTS.csv'
});

export const REQUIRED_TABLES = Object.freeze([
  'sourceMetadata', 'sourceSchema', 'sourceGeometries', 'matchingInput',
  'sourceObservations', 'conflicts', 'conflictEvidence', 'reconciledParcels',
  'canonicalParcels', 'geometryVersions', 'historicalParcels',
  'parcelLineage', 'geogitEvents'
]);

export const NODE_TYPES = Object.freeze({
  SourceDataset: 'SourceDataset',
  SourceSchemaProfile: 'SourceSchemaProfile',
  SourceGeometry: 'SourceGeometry',
  SourceObservation: 'SourceObservation',
  AdapterExecution: 'AdapterExecution',
  AdapterConcept: 'AdapterConcept',
  NormalizedObservation: 'NormalizedObservation',
  MatchCandidate: 'MatchCandidate',
  PairEvidence: 'PairEvidence',
  DistortionContext: 'DistortionContext',
  MatchDecision: 'MatchDecision',
  Conflict: 'Conflict',
  ConflictCheckResult: 'ConflictCheckResult',
  ConflictEvidence: 'ConflictEvidence',
  ReconciliationProposal: 'ReconciliationProposal',
  SystemInference: 'SystemInference',
  PolicyGate: 'PolicyGate',
  AuthoritativeState: 'AuthoritativeState',
  ReviewEvent: 'ReviewEvent',
  ReviewDecision: 'ReviewDecision',
  CanonicalRegistry: 'CanonicalRegistry',
  CanonicalParcel: 'CanonicalParcel',
  HistoricalParcel: 'HistoricalParcel',
  GeometryVersion: 'GeometryVersion',
  LineageEvent: 'LineageEvent',
  LineageTransaction: 'LineageTransaction',
  GeoGitEvent: 'GeoGitEvent'
});

export const EDGE_TYPES = Object.freeze({
  OBSERVED_FROM: 'OBSERVED_FROM',
  NORMALIZED_TO: 'NORMALIZED_TO',
  ROUTED_TO_ADAPTER: 'ROUTED_TO_ADAPTER',
  CONFORMS_TO_SCHEMA: 'CONFORMS_TO_SCHEMA',
  HAS_SOURCE_GEOMETRY: 'HAS_SOURCE_GEOMETRY',
  HAS_CANDIDATE: 'HAS_CANDIDATE',
  CANDIDATE_FOR: 'CANDIDATE_FOR',
  EVIDENCE_MEMBER_OF: 'EVIDENCE_MEMBER_OF',
  DECISION_FOR: 'DECISION_FOR',
  PAIR_EVIDENCE_FOR: 'PAIR_EVIDENCE_FOR',
  RECORDED_DISTORTION_CONTEXT: 'RECORDED_DISTORTION_CONTEXT',
  GLOBAL_ASSIGNMENT: 'GLOBAL_ASSIGNMENT',
  RECORDED_MATCH_OUTCOME: 'RECORDED_MATCH_OUTCOME',
  ASSIGNED_AS: 'ASSIGNED_AS',
  HAS_CONFLICT: 'HAS_CONFLICT',
  GENERATED_CONFLICT: 'GENERATED_CONFLICT',
  CONFLICT_CHECK_CLEAR: 'CONFLICT_CHECK_CLEAR',
  RECONCILED_WITH: 'RECONCILED_WITH',
  CONFLICTS_WITH: 'CONFLICTS_WITH',
  SUPPORTED_BY: 'SUPPORTED_BY',
  REFERENCES_EVIDENCE: 'REFERENCES_EVIDENCE',
  PROPOSED_STATE: 'PROPOSED_STATE',
  AUTHORITY_STATE: 'AUTHORITY_STATE',
  HAS_REVIEW_EVENT: 'HAS_REVIEW_EVENT',
  HAS_REVIEW_DECISION: 'HAS_REVIEW_DECISION',
  ENTERS_POLICY_GATE: 'ENTERS_POLICY_GATE',
  ENTERS_GOVERNANCE_PATH: 'ENTERS_GOVERNANCE_PATH',
  AUTHORITY_STATE_WITHOUT_EXPLICIT_GOVERNANCE_EVENT: 'AUTHORITY_STATE_WITHOUT_EXPLICIT_GOVERNANCE_EVENT',
  GOVERNANCE_OUTCOME: 'GOVERNANCE_OUTCOME',
  RECONCILIATION_TO_GOVERNANCE: 'RECONCILIATION_TO_GOVERNANCE',
  MATERIALIZED_IN_REGISTRY: 'MATERIALIZED_IN_REGISTRY',
  REGISTRY_MEMBER: 'REGISTRY_MEMBER',
  VERSION_OF: 'VERSION_OF',
  SUPERSEDES: 'SUPERSEDES',
  SPLIT_INTO: 'SPLIT_INTO',
  MERGED_FROM: 'MERGED_FROM',
  PARTICIPATES_IN_LINEAGE: 'PARTICIPATES_IN_LINEAGE',
  HAS_GEOGIT_EVENT: 'HAS_GEOGIT_EVENT',
  RECORDED_IN_GEOGIT: 'RECORDED_IN_GEOGIT',
  LINEAGE_INPUT: 'LINEAGE_INPUT',
  LINEAGE_RESULT: 'LINEAGE_RESULT'
});

export const ENTITY_AVAILABILITY = Object.freeze({
  AdapterExecution: {
    available: false,
    reason: 'No adapter execution/run table exists. SOURCE_SPECIFIC_SCHEMA is a schema contract and MATCHING_INPUT_VIEW is the normalized output-like layer.'
  },
  PairwiseMatchDecision: {
    available: false,
    reason: 'No candidate-pair decision table exists; match_status is parcel-level.'
  },
  PairwiseMatchScore: {
    available: false,
    reason: 'No per-alternative score, solver cost, veto flag, or objective contribution exists.'
  },
  RawSourceRecord: {
    available: false,
    reason: 'Raw original source-record tables are not included; source_record_id is only a logical identifier.'
  },
  DirectGeoGitGeometryLink: {
    available: false,
    reason: 'GEOGIT_EVENTS has no geometry_id foreign key.'
  }
});
