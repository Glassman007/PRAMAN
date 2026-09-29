import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import { createReplayProjector } from '../src/evidence-graph/replay/projection.mjs';
import { createEvidenceReplayController } from '../src/evidence-graph/replay/ReplayController.mjs';
import { buildIndividualParcelModeModel } from '../src/evidence-graph/replay/individualParcelMode.mjs';
import { buildVirtualRenderPlan, GRAPH_VIRTUALIZATION_THRESHOLD } from '../src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const datasetRoot = path.join(root, 'public', 'PRAMAN_DATA');
const layer = await loadEvidenceGraphDataLayerFromDirectory(datasetRoot);

const time = (fn) => {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
};

const firstRun = time(() => createReplayProjector(layer, { mode: 'run' }).project(8));
const cachedRun = time(() => createReplayProjector(layer, { mode: 'run' }).project(8));
const parcelId = layer.tables.reconciledParcels.find((row) => row.requiresHumanReview)?.canonical_parcel_id
  ?? layer.tables.reconciledParcels[0]?.canonical_parcel_id;
const parcelFirst = time(() => buildIndividualParcelModeModel(layer, parcelId));
const parcelCached = time(() => buildIndividualParcelModeModel(layer, parcelId));

const controller = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false });
controller.jumpToStage(8);
controller.isPlaying = true;
const tickStart = performance.now();
for (let i = 0; i < 1000; i += 1) controller.advance(0.1);
const tick1000Ms = performance.now() - tickStart;
controller.destroy();

let largestParcel = { parcelId: null, nodes: 0, edges: 0 };
for (const row of [...layer.tables.canonicalParcels, ...layer.tables.historicalParcels]) {
  const model = buildIndividualParcelModeModel(layer, row.canonical_parcel_id);
  if (model.nodes.length > largestParcel.nodes || model.edges.length > largestParcel.edges) {
    largestParcel = { parcelId: row.canonical_parcel_id, nodes: model.nodes.length, edges: model.edges.length };
  }
}

const syntheticNodes = [];
const syntheticPositions = new Map();
for (let i = 0; i < 10000; i += 1) {
  const id = `synthetic:${i}`;
  syntheticNodes.push({ id });
  syntheticPositions.set(id, { x: 100 + (i % 9) * 258, y: 100 + Math.floor(i / 9) * 84 });
}
const syntheticEdges = Array.from({ length: 9999 }, (_, i) => ({ id: `edge:${i}`, from: `synthetic:${i}`, to: `synthetic:${i + 1}` }));
const virtualized = time(() => buildVirtualRenderPlan(
  syntheticNodes,
  syntheticEdges,
  syntheticPositions,
  { left: 0, top: 0, width: 900, height: 600 }
));

console.log('PRAMAN Evidence Graph — Performance Benchmark');
console.log(`Global final snapshot: ${firstRun.value.nodes.length} nodes / ${firstRun.value.edges.length} edges`);
console.log(`First locality projection: ${firstRun.ms.toFixed(2)} ms`);
console.log(`Cached locality projection: ${cachedRun.ms.toFixed(3)} ms`);
console.log(`Representative parcel first build (${parcelId}): ${parcelFirst.ms.toFixed(3)} ms · ${parcelFirst.value.nodes.length} nodes / ${parcelFirst.value.edges.length} edges`);
console.log(`Representative parcel cached build: ${parcelCached.ms.toFixed(3)} ms`);
console.log(`1000 same-operation replay progress ticks: ${tick1000Ms.toFixed(2)} ms`);
console.log(`Largest current parcel projection: ${largestParcel.parcelId} · ${largestParcel.nodes} nodes / ${largestParcel.edges} edges`);
console.log(`Virtualization threshold: ${GRAPH_VIRTUALIZATION_THRESHOLD} nodes`);
console.log(`Synthetic 10,000-node viewport plan: ${virtualized.ms.toFixed(2)} ms · ${virtualized.value.nodeIds.size} nodes / ${virtualized.value.edgeIds.size} edges materialized`);
console.log(`Synthetic snapshot retained: ${virtualized.value.totalNodes} nodes / ${virtualized.value.totalEdges} edges`);
