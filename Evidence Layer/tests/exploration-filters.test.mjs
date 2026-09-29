import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import { buildExplorationFilterCatalog, applyEvidenceExplorationFilters, normalizeExplorationFilters } from '../src/evidence-graph/replay/explorationFilters.mjs';
import { createEvidenceReplayController } from '../src/evidence-graph/replay/ReplayController.mjs';
import { buildEvidenceGraphState, readEvidenceGraphStateFromUrl, writeEvidenceGraphStateToUrl } from '../src/evidence-graph/integration/dashboardLinks.mjs';

const root = path.resolve('public/PRAMAN_DATA');
const unique = (rows, key) => [...new Set(rows.map((r) => r[key]).filter(Boolean).map(String))].sort();

test('filter catalog is derived from actual current PRAMAN values', async () => {
  const layer = await loadEvidenceGraphDataLayerFromDirectory(root);
  const catalog = buildExplorationFilterCatalog(layer);
  assert.deepEqual(catalog.sources.map((x) => x.value).sort(), layer.tables.sourceMetadata.map((x) => x.source_id).sort());
  assert.deepEqual(catalog.cells.map((x) => x.value).sort(), unique([...layer.tables.canonicalParcels, ...layer.tables.historicalParcels], 'cell_id'));
  assert.deepEqual(catalog.matchStatuses.map((x) => x.value).sort(), unique(layer.tables.reconciledParcels, 'match_status'));
  assert.deepEqual(catalog.conflictTypes.map((x) => x.value).sort(), unique(layer.tables.conflicts, 'conflict_type'));
  assert.deepEqual(catalog.conflictStatuses.map((x) => x.value).sort(), unique(layer.tables.conflicts, 'status'));
  assert.deepEqual(catalog.recordStatuses.map((x) => x.value).sort(), unique(layer.tables.reconciledParcels, 'record_status'));
  assert.deepEqual(catalog.lineageTypes.map((x) => x.value).sort(), unique(layer.tables.parcelLineage, 'event_type'));
  assert.equal(catalog.unresolvedCount, layer.tables.reconciledParcels.filter((r) => r.unresolvedConflictIds.length).length);
});

test('filter catalog exposes only direct PRAMAN_DATA dimensions and no UI-created confidence or adapter buckets', async () => {
  const layer = await loadEvidenceGraphDataLayerFromDirectory(root);
  const catalog = buildExplorationFilterCatalog(layer);
  assert.equal('confidenceBands' in catalog, false);
  assert.equal('adapters' in catalog, false);
  assert.deepEqual(catalog.conflictStatuses.map((x) => x.value).sort(), unique(layer.tables.conflicts, 'status'));
  assert.deepEqual(catalog.authorityStatuses.map((x) => x.value).sort(), [...new Set(layer.tables.reconciledParcels.map((r) => r.authoritativeState?.state).filter(Boolean))].sort());
  const normalized = normalizeExplorationFilters({ adapterId: 'anything', confidenceBand: 'upper', reconciliationStatus: 'AUTHORITATIVE' });
  assert.equal('adapterId' in normalized, false);
  assert.equal('confidenceBand' in normalized, false);
  assert.equal(normalized.authorityStatus, 'AUTHORITATIVE');
});

test('source filter retains only observations from that dataset and downstream contextual graph nodes', async () => {
  const layer = await loadEvidenceGraphDataLayerFromDirectory(root);
  const source = layer.tables.sourceMetadata[0];
  const controller = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false, filters: { sourceId: source.source_id } });
  controller.jumpToStage('canonical-state');
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.filterSummary.active, true);
  const sourceNodes = snapshot.visibleNodes.filter((n) => n.entityType === 'SourceDataset');
  assert.deepEqual(sourceNodes.map((n) => n.sourceId), [source.source_id]);
  const allowedObs = new Set(layer.tables.sourceObservations.filter((o) => o.source_type === source.source_type).map((o) => o.observation_id));
  for (const node of snapshot.visibleNodes) {
    if (node.entityType === 'SourceDataset' && node.memberRecordIds) assert.ok(node.memberRecordIds.every((id) => allowedObs.has(id)));
  }
  assert.ok(snapshot.visibleEdges.every((e) => snapshot.visibleNodes.some((n) => n.id === e.from) && snapshot.visibleNodes.some((n) => n.id === e.to)));
});

test('unresolved-only and match-status filters operate on real reconciliation parcel membership', async () => {
  const layer = await loadEvidenceGraphDataLayerFromDirectory(root);
  const status = layer.tables.reconciledParcels.find((r) => r.unresolvedConflictIds.length)?.match_status;
  const expected = new Set(layer.tables.reconciledParcels.filter((r) => r.unresolvedConflictIds.length && r.match_status === status).map((r) => r.canonical_parcel_id));
  const controller = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false, filters: { unresolvedOnly: true, matchStatus: status } });
  controller.jumpToStage('canonical-state');
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.filterSummary.visibleParcels, expected.size);
  for (const node of snapshot.visibleNodes.filter((n) => n.stageId === 'canonical-state' && Array.isArray(n.memberRecordIds))) {
    assert.ok(node.memberRecordIds.every((id) => expected.has(id)));
  }
});

