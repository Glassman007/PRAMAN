import { deriveGeometryDiscrepancy } from './spatialConflictAnalysis.js';
function present(value) {
  return value !== null && value !== undefined && value !== '';
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!present(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function resolveObservationGeometry(model, observation) {
  if (!observation) return null;
  if (observation.geometry_id) {
    const direct = model.geometryById.get(observation.geometry_id);
    if (direct) return direct;
  }
  return model.geometryByObservationId.get(observation.observation_id) ?? null;
}

function resolveEvidenceGeometry(model, evidence, observation) {
  if (evidence?.geometry_id) {
    const direct = model.geometryById.get(evidence.geometry_id);
    if (direct) return direct;
  }
  return resolveObservationGeometry(model, observation);
}

function resolveConflictSource(model, conflict, side) {
  const isA = side === 'A';
  const sourceType = isA ? conflict.source_a : conflict.source_b;
  const observationId = isA ? conflict.source_a_observation_id : conflict.source_b_observation_id;
  const sourceValue = isA ? conflict.source_a_value : conflict.source_b_value;
  const observation = observationId ? model.observationById.get(observationId) ?? null : null;
  let geometry = resolveObservationGeometry(model, observation);
  if (!geometry && present(sourceValue)) geometry = model.geometryById.get(sourceValue) ?? null;

  return {
    side,
    role: `SOURCE_${side}`,
    sourceType,
    sourceValue,
    observation,
    geometry,
    metadata: sourceType ? model.sourceMetadataByType.get(sourceType) ?? null : null,
  };
}

function buildEvidenceItems(model, conflict) {
  return (model.evidenceByConflictId.get(conflict.conflict_id) ?? []).map((evidence) => {
    const observation = evidence.observation_id
      ? model.observationById.get(evidence.observation_id) ?? null
      : null;
    const geometry = resolveEvidenceGeometry(model, evidence, observation);
    const sourceType = evidence.source_type ?? observation?.source_type ?? null;
    const metadata = sourceType ? model.sourceMetadataByType.get(sourceType) ?? null : null;

    return {
      evidence,
      observation,
      geometry,
      sourceType,
      metadata,
    };
  });
}

function buildSourceGroups(conflict, sourceA, sourceB, evidenceItems) {
  const orderedSourceTypes = [];
  for (const sourceType of [sourceA.sourceType, sourceB.sourceType, ...evidenceItems.map((item) => item.sourceType)]) {
    if (present(sourceType) && !orderedSourceTypes.includes(sourceType)) orderedSourceTypes.push(sourceType);
  }

  return orderedSourceTypes.map((sourceType) => {
    const sourceEvidence = evidenceItems.filter((item) => item.sourceType === sourceType);
    const observations = uniqueBy(
      [
        sourceA.sourceType === sourceType ? sourceA.observation : null,
        sourceB.sourceType === sourceType ? sourceB.observation : null,
        ...sourceEvidence.map((item) => item.observation),
      ].filter(Boolean),
      (observation) => observation.observation_id
    );

    const roles = [];
    if (sourceA.sourceType === sourceType) roles.push('SOURCE_A');
    if (sourceB.sourceType === sourceType) roles.push('SOURCE_B');
    for (const item of sourceEvidence) {
      const role = item.evidence.evidence_role;
      if (present(role) && !roles.includes(role)) roles.push(role);
    }

    const conflictValues = [];
    if (sourceA.sourceType === sourceType && present(sourceA.sourceValue)) {
      conflictValues.push({ label: 'Source A value', value: sourceA.sourceValue });
    }
    if (sourceB.sourceType === sourceType && present(sourceB.sourceValue)) {
      conflictValues.push({ label: 'Source B value', value: sourceB.sourceValue });
    }

    return {
      sourceType,
      roles,
      metadata: modelMetadata(sourceA, sourceB, sourceType, sourceEvidence),
      observations,
      evidenceItems: sourceEvidence,
      conflictValues,
    };
  });
}

function modelMetadata(sourceA, sourceB, sourceType, evidenceItems) {
  if (sourceA.sourceType === sourceType && sourceA.metadata) return sourceA.metadata;
  if (sourceB.sourceType === sourceType && sourceB.metadata) return sourceB.metadata;
  return evidenceItems.find((item) => item.metadata)?.metadata ?? null;
}

function geometryRoleForEvidence(item, sourceA, sourceB) {
  const role = String(item.evidence.evidence_role ?? '').toUpperCase();
  if (role === 'SOURCE_A' || item.sourceType === sourceA.sourceType && item.observation?.observation_id === sourceA.observation?.observation_id) {
    return 'source-a';
  }
  if (role === 'SOURCE_B' || item.sourceType === sourceB.sourceType && item.observation?.observation_id === sourceB.observation?.observation_id) {
    return 'source-b';
  }
  return 'additional';
}

function buildGeometryEntries(parcelCase, sourceA, sourceB, evidenceItems) {
  const candidates = [];

  if (sourceA.geometry?.normalizedGeometry) {
    candidates.push({
      key: `source-a:${sourceA.geometry.geometry_id}`,
      geometryId: sourceA.geometry.geometry_id,
      label: sourceA.sourceType ?? 'Source A',
      detail: 'Source A geometry',
      role: 'source-a',
      geometry: sourceA.geometry.normalizedGeometry,
      crs: sourceA.geometry.normalized_crs ?? null,
      sourceType: sourceA.sourceType ?? null,
    });
  }
  if (sourceB.geometry?.normalizedGeometry) {
    candidates.push({
      key: `source-b:${sourceB.geometry.geometry_id}`,
      geometryId: sourceB.geometry.geometry_id,
      label: sourceB.sourceType ?? 'Source B',
      detail: 'Source B geometry',
      role: 'source-b',
      geometry: sourceB.geometry.normalizedGeometry,
      crs: sourceB.geometry.normalized_crs ?? null,
      sourceType: sourceB.sourceType ?? null,
    });
  }

  for (const item of evidenceItems) {
    if (!item.geometry?.normalizedGeometry) continue;
    const role = geometryRoleForEvidence(item, sourceA, sourceB);
    candidates.push({
      key: `${role}:${item.geometry.geometry_id}`,
      geometryId: item.geometry.geometry_id,
      label: item.sourceType ?? item.evidence.evidence_role ?? 'Evidence geometry',
      detail: item.evidence.evidence_role ?? 'Additional evidence',
      role,
      geometry: item.geometry.normalizedGeometry,
      crs: item.geometry.normalized_crs ?? null,
      sourceType: item.sourceType ?? null,
    });
  }

  const authoritative = parcelCase.currentGeometry ?? parcelCase.historicalGeometry ?? null;
  if (authoritative?.geometry) {
    candidates.push({
      key: `authoritative:${authoritative.geometry_id}`,
      geometryId: authoritative.geometry_id,
      label: parcelCase.isHistorical ? 'Historical parcel geometry' : 'Current authoritative geometry',
      detail: authoritative.geometry_status ?? authoritative.version_label ?? 'Parcel geometry',
      role: parcelCase.isHistorical ? 'historical' : 'authoritative',
      geometry: authoritative.geometry,
      crs: authoritative.crs ?? null,
      sourceType: authoritative.source_type ?? null,
    });
  }

  return uniqueBy(candidates, (entry) => entry.key);
}

function isSpatialConflict(conflict, evidenceItems) {
  const terms = [
    conflict.attribute_or_geometry,
    conflict.conflict_type,
    ...evidenceItems.map((item) => item.evidence.attribute_name),
  ].filter(Boolean).join(' ').toLowerCase();
  return /(geometry|boundary|footprint|occupation|spatial|survey|encroachment)/.test(terms);
}

export function buildConflictInvestigation(model, parcelCase, conflict) {
  if (!conflict) return null;
  const sourceA = resolveConflictSource(model, conflict, 'A');
  const sourceB = resolveConflictSource(model, conflict, 'B');
  const evidenceItems = buildEvidenceItems(model, conflict);
  const sourceGroups = buildSourceGroups(conflict, sourceA, sourceB, evidenceItems);
  const geometryEntries = buildGeometryEntries(parcelCase, sourceA, sourceB, evidenceItems);
  const geometryDiscrepancy = isSpatialConflict(conflict, evidenceItems)
    ? deriveGeometryDiscrepancy(geometryEntries)
    : null;

  return {
    conflict,
    sourceA,
    sourceB,
    evidenceItems,
    sourceGroups,
    geometryEntries,
    hasGeometry: geometryEntries.length > 0,
    isSpatialConflict: isSpatialConflict(conflict, evidenceItems),
    geometryDiscrepancy,
  };
}

export function hasPresentValue(value) {
  return present(value);
}
