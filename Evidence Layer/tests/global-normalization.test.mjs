import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import {
  buildGlobalNormalizationModel,
  buildNormalizationObservationModel,
  createReplayProjector
} from '../src/evidence-graph/replay/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataset = path.join(root, 'public', 'PRAMAN_DATA');
const loadLayer = () => loadEvidenceGraphDataLayerFromDirectory(dataset, { strict: false });

function countBy(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row) || 'UNSPECIFIED';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

test('global normalization model is backed by the complete MATCHING_INPUT_VIEW population', async () => {
  const layer = await loadLayer();
  const model = buildGlobalNormalizationModel(layer);
  const normalizedIds = layer.tables.matchingInput.map((row) => row.observation_id);
  const sourceIds = new Set(layer.tables.sourceObservations.map((row) => row.observation_id));
  assert.equal(model.normalizedObservationCount, layer.tables.matchingInput.length);
  assert.deepEqual(new Set(model.normalizedObservationIds), new Set(normalizedIds));
  assert.equal(model.sourceObservationCoverageCount, normalizedIds.filter((id) => sourceIds.has(id)).length);
  assert.equal(model.sourceDatasetCount, layer.tables.sourceMetadata.length);
  assert.equal(model.preservation.sourceStatePreserved, true);
  assert.equal(model.preservation.rawSourceRecordFilesAvailable, false);
});

test('CRS and geometry normalization statistics are recomputed from explicit source geometry before/after fields', async () => {
  const layer = await loadLayer();
  const model = buildGlobalNormalizationModel(layer);
  const geometryById = new Map(layer.tables.sourceGeometries.map((row) => [row.geometry_id, row]));
  let crsChanged = 0;
  let geometryChanged = 0;
  const normalizedCrs = [];
  for (const row of layer.tables.matchingInput) {
    const geometry = geometryById.get(row.geometry_id);
    assert.ok(geometry, `missing geometry ${row.geometry_id}`);
    if (geometry.original_crs !== geometry.normalized_crs) crsChanged += 1;
    if (geometry.original_geometry_wkt !== geometry.normalized_geometry_wkt) geometryChanged += 1;
    normalizedCrs.push(geometry.normalized_crs);
  }
  assert.equal(model.crsChangedObservationCount, crsChanged);
  assert.equal(model.geometryChangedObservationCount, geometryChanged);
  assert.deepEqual(model.normalizedCrsDistribution, countBy(normalizedCrs, (value) => value));
});

test('Normalization operation converges all normalized evidence into one locality-scale evidence space', async () => {
  const layer = await loadLayer();
  const projection = createReplayProjector(layer, { mode: 'run' }).project(2);
  const stage3Nodes = projection.nodes.filter((node) => node.stageId === 'normalization');
  assert.equal(stage3Nodes.length, 1);
  const node = stage3Nodes[0];
  assert.equal(node.data.normalizationSpace, true);
  assert.equal(node.metric.label, 'NORMALIZED OBSERVATIONS');
  assert.equal(node.metric.value, layer.tables.matchingInput.length);
  assert.deepEqual(new Set(node.memberRecordIds), new Set(layer.tables.matchingInput.map((row) => row.observation_id)));
  assert.match(node.subtitle, /source provenance preserved/i);
});

test('adapter outputs converge into the global normalized node without fabricated observation IDs', async () => {
  const layer = await loadLayer();
  const projection = createReplayProjector(layer, { mode: 'run' }).project(2);
  const normalizedNode = projection.nodes.find((node) => node.data?.normalizationSpace);
  assert.ok(normalizedNode);
  const validIds = new Set(layer.tables.matchingInput.map((row) => row.observation_id));
  const edges = projection.edges.filter((edge) => edge.stageId === 'normalization' && edge.type === 'NORMALIZED_TO');
  assert.ok(edges.length > 0);
  for (const edge of edges) {
    assert.equal(edge.to, normalizedNode.id);
    assert.ok(edge.from.startsWith('cluster:adapters:'));
    assert.ok(edge.memberRecordIds.length > 0);
    for (const id of edge.memberRecordIds) assert.ok(validIds.has(id), `fabricated normalized observation ${id}`);
  }
});

test('individual normalization inspection reconstructs actual before, transformations and normalized representation', async () => {
  const layer = await loadLayer();
  const normalized = layer.tables.matchingInput[0];
  const source = layer.tables.sourceMetadata.find((row) => row.source_type === normalized.source_type);
  const geometry = layer.tables.sourceGeometries.find((row) => row.geometry_id === normalized.geometry_id);
  const model = buildNormalizationObservationModel(layer, normalized.observation_id);
  assert.equal(model.found, true);
  assert.equal(model.before.sourceRecordId, normalized.source_record_id);
  assert.equal(model.before.geometry.crs, geometry.original_crs);
  assert.equal(model.normalized.geometry.crs, geometry.normalized_crs);
  assert.equal(model.normalized.record.observation_id, normalized.observation_id);
  assert.equal(model.normalized.provenance.originalSourceRecordId, normalized.source_record_id);
  assert.equal(model.normalized.provenance.originalSourceStatePreserved, true);
  assert.equal(model.normalized.namespace.displayKey, `${source.source_id}::${normalized.source_record_id}`);
  assert.ok(model.transformations.some((item) => item.label === 'CRS / reference-frame normalization'));
  assert.ok(model.transformations.some((item) => item.label === 'Geometry representation normalization'));
  assert.ok(model.transformations.some((item) => item.label === 'Field names / schema normalization'));
  assert.ok(model.transformations.some((item) => item.label === 'Positional uncertainty and quality propagation'));
});

test('normalization inspection does not fabricate raw values or unsupported conversion metadata', async () => {
  const layer = await loadLayer();
  const model = buildNormalizationObservationModel(layer, layer.tables.matchingInput[0].observation_id);
  assert.match(model.before.availability, /raw per-source record files are not included/i);
  const units = model.transformations.find((item) => item.key === 'units');
  const temporal = model.transformations.find((item) => item.key === 'temporal');
  const schema = model.transformations.find((item) => item.key === 'schema');
  assert.match(String(units.before), /not separately stored/i);
  assert.match(temporal.method, /no alternative raw date string\/format is supplied/i);
  assert.match(schema.method, /does not store a field-by-field raw-to-normalized mapping/i);
});

test('dashboard exposes source preservation and before-to-normalized observation inspection', () => {
  const dashboard = fs.readFileSync(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  assert.match(dashboard, /BEFORE · AVAILABLE SOURCE STATE/);
  assert.match(dashboard, /APPLIED \/ REPRESENTED TRANSFORMATIONS/);
  assert.match(dashboard, /NORMALIZED REPRESENTATION/);
  assert.match(dashboard, /Source state is not deleted/);
  assert.match(dashboard, /data-role="normalization-observation-form"/);
  assert.match(dashboard, /buildNormalizationObservationModel/);

  const renderer = fs.readFileSync(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs'), 'utf8');
  assert.match(renderer, /NORMALIZED EVIDENCE/);
  assert.match(renderer, /is-normalization-route/);
});