test('lineage filter values are actual event types and retain their participating parcels', async () => {
  const layer = await loadEvidenceGraphDataLayerFromDirectory(root);
  const type = layer.tables.parcelLineage[0].event_type;
  const participants = new Set(layer.tables.parcelLineage.filter((r) => r.event_type === type).flatMap((r) => [r.parent_parcel_id, r.child_parcel_id]));
  const controller = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false, filters: { lineageType: type } });
  controller.jumpToStage('history-lineage');
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.filterSummary.visibleParcels, participants.size);
  assert.ok(snapshot.visibleNodes.some((n) => n.stageId === 'history-lineage'));
});

test('clear filters restores the unfiltered projection', async () => {
  const layer = await loadEvidenceGraphDataLayerFromDirectory(root);
  const controller = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false });
  controller.jumpToStage('canonical-state');
  const baseline = controller.getSnapshot();
  const sourceId = layer.tables.sourceMetadata[0].source_id;
  const filtered = controller.setFilters({ sourceId });
  assert.equal(filtered.filterSummary.active, true);
  assert.ok(filtered.visibleNodes.length < baseline.visibleNodes.length);
  const restored = controller.clearFilters();
  assert.equal(restored.filterSummary.active, false);
  assert.equal(restored.visibleNodes.length, baseline.visibleNodes.length);
  assert.equal(restored.visibleEdges.length, baseline.visibleEdges.length);
});

test('parcel mode filters only the selected parcel evidence and never imports unrelated observations', async () => {
  const layer = await loadEvidenceGraphDataLayerFromDirectory(root);
  const recon = layer.tables.reconciledParcels.find((r) => r.matchedSourceIds.length > 1);
  const parcelObs = recon.matchedSourceIds.map((id) => layer.tables.sourceObservations.find((o) => o.observation_id === id)).filter(Boolean);
  const sourceType = parcelObs[0].source_type;
  const sourceId = layer.tables.sourceMetadata.find((s) => s.source_type === sourceType).source_id;
  const expected = new Set(parcelObs.filter((o) => o.source_type === sourceType).map((o) => o.observation_id));
  const controller = createEvidenceReplayController({ dataLayer: layer, mode: 'parcel', parcelId: recon.canonical_parcel_id, autoSchedule: false, filters: { sourceId } });
  controller.jumpToStage('normalization');
  const snapshot = controller.getSnapshot();
  const ids = new Set(snapshot.visibleNodes.flatMap((n) => n.memberRecordIds || []).filter((id) => String(id).startsWith('OBS-')));
  for (const id of ids) assert.ok(expected.has(id), `unexpected observation ${id}`);
});

test('filter state round-trips through Evidence Graph URL return state', () => {
  const filters = normalizeExplorationFilters({ sourceId: 'SRC-X', matchStatus: 'RECONCILED', unresolvedOnly: true });
  const state = buildEvidenceGraphState(null, { selectedParcelId: null, filters });
  const href = writeEvidenceGraphStateToUrl(state, '/evidence-graph?hostFilter=kept');
  const restored = readEvidenceGraphStateFromUrl(href);
  assert.deepEqual(normalizeExplorationFilters(restored.filters), filters);
  assert.match(href, /hostFilter=kept/);
  assert.match(href, /egFilters=/);
});

test('filtered locality graph preserves a contextual path from retained source evidence to canonical state', async () => {
  const layer = await loadEvidenceGraphDataLayerFromDirectory(root);
  const sourceId = layer.tables.sourceMetadata[0].source_id;
  const controller = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false, filters: { sourceId } });
  controller.jumpToStage('canonical-state');
  const snapshot = controller.getSnapshot();
  const sourceNode = snapshot.visibleNodes.find((n) => n.entityType === 'SourceDataset' && n.sourceId === sourceId);
  const canonicalNodes = new Set(snapshot.visibleNodes.filter((n) => n.stageId === 'canonical-state').map((n) => n.id));
  assert.ok(sourceNode);
  assert.ok(canonicalNodes.size > 0);
  const outgoing = new Map();
  for (const e of snapshot.visibleEdges) { if (!outgoing.has(e.from)) outgoing.set(e.from, []); outgoing.get(e.from).push(e.to); }
  const queue = [sourceNode.id], seen = new Set(queue);
  let reached = false;
  while (queue.length && !reached) {
    const id = queue.shift();
    if (canonicalNodes.has(id)) { reached = true; break; }
    for (const next of outgoing.get(id) || []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  assert.equal(reached, true, 'filtering should preserve the explanatory connector path');
});
