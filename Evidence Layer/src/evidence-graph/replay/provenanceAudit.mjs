import { NODE_TYPES } from '../data/constants.mjs';
import { ADAPTER_DEFINITIONS } from './adapterProcessing.mjs';

const TABLE_BINDINGS = Object.freeze({
  SOURCE_METADATA: ['sourceMetadata', 'source_id'],
  SOURCE_SPECIFIC_SCHEMA: ['sourceSchema', 'source_type'],
  SOURCE_GEOMETRIES: ['sourceGeometries', 'geometry_id'],
  MATCHING_INPUT_VIEW: ['matchingInput', 'observation_id'],
  SOURCE_OBSERVATIONS: ['sourceObservations', 'observation_id'],
  CONFLICTS: ['conflicts', 'conflict_id'],
  CONFLICT_EVIDENCE: ['conflictEvidence', 'conflict_evidence_id'],
  CONFLICTS_REJECTED_PROVENANCE: ['conflictRejectedProvenance', 'conflict_id'],
  RECONCILED_PARCELS: ['reconciledParcels', 'canonical_parcel_id'],
  CANONICAL_PARCELS: ['canonicalParcels', 'canonical_parcel_id'],
  GEOMETRY_VERSIONS: ['geometryVersions', 'geometry_id'],
  HISTORICAL_PARCELS: ['historicalParcels', 'canonical_parcel_id'],
  PARCEL_LINEAGE: ['parcelLineage', 'lineage_event_id'],
  GEOGIT_EVENTS: ['geogitEvents', 'event_id']
});

const configAdapterIds = new Set(ADAPTER_DEFINITIONS.map((row) => row.id));

function tableRecordIds(layer, table) {
  const binding = TABLE_BINDINGS[table];
  if (!binding) return null;
  const [key, idField] = binding;
  return new Set((layer.tables[key] ?? []).map((row) => row[idField]).filter(Boolean));
}

export function candidateRelationshipExists(layer, relationshipId) {
  const [observationId, parcelId, role, ordinalText] = String(relationshipId ?? '').split(':');
  const observation = layer.tables.sourceObservations.find((row) => row.observation_id === observationId);
  if (!observation) return false;
  const ordinal = Number(ordinalText);
  if (role === 'PRIMARY') return ordinal === 0 && observation.candidate_canonical_parcel_id === parcelId;
  if (role === 'ALTERNATE') return Number.isInteger(ordinal) && observation.alternateCandidateParcelIds[ordinal] === parcelId;
  return false;
}

function checkMetadataRef(layer, ref, context, errors) {
  if (!ref?.table || ref.recordId == null) return;
  if (ref.table === 'PRAMAN_ADAPTER_ARCHITECTURE') {
    if (!configAdapterIds.has(ref.recordId)) errors.push(`${context}: unknown adapter architecture id ${ref.recordId}`);
    return;
  }
  const ids = tableRecordIds(layer, ref.table);
  if (!ids) {
    errors.push(`${context}: unsupported metadata table ${ref.table}`);
    return;
  }
  if (!ids.has(ref.recordId)) errors.push(`${context}: ${ref.table} record ${ref.recordId} does not exist`);
}

function checkMembers(layer, item, context, errors) {
  const table = item.data?.memberTable;
  const members = item.memberRecordIds ?? item.data?.memberRecordIds ?? [];
  if (!members.length) return;
  if (!table) {
    // Individual derived candidate nodes use SOURCE_OBSERVATIONS metadata and a deterministic relationship id.
    if (item.entityType === NODE_TYPES.MatchCandidate || item.type === NODE_TYPES.MatchCandidate) {
      for (const id of members) if (!candidateRelationshipExists(layer, id)) errors.push(`${context}: candidate relationship ${id} is not reproducible from SOURCE_OBSERVATIONS`);
    }
    return;
  }
  const ids = tableRecordIds(layer, table);
  if (!ids) {
    errors.push(`${context}: unsupported member table ${table}`);
    return;
  }
  for (const id of members) if (!ids.has(id)) errors.push(`${context}: member ${id} is not a ${table} record`);
}

export function auditProjectionProvenance(layer, projection) {
  const errors = [];
  const nodeIds = new Set((projection.nodes ?? []).map((node) => node.id));

  for (const node of projection.nodes ?? []) {
    checkMetadataRef(layer, node.metadataRef, `node ${node.id}`, errors);
    checkMembers(layer, node, `node ${node.id}`, errors);
    for (const id of node.data?.derivedRelationshipIds ?? []) {
      if (!candidateRelationshipExists(layer, id)) errors.push(`node ${node.id}: derived candidate relationship ${id} cannot be reproduced`);
    }
    if ((node.entityType === NODE_TYPES.MatchCandidate || node.type === NODE_TYPES.MatchCandidate)
        && node.datasetRecordId && String(node.datasetRecordId).includes(':')
        && !candidateRelationshipExists(layer, node.datasetRecordId)) {
      errors.push(`node ${node.id}: candidate relationship ${node.datasetRecordId} cannot be reproduced`);
    }
  }

  for (const edge of projection.edges ?? []) {
    if (!nodeIds.has(edge.from)) errors.push(`edge ${edge.id}: missing source node ${edge.from}`);
    if (!nodeIds.has(edge.to)) errors.push(`edge ${edge.id}: missing target node ${edge.to}`);
    checkMetadataRef(layer, edge.metadataRef, `edge ${edge.id}`, errors);
    checkMembers(layer, edge, `edge ${edge.id}`, errors);
  }

  return {
    ok: errors.length === 0,
    errors,
    nodeCount: projection.nodes?.length ?? 0,
    edgeCount: projection.edges?.length ?? 0
  };
}

