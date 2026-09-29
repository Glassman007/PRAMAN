import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import { createEvidenceReplayController, createReplayProjector, REPLAY_STAGES } from '../src/evidence-graph/replay/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataset = path.join(root, 'public', 'PRAMAN_DATA');

async function loadLayer() { return loadEvidenceGraphDataLayerFromDirectory(dataset, { strict: false }); }

test('replay registry matches the requested lifecycle and includes supported history', () => {
  assert.deepEqual(REPLAY_STAGES.map((s) => s.label), [
    'Sources', 'Adapters', 'Normalization', 'Matching', 'Conflict Detection',
    'Reconciliation', 'Authority / Review', 'Canonical State', 'History / Lineage'
  ]);
});

test('locality replay projections are cumulative and every rendered node/edge is evidence-backed', async () => {
  const layer = await loadLayer();
  const projector = createReplayProjector(layer, { mode: 'run' });
  let priorNodes = 0;
  let priorEdges = 0;
  for (let i = 0; i < REPLAY_STAGES.length; i += 1) {
    const projection = projector.project(i);
    assert.ok(projection.nodes.length >= priorNodes, `operation ${i + 1} lost cumulative nodes`);
    assert.ok(projection.edges.length >= priorEdges, `operation ${i + 1} lost cumulative edges`);
    for (const node of projection.nodes) {
      assert.ok(Array.isArray(node.memberRecordIds) && node.memberRecordIds.length > 0, `unbacked node ${node.id}`);
      assert.ok(node.metadataRef?.table, `node ${node.id} has no source table`);
    }
    for (const edge of projection.edges) {
      assert.ok(Array.isArray(edge.memberRecordIds) && edge.memberRecordIds.length > 0, `unbacked edge ${edge.id}`);
      assert.ok(projection.nodes.some((n) => n.id === edge.from), `edge ${edge.id} missing from-node`);
      assert.ok(projection.nodes.some((n) => n.id === edge.to), `edge ${edge.id} missing to-node`);
    }
    priorNodes = projection.nodes.length;
    priorEdges = projection.edges.length;
  }
});

test('adapter and matching operations preserve audited data limitations', async () => {
  const layer = await loadLayer();
  const projector = createReplayProjector(layer, { mode: 'run' });
  const adapterProjection = projector.project(1);
  assert.equal(adapterProjection.nodes.some((n) => n.entityType === 'AdapterExecution'), false);
  assert.ok(adapterProjection.notes.some((n) => /No adapter execution\/run table exists/.test(n.note)));

  const matchingProjection = projector.project(3);
  assert.ok(matchingProjection.notes.some((n) => /No candidate-pair decision table exists/.test(n.note)));
  assert.ok(matchingProjection.notes.some((n) => /No per-alternative score/.test(n.note)));
  const candidateClusters = matchingProjection.nodes.filter((n) => n.entityType === 'MatchCandidate');
  assert.equal(candidateClusters.reduce((sum, n) => sum + n.count, 0), layer.getMatchingSummary().candidates.total);
});

test('history projection does not fabricate a GeoGit-to-geometry foreign key', async () => {
  const layer = await loadLayer();
  const projection = createReplayProjector(layer, { mode: 'run' }).project(8);
  const geometry = projection.nodes.find((n) => n.id === 'cluster:history-lineage:geometry-versions');
  const geogit = projection.nodes.find((n) => n.id === 'cluster:history-lineage:geogit-events');
  assert.ok(geometry && geogit);
  assert.equal(projection.edges.some((e) => e.from === geometry.id && e.to === geogit.id), false);
  assert.ok(projection.notes.some((n) => /no geometry_id foreign key/.test(n.note)));
});

test('parcel replay is a focused dataset-backed projection with conceptual adapter routes', async () => {
  const layer = await loadLayer();
  const parcelId = layer.tables.conflicts[0].canonical_parcel_id;
  const recon = layer.tables.reconciledParcels.find((r) => r.canonical_parcel_id === parcelId);
  const projector = createReplayProjector(layer, { mode: 'parcel', parcelId });
  const final = projector.project(REPLAY_STAGES.length - 1);
  const observationIds = new Set(final.nodes.filter((n) => n.type === 'SourceObservation').map((n) => n.datasetRecordId));
  assert.deepEqual(observationIds, new Set(recon.matchedSourceIds));
  assert.equal(final.nodes.some((n) => ['SourceGeometry','SourceSchemaProfile','ConflictEvidence'].includes(n.type)), false);
  assert.ok(final.nodes.some((n) => n.type === 'AdapterConcept'));
  assert.ok(final.nodes.filter((n) => n.type === 'AdapterConcept').every((n) => n.data?.executionRecordsAvailable === false));
});

