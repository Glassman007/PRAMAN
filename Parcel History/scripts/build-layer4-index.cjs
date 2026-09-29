'use strict';

const fs = require('fs');
const path = require('path');
const { Layer4HistoryLineageAdapter } = require('../layer4.historyLineage.adapter.cjs');

const datasetRoot = process.env.PRAMAN_DATASET_DIR || process.argv[2];
if (!datasetRoot) {
  throw new Error('Pass the PRAMAN_DATA directory as argv[2] or set PRAMAN_DATASET_DIR.');
}

const outputRoot = path.resolve(__dirname, '../public/layer4-data');
const parcelOutputRoot = path.join(outputRoot, 'parcels');
const geometryOutputRoot = path.join(outputRoot, 'geometries');
fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(parcelOutputRoot, { recursive: true });
fs.mkdirSync(geometryOutputRoot, { recursive: true });

const adapter = new Layer4HistoryLineageAdapter({ datasetRoot });
const MEANINGFUL_TYPES = new Set([
  'SURVEY_OBSERVATION',
  'GEOMETRY_CHANGE',
  'OFFICIAL_APPROVAL',
  'MUTATION',
  'SPLIT',
  'MERGE',
  'CONFLICT'
]);

function normalizedDate(event) {
  return event.effective_date || event.recorded_date || null;
}

function latestMeaningfulEvent(events) {
  const meaningful = events.filter((event) => MEANINGFUL_TYPES.has(event.event_type));
  const dated = meaningful.filter((event) => normalizedDate(event));
  const source = dated.length ? dated : meaningful;
  if (!source.length) return null;
  return [...source].sort((left, right) => {
    const leftDate = normalizedDate(left) || '';
    const rightDate = normalizedDate(right) || '';
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    return String(left.adapter_event_key || left.event_id || '').localeCompare(String(right.adapter_event_key || right.event_id || ''));
  }).at(-1);
}

function uiPrimaryStatus(model) {
  if (model.states.currentAuthoritative) {
    return model.states.currentAuthoritative.recordStatus || null;
  }
  if (model.identityClass === 'HISTORICAL_RETIRED') return 'HISTORICAL';
  return null;
}

function stateMarkers(model) {
  const markers = new Set();
  if (model.states.currentAuthoritative?.recordStatus) markers.add(model.states.currentAuthoritative.recordStatus);
  if (model.identityClass === 'HISTORICAL_RETIRED') markers.add('HISTORICAL');
  if (model.states.historical.some((state) => state.stateScope === 'GEOMETRY_ONLY' || state.recordStatus === 'SUPERSEDED_GEOMETRY')) {
    markers.add('SUPERSEDED');
  }
  if (model.states.proposed?.proposalDisposition === 'PENDING') markers.add('PROPOSED');
  return [...markers].filter(Boolean).sort();
}

function lineageSummary(lineage) {
  const parents = lineage?.parents || [];
  const children = lineage?.children || [];
  const edges = lineage?.edges || [];
  const semanticTypes = [...new Set(edges.map((edge) => edge.semanticType).filter(Boolean))];
  return {
    hasLineage: parents.length > 0 || children.length > 0,
    parentCount: parents.length,
    childCount: children.length,
    semanticTypes
  };
}

function historyTypes(events) {
  return [...new Set(
    events.map((event) => event.event_type).filter((type) => MEANINGFUL_TYPES.has(type))
  )].sort();
}

function stripGeometry(geometry) {
  if (!geometry) return null;
  return {
    geometryId: geometry.geometryId || null,
    version: geometry.version || null,
    effectiveDate: geometry.effectiveDate || null,
    geometryStatus: geometry.geometryStatus || null,
    sourceType: geometry.sourceType || null,
    areaSqM: geometry.areaSqM ?? null,
    changeReason: geometry.changeReason || null,
    acceptedStatus: geometry.acceptedStatus || null,
    supersedesGeometryId: geometry.supersedesGeometryId || null,
    crs: geometry.crs || null
  };
}

function currentStatePayload(state) {
  if (!state) return null;
  return {
    stateType: state.stateType,
    parcelId: state.parcelId,
    parcelVersion: state.parcelVersion,
    acceptedParcelVersion: state.acceptedParcelVersion || state.parcelVersion,
    authoritativeGeometryVersion: state.authoritativeGeometryVersion,
    effectiveDate: state.effectiveDate,
    lastOfficialChange: state.lastOfficialChange || null,
    recordStatus: state.recordStatus,
    authorityStatus: state.authorityStatus,
    owner: state.owner,
    ownershipCategory: state.ownershipCategory,
    tenureType: state.tenureType,
    landUse: state.landUse,
    propertyType: state.propertyType,
    areaSqM: state.areaSqM,
    builtUpAreaSqM: state.builtUpAreaSqM,
    cellId: state.cellId,
    locality: state.locality,
    municipalWard: state.municipalWard,
    specialCondition: state.specialCondition,
    geometry: stripGeometry(state.geometry),
    openConflictStatus: state.openConflictStatus || null,
    openConflictCount: state.openConflictCount ?? null,
    openConflictIds: Array.isArray(state.openConflictIds) ? state.openConflictIds : [],
    sourceTable: state.sourceTable
  };
}

