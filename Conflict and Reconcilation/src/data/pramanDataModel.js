import { geometryBounds, parseWktGeometry } from './geometry.js';

function addGrouped(map, key, value) {
  if (key == null || key === '') return;
  const group = map.get(key);
  if (group) group.push(value);
  else map.set(key, [value]);
}

function uniqueValues(values) {
  return [...new Set(values.filter((value) => value != null && value !== ''))];
}

function buildUniqueIndex(rows, keyField, label, issues) {
  const map = new Map();
  for (const row of rows) {
    const key = row[keyField];
    if (key == null || key === '') continue;
    if (map.has(key)) {
      issues.push({
        level: 'warning',
        code: 'DUPLICATE_INDEX_KEY',
        message: `${label}: duplicate ${keyField} ${key}; the first row remains authoritative in the runtime index.`,
      });
      continue;
    }
    map.set(key, row);
  }
  return map;
}

function buildGroupedIndex(rows, keyField) {
  const map = new Map();
  for (const row of rows) addGrouped(map, row[keyField], row);
  return map;
}

function buildLineageIndex(rows) {
  const map = new Map();
  for (const row of rows) {
    if (row.parent_parcel_id) {
      addGrouped(map, row.parent_parcel_id, {
        event: row,
        role: 'PARENT',
        relatedParcelId: row.child_parcel_id ?? null,
      });
    }
    if (row.child_parcel_id) {
      addGrouped(map, row.child_parcel_id, {
        event: row,
        role: 'CHILD',
        relatedParcelId: row.parent_parcel_id ?? null,
      });
    }
  }
  return map;
}

function normalizeStatus(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function classifyConflictStatus(status) {
  const value = normalizeStatus(status);
  if (!value) return 'unknown';
  if (/(resolved|closed|complete|completed|decided|settled)/.test(value)) return 'resolved';
  if (/(open|pending|unresolved|active|review)/.test(value)) return 'open';
  return 'other';
}

function semanticPriority(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return Number.NEGATIVE_INFINITY;
  if (/(critical|severe|extreme|urgent)/.test(text)) return 4;
  if (/(major|high)/.test(text)) return 3;
  if (/(moderate|medium)/.test(text)) return 2;
  if (/(minor|low)/.test(text)) return 1;
  return 0;
}

function highestDatasetValue(rows, field) {
  let best = null;
  let bestPriority = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const value = row[field];
    if (value == null || value === '') continue;
    const priority = semanticPriority(value);
    if (best == null || priority > bestPriority) {
      best = value;
      bestPriority = priority;
    }
  }
  return best;
}

