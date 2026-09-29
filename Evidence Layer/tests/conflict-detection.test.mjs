import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import {
  CONFLICT_CATEGORY_DEFINITIONS,
  buildConflictDetectionModel,
  buildConflictInspectionModel,
  createReplayProjector,
  getConflictCategory
} from '../src/evidence-graph/replay/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataset = path.join(root, 'public', 'PRAMAN_DATA');
const loadLayer = () => loadEvidenceGraphDataLayerFromDirectory(dataset, { strict: false });

function flattenDefinedTypes() {
  return CONFLICT_CATEGORY_DEFINITIONS.flatMap((category) => category.conflictTypes);
}

test('Conflict operation categorizes every explicit CONFLICTS row exactly once and creates no synthetic conflict records', async () => {
  const layer = await loadLayer();
  const model = buildConflictDetectionModel(layer);
  assert.equal(model.conflicts, layer.tables.conflicts.length);
  assert.equal(model.categories.reduce((sum, category) => sum + category.count, 0), layer.tables.conflicts.length);
  assert.equal(model.unknownConflictIds.length, 0);
  const actualTypes = new Set(layer.tables.conflicts.map((row) => row.conflict_type));
  const definedTypes = new Set(flattenDefinedTypes());
  assert.deepEqual(definedTypes, actualTypes);
  for (const row of layer.tables.conflicts) assert.ok(getConflictCategory(row), `missing category for ${row.conflict_type}`);
});

test('Conflict operation is aggregated by dataset-backed conflict category, not status/criticality pseudo-taxonomies', async () => {
  const layer = await loadLayer();
  const model = buildConflictDetectionModel(layer);
  const projection = createReplayProjector(layer, { mode: 'run' }).project(4);
  const stage5 = projection.nodes.filter((node) => node.stageId === 'conflict-detection');
  assert.equal(stage5.length, model.categories.length);
  assert.ok(stage5.length < 20);
  for (const category of model.categories) {
    const node = stage5.find((entry) => entry.data?.categoryId === category.id);
    assert.ok(node, `missing category node ${category.id}`);
    assert.equal(node.memberRecordIds.length, category.count);
    assert.equal(node.metric.value, category.count);
    assert.equal(node.data?.conflictRole, 'category');
  }
  assert.equal(stage5.some((node) => String(node.id).includes('status:')), false);
  assert.equal(stage5.some((node) => String(node.id).includes('criticality:')), false);
});

test('conflict category nodes are downstream of matching outcomes and do not replace identity matching', async () => {
  const layer = await loadLayer();
  const projection = createReplayProjector(layer, { mode: 'run' }).project(4);
  const stage5 = projection.nodes.filter((node) => node.stageId === 'conflict-detection');
  const incoming = projection.edges.filter((edge) => edge.stageId === 'conflict-detection' && edge.type === 'GENERATED_CONFLICT');
  assert.ok(incoming.length > 0);
  for (const node of stage5) {
    assert.ok(incoming.some((edge) => edge.to === node.id), `${node.id} has no matching identity outcome input`);
  }
  assert.ok(incoming.every((edge) => edge.from.startsWith('cluster:matching:outcome:')));
  assert.ok(projection.notes.some((note) => /MATCHING DETERMINES IDENTITY.*CONFLICT DETECTION DETERMINES DISAGREEMENT/.test(note.note)));
});

test('individual conflict inspection exposes parcel, field, competing values, provenance, quality and reconciliation state', async () => {
  const layer = await loadLayer();
  const row = layer.tables.conflicts.find((conflict) => conflict.source_a_observation_id && conflict.source_b_observation_id && /geometry|boundary/i.test(`${conflict.attribute_or_geometry} ${conflict.conflict_type}`))
    ?? layer.tables.conflicts.find((conflict) => conflict.source_a_observation_id && conflict.source_b_observation_id)
    ?? layer.tables.conflicts[0];
  const model = buildConflictInspectionModel(layer, row.conflict_id);
  assert.equal(model.found, true);
  assert.equal(model.parcelId, row.canonical_parcel_id);
  assert.equal(model.conflict.conflictingField, row.attribute_or_geometry);
  assert.equal(model.conflict.sourceAValue, row.source_a_value);
  assert.equal(model.conflict.sourceBValue, row.source_b_value);
  assert.equal(model.conflict.status, row.status);
  assert.ok(model.category);
  assert.ok(model.provenance.sourceA);
  assert.ok(model.provenance.sourceB);
  assert.ok(model.evidence.length >= 1);
  assert.ok(model.reconciliation);
  if (row.source_a_observation_id) assert.equal(model.provenance.sourceA.observationId, row.source_a_observation_id);
  if (row.source_b_observation_id) assert.equal(model.provenance.sourceB.observationId, row.source_b_observation_id);
});

test('category aggregate counts reconcile to actual conflict_type populations and affected parcels', async () => {
  const layer = await loadLayer();
  const model = buildConflictDetectionModel(layer);
  for (const category of model.categories) {
    const expectedRows = layer.tables.conflicts.filter((row) => category.conflictTypes.includes(row.conflict_type));
    assert.equal(category.count, expectedRows.length);
    assert.equal(category.parcelCount, new Set(expectedRows.map((row) => row.canonical_parcel_id)).size);
    assert.deepEqual(new Set(category.conflictIds), new Set(expectedRows.map((row) => row.conflict_id)));
  }
});

test('Conflict operation provides conflict inspection and a non-duplicating Conflict Explorer handoff', () => {
  const dashboard = fs.readFileSync(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  assert.match(dashboard, /MATCHING DETERMINES IDENTITY → CONFLICT DETECTION DETERMINES DISAGREEMENT/);
  assert.match(dashboard, /data-role="conflict-search-form"/);
  assert.match(dashboard, /OPEN IN CONFLICT EXPLORER/);
  assert.match(dashboard, /praman:evidence-graph:open-conflict-explorer/);
  assert.match(dashboard, /Reconciliation status/);
  assert.match(dashboard, /Conflict evidence \/ provenance/);
  const renderer = fs.readFileSync(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs'), 'utf8');
  assert.match(renderer, /CONFLICT CATEGORY/);
  assert.match(renderer, /is-conflict-route/);
});
