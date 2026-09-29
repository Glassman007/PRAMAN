import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import { buildParcelHistoryLineageModel, buildIndividualParcelModeModel } from '../src/evidence-graph/replay/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const datasetRoot = path.join(root, 'public', 'PRAMAN_DATA');
const loadLayer = () => loadEvidenceGraphDataLayerFromDirectory(datasetRoot);

function splitRow(layer) { return layer.tables.parcelLineage.find((r) => r.event_type === 'SPLIT' || r.event_type === 'CROSS_CELL_SPLIT'); }
function mergeRow(layer) { return layer.tables.parcelLineage.find((r) => ['MERGE','CROSS_CELL_MERGE','REDEVELOPMENT_CONSOLIDATION'].includes(r.event_type)); }

test('split lineage is reconstructed as one parent to all recorded children', async () => {
  const layer = await loadLayer();
  const row = splitRow(layer);
  const model = buildParcelHistoryLineageModel(layer, row.child_parcel_id);
  const tx = model.transactions.find((t) => t.type === 'SPLIT');
  assert.ok(tx);
  assert.deepEqual(tx.parentParcelIds, [row.parent_parcel_id]);
  assert.ok(tx.childParcelIds.length >= 2);
  const expectedChildren = layer.tables.parcelLineage.filter((r) => (r.event_type === row.event_type || (r.event_type.includes('SPLIT') && row.event_type.includes('SPLIT'))) && r.parent_parcel_id === row.parent_parcel_id && r.effective_date === row.effective_date && r.reason === row.reason && r.source === row.source).map((r) => r.child_parcel_id);
  assert.deepEqual(new Set(tx.childParcelIds), new Set(expectedChildren));
});

test('merge lineage is reconstructed as all recorded parents to one resulting parcel', async () => {
  const layer = await loadLayer();
  const row = mergeRow(layer);
  const model = buildParcelHistoryLineageModel(layer, row.parent_parcel_id);
  const tx = model.transactions.find((t) => t.type === 'MERGE');
  assert.ok(tx);
  assert.ok(tx.parentParcelIds.length >= 2);
  assert.deepEqual(tx.childParcelIds, [row.child_parcel_id]);
});

test('geometry history exposes resurvey, boundary correction and supersession only where recorded', async () => {
  const layer = await loadLayer();
  const target = layer.tables.geometryVersions.find((g) => /resurvey|boundary correction/i.test(g.change_reason || '') && g.supersedes_geometry_id);
  const model = buildParcelHistoryLineageModel(layer, target.canonical_parcel_id);
  const version = model.geometryVersions.find((g) => g.geometry_id === target.geometry_id);
  assert.ok(version.historyKinds.includes(/boundary correction/i.test(target.change_reason) ? 'BOUNDARY_CORRECTION' : 'RESURVEY'));
  assert.ok(model.geometryVersions.some((g) => g.geometry_id === target.supersedes_geometry_id));
  const graph = buildIndividualParcelModeModel(layer, target.canonical_parcel_id);
  assert.ok(graph.edges.some((e) => e.type === 'SUPERSEDES' && e.from.includes(target.geometry_id) && e.to.includes(target.supersedes_geometry_id)));
});

test('mutation, rollback and new canonical version are surfaced from actual GeoGit events', async () => {
  const layer = await loadLayer();
  for (const eventType of ['MUTATION_RECORDED','ROLLBACK','CANONICAL_STATE_UPDATED']) {
    const event = layer.tables.geogitEvents.find((e) => e.event_type === eventType);
    assert.ok(event, `dataset should contain ${eventType}`);
    const model = buildParcelHistoryLineageModel(layer, event.parcel_id);
    assert.ok(model.geogitEvents.some((e) => e.event_id === event.event_id));
  }
});

test('GeoGit remains supporting history evidence and is never linked directly to geometry versions', async () => {
  const layer = await loadLayer();
  const event = layer.tables.geogitEvents.find((e) => e.event_type === 'CANONICAL_STATE_UPDATED');
  const graph = buildIndividualParcelModeModel(layer, event.parcel_id);
  const geogitIds = new Set(graph.nodes.filter((n) => n.type === 'GeoGitEvent').map((n) => n.id));
  const geometryIds = new Set(graph.nodes.filter((n) => n.type === 'GeometryVersion').map((n) => n.id));
  for (const e of graph.edges) assert.equal(geogitIds.has(e.from) && geometryIds.has(e.to) || geometryIds.has(e.from) && geogitIds.has(e.to), false);
  assert.ok(graph.nodes.filter((n) => n.type === 'GeoGitEvent').every((n) => n.data?.details?.supportingHistoricalEvidence === true && n.data?.details?.evidenceGraphDependency === false));
});

test('current canonical geometry is prominent while historical parcel and geometry states are subdued', async () => {
  const layer = await loadLayer();
  const target = layer.tables.canonicalParcels.find((p) => layer.tables.geometryVersions.filter((g) => g.canonical_parcel_id === p.canonical_parcel_id).length > 1);
  const graph = buildIndividualParcelModeModel(layer, target.canonical_parcel_id);
  const current = graph.nodes.find((n) => n.type === 'GeometryVersion' && n.data?.isCurrentGeometry);
  assert.equal(current?.data?.visualTone, 'current');
  const old = graph.nodes.find((n) => n.type === 'GeometryVersion' && !n.data?.isCurrentGeometry);
  assert.equal(old?.data?.visualTone, 'historical');
  assert.ok(graph.nodes.filter((n) => n.type === 'HistoricalParcel').every((n) => n.data?.visualTone === 'historical'));
});

test('dashboard states the Evidence Graph / GeoGit distinction and has a dedicated history inspector', async () => {
  const dashboard = await fs.readFile(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  const renderer = await fs.readFile(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs'), 'utf8');
  const historyModule = await fs.readFile(path.join(root, 'src/evidence-graph/replay/historyLineage.mjs'), 'utf8');
  const css = await fs.readFile(path.join(root, 'src/evidence-graph/dashboard/evidenceGraph.css'), 'utf8');
  assert.match(historyModule, /EVIDENCE GRAPH ≠ GEOGIT/);
  assert.match(dashboard, /historyLineageInspectorMarkup/);
  assert.match(dashboard, /no direct GeoGit-event → geometry-version link is invented/i);
  assert.match(renderer, /GEOGIT SUPPORT/);
  assert.match(css, /eg-history-tone-historical/);
  assert.match(css, /eg-history-tone-current/);
});
