'use strict';

const fs = require('fs');
const path = require('path');

const EVENT_CLASSES = Object.freeze([
  'SURVEY_OBSERVATION',
  'GEOMETRY_CHANGE',
  'OFFICIAL_APPROVAL',
  'MUTATION',
  'SPLIT',
  'MERGE',
  'CONFLICT',
  'ADMINISTRATIVE_METADATA'
]);

const FILES = Object.freeze({
  sourceMetadata: '1 Source_inputs/SOURCE_METADATA.csv',
  sourceObservations: '4 Matching/SOURCE_OBSERVATIONS.csv',
  conflicts: '5 Conflicts/CONFLICTS.csv',
  conflictEvidence: '5 Conflicts/CONFLICT_EVIDENCE.csv',
  reconciledParcels: '6 Reconciliation/RECONCILED_PARCELS.csv',
  canonicalParcels: '7 Authoritative_state/CANONICAL_PARCELS.csv',
  geometryVersions: '7 Authoritative_state/GEOMETRY_VERSIONS.csv',
  historicalParcels: '8 History/HISTORICAL_PARCELS.csv',
  parcelLineage: '8 History/PARCEL_LINEAGE.csv',
  geogitEvents: '8 History/GEOGIT_EVENTS.csv'
});

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

function normalizeNumber(value) {
  const text = normalizeText(value);
  if (text === null) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function normalizeBoolean(value) {
  const text = normalizeText(value);
  if (text === null) return null;
  if (/^true$/i.test(text)) return true;
  if (/^false$/i.test(text)) return false;
  return null;
}

function parseJson(value) {
  const text = normalizeText(value);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseList(value) {
  const text = normalizeText(value);
  if (text === null) return [];
  if (text.startsWith('[')) {
    const parsed = parseJson(text);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeText).filter(Boolean);
    }
  }
  return text.split(';').map(normalizeText).filter(Boolean);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }

  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }

  const [rawHeaders = [], ...records] = rows;
  const headers = rawHeaders.map((header, index) => (
    index === 0 ? header.replace(/^\uFEFF/, '') : header
  ));

  return records
    .filter((record) => record.some((cell) => cell !== ''))
    .map((record) => Object.fromEntries(
      headers.map((header, index) => [header, record[index] ?? ''])
    ));
}

function looksLikeDatasetRoot(candidate) {
  return Boolean(candidate)
    && fs.existsSync(path.join(candidate, FILES.canonicalParcels))
    && fs.existsSync(path.join(candidate, FILES.geogitEvents));
}

function resolveDatasetRoot(explicitRoot) {
  const candidates = [
    explicitRoot,
    process.env.PRAMAN_DATASET_DIR,
    path.resolve(__dirname, '../../dataset/PRAMAN_DATA'),
    path.resolve(__dirname, '../dataset/PRAMAN_DATA'),
    path.resolve(__dirname, 'dataset/PRAMAN_DATA'),
    path.resolve(__dirname, 'PRAMAN_DATA')
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (looksLikeDatasetRoot(resolved)) return resolved;
  }

  throw new Error(
    'PRAMAN Layer 4 dataset not found. Pass { datasetRoot } or set PRAMAN_DATASET_DIR to the PRAMAN_DATA directory.'
  );
}