function countBy(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[field];
    if (value == null || value === '') continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function countConflictsBySource(conflicts) {
  const counts = new Map();
  for (const conflict of conflicts) {
    const sources = new Set([conflict.source_a, conflict.source_b].filter(Boolean));
    for (const source of sources) counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return counts;
}

function sortByTextField(rows, field) {
  return [...rows].sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')));
}

function enrichSourceGeometries(rows, parseIssues) {
  return rows.map((row) => {
    const normalizedGeometry = parseWktGeometry(row.normalized_geometry_wkt);
    const originalGeometry = parseWktGeometry(row.original_geometry_wkt);
    if (row.normalized_geometry_wkt && !normalizedGeometry) {
      parseIssues.push({
        level: 'warning',
        code: 'UNPARSED_NORMALIZED_GEOMETRY',
        message: `SOURCE_GEOMETRIES ${row.geometry_id ?? '(unknown)'} has unsupported/invalid normalized WKT.`,
      });
    }
    if (row.original_geometry_wkt && !originalGeometry) {
      parseIssues.push({
        level: 'warning',
        code: 'UNPARSED_ORIGINAL_GEOMETRY',
        message: `SOURCE_GEOMETRIES ${row.geometry_id ?? '(unknown)'} has unsupported/invalid original WKT.`,
      });
    }
    return {
      ...row,
      originalGeometry,
      normalizedGeometry,
      normalizedGeometryBounds: geometryBounds(normalizedGeometry),
    };
  });
}

function enrichGeometryVersions(rows, parseIssues) {
  return rows.map((row) => {
    const geometry = parseWktGeometry(row.geometry_wkt);
    if (row.geometry_wkt && !geometry) {
      parseIssues.push({
        level: 'warning',
        code: 'UNPARSED_VERSION_GEOMETRY',
        message: `GEOMETRY_VERSIONS ${row.geometry_id ?? '(unknown)'} has unsupported/invalid WKT.`,
      });
    }
    return {
      ...row,
      geometry,
      geometryBounds: geometryBounds(geometry),
    };
  });
}

function buildCases(context) {
  const {
    conflictsByParcelId,
    evidenceByConflictId,
    reconciliationByParcelId,
    canonicalParcelById,
    historicalParcelById,
    geometryVersionById,
    geometryVersionsByParcelId,
    geoGitEventsByParcelId,
    lineageByParcelId,
    rejectedProvenanceByConflictId,
  } = context;

  const cases = [];
  const parcelConflictCaseByParcelId = new Map();

  for (const [parcelId, conflicts] of conflictsByParcelId) {
    const canonicalParcel = canonicalParcelById.get(parcelId) ?? null;
    const historicalParcel = historicalParcelById.get(parcelId) ?? null;
    const reconciliation = reconciliationByParcelId.get(parcelId) ?? null;
    const evidenceRecords = conflicts.flatMap((conflict) => evidenceByConflictId.get(conflict.conflict_id) ?? []);
    const openConflicts = conflicts.filter((conflict) => classifyConflictStatus(conflict.status) === 'open');
    const resolvedConflicts = conflicts.filter((conflict) => classifyConflictStatus(conflict.status) === 'resolved');
    const sourceTypes = uniqueValues([
      ...conflicts.flatMap((conflict) => [conflict.source_a, conflict.source_b]),
      ...evidenceRecords.map((evidence) => evidence.source_type),
    ]);
    const conflictTypes = uniqueValues(conflicts.map((conflict) => conflict.conflict_type));
    const geometryVersions = geometryVersionsByParcelId.get(parcelId) ?? [];
    const currentGeometry = canonicalParcel?.current_geometry_id
      ? geometryVersionById.get(canonicalParcel.current_geometry_id) ?? null
      : null;
    const historicalGeometry = historicalParcel?.historical_geometry_id
      ? geometryVersionById.get(historicalParcel.historical_geometry_id) ?? null
      : null;
    const rejectedProvenance = conflicts
      .map((conflict) => rejectedProvenanceByConflictId.get(conflict.conflict_id))
      .filter(Boolean);

    const conflictReviewRequired = conflicts.some((conflict) => conflict.human_review_required === true);
    const reconciliationReviewRequired = reconciliation?.requires_human_review === true;

    const parcelCase = {
      parcelId,
      parcelKind: canonicalParcel ? 'CURRENT' : historicalParcel ? 'HISTORICAL' : 'UNRESOLVED',
      isCurrent: Boolean(canonicalParcel),
      isHistorical: Boolean(historicalParcel),
      canonicalParcel,
      historicalParcel,
      parcelMetadata: canonicalParcel ?? historicalParcel,
      conflicts,
      openConflicts,
      resolvedConflicts,
      otherStatusConflicts: conflicts.filter((conflict) => classifyConflictStatus(conflict.status) === 'other'),
      sourceTypes,
      evidenceRecords,
      conflictReviewRequired,
      reconciliationReviewRequired,
      humanReviewRequired: conflictReviewRequired || reconciliationReviewRequired,
      highestSeverity: highestDatasetValue(conflicts, 'severity'),
      highestCriticality: highestDatasetValue(conflicts, 'criticality'),
      conflictTypes,
      reconciliation,
      currentGeometry,
      historicalGeometry,
      geometryVersions,
      lineageReferences: lineageByParcelId.get(parcelId) ?? [],
      geoGitEvents: geoGitEventsByParcelId.get(parcelId) ?? [],
      rejectedProvenance,
    };

    cases.push(parcelCase);
    parcelConflictCaseByParcelId.set(parcelId, parcelCase);
  }

  return { cases, parcelConflictCaseByParcelId };
}

function buildAggregates(conflicts, cases, evidenceByConflictId) {
  const openConflicts = conflicts.filter((row) => classifyConflictStatus(row.status) === 'open');
  const resolvedConflicts = conflicts.filter((row) => classifyConflictStatus(row.status) === 'resolved');
  const statusesPresent = uniqueValues(conflicts.map((row) => row.status));
  const severityValuesPresent = uniqueValues(conflicts.map((row) => row.severity));
  const criticalityValuesPresent = uniqueValues(conflicts.map((row) => row.criticality));
  const conflictTypesPresent = uniqueValues(conflicts.map((row) => row.conflict_type));
  const sourceTypesPresent = uniqueValues(conflicts.flatMap((row) => [row.source_a, row.source_b]));
  const conflictCountPerParcel = new Map(cases.map((parcelCase) => [parcelCase.parcelId, parcelCase.conflicts.length]));
  const evidenceCountPerConflict = new Map(
    conflicts.map((conflict) => [conflict.conflict_id, (evidenceByConflictId.get(conflict.conflict_id) ?? []).length])
  );
  const evidenceCountPerParcel = new Map(cases.map((parcelCase) => [parcelCase.parcelId, parcelCase.evidenceRecords.length]));

  return Object.freeze({
    totalConflictRecords: conflicts.length,
    affectedParcelCases: cases.length,
    openConflictRecords: openConflicts.length,
    resolvedConflictRecords: resolvedConflicts.length,
    parcelsWithAtLeastOneOpenConflict: cases.filter((parcelCase) => parcelCase.openConflicts.length > 0).length,
    parcelsRequiringHumanReview: cases.filter((parcelCase) => parcelCase.humanReviewRequired).length,
    conflictTypesPresent,
    severityValuesPresent,
    criticalityValuesPresent,
    statusesPresent,
    sourceTypesPresent,
    conflictCountByType: countBy(conflicts, 'conflict_type'),
    conflictCountBySource: countConflictsBySource(conflicts),
    conflictCountBySeverity: countBy(conflicts, 'severity'),
    conflictCountByCriticality: countBy(conflicts, 'criticality'),
    conflictCountPerParcel,
    evidenceCountPerConflict,
    evidenceCountPerParcel,
  });
}

function makeSelectors(model) {
  const { aggregates } = model;
  return Object.freeze({
    getTotalConflictRecords: () => aggregates.totalConflictRecords,
    getAffectedParcelCases: () => aggregates.affectedParcelCases,
    getOpenConflictRecords: () => aggregates.openConflictRecords,
    getResolvedConflictRecords: () => aggregates.resolvedConflictRecords,
    getParcelsWithAtLeastOneOpenConflict: () => aggregates.parcelsWithAtLeastOneOpenConflict,
    getParcelsRequiringHumanReview: () => aggregates.parcelsRequiringHumanReview,
    getConflictTypesPresent: () => aggregates.conflictTypesPresent,
    getSeverityValuesPresent: () => aggregates.severityValuesPresent,
    getCriticalityValuesPresent: () => aggregates.criticalityValuesPresent,
    getStatusesPresent: () => aggregates.statusesPresent,
    getSourceTypesPresent: () => aggregates.sourceTypesPresent,
    getConflictCountByType: () => aggregates.conflictCountByType,
    getConflictCountBySource: () => aggregates.conflictCountBySource,
    getConflictCountBySeverity: () => aggregates.conflictCountBySeverity,
    getConflictCountByCriticality: () => aggregates.conflictCountByCriticality,
    getConflictCountPerParcel: () => aggregates.conflictCountPerParcel,
    getEvidenceCountPerConflict: () => aggregates.evidenceCountPerConflict,
    getEvidenceCountPerParcel: () => aggregates.evidenceCountPerParcel,
    getParcelConflictCases: () => model.parcelConflictCases,
    getParcelConflictCase: (parcelId) => model.parcelConflictCaseByParcelId.get(parcelId) ?? null,
    getConflict: (conflictId) => model.conflictById.get(conflictId) ?? null,
  });
}

export function buildPramanDataModel(tables) {
  const indexIssues = [];
  const geometryIssues = [];

  const sourceGeometries = enrichSourceGeometries(tables.sourceGeometries ?? [], geometryIssues);
  const geometryVersions = enrichGeometryVersions(tables.geometryVersions ?? [], geometryIssues);

  const conflictById = buildUniqueIndex(tables.conflicts ?? [], 'conflict_id', 'CONFLICTS', indexIssues);
  const conflictsByParcelId = buildGroupedIndex(tables.conflicts ?? [], 'canonical_parcel_id');
  const evidenceByConflictId = buildGroupedIndex(tables.conflictEvidence ?? [], 'conflict_id');
  const observationById = buildUniqueIndex(tables.sourceObservations ?? [], 'observation_id', 'SOURCE_OBSERVATIONS', indexIssues);
  const geometryById = buildUniqueIndex(sourceGeometries, 'geometry_id', 'SOURCE_GEOMETRIES', indexIssues);
  const sourceMetadataByType = buildUniqueIndex(tables.sourceMetadata ?? [], 'source_type', 'SOURCE_METADATA', indexIssues);
  const sourceSchemaByType = buildUniqueIndex(tables.sourceSpecificSchema ?? [], 'source_type', 'SOURCE_SPECIFIC_SCHEMA', indexIssues);
  const reconciliationByParcelId = buildUniqueIndex(tables.reconciledParcels ?? [], 'canonical_parcel_id', 'RECONCILED_PARCELS', indexIssues);
  const canonicalParcelById = buildUniqueIndex(tables.canonicalParcels ?? [], 'canonical_parcel_id', 'CANONICAL_PARCELS', indexIssues);
  const historicalParcelById = buildUniqueIndex(tables.historicalParcels ?? [], 'canonical_parcel_id', 'HISTORICAL_PARCELS', indexIssues);
  const geometryVersionById = buildUniqueIndex(geometryVersions, 'geometry_id', 'GEOMETRY_VERSIONS', indexIssues);
  const geometryVersionsByParcelId = buildGroupedIndex(geometryVersions, 'canonical_parcel_id');
  const geoGitEventsByParcelId = buildGroupedIndex(sortByTextField(tables.geoGitEvents ?? [], 'timestamp'), 'parcel_id');
  const lineageByParcelId = buildLineageIndex(tables.parcelLineage ?? []);
  const rejectedProvenanceByConflictId = buildUniqueIndex(
    tables.conflictsRejectedProvenance ?? [],
    'conflict_id',
    'CONFLICTS_REJECTED_PROVENANCE',
    indexIssues
  );

  const geometryByObservationId = new Map();
  for (const geometry of sourceGeometries) {
    for (const observationId of geometry.observation_ids ?? []) {
      if (!geometryByObservationId.has(observationId)) geometryByObservationId.set(observationId, geometry);
    }
  }

  const base = {
    tables: {
      ...tables,
      sourceGeometries,
      geometryVersions,
    },
    conflictById,
    conflictsByParcelId,
    evidenceByConflictId,
    observationById,
    geometryById,
    geometryByObservationId,
    sourceMetadataByType,
    sourceSchemaByType,
    reconciliationByParcelId,
    canonicalParcelById,
    historicalParcelById,
    geometryVersionById,
    geometryVersionsByParcelId,
    geoGitEventsByParcelId,
    lineageByParcelId,
    rejectedProvenanceByConflictId,
  };

  const { cases, parcelConflictCaseByParcelId } = buildCases(base);
  const aggregates = buildAggregates(tables.conflicts ?? [], cases, evidenceByConflictId);

  const model = {
    ...base,
    parcelConflictCases: cases,
    parcelConflictCaseByParcelId,
    aggregates,
    buildIssues: [...indexIssues, ...geometryIssues],
  };
  model.selectors = makeSelectors(model);
  return model;
}

function addValidationIssue(issues, code, message, context = {}) {
  issues.push({ level: 'warning', code, message, ...context });
}

export function validatePramanDataModel(model) {
  const issues = [...(model.buildIssues ?? [])];
  const {
    tables,
    conflictById,
    observationById,
    geometryById,
    reconciliationByParcelId,
    canonicalParcelById,
    historicalParcelById,
    geometryVersionById,
  } = model;

  for (const evidence of tables.conflictEvidence ?? []) {
    if (evidence.conflict_id && !conflictById.has(evidence.conflict_id)) {
      addValidationIssue(issues, 'MISSING_CONFLICT_FOR_EVIDENCE', `Conflict evidence ${evidence.conflict_evidence_id} references missing conflict ${evidence.conflict_id}.`);
    }
    if (evidence.observation_id && !observationById.has(evidence.observation_id)) {
      addValidationIssue(issues, 'MISSING_OBSERVATION_FOR_EVIDENCE', `Conflict evidence ${evidence.conflict_evidence_id} references missing observation ${evidence.observation_id}.`);
    }
    if (evidence.geometry_id && !geometryById.has(evidence.geometry_id)) {
      addValidationIssue(issues, 'MISSING_GEOMETRY_FOR_EVIDENCE', `Conflict evidence ${evidence.conflict_evidence_id} references missing source geometry ${evidence.geometry_id}.`);
    }
  }

  for (const conflict of tables.conflicts ?? []) {
    for (const [field, observationId] of [
      ['source_a_observation_id', conflict.source_a_observation_id],
      ['source_b_observation_id', conflict.source_b_observation_id],
    ]) {
      if (observationId && !observationById.has(observationId)) {
        addValidationIssue(issues, 'MISSING_CONFLICT_OBSERVATION', `Conflict ${conflict.conflict_id} ${field} references missing observation ${observationId}.`);
      }
    }
    const parcelId = conflict.canonical_parcel_id;
    if (parcelId && !canonicalParcelById.has(parcelId) && !historicalParcelById.has(parcelId)) {
      addValidationIssue(issues, 'UNRESOLVED_CONFLICT_PARCEL', `Conflict ${conflict.conflict_id} references parcel ${parcelId}, which is absent from both current and historical parcel registries.`);
    }
  }

  for (const observation of tables.sourceObservations ?? []) {
    if (observation.geometry_id && !geometryById.has(observation.geometry_id)) {
      addValidationIssue(issues, 'MISSING_OBSERVATION_GEOMETRY', `Observation ${observation.observation_id} references missing source geometry ${observation.geometry_id}.`);
    }
  }

  for (const geometry of tables.sourceGeometries ?? []) {
    for (const observationId of geometry.observation_ids ?? []) {
      if (!observationById.has(observationId)) {
        addValidationIssue(issues, 'MISSING_GEOMETRY_OBSERVATION', `Source geometry ${geometry.geometry_id} references missing observation ${observationId}.`);
      }
    }
  }

  for (const reconciliation of tables.reconciledParcels ?? []) {
    const parcelId = reconciliation.canonical_parcel_id;
    if (!parcelId) continue;
    const current = canonicalParcelById.has(parcelId);
    const historical = historicalParcelById.has(parcelId);
    if (!current && !historical) {
      addValidationIssue(issues, 'UNRESOLVED_RECONCILIATION_PARCEL', `Reconciliation row ${parcelId} resolves to neither CANONICAL_PARCELS nor HISTORICAL_PARCELS.`);
    }
    if (current && historical) {
      addValidationIssue(issues, 'AMBIGUOUS_PARCEL_LIFECYCLE', `Parcel ${parcelId} appears in both current and historical parcel registries.`);
    }

    const lifecycleText = `${reconciliation.record_status ?? ''} ${reconciliation.lineage_status ?? ''}`.toLowerCase();
    const indicatesHistorical = /(histor|retir)/.test(lifecycleText);
    if (indicatesHistorical && !historical) {
      addValidationIssue(issues, 'HISTORICAL_RECONCILIATION_WITHOUT_HISTORY', `Reconciliation row ${parcelId} is marked as historical/retired but has no HISTORICAL_PARCELS record.`);
    }
    if (!indicatesHistorical && !current) {
      addValidationIssue(issues, 'CURRENT_RECONCILIATION_WITHOUT_CANONICAL', `Reconciliation row ${parcelId} is not marked historical/retired but has no CANONICAL_PARCELS record.`);
    }

    for (const observationId of reconciliation.matched_source_ids ?? []) {
      if (!observationById.has(observationId)) {
        addValidationIssue(issues, 'MISSING_RECONCILIATION_OBSERVATION', `Reconciliation row ${parcelId} references missing matched observation ${observationId}.`);
      }
    }
    for (const conflictId of reconciliation.unresolved_conflicts ?? []) {
      if (!conflictById.has(conflictId)) {
        addValidationIssue(issues, 'MISSING_RECONCILIATION_CONFLICT', `Reconciliation row ${parcelId} references missing unresolved conflict ${conflictId}.`);
      }
    }
    for (const relatedParcelId of [...(reconciliation.parent_parcel_ids ?? []), ...(reconciliation.child_parcel_ids ?? [])]) {
      if (!canonicalParcelById.has(relatedParcelId) && !historicalParcelById.has(relatedParcelId)) {
        addValidationIssue(issues, 'MISSING_RECONCILIATION_LINEAGE_PARCEL', `Reconciliation row ${parcelId} references missing related parcel ${relatedParcelId}.`);
      }
    }
    for (const [stateName, state] of [['proposed_state', reconciliation.proposed_state], ['authoritative_state', reconciliation.authoritative_state]]) {
      const geometryId = state && typeof state === 'object' ? state.geometry_id : null;
      if (geometryId && !geometryVersionById.has(geometryId)) {
        addValidationIssue(issues, 'MISSING_RECONCILIATION_GEOMETRY', `Reconciliation row ${parcelId} ${stateName} references missing geometry version ${geometryId}.`);
      }
    }
  }

  for (const parcel of tables.canonicalParcels ?? []) {
    if (parcel.current_geometry_id && !geometryVersionById.has(parcel.current_geometry_id)) {
      addValidationIssue(issues, 'MISSING_CURRENT_GEOMETRY_VERSION', `Current parcel ${parcel.canonical_parcel_id} references missing geometry version ${parcel.current_geometry_id}.`);
    }
  }

  for (const parcel of tables.historicalParcels ?? []) {
    if (parcel.historical_geometry_id && !geometryVersionById.has(parcel.historical_geometry_id)) {
      addValidationIssue(issues, 'MISSING_HISTORICAL_GEOMETRY_VERSION', `Historical parcel ${parcel.canonical_parcel_id} references missing geometry version ${parcel.historical_geometry_id}.`);
    }
  }

  const knownParcelIds = new Set([...canonicalParcelById.keys(), ...historicalParcelById.keys()]);
  for (const lineage of tables.parcelLineage ?? []) {
    if (lineage.parent_parcel_id && !knownParcelIds.has(lineage.parent_parcel_id)) {
      addValidationIssue(issues, 'MISSING_LINEAGE_PARENT', `Lineage event ${lineage.lineage_event_id} references missing parent parcel ${lineage.parent_parcel_id}.`);
    }
    if (lineage.child_parcel_id && !knownParcelIds.has(lineage.child_parcel_id)) {
      addValidationIssue(issues, 'MISSING_LINEAGE_CHILD', `Lineage event ${lineage.lineage_event_id} references missing child parcel ${lineage.child_parcel_id}.`);
    }
  }

  for (const event of tables.geoGitEvents ?? []) {
    if (event.parcel_id && !knownParcelIds.has(event.parcel_id)) {
      addValidationIssue(issues, 'MISSING_GEOGIT_PARCEL', `GeoGit event ${event.event_id} references missing parcel ${event.parcel_id}.`);
    }
  }

  for (const parcelCase of model.parcelConflictCases ?? []) {
    if (!parcelCase.canonicalParcel && !parcelCase.historicalParcel) {
      addValidationIssue(issues, 'UNRESOLVED_CASE_PARCEL', `ParcelConflictCase ${parcelCase.parcelId} has no current or historical parcel metadata.`);
    }
  }

  // This catches unrecognized future status vocabularies without inventing replacements.
  const unclassifiedStatuses = (model.aggregates?.statusesPresent ?? []).filter(
    (status) => classifyConflictStatus(status) === 'other'
  );
  for (const status of unclassifiedStatuses) {
    addValidationIssue(issues, 'UNCLASSIFIED_CONFLICT_STATUS', `Conflict status ${status} is preserved from the dataset but is not classified as open/resolved by runtime semantics.`);
  }

  // Touch the index explicitly so a broken reconciliation index cannot go unnoticed in future edits.
  for (const parcelId of reconciliationByParcelId.keys()) {
    if (!knownParcelIds.has(parcelId)) {
      addValidationIssue(issues, 'RECONCILIATION_INDEX_ORPHAN', `Reconciliation index contains unresolved parcel ${parcelId}.`);
    }
  }

  return issues;
}

export function reportValidationIssues(issues, logger = console) {
  if (!issues.length) {
    logger.info?.('[PRAMAN dataset validation] All configured production relationships resolved successfully.');
    return;
  }

  logger.warn?.(`[PRAMAN dataset validation] ${issues.length} warning(s) detected. No mock fallback has been substituted.`);
  for (const issue of issues) logger.warn?.(`[PRAMAN dataset validation] ${issue.code}: ${issue.message}`);
}
