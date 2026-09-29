const list = (value) => String(value ?? '').split(';').map((v) => v.trim()).filter(Boolean);

function minMax(values) {
  const rows = values.filter(Boolean).sort();
  return { start: rows[0] ?? null, end: rows.at(-1) ?? null };
}

function ratio(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function deriveSpatialNature(observations, knownGeometryIds) {
  if (!observations.length) return { label: 'No source observations', spatialObservationCount: 0, coveragePercent: 0 };
  const spatialObservationCount = observations.filter((row) => row.geometry_id && knownGeometryIds.has(row.geometry_id)).length;
  const coveragePercent = ratio(spatialObservationCount, observations.length);
  if (spatialObservationCount === 0) return { label: 'Non-spatial', spatialObservationCount, coveragePercent };
  if (spatialObservationCount === observations.length) return { label: 'Spatially referenced', spatialObservationCount, coveragePercent };
  return { label: 'Partially spatially referenced', spatialObservationCount, coveragePercent };
}

function buildSourceArrivalModelsUncached(layer) {
  if (!layer?.tables) throw new Error('buildSourceArrivalModels requires the evidence data layer');
  const knownGeometryIds = new Set(layer.tables.sourceGeometries.map((row) => row.geometry_id));
  const schemaByType = new Map(layer.tables.sourceSchema.map((row) => [row.source_type, row]));
  const observationsByType = new Map();
  for (const row of layer.tables.sourceObservations) {
    if (!observationsByType.has(row.source_type)) observationsByType.set(row.source_type, []);
    observationsByType.get(row.source_type).push(row);
  }

  return layer.tables.sourceMetadata.map((source) => {
    const observations = observationsByType.get(source.source_type) ?? [];
    const schema = schemaByType.get(source.source_type) ?? null;
    const dates = minMax(observations.map((row) => row.observation_date));
    const spatial = deriveSpatialNature(observations, knownGeometryIds);
    return {
      sourceId: source.source_id,
      sourceName: source.source_name || source.source_type,
      sourceType: source.source_type,
      authority: source.authority || null,
      observationIds: observations.map((row) => row.observation_id).filter(Boolean),
      observationCount: observations.length,
      spatialNature: spatial.label,
      spatialObservationCount: spatial.spatialObservationCount,
      spatialCoveragePercent: spatial.coveragePercent,
      reliability: source.reliability === '' || source.reliability == null ? null : Number(source.reliability),
      nominalAccuracy: source.nominal_accuracy || null,
      crs: source.CRS || null,
      acquisitionDate: source.acquisition_date || null,
      temporalCurrency: source.temporal_currency || null,
      updateFrequency: source.update_frequency || null,
      observationDateStart: dates.start,
      observationDateEnd: dates.end,
      schema: schema ? {
        profileId: schema.source_type,
        purpose: schema.purpose || null,
        sourceSpecificKeys: list(schema.source_specific_keys),
        requiredKeys: list(schema.required_keys),
        historicalNullableKeys: list(schema.historical_nullable_keys),
        lifecycleMetadataFields: list(schema.lifecycle_metadata_fields)
      } : null,
      adapter: {
        executionRecordsAvailable: false,
        executionCount: 0,
        processingProfileAvailable: Boolean(schema),
        processingProfileId: schema?.source_type ?? null,
        caution: layer.entityAvailability?.AdapterExecution?.reason ?? 'Adapter execution identity is not available in the supplied dataset.'
      }
    };
  });
}

const sourceArrivalModelCache = new WeakMap();
export function buildSourceArrivalModels(layer) {
  if (sourceArrivalModelCache.has(layer)) return sourceArrivalModelCache.get(layer);
  const value = buildSourceArrivalModelsUncached(layer);
  sourceArrivalModelCache.set(layer, value);
  return value;
}
