import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import { buildAdapterProcessingModels } from '../src/evidence-graph/replay/adapterProcessing.mjs';
import { buildExplorationFilterCatalog } from '../src/evidence-graph/replay/explorationFilters.mjs';
import { buildIndividualParcelModeModel } from '../src/evidence-graph/replay/individualParcelMode.mjs';
import { createReplayProjector } from '../src/evidence-graph/replay/projection.mjs';
import { createEvidenceReplayController } from '../src/evidence-graph/replay/ReplayController.mjs';
import { buildVirtualRenderPlan, GRAPH_VIRTUALIZATION_THRESHOLD } from '../src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const datasetRoot = path.join(root, 'public', 'PRAMAN_DATA');
const loadLayer = () => loadEvidenceGraphDataLayerFromDirectory(datasetRoot);

test('global replay remains aggregate rather than rendering source observations or canonical parcels one-by-one', async () => {
  const layer = await loadLayer();
  const projection = createReplayProjector(layer, { mode: 'run' }).project(8);
  assert.ok(projection.nodes.length < layer.tables.canonicalParcels.length);
  assert.equal(projection.nodes.some((n) => n.type === 'SourceObservation' && !n.aggregate), false);
  assert.equal(projection.nodes.some((n) => n.type === 'CanonicalParcel' && !n.aggregate), false);
  assert.ok(projection.nodes.some((n) => n.data?.canonicalRole === 'registry'));
});

test('expensive dataset-derived selectors and locality projection are memoized per immutable data layer', async () => {
  const layer = await loadLayer();
  assert.strictEqual(buildAdapterProcessingModels(layer), buildAdapterProcessingModels(layer));
  assert.strictEqual(buildExplorationFilterCatalog(layer), buildExplorationFilterCatalog(layer));
  const first = createReplayProjector(layer, { mode: 'run' }).project(8);
  const second = createReplayProjector(layer, { mode: 'run' }).project(8);
  assert.strictEqual(first, second);
});

test('parcel detail is built on demand and reused without losing record-level evidence', async () => {
  const layer = await loadLayer();
  const parcelId = layer.tables.reconciledParcels.find((r) => r.requiresHumanReview)?.canonical_parcel_id
    ?? layer.tables.reconciledParcels[0].canonical_parcel_id;
  const first = buildIndividualParcelModeModel(layer, parcelId);
  const second = buildIndividualParcelModeModel(layer, parcelId);
  assert.strictEqual(first, second);
  assert.ok(first.nodes.some((n) => n.type === 'SourceObservation'));
  assert.ok(first.nodes.some((n) => n.type === 'NormalizedObservation'));
  assert.ok(first.nodes.some((n) => n.type === 'MatchDecision'));
});

test('replay progress reuses structural node/edge arrays instead of recomputing the graph each tick', async () => {
  const layer = await loadLayer();
  const controller = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false });
  controller.jumpToStage(8);
  const before = controller.getSnapshot();
  controller.isPlaying = true;
  controller.advance(1);
  const after = controller.getSnapshot();
  assert.strictEqual(before.visibleNodes, after.visibleNodes);
  assert.strictEqual(before.visibleEdges, after.visibleEdges);
  controller.destroy();
});

test('virtualization keeps the complete snapshot but materializes only viewport nodes/edges above the render budget', () => {
  const nodes = [];
  const positions = new Map();
  for (let i = 0; i < 1000; i += 1) {
    const id = `n${i}`;
    nodes.push({ id });
    positions.set(id, { x: 100 + (i % 9) * 258, y: 100 + Math.floor(i / 9) * 84 });
  }
  const edges = Array.from({ length: 999 }, (_, i) => ({ id: `e${i}`, from: `n${i}`, to: `n${i + 1}` }));
  const plan = buildVirtualRenderPlan(nodes, edges, positions, { left: 0, top: 0, width: 900, height: 600 });
  assert.equal(plan.virtualized, true);
  assert.equal(plan.totalNodes, 1000);
  assert.equal(plan.totalEdges, 999);
  assert.ok(plan.nodeIds.size < nodes.length);
  assert.ok(plan.nodeIds.size > 0);
  assert.ok(plan.edgeIds.size < edges.length);
  assert.ok(GRAPH_VIRTUALIZATION_THRESHOLD < nodes.length);
  for (const edge of edges.filter((e) => plan.edgeIds.has(e.id))) {
    assert.ok(plan.nodeIds.has(edge.from));
    assert.ok(plan.nodeIds.has(edge.to));
  }
});
