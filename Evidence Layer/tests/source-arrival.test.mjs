import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import { createReplayProjector } from '../src/evidence-graph/replay/index.mjs';
import { buildSourceArrivalModels } from '../src/evidence-graph/replay/sourceArrival.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataset = path.join(root, 'public', 'PRAMAN_DATA');
const loadLayer = () => loadEvidenceGraphDataLayerFromDirectory(dataset, { strict: false });

function ids(rows) { return new Set(rows.map((row) => row.observation_id)); }

test('Source operation renders exactly one source cluster per actual SOURCE_METADATA record', async () => {
  const layer = await loadLayer();
  const stage = createReplayProjector(layer, { mode: 'run' }).project(0);
  assert.equal(stage.nodes.length, layer.tables.sourceMetadata.length);
  assert.equal(stage.edges.length, 0);
  assert.equal(stage.nodes.every((node) => node.entityType === 'SourceDataset'), true);
  assert.equal(stage.nodes.some((node) => node.entityType === 'SourceObservation'), false);
  assert.deepEqual(
    new Set(stage.nodes.map((node) => node.data.details.sourceType)),
    new Set(layer.tables.sourceMetadata.map((row) => row.source_type))
  );
});

test('every source cluster exposes the exact source-observation membership and count', async () => {
  const layer = await loadLayer();
  const stage = createReplayProjector(layer, { mode: 'run' }).project(0);
  for (const node of stage.nodes) {
    const sourceType = node.data.details.sourceType;
    const observations = layer.tables.sourceObservations.filter((row) => row.source_type === sourceType);
    assert.equal(node.count, observations.length);
    assert.equal(node.metric.label, 'SOURCE OBSERVATIONS');
    assert.equal(node.metric.value, observations.length);
    assert.deepEqual(new Set(node.memberRecordIds), ids(observations));
    assert.equal(node.datasetRecordId, node.sourceId);
    assert.equal(node.metadataRef.table, 'SOURCE_METADATA');
  }
});

test('source nature and source inspector metadata are deterministic from production tables', async () => {
  const layer = await loadLayer();
  const models = buildSourceArrivalModels(layer);
  const geometryIds = new Set(layer.tables.sourceGeometries.map((row) => row.geometry_id));
  assert.equal(models.length, layer.tables.sourceMetadata.length);
  for (const model of models) {
    const observations = layer.tables.sourceObservations.filter((row) => row.source_type === model.sourceType);
    const spatial = observations.filter((row) => row.geometry_id && geometryIds.has(row.geometry_id)).length;
    assert.equal(model.spatialObservationCount, spatial);
    assert.equal(model.observationCount, observations.length);
    assert.equal(model.adapter.executionRecordsAvailable, false);
    assert.equal(model.adapter.executionCount, 0);
    assert.equal(model.adapter.processingProfileAvailable, layer.tables.sourceSchema.some((row) => row.source_type === model.sourceType));
    assert.ok(model.reliability === null || Number.isFinite(model.reliability));
    assert.ok(model.observationDateStart);
    assert.ok(model.observationDateEnd);
  }
});

test('source inspector states unavailable adapter execution and dataset version instead of fabricating them', () => {
  const source = fs.readFileSync(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  assert.match(source, /No execution identity recorded/);
  assert.match(source, /Dataset version<\/dt><dd>Not supplied/);
  assert.match(source, /SOURCE DATASET/);
  assert.match(source, /source observations/);
});
