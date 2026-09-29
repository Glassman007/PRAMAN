const uniq = (values) => [...new Set(values.filter(Boolean))];

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function countBy(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row) || 'UNSPECIFIED';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}


const adapterModelCache = new WeakMap();
const activeAdapterModelCache = new WeakMap();

function mergeCountObjects(objects) {
  const out = {};
  for (const obj of objects) for (const [key, value] of Object.entries(obj ?? {})) out[key] = (out[key] || 0) + Number(value || 0);
  return out;
}

function percent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * PRAMAN adapter architecture baseline.
 *
 * These are conceptual adapter families defined by the project architecture, not
 * dataset execution records. `sourceTypes` expresses deterministic architecture
 * routing for source types that actually exist in the current synthetic run.
 */
export const ADAPTER_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'document-ingestion',
    name: 'Document Ingestion',
    sourceTypes: Object.freeze(['CADASTRAL_REVENUE', 'MUNICIPAL_PROPERTY', 'DDA_DEVELOPMENT_AUTHORITY']),
    input: 'Revenue, municipal and allotment/registry records that require structured field extraction while preserving the source record identity.',
    processing: 'Parse the source record representation, identify source-specific fields, preserve raw values/provenance, and prepare structured administrative evidence for downstream normalization.',
    output: 'Structured source-record evidence retaining source_record_id, source-specific fields and lifecycle metadata.',
    transformations: Object.freeze([
      'source-field extraction and schema identification',
      'identifier field preparation (plot/khasra/property/allotment identifiers)',
      'date and lifecycle-metadata extraction',
      'units/value parsing without overwriting the original source value',
      'provenance preservation for the original source record'
    ])
  }),
  Object.freeze({
    id: 'image-observation',
    name: 'Image Observation',
    sourceTypes: Object.freeze(['DRONE_ORTHOPHOTO']),
    input: 'Georeferenced drone / orthophoto observations containing recent physical-world evidence.',
    processing: 'Extract image-derived physical features and retain their observation time and geospatial reference for later evidence comparison.',
    output: 'Spatial observations such as detected buildings, boundary evidence, road edges, walls/fences, vegetation, open land and possible encroachment signals.',
    transformations: Object.freeze([
      'image feature / object extraction',
      'boundary, road-edge and wall/fence evidence extraction',
      'vegetation / vacant-land / encroachment feature extraction',
      'imagery timestamp preservation',
      'CRS / reference-frame normalization preparation for extracted image observations'
    ])
  }),
  Object.freeze({
    id: 'surface-3d-observation',
    name: 'Surface / 3D Observation',
    sourceTypes: Object.freeze([]),
    input: 'DSM/DTM, point-cloud or other surface/vertical-complexity observations.',
    processing: 'Derive elevation, surface and vertical-complexity evidence while preserving reference frame and uncertainty.',
    output: 'Surface / 3D observations suitable for high-rise and vertical-complexity reasoning.',
    transformations: Object.freeze([
      'surface/elevation feature extraction',
      'vertical-complexity / high-rise context derivation',
      'height / elevation units normalization preparation',
      'surface reference-frame metadata preservation',
      'quality / uncertainty propagation'
    ])
  }),
  Object.freeze({
    id: 'survey-observation',
    name: 'Survey Observation',
    sourceTypes: Object.freeze(['GNSS_CORS_SURVEY']),
    input: 'GNSS/CORS field-survey observations with surveyed corner points, reference-frame metadata and positional accuracy.',
    processing: 'Interpret survey geometry in its declared reference frame, preserve CORS/survey provenance and propagate positional accuracy.',
    output: 'High-accuracy survey evidence containing surveyed geometry, observed area and uncertainty/accuracy metadata.',
    transformations: Object.freeze([
      'CRS / reference-frame normalization and identification',
      'datum / CORS reference metadata preservation',
      'surveyed-corner geometry preparation',
      'positional-accuracy propagation',
      'area / units normalization preparation'
    ])
  }),
  Object.freeze({
    id: 'parcel-spatial-unit',
    name: 'Parcel / Spatial-Unit',
    sourceTypes: Object.freeze(['CADASTRAL_REVENUE', 'MUNICIPAL_PROPERTY', 'DDA_DEVELOPMENT_AUTHORITY', 'BUILDING_GIS', 'UTILITY_INFRASTRUCTURE']),
    input: 'Existing parcel, municipal, development-authority, building and utility GIS geometries tied to source records.',
    processing: 'Interpret source geometries as parcel/spatial-unit evidence and prepare them for comparison without prematurely changing disputed boundaries.',
    output: 'Parcel/spatial-unit observations with normalized geometry references, source identifiers, area and geometry-quality metadata.',
    transformations: Object.freeze([
      'CRS / reference-frame normalization',
      'geometry normalization and geometry-hygiene checks',
      'area / units normalization',
      'parcel / source-identifier normalization preparation',
      'geometry-quality and positional-accuracy propagation'
    ])
  }),
  Object.freeze({
    id: 'administrative-legal-record',
    name: 'Administrative / Legal Record',
    sourceTypes: Object.freeze(['CADASTRAL_REVENUE', 'MUNICIPAL_PROPERTY', 'DDA_DEVELOPMENT_AUTHORITY']),
    input: 'Revenue, municipal-property and development/allotment records carrying tenure, ownership/use, taxation or administrative state.',
    processing: 'Map source-specific administrative/legal fields into comparable evidence slots while retaining original source values and authority metadata.',
    output: 'Structured administrative/legal observations ready for conflict detection and reconciliation after normalization.',
    transformations: Object.freeze([
      'schema normalization of administrative/legal fields',
      'identifier normalization (plot/property/khasra/allotment references)',
      'name / address normalization preparation',
      'date / temporal normalization preparation',
      'administrative-code and tenure/use-value normalization preparation',
      'source authority and lifecycle metadata preservation'
    ])
  }),
  Object.freeze({
    id: 'context-feature',
    name: 'Context Feature',
    sourceTypes: Object.freeze(['CADASTRAL_REVENUE', 'MUNICIPAL_PROPERTY', 'BUILDING_GIS', 'UTILITY_INFRASTRUCTURE']),
    input: 'Neighbourhood/context layers such as cadastral surroundings, municipal GIS, buildings and utility/easement features.',
    processing: 'Convert surrounding spatial evidence into contextual features that can support parcel matching without being treated as cadastral authority by default.',
    output: 'Context observations for adjacency, building, infrastructure/easement and surrounding spatial evidence.',
    transformations: Object.freeze([
      'context-geometry extraction',
      'CRS / geometry normalization preparation',
      'building / utility / easement feature interpretation',
      'spatial-units normalization',
      'context provenance and source-reliability propagation'
    ])
  })
]);

