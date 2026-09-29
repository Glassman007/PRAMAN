import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import { buildParcelSearchIndex, createEvidenceReplayController, REPLAY_STAGES } from '../src/evidence-graph/replay/index.mjs';

const root = path.resolve('public/PRAMAN_DATA');
const appRoot = path.resolve('.');

async function loadLayer() { return loadEvidenceGraphDataLayerFromDirectory(root); }

function finish(controller) {
  controller.play();
  controller.advance(controller.stageDurationMs * (REPLAY_STAGES.length + 1));
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.playbackState, 'completed');
  return snapshot;
}

function ids(snapshot, key = 'visibleNodes') {
  return (snapshot[key] || []).map((item) => item.id).sort();
}

test('acceptance 1: full dataset playback completes as the unfiltered dataset-driven waterfall', async () => {
  const layer = await loadLayer();
  const controller = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false });
  const final = finish(controller);
  assert.equal(final.mode, 'run');
  assert.equal(final.filterSummary.active, false);
  assert.ok(final.visibleNodes.some((n) => n.stageId === 'sources'));
  assert.ok(final.visibleNodes.some((n) => n.stageId === 'canonical-state'));
  assert.ok(final.visibleEdges.length > 0);
  controller.destroy();
});

test('acceptance 2: canonical and source parcel searches resolve to the same focused Evidence Graph system', async () => {
  const layer = await loadLayer();
  const index = buildParcelSearchIndex(layer);
  const sourceEntry = index.find((entry) => entry.identifierType === 'SOURCE_PARCEL');
  assert.ok(sourceEntry);
  const canonicalEntry = index.find((entry) => entry.identifierType === 'CANONICAL_PARCEL' && entry.parcelId === sourceEntry.parcelId);
  assert.ok(canonicalEntry);

  const sourceController = createEvidenceReplayController({ dataLayer: layer, mode: 'parcel', parcelId: sourceEntry.parcelId, autoSchedule: false });
  const canonicalController = createEvidenceReplayController({ dataLayer: layer, mode: 'parcel', parcelId: canonicalEntry.parcelId, autoSchedule: false });
  const sourceFinal = finish(sourceController);
  const canonicalFinal = finish(canonicalController);
  assert.deepEqual(ids(sourceFinal), ids(canonicalFinal));
  assert.deepEqual(ids(sourceFinal, 'visibleEdges'), ids(canonicalFinal, 'visibleEdges'));
  assert.ok(sourceFinal.visibleNodes.every((n) => n.data?.parcelMode === true));
  sourceController.destroy(); canonicalController.destroy();
});

test('acceptance 3: filter-only playback uses recorded source membership and excludes stale unrelated evidence', async () => {
  const layer = await loadLayer();
  const source = layer.tables.sourceMetadata[0];
  const controller = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false, filters: { sourceId: source.source_id } });
  const final = finish(controller);
  assert.equal(final.filterSummary.active, true);
  assert.equal(final.filters.sourceId, source.source_id);
  assert.deepEqual(final.visibleNodes.filter((n) => n.entityType === 'SourceDataset').map((n) => n.sourceId), [source.source_id]);
  const allowed = new Set(layer.tables.sourceObservations.filter((o) => o.source_type === source.source_type).map((o) => o.observation_id));
  for (const node of final.visibleNodes.filter((n) => n.entityType === 'SourceDataset')) {
    assert.ok(node.memberRecordIds.every((id) => allowed.has(id)));
  }
  controller.destroy();
});