test('replay controller is a reusable continuous state machine with transport, restoration positioning and speed', async () => {
  const layer = await loadLayer();
  const controller = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false, stageDurationMs: 1000 });
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.currentStage.label, 'Sources');
  assert.equal(snapshot.isPlaying, false);
  assert.ok(Array.isArray(snapshot.visibleNodes));
  assert.ok(Array.isArray(snapshot.visibleEdges));
  assert.equal(snapshot.selectedNode, null);
  assert.equal(snapshot.stageProgress, 0);

  controller.play();
  controller.advance(500);
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.currentStage.label, 'Sources');
  assert.equal(snapshot.stageProgress, 0.5);

  controller.setPlaybackSpeed(2);
  controller.advance(250);
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.currentStage.label, 'Adapters');
  assert.equal(snapshot.stageProgress, 0);

  controller.jumpToStage('authority-review');
  assert.equal(controller.getSnapshot().currentStage.label, 'Authority / Review');
  controller.seekTimeline(7.5);
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.currentStage.label, 'Canonical State');
  assert.equal(snapshot.stageProgress, 0.5);
  controller.destroy();
});

test('selected node is part of replay snapshot, never a synthetic animation marker', async () => {
  const layer = await loadLayer();
  const controller = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false });
  const node = controller.getSnapshot().visibleNodes[0];
  controller.selectNode(node.id);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.selectedNode.id, node.id);
  assert.ok(snapshot.selectedNode.memberRecordIds.length > 0);
  assert.equal(snapshot.selectedNode.type === 'AnimatedDot', false);
  controller.destroy();
});

test('legacy manual stage navigation APIs are absent from the production controller', () => {
  const source = fs.readFileSync(path.join(root, 'src/evidence-graph/replay/ReplayController.mjs'), 'utf8');
  for (const legacyMethod of ['previousStage()', 'nextStage()', 'restart()']) {
    assert.equal(source.includes(legacyMethod), false, `${legacyMethod} should not remain in the production controller`);
  }
});

test('dashboard exposes one continuous lifecycle controller without stage navigation', () => {
  const source = fs.readFileSync(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  for (const role of ['lifecycle-play', 'play', 'pause', 'speed', 'playback-state', 'operation-name']) {
    assert.match(source, new RegExp(`data-role=\"${role}\"`));
  }
  for (const retiredRole of ['previous', 'next', 'restart', 'scrubber', 'stage-jumps', 'timeline', 'stage-index']) {
    assert.doesNotMatch(source, new RegExp(`data-role=\"${retiredRole}\"`));
  }
  assert.match(source, /createEvidenceReplayController/);
  assert.match(source, /setPlaybackSpeed/);
  assert.doesNotMatch(source, /Previous stage|Next stage|Stage 1 \/ 9/);
});

test('continuous playback accumulates evidence, uses lifecycle states, and replay resets safely', async () => {
  const layer = await loadLayer();
  const controller = createEvidenceReplayController({ dataLayer: layer, autoSchedule: false, stageDurationMs: 1000 });
  assert.equal(controller.getSnapshot().playbackState, 'idle');
  controller.play();
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.playbackState, 'running');
  const initialNodes = snapshot.visibleNodes.length;
  controller.advance(500);
  snapshot = controller.getSnapshot();
  assert.ok(snapshot.visibleNodes.length >= initialNodes);
  const halfwayNodes = snapshot.visibleNodes.length;
  controller.advance(700);
  snapshot = controller.getSnapshot();
  assert.ok(snapshot.currentStageIndex >= 1);
  assert.ok(snapshot.visibleNodes.length >= halfwayNodes, 'previously revealed evidence must remain visible');
  controller.pause();
  assert.equal(controller.getSnapshot().playbackState, 'paused');
  controller.play();
  controller.advance(REPLAY_STAGES.length * 1000 * 2);
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.playbackState, 'completed');
  const completedNodeIds = snapshot.visibleNodes.map((node) => node.id);
  controller.replay();
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.playbackState, 'running');
  assert.equal(snapshot.currentStageIndex, 0);
  assert.equal(snapshot.stageProgress, 0);
  controller.advance(REPLAY_STAGES.length * 1000 * 2);
  assert.deepEqual(controller.getSnapshot().visibleNodes.map((node) => node.id), completedNodeIds);
  controller.destroy();
});

test('playback never creates overlapping timers or duplicate rendered evidence IDs', async () => {
  const layer = await loadLayer();
  let scheduled = 0;
  let cleared = 0;
  let nextTimerId = 0;
  const activeTimers = new Set();
  const controller = createEvidenceReplayController({
    dataLayer: layer,
    autoSchedule: true,
    stageDurationMs: 1000,
    setTimer: () => { const id = ++nextTimerId; activeTimers.add(id); scheduled += 1; return id; },
    clearTimer: (id) => { if (activeTimers.delete(id)) cleared += 1; },
  });
  controller.play();
  controller.play();
  assert.equal(scheduled, 1, 'calling play twice must not create a second playback loop');
  assert.equal(activeTimers.size, 1);
  controller.advance(4500);
  let snapshot = controller.getSnapshot();
  assert.equal(new Set(snapshot.visibleNodes.map((node) => node.id)).size, snapshot.visibleNodes.length);
  assert.equal(new Set(snapshot.visibleEdges.map((edge) => edge.id)).size, snapshot.visibleEdges.length);
  controller.replay();
  assert.equal(activeTimers.size, 1, 'replay must replace, not overlap, the prior timer');
  assert.equal(scheduled, 2);
  assert.equal(cleared, 1);
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.currentStageIndex, 0);
  assert.equal(snapshot.stageProgress, 0);
  controller.destroy();
  assert.equal(activeTimers.size, 0);
});
