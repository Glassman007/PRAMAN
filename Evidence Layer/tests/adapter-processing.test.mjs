import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import {
  ADAPTER_DEFINITIONS,
  buildAdapterProcessingModels,
  buildActiveAdapterProcessingModels,
  createReplayProjector
} from '../src/evidence-graph/replay/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataset = path.join(root, 'public', 'PRAMAN_DATA');
const loadLayer = () => loadEvidenceGraphDataLayerFromDirectory(dataset, { strict: false });
const ids = (rows, field = 'observation_id') => new Set(rows.map((row) => row[field]).filter(Boolean));

const expectedRoutes = new Map([
  ['Document Ingestion', new Set(['CADASTRAL_REVENUE', 'MUNICIPAL_PROPERTY', 'DDA_DEVELOPMENT_AUTHORITY'])],
  ['Image Observation', new Set(['DRONE_ORTHOPHOTO'])],
  ['Surface / 3D Observation', new Set()],
  ['Survey Observation', new Set(['GNSS_CORS_SURVEY'])],
  ['Parcel / Spatial-Unit', new Set(['CADASTRAL_REVENUE', 'MUNICIPAL_PROPERTY', 'DDA_DEVELOPMENT_AUTHORITY', 'BUILDING_GIS', 'UTILITY_INFRASTRUCTURE'])],
  ['Administrative / Legal Record', new Set(['CADASTRAL_REVENUE', 'MUNICIPAL_PROPERTY', 'DDA_DEVELOPMENT_AUTHORITY'])],
  ['Context Feature', new Set(['CADASTRAL_REVENUE', 'MUNICIPAL_PROPERTY', 'BUILDING_GIS', 'UTILITY_INFRASTRUCTURE'])]
]);

test('adapter registry contains the seven PRAMAN conceptual families with explicit non-vague processing', () => {
  assert.equal(ADAPTER_DEFINITIONS.length, 7);
  assert.deepEqual(new Set(ADAPTER_DEFINITIONS.map((adapter) => adapter.name)), new Set(expectedRoutes.keys()));
  for (const adapter of ADAPTER_DEFINITIONS) {
    assert.ok(adapter.input.length > 20);
    assert.ok(adapter.processing.length > 20);
    assert.ok(adapter.output.length > 20);
    assert.ok(adapter.transformations.length >= 4);
    assert.equal(adapter.transformations.some((step) => /^normalization$/i.test(step.trim())), false, `${adapter.name} has a vague normalization-only step`);
  }
});

test('current source types route to the architecture-defined adapters and may fan out', async () => {
  const layer = await loadLayer();
  const models = buildAdapterProcessingModels(layer);
  assert.equal(models.length, 7);
  const existingTypes = new Set(layer.tables.sourceMetadata.map((row) => row.source_type));
  for (const model of models) {
    assert.deepEqual(new Set(model.sourceTypes), expectedRoutes.get(model.adapterName));
    for (const sourceType of model.sourceTypes) assert.ok(existingTypes.has(sourceType), `${sourceType} is not a real current source type`);
  }
  const cadastralAdapters = models.filter((model) => model.sourceTypes.includes('CADASTRAL_REVENUE'));
  assert.ok(cadastralAdapters.length > 1, 'combined cadastral/revenue source should fan out to multiple adapters');
});

test('Surface / 3D remains defined but is not rendered when no current surface/point-cloud source exists', async () => {
  const layer = await loadLayer();
  const all = buildAdapterProcessingModels(layer);
  const surface = all.find((model) => model.adapterName === 'Surface / 3D Observation');
  assert.ok(surface);
  assert.equal(surface.active, false);
  assert.equal(surface.recordsProcessed, 0);
  const active = buildActiveAdapterProcessingModels(layer);
  assert.equal(active.some((model) => model.adapterId === surface.adapterId), false);
  assert.equal(active.length, 6);
});

test('processed and successful-output counts are derived from real observation and normalized rows', async () => {
  const layer = await loadLayer();
  const models = buildActiveAdapterProcessingModels(layer);
  const normalizedIds = ids(layer.tables.matchingInput);
  for (const model of models) {
    const expectedObs = layer.tables.sourceObservations.filter((row) => model.sourceTypes.includes(row.source_type));
    assert.equal(model.recordsProcessed, expectedObs.length);
    assert.deepEqual(new Set(model.observationIds), ids(expectedObs));
    const expectedSuccessful = expectedObs.map((row) => row.observation_id).filter((id) => normalizedIds.has(id));
    assert.equal(model.successfulOutputs, expectedSuccessful.length);
    assert.deepEqual(new Set(model.successfulOutputIds), new Set(expectedSuccessful));
    assert.equal(model.outputCoveragePercent, expectedObs.length ? 100 : 0);
    assert.equal(model.executionRecordsAvailable, false);
  }
});