function historicalStatePayload(state) {
  if (!state) return null;
  return {
    stateType: state.stateType,
    stateScope: state.stateScope,
    parcelId: state.parcelId,
    parcelVersion: state.parcelVersion,
    geometryVersion: state.geometryVersion,
    effectiveDate: state.effectiveDate,
    retiredDate: state.retiredDate,
    recordStatus: state.recordStatus,
    lineageStatus: state.lineageStatus,
    authorityStatus: state.authorityStatus,
    owner: state.owner,
    landUse: state.landUse,
    areaSqM: state.areaSqM,
    cellId: state.cellId,
    locality: state.locality,
    retirementReason: state.retirementReason,
    geometry: stripGeometry(state.geometry),
    sourceTable: state.sourceTable
  };
}

function proposedStatePayload(state) {
  if (!state) return null;
  return {
    stateType: state.stateType,
    parcelId: state.parcelId,
    proposalDisposition: state.proposalDisposition,
    authorityStatus: state.authorityStatus,
    reviewStatus: state.reviewStatus,
    reconciliationStatus: state.reconciliationStatus,
    reconciliationTimestamp: state.reconciliationTimestamp,
    criticalityLevel: state.criticalityLevel,
    reason: state.reason,
    requiresHumanReview: state.requiresHumanReview,
    unresolvedConflictIds: Array.isArray(state.unresolvedConflictIds) ? state.unresolvedConflictIds : [],
    benchmarkCaseIds: Array.isArray(state.benchmarkCaseIds) ? state.benchmarkCaseIds : [],
    owner: state.owner,
    landUse: state.landUse,
    areaSqM: state.areaSqM,
    geometryId: state.geometryId,
    geometryReferenceStatus: state.geometryReferenceStatus,
    geometryReferenceAcceptedStatus: state.geometryReferenceAcceptedStatus,
    recordStatus: state.recordStatus,
    children: Array.isArray(state.children) ? state.children : [],
    geometry: stripGeometry(state.geometry),
    sourceTable: state.sourceTable
  };
}

function eventPayload(event) {
  return {
    adapter_event_key: event.adapter_event_key || null,
    event_id: event.event_id || null,
    parcel_id: event.parcel_id || null,
    event_type: event.event_type || null,
    event_subtype: event.event_subtype || null,
    effective_date: event.effective_date || null,
    recorded_date: event.recorded_date || null,
    source: event.source || null,
    source_record_id: event.source_record_id || null,
    geometry_version_before: event.geometry_version_before || null,
    geometry_version_after: event.geometry_version_after || null,
    parcel_version_before: event.parcel_version_before || null,
    parcel_version_after: event.parcel_version_after || null,
    authority_status: event.authority_status || null,
    review_status: event.review_status || null,
    related_conflict_id: event.related_conflict_id || null,
    related_conflict_ids: Array.isArray(event.related_conflict_ids) ? event.related_conflict_ids : [],
    related_commit_id: event.related_commit_id || null,
    related_geogit_event_id: event.related_geogit_event_id || null,
    related_parent_parcels: Array.isArray(event.related_parent_parcels) ? event.related_parent_parcels : [],
    related_child_parcels: Array.isArray(event.related_child_parcels) ? event.related_child_parcels : [],
    description: event.description || null,
    geometry_status: event.geometry_status || null,
    geometry: stripGeometry(event.geometry),
    geometry_before: stripGeometry(event.geometry_before),
    geometry_after: stripGeometry(event.geometry_after),
    area_before_sqm: event.area_before_sqm ?? null,
    area_after_sqm: event.area_after_sqm ?? null,
    conflict_status: event.conflict_status || null,
    conflict_details: Array.isArray(event.conflict_details) ? event.conflict_details : [],
    human_review_required: event.human_review_required ?? null,
    actor_type: event.actor_type || null,
    observation_id: event.observation_id || null,
    source_parcel_id: event.source_parcel_id || null,
    observation_geometry_id: event.observation_geometry_id || null,
    observed_area_sqm: event.observed_area_sqm ?? null,
    positional_accuracy_m: event.positional_accuracy_m ?? null,
    survey_status: event.survey_status || null,
    measurement_crs: event.measurement_crs || null,
    surveyor_source: event.surveyor_source || null,
    record_status: event.record_status || null,
    source_table: event.source_table || null
  };
}