test('acceptance 4: parcel + filter keeps only the selected parcel evidence supported by that filter', async () => {
  const layer = await loadLayer();
  const reconciliation = layer.tables.reconciledParcels.find((r) => {
    const types = new Set(r.matchedSourceIds.map((id) => layer.tables.sourceObservations.find((o) => o.observation_id === id)?.source_type).filter(Boolean));
    return types.size > 1;
  });
  assert.ok(reconciliation);
  const observations = reconciliation.matchedSourceIds.map((id) => layer.tables.sourceObservations.find((o) => o.observation_id === id)).filter(Boolean);
  const selectedType = observations[0].source_type;
  const source = layer.tables.sourceMetadata.find((s) => s.source_type === selectedType);
  const expected = new Set(observations.filter((o) => o.source_type === selectedType).map((o) => o.observation_id));

  const controller = createEvidenceReplayController({ dataLayer: layer, mode: 'parcel', parcelId: reconciliation.canonical_parcel_id, autoSchedule: false, filters: { sourceId: source.source_id } });
  const final = finish(controller);
  assert.equal(final.filterSummary.selectedParcelMatches, true);
  const observationUniverse = new Set(layer.tables.sourceObservations.map((o) => o.observation_id));
  const actual = new Set(final.visibleNodes.flatMap((n) => n.memberRecordIds || []).filter((id) => observationUniverse.has(String(id))));
  for (const id of actual) assert.ok(expected.has(id), `unexpected observation in parcel + filter graph: ${id}`);
  assert.ok(actual.size > 0);
  controller.destroy();
});

test('acceptance 5: replay after parcel search preserves the parcel and produces the same data-driven lifecycle', async () => {
  const layer = await loadLayer();
  const parcelId = layer.tables.reconciledParcels.find((r) => r.matchedSourceIds.length)?.canonical_parcel_id;
  const controller = createEvidenceReplayController({ dataLayer: layer, mode: 'parcel', parcelId, autoSchedule: false });
  const first = finish(controller);
  const firstNodes = ids(first), firstEdges = ids(first, 'visibleEdges');
  controller.replay();
  assert.equal(controller.getSnapshot().parcelId, parcelId);
  const second = finish(controller);
  assert.deepEqual(ids(second), firstNodes);
  assert.deepEqual(ids(second, 'visibleEdges'), firstEdges);
  controller.destroy();
});

test('acceptance 6: replay and live regeneration after filters preserve current filter state without stale graph data', async () => {
  const layer = await loadLayer();
  const controller = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false });
  const unfiltered = finish(controller);
  const source = layer.tables.sourceMetadata[0];
  const filteredAtCompletion = controller.setFilters({ sourceId: source.source_id });
  assert.equal(filteredAtCompletion.playbackState, 'completed');
  assert.equal(filteredAtCompletion.filters.sourceId, source.source_id);
  assert.ok(filteredAtCompletion.visibleNodes.length < unfiltered.visibleNodes.length);
  const filteredIds = ids(filteredAtCompletion);
  controller.replay();
  assert.equal(controller.getSnapshot().filters.sourceId, source.source_id);
  const replayed = finish(controller);
  assert.deepEqual(ids(replayed), filteredIds);
  controller.destroy();
});

test('acceptance 7: clearing filters restores the complete overview projection and source contains an explicit parcel reset path', async () => {
  const layer = await loadLayer();
  const baselineController = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false });
  const baseline = finish(baselineController);
  const controller = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false, filters: { matchStatus: layer.tables.reconciledParcels[0].match_status } });
  finish(controller);
  const restored = controller.clearFilters();
  assert.equal(restored.filterSummary.active, false);
  assert.deepEqual(ids(restored), ids(baseline));
  assert.deepEqual(ids(restored, 'visibleEdges'), ids(baseline, 'visibleEdges'));

  const dashboard = await fs.readFile(path.join(appRoot, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  assert.match(dashboard, /BACK TO RECONCILIATION OVERVIEW/);
  assert.match(dashboard, /els\.searchInput\.value = ''/);
  baselineController.destroy(); controller.destroy();
});

test('supported filter dimensions are direct dataset fields/relationships and selected-node inspection exposes provenance', async () => {
  const filterSource = await fs.readFile(path.join(appRoot, 'src/evidence-graph/replay/explorationFilters.mjs'), 'utf8');
  const dashboard = await fs.readFile(path.join(appRoot, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  assert.doesNotMatch(dashboard, /Confidence band|data-filter-key="adapterId"/);
  assert.match(dashboard, /Conflict state/);
  assert.match(dashboard, /Authority state/);
  assert.match(filterSource, /authoritativeState\?\.state/);
  assert.match(filterSource, /c\.status === f\.conflictStatus/);
  assert.match(dashboard, /Record provenance/);
  assert.match(dashboard, /Provenance reference/);
  assert.match(dashboard, /Recorded confidence/);
});