test('quality warnings are real source-geometry flags and quarantine is explicitly unavailable', async () => {
  const layer = await loadLayer();
  for (const model of buildActiveAdapterProcessingModels(layer)) {
    const warningRows = layer.tables.sourceGeometries.filter((row) => model.sourceTypes.includes(row.source_type) && row.geometry_quality_flag && row.geometry_quality_flag !== 'NORMALIZED');
    assert.equal(model.qualityWarningCount, warningRows.length);
    assert.deepEqual(new Set(model.qualityWarningGeometryIds), ids(warningRows, 'geometry_id'));
    assert.equal(model.quarantineAvailable, false);
    assert.equal(model.quarantineCount, null);
    assert.match(model.quarantineNote, /No adapter-level quarantine\/execution table/);
  }
});

test('Adapter operation renders one evidence-backed node per active adapter and source-to-adapter routes', async () => {
  const layer = await loadLayer();
  const active = buildActiveAdapterProcessingModels(layer);
  const projection = createReplayProjector(layer, { mode: 'run' }).project(1);
  const adapterNodes = projection.nodes.filter((node) => node.entityType === 'AdapterConcept');
  const routeEdges = projection.edges.filter((edge) => edge.type === 'ROUTED_TO_ADAPTER');
  assert.equal(adapterNodes.length, active.length);
  assert.equal(adapterNodes.some((node) => node.label === 'Surface / 3D Observation'), false);
  assert.equal(adapterNodes.some((node) => node.entityType === 'AdapterExecution'), false);
  assert.equal(routeEdges.length, active.reduce((sum, model) => sum + model.sourceCount, 0));

  for (const node of adapterNodes) {
    const model = active.find((item) => item.adapterId === node.data.details.adapterId);
    assert.ok(model);
    assert.equal(node.metric.label, 'RECORDS PROCESSED');
    assert.equal(node.metric.value, model.recordsProcessed);
    assert.deepEqual(new Set(node.memberRecordIds), new Set(model.observationIds));
  }

  for (const edge of routeEdges) {
    assert.ok(edge.from.startsWith('cluster:sources:SRC-'));
    assert.ok(edge.to.startsWith('cluster:adapters:'));
    assert.ok(edge.memberRecordIds.length > 0);
  }
  assert.ok(projection.notes.some((item) => /Surface \/ 3D Observation.*not exercised/.test(item.note)));
});

test('Normalization operation continues the real route from adapters into normalized observations', async () => {
  const layer = await loadLayer();
  const projection = createReplayProjector(layer, { mode: 'run' }).project(2);
  const normalizedEdges = projection.edges.filter((edge) => edge.stageId === 'normalization' && edge.type === 'NORMALIZED_TO');
  assert.ok(normalizedEdges.length > 0);
  for (const edge of normalizedEdges) {
    assert.ok(edge.from.startsWith('cluster:adapters:'), edge.from);
    assert.ok(edge.to.startsWith('cluster:normalization:'), edge.to);
    assert.ok(projection.nodes.some((node) => node.id === edge.from));
    assert.ok(projection.nodes.some((node) => node.id === edge.to));
  }
});

test('adapter inspector exposes INPUT, PROCESSING, OUTPUT, explicit transformations, warnings and execution caveat', () => {
  const source = fs.readFileSync(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  assert.match(source, /<h3>INPUT<\/h3>/);
  assert.match(source, /<h3>PROCESSING<\/h3>/);
  assert.match(source, /<h3>OUTPUT<\/h3>/);
  assert.match(source, /Records processed/);
  assert.match(source, /Successful outputs/);
  assert.match(source, /Geometry QC flags/);
  assert.match(source, /Execution log<\/dt><dd>Not recorded in supplied dataset/);

  const adapterSource = fs.readFileSync(path.join(root, 'src/evidence-graph/replay/adapterProcessing.mjs'), 'utf8');
  for (const phrase of ['identifier normalization', 'CRS / reference-frame normalization', 'schema normalization', 'area / units normalization', 'date / temporal normalization']) {
    assert.match(adapterSource, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});
