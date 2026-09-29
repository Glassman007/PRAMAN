const uniq = (values) => [...new Set(values.filter(Boolean))];

function countBy(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row) || 'UNSPECIFIED';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function safeJson(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return { __raw: raw, __parseError: true }; }
}

function same(a, b) { return String(a ?? '') === String(b ?? ''); }

function sourceNamespace(source, normalized) {
  if (!source || !normalized) return null;
  return {
    sourceId: source.source_id,
    sourceType: source.source_type,
    sourceRecordId: normalized.source_record_id,
    sourceParcelId: normalized.source_parcel_id,
    // Deterministic application-side display key. It does not claim to be a stored dataset identifier.
    displayKey: `${source.source_id}::${normalized.source_record_id}`
  };
}

function buildNormalizationObservationModelUncached(layer, observationId) {
  if (!layer?.tables) throw new Error('buildNormalizationObservationModel requires the evidence data layer');
  const normalized = layer.tables.matchingInput.find((row) => row.observation_id === observationId) ?? null;
  if (!normalized) return { found: false, observationId };

  const observation = layer.tables.sourceObservations.find((row) => row.observation_id === observationId) ?? null;
  const geometry = layer.tables.sourceGeometries.find((row) => row.geometry_id === normalized.geometry_id) ?? null;
  const source = layer.tables.sourceMetadata.find((row) => row.source_type === normalized.source_type) ?? null;
  const schema = layer.tables.sourceSchema.find((row) => row.source_type === normalized.source_type) ?? null;
  const sourceSpecific = safeJson(normalized.source_specific_details);

  const transformations = [];
  if (geometry) {
    transformations.push({
      key: 'crs-reference-frame',
      label: 'CRS / reference-frame normalization',
      supported: true,
      changed: !same(geometry.original_crs, geometry.normalized_crs),
      before: geometry.original_crs || null,
      after: geometry.normalized_crs || null,
      evidence: 'SOURCE_GEOMETRIES.original_crs → normalized_crs',
      method: geometry.normalization_method || null
    });
    transformations.push({
      key: 'geometry-representation',
      label: 'Geometry representation normalization',
      supported: true,
      changed: !same(geometry.original_geometry_wkt, geometry.normalized_geometry_wkt),
      before: geometry.original_geometry_wkt || null,
      after: geometry.normalized_geometry_wkt || null,
      evidence: 'SOURCE_GEOMETRIES.original_geometry_wkt → normalized_geometry_wkt',
      method: geometry.normalization_method || null
    });
  }

  transformations.push({
    key: 'units',
    label: 'Units normalization / explicit measurement units',
    supported: true,
    changed: null,
    before: 'Original source-unit conversion is not separately stored.',
    after: {
      observedAreaSqm: geometry?.observedAreaSqm ?? normalized.observedArea ?? null,
      positionalAccuracyM: normalized.positionalAccuracyM ?? geometry?.positionalAccuracyM ?? null
    },
    evidence: 'SOURCE_GEOMETRIES.observed_area_sqm + MATCHING_INPUT_VIEW.positional_accuracy_m',
    method: 'The normalized evidence exposes area/accuracy in explicit metric fields; no unsupported raw-unit conversion is inferred.'
  });

  transformations.push({
    key: 'identifiers',
    label: 'Identifier normalization / source namespace preservation',
    supported: true,
    changed: null,
    before: {
      sourceRecordId: normalized.source_record_id || null,
      sourceParcelId: normalized.source_parcel_id || null
    },
    after: sourceNamespace(source, normalized),
    evidence: 'SOURCE_METADATA.source_id/source_type + MATCHING_INPUT_VIEW.source_record_id/source_parcel_id',
    method: 'Original identifiers remain visible; PRAMAN can display them in a deterministic source namespace without replacing the source identity.'
  });

  transformations.push({
    key: 'schema',
    label: 'Field names / schema normalization',
    supported: true,
    changed: null,
    before: {
      sourceType: normalized.source_type,
      sourceSpecificDetails: sourceSpecific,
      schemaKeys: String(schema?.source_specific_keys ?? '').split(';').map((v) => v.trim()).filter(Boolean)
    },
    after: {
      commonFields: [
        'observation_id', 'source_type', 'source_record_id', 'source_parcel_id', 'owner_name', 'address', 'land_use',
        'geometry_id', 'observed_area', 'observation_date', 'source_reliability', 'geometry_confidence',
        'attribute_confidence', 'temporal_freshness', 'identifier_confidence', 'positional_accuracy_m'
      ],
      sourceSpecificDetails: sourceSpecific
    },
    evidence: 'SOURCE_SPECIFIC_SCHEMA + MATCHING_INPUT_VIEW',
    method: 'Source-specific fields are retained while common evidence fields are exposed in a shared comparison schema. The dataset does not store a field-by-field raw-to-normalized mapping.'
  });

  transformations.push({
    key: 'temporal',
    label: 'Dates / timestamps normalization',
    supported: true,
    changed: null,
    before: observation?.observation_date || normalized.observation_date || null,
    after: normalized.observation_date || null,
    evidence: 'SOURCE_OBSERVATIONS.observation_date + MATCHING_INPUT_VIEW.observation_date',
    method: 'The comparable observation date is preserved. No alternative raw date string/format is supplied, so no format conversion is fabricated.'
  });

  transformations.push({
    key: 'uncertainty',
    label: 'Positional uncertainty and quality propagation',
    supported: true,
    changed: null,
    before: {
      sourceReliability: source?.reliability === '' || source?.reliability == null ? null : Number(source.reliability),
      nominalAccuracy: source?.nominal_accuracy || null,
      geometryQualityFlag: geometry?.geometry_quality_flag || null
    },
    after: {
      sourceReliability: normalized.sourceReliability,
      geometryConfidence: normalized.geometryConfidence,
      attributeConfidence: normalized.attributeConfidence,
      temporalFreshness: normalized.temporalFreshness,
      identifierConfidence: normalized.identifierConfidence,
      positionalAccuracyM: normalized.positionalAccuracyM
    },
    evidence: 'SOURCE_METADATA + SOURCE_GEOMETRIES + MATCHING_INPUT_VIEW',
    method: 'Quality and uncertainty remain explicit dimensions rather than being collapsed into a single confidence value.'
  });

  return {
    found: true,
    observationId,
    source: source ? {
      sourceId: source.source_id,
      sourceName: source.source_name,
      sourceType: source.source_type,
      authority: source.authority,
      acquisitionDate: source.acquisition_date,
      declaredCrs: source.CRS,
      nominalAccuracy: source.nominal_accuracy,
      reliability: source.reliability === '' || source.reliability == null ? null : Number(source.reliability)
    } : null,
    before: {
      availability: 'Partial source-side state only; raw per-source record files are not included.',
      sourceRecordId: normalized.source_record_id || null,
      sourceParcelId: normalized.source_parcel_id || null,
      sourceSpecificDetails: sourceSpecific,
      observationDate: observation?.observation_date || normalized.observation_date || null,
      geometry: geometry ? {
        geometryId: geometry.geometry_id,
        crs: geometry.original_crs || null,
        wkt: geometry.original_geometry_wkt || null,
        observedAreaSqm: geometry.observedAreaSqm,
        positionalAccuracyM: geometry.positionalAccuracyM
      } : null
    },
    transformations,
    normalized: {
      record: normalized,
      namespace: sourceNamespace(source, normalized),
      geometry: geometry ? {
        geometryId: geometry.geometry_id,
        crs: geometry.normalized_crs || null,
        wkt: geometry.normalized_geometry_wkt || null,
        observedAreaSqm: geometry.observedAreaSqm,
        positionalAccuracyM: geometry.positionalAccuracyM,
        qualityFlag: geometry.geometry_quality_flag || null,
        normalizationMethod: geometry.normalization_method || null
      } : null,
      provenance: {
        originalSourceRecordId: normalized.source_record_id || null,
        sourceId: source?.source_id || null,
        sourceType: normalized.source_type,
        sourceGeometryId: normalized.geometry_id || null,
        originalSourceStatePreserved: true
      }
    }
  };
}

