import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import { createReplayProjector } from '../src/evidence-graph/replay/projection.mjs';
import { buildWaterfallLayout, WATERFALL_OPERATION_LABELS } from '../src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs';

const DATASET = fileURLToPath(new URL('../public/PRAMAN_DATA/', import.meta.url));

async function finalOverview() {
  const layer = await loadEvidenceGraphDataLayerFromDirectory(DATASET);
  return createReplayProjector(layer, { mode: 'run' }).project(8);
}

test('waterfall layout places every real overview relationship downstream', async () => {
  const graph = await finalOverview();
  const layout = buildWaterfallLayout(graph.nodes, graph.edges, 1200);
  assert.equal(layout.positions.size, graph.nodes.length);
  assert.equal(layout.operationLayouts.size, 9);
  assert.ok(layout.height > 2000, 'completed lifecycle should extend vertically rather than fit one fixed viewport');
  for (const edge of graph.edges) {
    const from = layout.positions.get(edge.from);
    const to = layout.positions.get(edge.to);
    assert.ok(from && to, `layout missing endpoint for ${edge.id}`);
    assert.ok(to.y > from.y, `${edge.type} must visually flow downward`);
  }
});

test('real branching and convergence remain represented by the source graph', async () => {
  const graph = await finalOverview();
  const outDegree = new Map();
  const inDegree = new Map();
  for (const edge of graph.edges) {
    outDegree.set(edge.from, (outDegree.get(edge.from) || 0) + 1);
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }
  assert.ok([...outDegree.values()].some((count) => count > 1), 'expected at least one dataset-backed branch');
  assert.ok([...inDegree.values()].some((count) => count > 1), 'expected at least one dataset-backed convergence');
  assert.ok(graph.edges.length > 0, 'waterfall must retain the current data-backed overview relationships');
});

test('waterfall operation captions describe logic without numbered stage presentation', () => {
  assert.deepEqual(Object.values(WATERFALL_OPERATION_LABELS), [
    'SOURCE OBSERVATIONS',
    'ADAPTER INTERPRETATION',
    'NORMALIZED EVIDENCE',
    'MATCHING / CANDIDATE RELATIONSHIPS',
    'CONFLICTS',
    'RECONCILIATION',
    'AUTHORITY / POLICY / HUMAN DECISION',
    'AUTHORITATIVE CANONICAL STATE',
    'HISTORY / LINEAGE / FINAL OUTCOME',
  ]);
  assert.ok(Object.values(WATERFALL_OPERATION_LABELS).every((label) => !/^Stage\s+\d/i.test(label)));
});

test('active waterfall uses natural document flow rather than a fixed-height internal canvas', () => {
  const css = fs.readFileSync(new URL('../src/evidence-graph/dashboard/evidenceGraph.css', import.meta.url), 'utf8');
  assert.match(css, /data-replay-open="true"\] \{[\s\S]*?height: auto;[\s\S]*?overflow: visible;/);
  assert.match(css, /data-replay-open="true"\] \.eg-canvas \{[\s\S]*?position: relative;[\s\S]*?overflow: visible;/);
  assert.match(css, /data-replay-open="true"\] \.eg-graph-root \{[\s\S]*?height: auto;/);
});