function historyDetailPayload(model, summary) {
  const events = model.events
    .map(eventPayload)
    .sort((left, right) => {
      const leftDate = normalizedDate(left);
      const rightDate = normalizedDate(right);
      if (leftDate && rightDate && leftDate !== rightDate) return leftDate.localeCompare(rightDate);
      if (leftDate && !rightDate) return -1;
      if (!leftDate && rightDate) return 1;
      return String(left.adapter_event_key || left.event_id || '').localeCompare(String(right.adapter_event_key || right.event_id || ''));
    });

  return {
    schemaVersion: 'layer4-history-v3',
    parcel: {
      parcelId: model.parcelId,
      identityClass: model.identityClass,
      primaryStatus: summary.primaryStatus,
      landUse: summary.landUse,
      cellId: summary.cellId,
      locality: summary.locality
    },
    currentAuthoritative: currentStatePayload(model.states.currentAuthoritative),
    historicalStates: model.states.historical.map(historicalStatePayload).filter(Boolean),
    proposedChange: proposedStatePayload(model.states.proposed),
    lineage: {
      parents: model.lineage?.parents || [],
      children: model.lineage?.children || [],
      incomingEdges: model.lineage?.incomingEdges || [],
      outgoingEdges: model.lineage?.outgoingEdges || [],
      edges: model.lineage?.edges || []
    },
    events
  };
}


let geometryResourceCount = 0;
for (const record of adapter.tables.geometryVersions) {
  const geometryId = record.geometry_id ? String(record.geometry_id).trim() : '';
  const geometryWkt = record.geometry_wkt ? String(record.geometry_wkt).trim() : '';
  if (!geometryId || !geometryWkt) continue;
  const area = record.area_sqm === '' || record.area_sqm === null || record.area_sqm === undefined
    ? null
    : Number(record.area_sqm);
  const payload = {
    schemaVersion: 'layer4-geometry-v1',
    geometryId,
    parcelId: record.canonical_parcel_id || null,
    version: record.version_label || null,
    effectiveDate: record.effective_date || null,
    geometryStatus: record.geometry_status || null,
    sourceType: record.source_type || null,
    areaSqM: Number.isFinite(area) ? area : null,
    changeReason: record.change_reason || null,
    acceptedStatus: record.accepted_status || null,
    supersedesGeometryId: record.supersedes_geometry_id || null,
    crs: record.crs || null,
    geometryWkt
  };
  fs.writeFileSync(path.join(geometryOutputRoot, `${encodeURIComponent(geometryId)}.json`), JSON.stringify(payload));
  geometryResourceCount += 1;
}

const summaries = [];
for (const parcel of adapter.listParcels()) {
  const model = adapter.getParcelModel(parcel.parcelId);
  if (!model) continue;

  const current = model.states.currentAuthoritative;
  const retired = model.states.historical.find((state) => state.stateScope === 'RETIRED_PARCEL') || null;
  const latest = latestMeaningfulEvent(model.events);
  const lineage = lineageSummary(model.lineage);
  const sourceIds = [...new Set(model.sourceProvenance.map((record) => record.sourceParcelId).filter(Boolean))].sort();

  const summary = {
    parcelId: model.parcelId,
    identityClass: model.identityClass,
    primaryStatus: uiPrimaryStatus(model),
    rawRecordStatus: current?.recordStatus || retired?.recordStatus || null,
    stateMarkers: stateMarkers(model),
    landUse: current?.landUse || null,
    cellId: current?.cellId || retired?.cellId || parcel.cellId || null,
    locality: current?.locality || parcel.locality || null,
    sourceParcelIds: sourceIds,
    historyTypes: historyTypes(model.events),
    latestMeaningfulEvent: latest ? {
      type: latest.event_type,
      subtype: latest.event_subtype || null,
      date: normalizedDate(latest),
      description: latest.description || null
    } : null,
    lineage
  };

  summaries.push(summary);
  fs.writeFileSync(
    path.join(parcelOutputRoot, `${encodeURIComponent(model.parcelId)}.json`),
    JSON.stringify(historyDetailPayload(model, summary))
  );
}

summaries.sort((left, right) => left.parcelId.localeCompare(right.parcelId, undefined, { numeric: true }));

const uniqueSorted = (items) => [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const index = {
  generatedFrom: 'PRAMAN Layer 4 data contract',
  counts: {
    totalIdentities: summaries.length,
    currentCanonical: summaries.filter((row) => row.identityClass === 'ACTIVE_CANONICAL').length,
    historicalRetired: summaries.filter((row) => row.identityClass === 'HISTORICAL_RETIRED').length
  },
  facets: {
    statuses: uniqueSorted(summaries.flatMap((row) => row.stateMarkers)),
    landUses: uniqueSorted(summaries.map((row) => row.landUse)),
    cells: uniqueSorted(summaries.map((row) => row.cellId)),
    historyTypes: uniqueSorted(summaries.flatMap((row) => row.historyTypes))
  },
  parcels: summaries
};

fs.writeFileSync(path.join(outputRoot, 'index.json'), JSON.stringify(index));
console.log(JSON.stringify({ counts: index.counts, facets: index.facets, geometryResourceCount, outputRoot }, null, 2));