export function buildAdapterProcessingModels(layer) {
  if (!layer?.tables) throw new Error('buildAdapterProcessingModels requires the evidence data layer');
  const cached = adapterModelCache.get(layer);
  if (cached) return cached;

  const sourceByType = new Map(layer.tables.sourceMetadata.map((row) => [row.source_type, row]));
  const schemaByType = new Map(layer.tables.sourceSchema.map((row) => [row.source_type, row]));
  const observationsByType = groupBy(layer.tables.sourceObservations, (row) => row.source_type);
  const normalizedByType = groupBy(layer.tables.matchingInput, (row) => row.source_type);
  const geometriesByType = groupBy(layer.tables.sourceGeometries, (row) => row.source_type);

  // Source-level metrics are computed once, then reused by every conceptual adapter route.
  // Several source types intentionally route through multiple adapters, so recalculating the
  // same observation/geometry memberships per adapter is unnecessary work.
  const sourceMetricsByType = new Map();
  for (const [sourceType, source] of sourceByType) {
    const observations = observationsByType.get(sourceType) ?? [];
    const normalized = normalizedByType.get(sourceType) ?? [];
    const normalizedIds = new Set(normalized.map((row) => row.observation_id));
    const successfulOutputIds = observations.map((row) => row.observation_id).filter((id) => normalizedIds.has(id));
    const geometries = geometriesByType.get(sourceType) ?? [];
    const warningGeometries = geometries.filter((row) => row.geometry_quality_flag && row.geometry_quality_flag !== 'NORMALIZED');
    const schema = schemaByType.get(sourceType) ?? null;
    sourceMetricsByType.set(sourceType, {
      sourceId: source.source_id,
      sourceName: source.source_name || source.source_type,
      sourceType,
      observationIds: observations.map((row) => row.observation_id).filter(Boolean),
      observationCount: observations.length,
      normalizedOutputIds: successfulOutputIds,
      normalizedOutputCount: successfulOutputIds.length,
      outputCoveragePercent: percent(successfulOutputIds.length, observations.length),
      geometryRecordIds: geometries.map((row) => row.geometry_id).filter(Boolean),
      qualityWarningGeometryIds: warningGeometries.map((row) => row.geometry_id).filter(Boolean),
      qualityWarningCount: warningGeometries.length,
      qualityWarningFlags: countBy(warningGeometries, (row) => row.geometry_quality_flag),
      observationStatusCounts: countBy(observations, (row) => row.record_status),
      schema: schema ? {
        sourceType: schema.source_type,
        purpose: schema.purpose || null,
        requiredKeys: String(schema.required_keys || '').split(';').map((v) => v.trim()).filter(Boolean),
        sourceSpecificKeys: String(schema.source_specific_keys || '').split(';').map((v) => v.trim()).filter(Boolean),
        lifecycleMetadataFields: String(schema.lifecycle_metadata_fields || '').split(';').map((v) => v.trim()).filter(Boolean)
      } : null
    });
  }

  const models = ADAPTER_DEFINITIONS.map((definition) => {
    const routedSourceTypes = definition.sourceTypes.filter((sourceType) => sourceByType.has(sourceType));
    const sources = routedSourceTypes.map((sourceType) => sourceMetricsByType.get(sourceType));
    const observationIds = uniq(sources.flatMap((source) => source.observationIds));
    const normalizedOutputIds = uniq(sources.flatMap((source) => source.normalizedOutputIds));
    const warningGeometryIds = uniq(sources.flatMap((source) => source.qualityWarningGeometryIds));

    return {
      adapterId: definition.id,
      adapterName: definition.name,
      active: observationIds.length > 0,
      architectureDefined: true,
      executionRecordsAvailable: false,
      sourceTypes: routedSourceTypes,
      sources,
      sourceCount: sources.length,
      observationIds,
      recordsProcessed: observationIds.length,
      successfulOutputIds: normalizedOutputIds,
      successfulOutputs: normalizedOutputIds.length,
      outputCoveragePercent: percent(normalizedOutputIds.length, observationIds.length),
      qualityWarningGeometryIds: warningGeometryIds,
      qualityWarningCount: warningGeometryIds.length,
      qualityWarningFlags: mergeCountObjects(sources.map((source) => source.qualityWarningFlags)),
      observationStatusCounts: mergeCountObjects(sources.map((source) => source.observationStatusCounts)),
      quarantineAvailable: false,
      quarantineCount: null,
      quarantineNote: 'No adapter-level quarantine/execution table is present in the supplied production dataset.',
      input: definition.input,
      processing: definition.processing,
      output: definition.output,
      transformations: [...definition.transformations],
      caveat: 'Counts are deterministic coverage over source observations routed by the PRAMAN adapter architecture. They are not adapter-run logs because the dataset stores no adapter execution identity.'
    };
  });
  adapterModelCache.set(layer, models);
  return models;
}

export function buildActiveAdapterProcessingModels(layer) {
  const cached = activeAdapterModelCache.get(layer);
  if (cached) return cached;
  const active = buildAdapterProcessingModels(layer).filter((model) => model.active);
  activeAdapterModelCache.set(layer, active);
  return active;
}