function readCsv(root, relativePath) {
  return parseCsv(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function indexOne(records, key) {
  return new Map(records.map((record) => [normalizeText(record[key]), record]).filter(([id]) => id));
}

function indexMany(records, key) {
  const index = new Map();
  records.forEach((record) => {
    const id = normalizeText(record[key]);
    if (!id) return;
    if (!index.has(id)) index.set(id, []);
    index.get(id).push(record);
  });
  return index;
}

function pickGeometry(record) {
  if (!record) return null;
  return {
    geometryId: normalizeText(record.geometry_id),
    parcelId: normalizeText(record.canonical_parcel_id),
    version: normalizeText(record.version_label),
    effectiveDate: normalizeText(record.effective_date),
    geometryStatus: normalizeText(record.geometry_status),
    sourceType: normalizeText(record.source_type),
    areaSqM: normalizeNumber(record.area_sqm),
    changeReason: normalizeText(record.change_reason),
    acceptedStatus: normalizeText(record.accepted_status),
    supersedesGeometryId: normalizeText(record.supersedes_geometry_id),
    geometryWkt: normalizeText(record.geometry_wkt),
    crs: normalizeText(record.crs)
  };
}

function sortByDateThenKey(a, b) {
  const aDate = a.recorded_date || a.effective_date || '';
  const bDate = b.recorded_date || b.effective_date || '';
  if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate);
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;
  return String(a.adapter_event_key || '').localeCompare(String(b.adapter_event_key || ''));
}

function geogitClass(eventType) {
  switch (eventType) {
    case 'PROPOSAL_ACCEPTED':
      return 'OFFICIAL_APPROVAL';
    case 'PROPOSAL_REJECTED':
      // A rejection is an official decision, but not an approval/acceptance.
      // Keep the detailed subtype and REJECTED authority status without rendering it as green approval.
      return 'ADMINISTRATIVE_METADATA';
    case 'MUTATION_RECORDED':
    case 'ROLLBACK':
      return 'MUTATION';
    case 'SPLIT':
      return 'SPLIT';
    case 'MERGE':
      return 'MERGE';
    case 'CONFLICT_DETECTED':
      return 'CONFLICT';
    default:
      return 'ADMINISTRATIVE_METADATA';
  }
}

function authorityFromGeoGit(eventType) {
  if (eventType === 'PROPOSAL_ACCEPTED') return 'ACCEPTED';
  if (eventType === 'PROPOSAL_REJECTED') return 'REJECTED';
  return null;
}

function reviewFromGeoGit(record) {
  if (record.event_type === 'HUMAN_REVIEW') return 'HUMAN_REVIEW';
  return null;
}

function lineageSemanticClass(eventType) {
  if (eventType === 'SPLIT' || eventType === 'CROSS_CELL_SPLIT') return 'SPLIT';
  if (eventType === 'MERGE' || eventType === 'CROSS_CELL_MERGE' || eventType === 'REDEVELOPMENT_CONSOLIDATION') return 'MERGE';
  return null;
}

class Layer4HistoryLineageAdapter {
  constructor(options = {}) {
    this.datasetRoot = resolveDatasetRoot(options.datasetRoot);
    this.tables = Object.fromEntries(
      Object.entries(FILES).map(([key, relativePath]) => [key, readCsv(this.datasetRoot, relativePath)])
    );

    this.canonicalById = indexOne(this.tables.canonicalParcels, 'canonical_parcel_id');
    this.historicalById = indexOne(this.tables.historicalParcels, 'canonical_parcel_id');
    this.geometryById = indexOne(this.tables.geometryVersions, 'geometry_id');
    this.geometriesByParcel = indexMany(this.tables.geometryVersions, 'canonical_parcel_id');
    this.reconciledById = indexOne(this.tables.reconciledParcels, 'canonical_parcel_id');
    this.geogitByParcel = indexMany(this.tables.geogitEvents, 'parcel_id');
    this.conflictsByParcel = indexMany(this.tables.conflicts, 'canonical_parcel_id');
    this.observationsByParcel = indexMany(this.tables.sourceObservations, 'candidate_canonical_parcel_id');
    this.conflictEvidenceByConflict = indexMany(this.tables.conflictEvidence, 'conflict_id');
    this.lineageByParent = indexMany(this.tables.parcelLineage, 'parent_parcel_id');
    this.lineageByChild = indexMany(this.tables.parcelLineage, 'child_parcel_id');
  }

  listParcels() {
    const active = this.tables.canonicalParcels.map((row) => ({
      parcelId: normalizeText(row.canonical_parcel_id),
      registryState: 'CURRENT_AUTHORITATIVE',
      recordStatus: normalizeText(row.parcel_status),
      cellId: normalizeText(row.cell_id),
      locality: normalizeText(row.locality)
    }));
    const historical = this.tables.historicalParcels.map((row) => ({
      parcelId: normalizeText(row.canonical_parcel_id),
      registryState: 'HISTORICAL',
      recordStatus: normalizeText(row.record_status),
      cellId: normalizeText(row.cell_id),
      locality: null
    }));
    return [...active, ...historical];
  }

  getCurrentAuthoritativeState(parcelId) {
    const id = normalizeText(parcelId);
    const parcel = this.canonicalById.get(id);
    if (!parcel) return null;

    const geometry = this.geometryById.get(normalizeText(parcel.current_geometry_id));
    if (!geometry) {
      throw new Error(`Canonical parcel ${id} references missing current geometry ${parcel.current_geometry_id}.`);
    }
    if (normalizeText(geometry.geometry_status) !== 'AUTHORITATIVE' || normalizeText(geometry.accepted_status) !== 'ACCEPTED') {
      throw new Error(`Canonical parcel ${id} current geometry is not explicitly authoritative and accepted.`);
    }

    const currentVersion = normalizeText(parcel.canonical_state_version);
    const latestCanonicalUpdate = (this.geogitByParcel.get(id) || [])
      .filter((event) => event.event_type === 'CANONICAL_STATE_UPDATED' && normalizeText(event.resulting_version) === currentVersion)
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0] || null;

    const conflicts = this.getConflicts(id);
    const openConflicts = conflicts.filter((conflict) => normalizeText(conflict.status) === 'OPEN');

    return {
      stateType: 'CURRENT_AUTHORITATIVE',
      parcelId: id,
      parcelVersion: currentVersion,
      acceptedParcelVersion: currentVersion,
      authoritativeGeometryVersion: normalizeText(parcel.authoritative_geometry_version),
      effectiveDate: latestCanonicalUpdate ? normalizeText(latestCanonicalUpdate.timestamp) : null,
      lastOfficialChange: latestCanonicalUpdate ? {
        eventId: normalizeText(latestCanonicalUpdate.event_id),
        timestamp: normalizeText(latestCanonicalUpdate.timestamp),
        source: normalizeText(latestCanonicalUpdate.source),
        reason: normalizeText(latestCanonicalUpdate.reason),
        resultingVersion: normalizeText(latestCanonicalUpdate.resulting_version)
      } : null,
      recordStatus: normalizeText(parcel.parcel_status),
      authorityStatus: 'AUTHORITATIVE',
      owner: normalizeText(parcel.owner_entity),
      ownershipCategory: normalizeText(parcel.ownership_category),
      tenureType: normalizeText(parcel.tenure_type),
      landUse: normalizeText(parcel.land_use),
      propertyType: normalizeText(parcel.property_type),
      areaSqM: normalizeNumber(parcel.area_sqm),
      builtUpAreaSqM: normalizeNumber(parcel.built_up_area_sqm),
      cellId: normalizeText(parcel.cell_id),
      locality: normalizeText(parcel.locality),
      municipalWard: normalizeText(parcel.municipal_ward),
      specialCondition: normalizeText(parcel.special_condition),
      geometry: pickGeometry(geometry),
      openConflictStatus: openConflicts.length ? 'OPEN' : 'NONE_OPEN',
      openConflictCount: openConflicts.length,
      openConflictIds: openConflicts.map((conflict) => conflict.conflictId),
      sourceTable: 'CANONICAL_PARCELS'
    };
  }

  getHistoricalStates(parcelId) {
    const id = normalizeText(parcelId);
    const historical = this.historicalById.get(id);
    const states = [];

    if (historical) {
      const geometry = this.geometryById.get(normalizeText(historical.historical_geometry_id));
      const creation = (this.geogitByParcel.get(id) || [])
        .filter((event) => event.event_type === 'PARCEL_CREATED')
        .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))[0] || null;

      states.push({
        stateType: 'HISTORICAL',
        stateScope: 'RETIRED_PARCEL',
        parcelId: id,
        parcelVersion: creation ? normalizeText(creation.resulting_version) : null,
        geometryVersion: geometry ? normalizeText(geometry.version_label) : null,
        effectiveDate: geometry ? normalizeText(geometry.effective_date) : null,
        retiredDate: normalizeText(historical.retired_date),
        recordStatus: normalizeText(historical.record_status),
        lineageStatus: normalizeText(historical.lineage_status),
        authorityStatus: geometry ? normalizeText(geometry.accepted_status) : null,
        owner: normalizeText(historical.former_owner),
        landUse: null,
        areaSqM: geometry ? normalizeNumber(geometry.area_sqm) : null,
        cellId: normalizeText(historical.cell_id),
        locality: null,
        retirementReason: normalizeText(historical.retirement_reason),
        geometry: pickGeometry(geometry),
        sourceTable: 'HISTORICAL_PARCELS'
      });
    }

    const geometryVersions = this.geometriesByParcel.get(id) || [];
    geometryVersions
      .filter((record) => record.geometry_status === 'SUPERSEDED')
      .forEach((record) => {
        const successor = geometryVersions.find((candidate) => (
          normalizeText(candidate.supersedes_geometry_id) === normalizeText(record.geometry_id)
          && candidate.geometry_status === 'AUTHORITATIVE'
          && candidate.accepted_status === 'ACCEPTED'
        ));
        states.push({
          stateType: 'HISTORICAL',
          stateScope: 'GEOMETRY_ONLY',
          parcelId: id,
          parcelVersion: null,
          geometryVersion: normalizeText(record.version_label),
          effectiveDate: normalizeText(record.effective_date),
          retiredDate: successor ? normalizeText(successor.effective_date) : null,
          recordStatus: 'SUPERSEDED_GEOMETRY',
          lineageStatus: null,
          authorityStatus: normalizeText(record.accepted_status),
          owner: null,
          landUse: null,
          areaSqM: normalizeNumber(record.area_sqm),
          cellId: null,
          locality: null,
          retirementReason: successor ? normalizeText(successor.change_reason) : null,
          geometry: pickGeometry(record),
          sourceTable: 'GEOMETRY_VERSIONS'
        });
      });

    return states.sort((a, b) => String(a.effectiveDate || '').localeCompare(String(b.effectiveDate || '')));
  }

  getReconciliationRecord(parcelId) {
    const id = normalizeText(parcelId);
    const reconciliation = this.reconciledById.get(id);
    if (!reconciliation) return null;

    const proposal = parseJson(reconciliation.proposed_state);
    const authority = parseJson(reconciliation.authoritative_state);
    const proposalStateMarker = normalizeText(proposal?.state);
    const authorityMarker = normalizeText(authority?.state);

    let proposalDisposition = null;
    if (proposalStateMarker === 'REJECTED') proposalDisposition = 'REJECTED';
    else if (authorityMarker === 'UNCHANGED_PENDING') proposalDisposition = 'PENDING';
    else if (authorityMarker === 'AUTHORITATIVE') proposalDisposition = 'NO_LONGER_PENDING';

    return {
      parcelId: id,
      recordStatus: normalizeText(reconciliation.record_status),
      lineageStatus: normalizeText(reconciliation.lineage_status),
      matchStatus: normalizeText(reconciliation.match_status),
      criticalityLevel: normalizeText(reconciliation.criticality_level),
      criticalityReason: normalizeText(reconciliation.criticality_reason),
      parentParcelIds: parseList(reconciliation.parent_parcel_ids),
      childParcelIds: parseList(reconciliation.child_parcel_ids),
      proposedState: proposal,
      authoritativeState: authority,
      authoritativeStateMarker: authorityMarker,
      proposalDisposition,
      requiresHumanReview: normalizeBoolean(reconciliation.requires_human_review),
      unresolvedConflictIds: parseList(reconciliation.unresolved_conflicts),
      reconciliationTimestamp: normalizeText(reconciliation.reconciliation_timestamp),
      benchmarkCaseIds: parseList(reconciliation.benchmark_case_ids),
      sourceTable: 'RECONCILED_PARCELS'
    };
  }

  getProposedState(parcelId) {
    const record = this.getReconciliationRecord(parcelId);
    if (!record || !record.proposedState) return null;

    // A proposal remains a proposal only while it is pending or when the retained
    // dataset explicitly records that the proposal was rejected. A proposal whose
    // authoritative state marker is AUTHORITATIVE is no longer a pending proposal;
    // current authority still comes exclusively from CANONICAL_PARCELS + accepted
    // authoritative geometry, never from this reconciliation JSON.
    if (!['PENDING', 'REJECTED'].includes(record.proposalDisposition)) return null;

    const proposal = record.proposedState;
    const geometryId = normalizeText(proposal.geometry_id);
    const geometryRecord = geometryId ? this.geometryById.get(geometryId) : null;
    const proposalGeometry = geometryRecord
      && ['PROPOSED', 'REJECTED'].includes(normalizeText(geometryRecord.geometry_status))
      ? pickGeometry(geometryRecord)
      : null;
    const disposition = record.proposalDisposition;

    return {
      stateType: 'PROPOSED',
      parcelId: record.parcelId,
      proposalDisposition: disposition,
      authorityStatus: disposition === 'REJECTED' ? 'NON_AUTHORITATIVE_REJECTED' : 'NON_AUTHORITATIVE_PENDING',
      reviewStatus: disposition === 'REJECTED'
        ? 'REJECTED'
        : (record.requiresHumanReview ? 'AWAITING_REVIEW' : 'PENDING'),
      reconciliationStatus: record.matchStatus,
      reconciliationTimestamp: record.reconciliationTimestamp,
      criticalityLevel: record.criticalityLevel,
      reason: record.criticalityReason,
      requiresHumanReview: record.requiresHumanReview,
      unresolvedConflictIds: record.unresolvedConflictIds,
      benchmarkCaseIds: record.benchmarkCaseIds,
      owner: normalizeText(proposal.owner),
      landUse: normalizeText(proposal.land_use),
      areaSqM: normalizeNumber(proposal.area_sqm),
      geometryId,
      geometryReferenceStatus: geometryRecord ? normalizeText(geometryRecord.geometry_status) : null,
      geometryReferenceAcceptedStatus: geometryRecord ? normalizeText(geometryRecord.accepted_status) : null,
      recordStatus: normalizeText(proposal.record_status),
      children: Array.isArray(proposal.children) ? proposal.children.map(normalizeText).filter(Boolean) : [],
      geometry: proposalGeometry,
      sourceTable: 'RECONCILED_PARCELS'
    };
  }

  getLineage(parcelId) {
    const id = normalizeText(parcelId);
    const incoming = this.lineageByChild.get(id) || [];
    const outgoing = this.lineageByParent.get(id) || [];

    const mapEdge = (row) => ({
      lineageEventId: normalizeText(row.lineage_event_id),
      semanticType: lineageSemanticClass(normalizeText(row.event_type)),
      eventSubtype: normalizeText(row.event_type),
      parentParcelId: normalizeText(row.parent_parcel_id),
      childParcelId: normalizeText(row.child_parcel_id),
      effectiveDate: normalizeText(row.effective_date),
      reason: normalizeText(row.reason),
      source: normalizeText(row.source),
      authorityStatus: normalizeText(row.accepted_status)
    });

    const parentEdges = incoming.map(mapEdge);
    const childEdges = outgoing.map(mapEdge);

    return {
      parcelId: id,
      parents: [...new Set(parentEdges.map((edge) => edge.parentParcelId).filter(Boolean))],
      children: [...new Set(childEdges.map((edge) => edge.childParcelId).filter(Boolean))],
      incomingEdges: parentEdges,
      outgoingEdges: childEdges,
      edges: [...parentEdges, ...childEdges]
    };
  }

  normalizeGeoGitEvents(parcelId) {
    const id = normalizeText(parcelId);
    const conflicts = this.conflictsByParcel.get(id) || [];
    const lineageRows = [
      ...(this.lineageByParent.get(id) || []),
      ...(this.lineageByChild.get(id) || [])
    ];

    return (this.geogitByParcel.get(id) || []).map((record) => {
      let eventType = geogitClass(normalizeText(record.event_type));
      let subtype = normalizeText(record.event_type);
      let parentParcels = [];
      let childParcels = [];

      if (eventType === 'SPLIT' || eventType === 'MERGE') {
        const related = normalizeText(record.related_parcel_ids);
        const date = normalizeText(record.timestamp)?.slice(0, 10) || null;
        const matchingLineage = lineageRows.filter((edge) => {
          const sameDate = normalizeText(edge.effective_date) === date;
          if (!sameDate) return false;
          if (eventType === 'SPLIT') {
            return normalizeText(edge.parent_parcel_id) === id
              && (!related || normalizeText(edge.child_parcel_id) === related);
          }
          return normalizeText(edge.parent_parcel_id) === id
            && (!related || normalizeText(edge.child_parcel_id) === related);
        });
        if (matchingLineage.length) {
          subtype = normalizeText(matchingLineage[0].event_type) || subtype;
          parentParcels = [...new Set(matchingLineage.map((edge) => normalizeText(edge.parent_parcel_id)).filter(Boolean))];
          childParcels = [...new Set(matchingLineage.map((edge) => normalizeText(edge.child_parcel_id)).filter(Boolean))];
        } else if (related) {
          if (eventType === 'SPLIT') {
            parentParcels = [id];
            childParcels = [related];
          } else {
            parentParcels = [id];
            childParcels = [related];
          }
        }
      }

      const parcelConflicts = record.event_type === 'CONFLICT_DETECTED'
        ? conflicts.map((conflict) => normalizeText(conflict.conflict_id)).filter(Boolean)
        : [];

      return {
        adapter_event_key: `GEOGIT_EVENTS:${normalizeText(record.event_id)}`,
        event_id: normalizeText(record.event_id),
        parcel_id: id,
        event_type: eventType,
        event_subtype: subtype,
        effective_date: null,
        recorded_date: normalizeText(record.timestamp),
        source: normalizeText(record.source),
        source_record_id: normalizeText(record.event_id),
        geometry_version_before: null,
        geometry_version_after: null,
        parcel_version_before: normalizeText(record.previous_version),
        parcel_version_after: normalizeText(record.resulting_version),
        authority_status: authorityFromGeoGit(record.event_type),
        review_status: reviewFromGeoGit(record),
        related_conflict_id: parcelConflicts.length === 1 ? parcelConflicts[0] : null,
        related_conflict_ids: parcelConflicts,
        related_commit_id: null,
        related_geogit_event_id: normalizeText(record.event_id),
        related_parent_parcels: parentParcels,
        related_child_parcels: childParcels,
        description: normalizeText(record.reason),
        actor_type: normalizeText(record.actor_type),
        source_table: 'GEOGIT_EVENTS'
      };
    });
  }

  normalizeLineageEvents(parcelId) {
    const id = normalizeText(parcelId);
    const rows = [
      ...(this.lineageByParent.get(id) || []),
      ...(this.lineageByChild.get(id) || [])
    ];

    return rows.map((row) => {
      const eventClass = lineageSemanticClass(normalizeText(row.event_type));
      const parentId = normalizeText(row.parent_parcel_id);
      const childId = normalizeText(row.child_parcel_id);
      const effectiveDate = normalizeText(row.effective_date);
      const matchingGeoGit = (this.geogitByParcel.get(parentId) || []).find((event) => (
        ['SPLIT', 'MERGE'].includes(normalizeText(event.event_type))
        && normalizeText(event.timestamp)?.slice(0, 10) === effectiveDate
        && normalizeText(event.related_parcel_ids) === childId
      ));

      return {
        adapter_event_key: `PARCEL_LINEAGE:${normalizeText(row.lineage_event_id)}:${id}`,
        event_id: normalizeText(row.lineage_event_id),
        parcel_id: id,
        event_type: eventClass,
        event_subtype: normalizeText(row.event_type),
        effective_date: effectiveDate,
        recorded_date: matchingGeoGit ? normalizeText(matchingGeoGit.timestamp) : null,
        source: normalizeText(row.source),
        source_record_id: normalizeText(row.lineage_event_id),
        geometry_version_before: null,
        geometry_version_after: null,
        parcel_version_before: matchingGeoGit ? normalizeText(matchingGeoGit.previous_version) : null,
        parcel_version_after: matchingGeoGit ? normalizeText(matchingGeoGit.resulting_version) : null,
        authority_status: normalizeText(row.accepted_status),
        review_status: null,
        related_conflict_id: null,
        related_conflict_ids: [],
        related_commit_id: null,
        related_geogit_event_id: matchingGeoGit ? normalizeText(matchingGeoGit.event_id) : null,
        related_parent_parcels: [parentId].filter(Boolean),
        related_child_parcels: [childId].filter(Boolean),
        description: normalizeText(row.reason),
        source_table: 'PARCEL_LINEAGE'
      };
    }).filter((event) => event.event_type);
  }

  normalizeGeometryEvents(parcelId) {
    const id = normalizeText(parcelId);
    // A geometry record is not automatically a geometry-change event.
    // Only versions that explicitly supersede an earlier geometry represent a change.
    return (this.geometriesByParcel.get(id) || [])
      .filter((record) => normalizeText(record.supersedes_geometry_id))
      .map((record) => {
        const beforeGeometry = this.geometryById.get(normalizeText(record.supersedes_geometry_id)) || null;
        return {
          adapter_event_key: `GEOMETRY_VERSIONS:${normalizeText(record.geometry_id)}`,
          event_id: null,
          parcel_id: id,
          event_type: 'GEOMETRY_CHANGE',
          event_subtype: normalizeText(record.source_type),
          effective_date: normalizeText(record.effective_date),
          recorded_date: null,
          source: normalizeText(record.source_type),
          source_record_id: normalizeText(record.geometry_id),
          geometry_version_before: normalizeText(record.supersedes_geometry_id),
          geometry_version_after: normalizeText(record.geometry_id),
          parcel_version_before: null,
          parcel_version_after: null,
          authority_status: normalizeText(record.accepted_status),
          review_status: normalizeText(record.geometry_status) === 'PROPOSED' ? 'PENDING_HUMAN_APPROVAL' : null,
          related_conflict_id: null,
          related_conflict_ids: [],
          related_commit_id: null,
          related_parent_parcels: [],
          related_child_parcels: [],
          description: normalizeText(record.change_reason),
          geometry_status: normalizeText(record.geometry_status),
          geometry: pickGeometry(record),
          geometry_before: pickGeometry(beforeGeometry),
          geometry_after: pickGeometry(record),
          area_before_sqm: beforeGeometry ? normalizeNumber(beforeGeometry.area_sqm) : null,
          area_after_sqm: normalizeNumber(record.area_sqm),
          source_table: 'GEOMETRY_VERSIONS'
        };
      });
  }

  normalizeSurveyObservationEvents(parcelId) {
    const id = normalizeText(parcelId);
    return (this.observationsByParcel.get(id) || [])
      .filter((record) => normalizeText(record.source_type) === 'GNSS_CORS_SURVEY')
      .map((record) => {
        const sourceDetails = parseJson(record.source_specific_details) || {};
        return {
          adapter_event_key: `SOURCE_OBSERVATIONS:${normalizeText(record.observation_id)}`,
          event_id: null,
          parcel_id: id,
          event_type: 'SURVEY_OBSERVATION',
          event_subtype: normalizeText(record.source_type),
          effective_date: normalizeText(record.observation_date),
          recorded_date: normalizeText(record.observation_date),
          source: normalizeText(record.source_type),
          source_record_id: normalizeText(record.source_record_id) || normalizeText(record.observation_id),
          geometry_version_before: null,
          geometry_version_after: null,
          parcel_version_before: null,
          parcel_version_after: null,
          authority_status: null,
          review_status: null,
          related_conflict_id: null,
          related_conflict_ids: [],
          related_commit_id: null,
          related_parent_parcels: [],
          related_child_parcels: [],
          related_lineage_parcels: parseList(record.lineage_reference),
          description: normalizeText(record.notes),
          observation_id: normalizeText(record.observation_id),
          source_parcel_id: normalizeText(record.source_parcel_id),
          owner_name: normalizeText(record.owner_name),
          land_use: normalizeText(record.land_use),
          observation_geometry_id: normalizeText(record.geometry_id),
          observed_area_sqm: normalizeNumber(record.observed_area),
          positional_accuracy_m: normalizeNumber(record.positional_accuracy_m),
          survey_status: normalizeText(record.record_status),
          measurement_crs: normalizeText(sourceDetails.crs),
          surveyor_source: normalizeText(sourceDetails.surveyor_source),
          record_status: normalizeText(record.record_status),
          source_table: 'SOURCE_OBSERVATIONS'
        };
      });
  }

  normalizeConflictFallbackEvents(parcelId, normalizedGeoGit) {
    const id = normalizeText(parcelId);
    const conflicts = this.conflictsByParcel.get(id) || [];
    const covered = new Set(
      normalizedGeoGit
        .filter((event) => event.event_type === 'CONFLICT')
        .flatMap((event) => event.related_conflict_ids || [])
    );

    return conflicts
      .filter((record) => !covered.has(normalizeText(record.conflict_id)))
      .map((record) => ({
        adapter_event_key: `CONFLICTS:${normalizeText(record.conflict_id)}`,
        event_id: null,
        parcel_id: id,
        event_type: 'CONFLICT',
        event_subtype: normalizeText(record.conflict_type),
        effective_date: null,
        recorded_date: null,
        source: [normalizeText(record.source_a), normalizeText(record.source_b)].filter(Boolean).join(' ↔ ') || null,
        source_record_id: normalizeText(record.conflict_id),
        geometry_version_before: null,
        geometry_version_after: null,
        parcel_version_before: null,
        parcel_version_after: null,
        authority_status: null,
        review_status: null,
        related_conflict_id: normalizeText(record.conflict_id),
        related_conflict_ids: [normalizeText(record.conflict_id)].filter(Boolean),
        related_commit_id: null,
        related_parent_parcels: [],
        related_child_parcels: [],
        description: normalizeText(record.explanation),
        conflict_status: normalizeText(record.status),
        human_review_required: normalizeBoolean(record.human_review_required),
        source_table: 'CONFLICTS'
      }));
  }

  getNormalizedEvents(parcelId) {
    const id = normalizeText(parcelId);
    const geogit = this.normalizeGeoGitEvents(id);
    const geogitWithoutLineageDuplicates = geogit.filter((event) => !['SPLIT', 'MERGE'].includes(event.event_type));
    const events = [
      ...geogitWithoutLineageDuplicates,
      ...this.normalizeLineageEvents(id),
      ...this.normalizeGeometryEvents(id),
      ...this.normalizeSurveyObservationEvents(id),
      ...this.normalizeConflictFallbackEvents(id, geogit)
    ];

    const invalid = events.filter((event) => !EVENT_CLASSES.includes(event.event_type));
    if (invalid.length) {
      throw new Error(`Layer 4 adapter produced unsupported event classes for ${id}.`);
    }

    const conflictsById = new Map(this.getConflicts(id).map((conflict) => [conflict.conflictId, conflict]));
    const decorated = events.map((event) => {
      const conflictIds = Array.isArray(event.related_conflict_ids) ? event.related_conflict_ids : [];
      const conflictDetails = conflictIds.map((conflictId) => conflictsById.get(conflictId)).filter(Boolean);
      return {
        ...event,
        conflict_details: conflictDetails
      };
    });
    return decorated.sort(sortByDateThenKey);
  }

  getSourceProvenance(parcelId) {
    const id = normalizeText(parcelId);
    const reconciliation = this.reconciledById.get(id);
    const matchedIds = new Set(parseList(reconciliation?.matched_source_ids));

    return (this.observationsByParcel.get(id) || []).map((record) => ({
      observationId: normalizeText(record.observation_id),
      sourceType: normalizeText(record.source_type),
      sourceRecordId: normalizeText(record.source_record_id),
      sourceParcelId: normalizeText(record.source_parcel_id),
      observationDate: normalizeText(record.observation_date),
      geometryId: normalizeText(record.geometry_id),
      ownerName: normalizeText(record.owner_name),
      landUse: normalizeText(record.land_use),
      observedAreaSqM: normalizeNumber(record.observed_area),
      recordStatus: normalizeText(record.record_status),
      lineageReference: parseList(record.lineage_reference),
      matchedByReconciliation: matchedIds.has(normalizeText(record.observation_id)),
      notes: normalizeText(record.notes)
    }));
  }

  getConflicts(parcelId) {
    const id = normalizeText(parcelId);
    return (this.conflictsByParcel.get(id) || []).map((record) => ({
      conflictId: normalizeText(record.conflict_id),
      conflictType: normalizeText(record.conflict_type),
      status: normalizeText(record.status),
      severity: normalizeText(record.severity),
      criticality: normalizeText(record.criticality),
      attributeOrGeometry: normalizeText(record.attribute_or_geometry),
      sourceA: normalizeText(record.source_a),
      sourceB: normalizeText(record.source_b),
      sourceAValue: normalizeText(record.source_a_value),
      sourceBValue: normalizeText(record.source_b_value),
      explanation: normalizeText(record.explanation),
      recommendedNextEvidence: normalizeText(record.recommended_next_evidence),
      humanReviewRequired: normalizeBoolean(record.human_review_required),
      sourceAObservationId: normalizeText(record.source_a_observation_id),
      sourceBObservationId: normalizeText(record.source_b_observation_id),
      evidence: (this.conflictEvidenceByConflict.get(normalizeText(record.conflict_id)) || []).map((evidence) => ({
        conflictEvidenceId: normalizeText(evidence.conflict_evidence_id),
        observationId: normalizeText(evidence.observation_id),
        evidenceRole: normalizeText(evidence.evidence_role),
        sourceType: normalizeText(evidence.source_type),
        attributeName: normalizeText(evidence.attribute_name),
        observedValue: normalizeText(evidence.observed_value),
        geometryId: normalizeText(evidence.geometry_id),
        temporalRole: normalizeText(evidence.temporal_role),
        supportsOrContradicts: normalizeText(evidence.supports_or_contradicts),
        sourceTable: normalizeText(evidence.source_table)
      }))
    }));
  }

  getVersionReferences(parcelId) {
    const id = normalizeText(parcelId);
    return (this.geogitByParcel.get(id) || []).map((record) => ({
      eventId: normalizeText(record.event_id),
      timestamp: normalizeText(record.timestamp),
      eventType: normalizeText(record.event_type),
      previousVersion: normalizeText(record.previous_version),
      resultingVersion: normalizeText(record.resulting_version),
      source: normalizeText(record.source),
      actorType: normalizeText(record.actor_type)
    }));
  }

  getParcelModel(parcelId) {
    const id = normalizeText(parcelId);
    if (!id || (!this.canonicalById.has(id) && !this.historicalById.has(id))) return null;

    return {
      parcelId: id,
      identityClass: this.canonicalById.has(id) ? 'ACTIVE_CANONICAL' : 'HISTORICAL_RETIRED',
      states: {
        currentAuthoritative: this.getCurrentAuthoritativeState(id),
        historical: this.getHistoricalStates(id),
        proposed: this.getProposedState(id)
      },
      reconciliation: this.getReconciliationRecord(id),
      lineage: this.getLineage(id),
      events: this.getNormalizedEvents(id),
      versionReferences: this.getVersionReferences(id),
      conflicts: this.getConflicts(id),
      sourceProvenance: this.getSourceProvenance(id)
    };
  }

  getAuditMetadata() {
    return {
      datasetRoot: this.datasetRoot,
      files: { ...FILES },
      rowCounts: Object.fromEntries(Object.entries(this.tables).map(([name, rows]) => [name, rows.length])),
      eventClasses: [...EVENT_CLASSES]
    };
  }
}

module.exports = {
  EVENT_CLASSES,
  FILES,
  Layer4HistoryLineageAdapter,
  parseCsv,
  resolveDatasetRoot
};
