import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import { createReplayProjector } from '../src/evidence-graph/replay/index.mjs';
import { buildAuthoritativeCanonicalStateModel } from '../src/evidence-graph/replay/authoritativeCanonicalState.mjs';
import { buildWaterfallLayout } from '../src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataset = path.join(root, 'public', 'PRAMAN_DATA');
const loadLayer = () => loadEvidenceGraphDataLayerFromDirectory(dataset, { strict: false });

const splitTypes = new Set(['SPLIT','CROSS_CELL_SPLIT']);
const mergeTypes = new Set(['MERGE','CROSS_CELL_MERGE','REDEVELOPMENT_CONSOLIDATION']);

test('final summary is derived from the same PRAMAN_DATA tables and recorded statuses', async () => {
  const layer = await loadLayer();
  const model = buildAuthoritativeCanonicalStateModel(layer);
  const s = model.summary;
  const status = new Map();
  for (const row of layer.tables.reconciledParcels) status.set(row.match_status, (status.get(row.match_status) || 0) + 1);
  const primary = layer.tables.sourceObservations.filter((row) => row.candidate_canonical_parcel_id).length;
  const alternates = layer.tables.sourceObservations.reduce((n, row) => n + (row.alternateCandidateParcelIds?.length || 0), 0);
  assert.equal(s.activeCanonicalParcels, layer.tables.canonicalParcels.length);
  assert.equal(s.historicalRetiredParcels, layer.tables.historicalParcels.length);
  assert.equal(s.sourceObservations, layer.tables.sourceObservations.length);
  assert.equal(s.candidateAssociations, primary + alternates);
  assert.equal(s.acceptedMatches, (status.get('AUTO_MATCHED')||0) + (status.get('MATCHED_WITH_MINOR_CONFLICT')||0) + (status.get('RECONCILED')||0));
  assert.equal(s.ambiguousCases, (status.get('HUMAN_REVIEW_REQUIRED')||0) + (status.get('TENTATIVE')||0) + (status.get('NEEDS_ADDITIONAL_EVIDENCE')||0));
  assert.equal(s.rejectedMatches, status.get('REJECTED_MATCH') || 0);
  assert.equal(s.reconciliationRecords, layer.tables.reconciledParcels.length);
  assert.equal(s.conflicts, layer.tables.conflicts.length);
  assert.equal(s.unresolvedCases, layer.tables.reconciledParcels.filter((r) => r.unresolvedConflictIds?.length).length);
  assert.equal(s.humanReviewCases, layer.tables.reconciledParcels.filter((r) => r.requiresHumanReview).length);
  assert.equal(s.splitLineageRelationships, layer.tables.parcelLineage.filter((r) => splitTypes.has(r.event_type)).length);
  assert.equal(s.mergeLineageRelationships, layer.tables.parcelLineage.filter((r) => mergeTypes.has(r.event_type)).length);
});

test('renderer completion state participates in structural invalidation and semantic hidden state wins CSS', async () => {
  const renderer = await fs.readFile(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs'), 'utf8');
  const css = await fs.readFile(path.join(root, 'src/evidence-graph/dashboard/evidenceGraph.css'), 'utf8');
  assert.match(renderer, /snapshot\?\.playbackState \|\| 'idle'/);
  assert.match(renderer, /snapshot\?\.playbackState === 'completed'/);
  assert.match(css, /\.praman-evidence-graph \[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
});

test('complete overview waterfall stays within desktop bounds without layout-box overlap', async () => {
  const layer = await loadLayer();
  const projection = createReplayProjector(layer, { mode: 'run' }).project(8);
  const width = 1424, nodeWidth = 210, nodeHeight = 108;
  const layout = buildWaterfallLayout(projection.nodes, projection.edges, width, { nodeWidth, nodeHeight });
  const boxes = projection.nodes.map((node) => ({ id: node.id, x: layout.positions.get(node.id).left, y: layout.positions.get(node.id).top }));
  for (const b of boxes) {
    assert.ok(b.x >= 0, `${b.id} left-clipped`);
    assert.ok(b.x + nodeWidth <= width + 0.001, `${b.id} right-clipped`);
  }
  for (let i=0;i<boxes.length;i++) for (let j=i+1;j<boxes.length;j++) {
    const a=boxes[i], b=boxes[j];
    const ox=Math.min(a.x+nodeWidth,b.x+nodeWidth)-Math.max(a.x,b.x);
    const oy=Math.min(a.y+nodeHeight,b.y+nodeHeight)-Math.max(a.y,b.y);
    assert.ok(!(ox>1 && oy>1), `${a.id} overlaps ${b.id}`);
  }
});

test('user-facing dashboard/renderer do not contain numbered-stage presentation controls', async () => {
  const source = (await Promise.all([
    fs.readFile(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8'),
    fs.readFile(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs'), 'utf8'),
  ])).join('\n');
  for (const phrase of ['Stage 1','Stage 2','Stage 3','Next Stage','Previous Stage']) assert.doesNotMatch(source, new RegExp(phrase, 'i'));
  assert.doesNotMatch(source, /data-role=["'](?:stage|timeline|scrubber)/i);
});

test('full overview still resolves to the expected data-backed graph cardinality', async () => {
  const layer = await loadLayer();
  const projection = createReplayProjector(layer, { mode: 'run' }).project(8);
  assert.equal(projection.nodes.length, 60);
  assert.equal(projection.edges.length, 146);
  assert.equal(new Set(projection.nodes.map((n) => n.id)).size, projection.nodes.length);
  assert.equal(new Set(projection.edges.map((e) => e.id)).size, projection.edges.length);
});