function buildGlobalNormalizationModelUncached(layer) {
  if (!layer?.tables) throw new Error('buildGlobalNormalizationModel requires the evidence data layer');
  const normalizedRows = layer.tables.matchingInput;
  const normalizedIds = normalizedRows.map((row) => row.observation_id).filter(Boolean);
  const sourceObservationIds = new Set(layer.tables.sourceObservations.map((row) => row.observation_id));
  const geometryById = new Map(layer.tables.sourceGeometries.map((row) => [row.geometry_id, row]));

  let crsChangedObservationCount = 0;
  let geometryChangedObservationCount = 0;
  let geometryResolvedObservationCount = 0;
  const originalCrs = [];
  const normalizedCrs = [];
  const qualityFlags = [];
  const normalizationMethods = [];

  for (const row of normalizedRows) {
    const geometry = geometryById.get(row.geometry_id);
    if (!geometry) continue;
    geometryResolvedObservationCount += 1;
    originalCrs.push(geometry.original_crs);
    normalizedCrs.push(geometry.normalized_crs);
    qualityFlags.push(geometry.geometry_quality_flag);
    normalizationMethods.push(geometry.normalization_method);
    if (!same(geometry.original_crs, geometry.normalized_crs)) crsChangedObservationCount += 1;
    if (!same(geometry.original_geometry_wkt, geometry.normalized_geometry_wkt)) geometryChangedObservationCount += 1;
  }

  const bySource = countBy(normalizedRows, (row) => row.source_type);
  const sourceModels = layer.tables.sourceMetadata.map((source) => {
    const rows = normalizedRows.filter((row) => row.source_type === source.source_type);
    return {
      sourceId: source.source_id,
      sourceName: source.source_name || source.source_type,
      sourceType: source.source_type,
      normalizedObservationIds: rows.map((row) => row.observation_id),
      normalizedObservationCount: rows.length
    };
  }).filter((row) => row.normalizedObservationCount > 0);

  return {
    nodeId: 'cluster:normalization:global-evidence-space',
    label: 'PRAMAN Normalized Evidence Space',
    subtitle: 'Comparable evidence with original source provenance preserved',
    normalizedObservationIds: normalizedIds,
    normalizedObservationCount: normalizedRows.length,
    sourceObservationCoverageCount: normalizedIds.filter((id) => sourceObservationIds.has(id)).length,
    sourceDatasetCount: sourceModels.length,
    sourceTypes: uniq(normalizedRows.map((row) => row.source_type)),
    bySource,
    sources: sourceModels,
    geometryResolvedObservationCount,
    crsChangedObservationCount,
    geometryChangedObservationCount,
    originalCrsDistribution: countBy(originalCrs, (value) => value),
    normalizedCrsDistribution: countBy(normalizedCrs, (value) => value),
    geometryQualityFlags: countBy(qualityFlags, (value) => value),
    normalizationMethods: countBy(normalizationMethods, (value) => value),
    dimensions: [
      { key: 'crs-reference-frame', label: 'CRS / reference frame', evidence: 'SOURCE_GEOMETRIES original_crs/normalized_crs + normalization_method' },
      { key: 'units', label: 'Units', evidence: 'observed_area_sqm + positional_accuracy_m; raw unit-conversion metadata is not separately stored' },
      { key: 'identifiers', label: 'Identifiers', evidence: 'source_record_id + source_parcel_id + source_id/source_type namespace' },
      { key: 'schema', label: 'Field names / schema', evidence: 'SOURCE_SPECIFIC_SCHEMA + MATCHING_INPUT_VIEW common fields + source_specific_details' },
      { key: 'temporal', label: 'Dates / timestamps', evidence: 'observation_date and source acquisition/temporal metadata' },
      { key: 'geometry', label: 'Geometry representation', evidence: 'original_geometry_wkt → normalized_geometry_wkt' },
      { key: 'uncertainty', label: 'Positional uncertainty', evidence: 'positional_accuracy_m + reliability/confidence dimensions' },
      { key: 'namespace', label: 'Source namespaces', evidence: 'SOURCE_METADATA.source_id/source_type + logical source record IDs' }
    ],
    preservation: {
      sourceStatePreserved: true,
      rawSourceRecordFilesAvailable: false,
      rawSourceRecordNote: 'Raw per-source source-record files are not included. The graph preserves the supplied source record IDs, source-specific details, original source geometry and provenance links.',
      identityRule: 'Normalized observations retain the same observation_id as their source evidence record; normalization adds a comparable representation rather than replacing source provenance.'
    }
  };
}

const globalNormalizationModelCache = new WeakMap();
export function buildGlobalNormalizationModel(layer) {
  if (globalNormalizationModelCache.has(layer)) return globalNormalizationModelCache.get(layer);
  const value = buildGlobalNormalizationModelUncached(layer);
  globalNormalizationModelCache.set(layer, value);
  return value;
}

const normalizationObservationCache = new WeakMap();
export function buildNormalizationObservationModel(layer, observationId) {
  let byId = normalizationObservationCache.get(layer);
  if (!byId) { byId = new Map(); normalizationObservationCache.set(layer, byId); }
  if (!byId.has(observationId)) byId.set(observationId, buildNormalizationObservationModelUncached(layer, observationId));
  return byId.get(observationId);
}
