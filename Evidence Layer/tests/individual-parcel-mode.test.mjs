import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import { buildIndividualParcelModeModel, buildParcelSearchIndex, createEvidenceReplayController, REPLAY_STAGES, ADAPTER_DEFINITIONS } from '../src/evidence-graph/replay/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const datasetRoot = path.join(root, 'public', 'PRAMAN_DATA');
const loadLayer = () => loadEvidenceGraphDataLayerFromDirectory(datasetRoot);

function cleanParcel(layer) {
  const conflictParcels = new Set(layer.tables.conflicts.map((c) => c.canonical_parcel_id));
  return layer.tables.canonicalParcels.find((p) => !conflictParcels.has(p.canonical_parcel_id))?.canonical_parcel_id;
}

function reviewedParcel(layer) {
  return layer.tables.reconciledParcels.find((r) => r.requiresHumanReview && layer.tables.geogitEvents.some((e) => e.parcel_id === r.canonical_parcel_id && e.event_type === 'HUMAN_REVIEW'))?.canonical_parcel_id;
}

function historicalLineageParcel(layer) {
  const ids = new Set(layer.tables.historicalParcels.map((p) => p.canonical_parcel_id));
  return layer.tables.parcelLineage.find((l) => ids.has(l.parent_parcel_id) || ids.has(l.child_parcel_id))?.parent_parcel_id;
}

test('parcel autocomplete index uses exactly the real canonical/historical and source parcel identifiers present in PRAMAN_DATA', async () => {
  const layer = await loadLayer();
  const index = buildParcelSearchIndex(layer);
  const canonicalIds = new Set([...layer.tables.canonicalParcels, ...layer.tables.historicalParcels].map((r) => r.canonical_parcel_id));
  const sourceParcelIds = new Set(layer.tables.sourceObservations.map((r) => r.source_parcel_id).filter(Boolean));
  assert.equal(index.length, canonicalIds.size + sourceParcelIds.size);
  assert.equal(new Set(index.map((x) => x.searchId)).size, index.length, 'every searchable identifier must be unique');
  assert.deepEqual(new Set(index.filter((x) => x.identifierType === 'CANONICAL_PARCEL').map((x) => x.searchId)), canonicalIds);
  assert.deepEqual(new Set(index.filter((x) => x.identifierType === 'SOURCE_PARCEL').map((x) => x.searchId)), sourceParcelIds);
  assert.ok(index.every((x) => canonicalIds.has(x.parcelId)), 'every source alias must resolve to a real canonical/historical parcel');
  const reconciliationByParcel = new Map(layer.tables.reconciledParcels.map((r) => [r.canonical_parcel_id, new Set(r.matchedSourceIds)]));
  for (const alias of index.filter((x) => x.identifierType === 'SOURCE_PARCEL')) {
    const sourceObservationIds = layer.tables.sourceObservations.filter((o) => o.source_parcel_id === alias.searchId).map((o) => o.observation_id);
    const matched = reconciliationByParcel.get(alias.parcelId) || new Set();
    assert.ok(sourceObservationIds.some((id) => matched.has(id)), `source alias ${alias.searchId} must resolve through recorded matched_source_ids`);
  }
});

test('focused parcel graph contains exactly the selected reconciliation observation membership', async () => {
  const layer = await loadLayer();
  const parcelId = reviewedParcel(layer);
  const recon = layer.tables.reconciledParcels.find((r) => r.canonical_parcel_id === parcelId);
  const model = buildIndividualParcelModeModel(layer, parcelId);
  assert.equal(model.found, true);
  assert.deepEqual(new Set(model.nodes.filter((n) => n.type === 'SourceObservation').map((n) => n.datasetRecordId)), new Set(recon.matchedSourceIds));
  assert.equal(model.nodes.some((n) => ['SourceGeometry','SourceSchemaProfile','ConflictEvidence'].includes(n.type)), false);
});

test('adapter nodes are project-architecture routes over real contributing source types, never fake executions', async () => {
  const layer = await loadLayer();
  const parcelId = reviewedParcel(layer);
  const model = buildIndividualParcelModeModel(layer, parcelId);
  const sourceTypes = new Set(model.story.sourceRecords.map((r) => r.sourceType));
  const expected = ADAPTER_DEFINITIONS.filter((a) => a.sourceTypes.some((t) => sourceTypes.has(t))).map((a) => a.id).sort();
  const actual = model.nodes.filter((n) => n.type === 'AdapterConcept').map((n) => n.datasetRecordId).sort();
  assert.deepEqual(actual, expected);
  assert.ok(model.nodes.filter((n) => n.type === 'AdapterConcept').every((n) => n.data.executionRecordsAvailable === false));
});

test('parcel matching shows only recorded candidate associations plus the parcel-level outcome', async () => {
  const layer = await loadLayer();
  const parcelId = reviewedParcel(layer);
  const model = buildIndividualParcelModeModel(layer, parcelId);
  const obs = model.story.sourceRecords.map((r) => layer.tables.sourceObservations.find((o) => o.observation_id === r.observationId));
  const expectedCandidates = obs.reduce((n, o) => n + (o.candidate_canonical_parcel_id ? 1 : 0) + o.alternateCandidateParcelIds.length, 0);
  assert.equal(model.nodes.filter((n) => n.type === 'MatchCandidate').length, expectedCandidates);
  assert.equal(model.nodes.filter((n) => n.type === 'MatchDecision').length, 1);
  assert.ok(model.nodes.filter((n) => n.type === 'MatchCandidate').every((n) => n.data.pairwiseScoreAvailable === false && n.data.pairwiseDecisionAvailable === false));
});

test('a clean parcel omits conflict nodes and records the non-applicable operation instead of fabricating a case', async () => {
  const layer = await loadLayer();
  const parcelId = cleanParcel(layer);
  const model = buildIndividualParcelModeModel(layer, parcelId);
  assert.ok(parcelId);
  assert.equal(model.nodes.some((n) => n.type === 'Conflict'), false);
  assert.equal(model.applicableStages.includes('conflict-detection'), false);
  assert.match(model.omittedStageNotes['conflict-detection'], /no fabricated conflict/i);
});

test('reviewed parcel exposes the real review event, review requirement, proposal and authoritative state', async () => {
  const layer = await loadLayer();
  const parcelId = reviewedParcel(layer);
  const model = buildIndividualParcelModeModel(layer, parcelId);
  assert.equal(model.story.humanReview.required, true);
  assert.ok(model.story.humanReview.explicitReviewEvents.length > 0);
  assert.ok(model.story.reconciliation.proposedState);
  assert.ok(model.story.authoritative.state);
  assert.ok(model.nodes.some((n) => n.type === 'ReviewEvent'));
  assert.ok(model.nodes.some((n) => n.type === 'AuthoritativeState'));
});

test('historical parcel mode expands only the selected parcel lineage transactions and their recorded co-participants', async () => {
  const layer = await loadLayer();
  const parcelId = historicalLineageParcel(layer);
  const model = buildIndividualParcelModeModel(layer, parcelId);
  const transactions = model.nodes.filter((n) => n.type === 'LineageTransaction');
  assert.ok(parcelId && transactions.length > 0);
  for (const n of transactions) {
    const d = n.data.details;
    assert.ok(d.parentParcelIds.includes(parcelId) || d.childParcelIds.includes(parcelId));
    assert.ok(n.memberRecordIds.every((id) => layer.tables.parcelLineage.some((r) => r.lineage_event_id === id)));
  }
});

test('Replay This Parcel uses the same state machine but only the selected parcel projection', async () => {
  const layer = await loadLayer();
  const parcelId = reviewedParcel(layer);
  const controller = createEvidenceReplayController({ dataLayer: layer, mode: 'parcel', parcelId, autoSchedule: false });
  assert.equal(controller.getSnapshot().parcelId, parcelId);
  controller.jumpToStage(REPLAY_STAGES.length - 1);
  const final = controller.getSnapshot();
  assert.equal(final.mode, 'parcel');
  assert.equal(final.metrics.parcelStory.parcelId, parcelId);
  assert.ok(final.visibleNodes.every((n) => n.data?.parcelMode === true));
  controller.destroy();
});

test('dashboard exposes autocomplete, parcel replay action and the parcel summary contract without numbered stages', async () => {
  const dashboard = await fs.readFile(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  const renderer = await fs.readFile(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs'), 'utf8');
  assert.match(dashboard, /praman-evidence-parcel-options/);
  assert.match(dashboard, /REPLAY THIS PARCEL/);
  assert.match(dashboard, /praman:evidence-graph:parcel-replay-requested/);
  assert.match(renderer, /INDIVIDUAL PARCEL MODE/);
  for (const phrase of ['Source records','Adapter routes','Why matched','Match evidence','Conflicts','Conflict handling','Human review','Authoritative result','History \/ lineage']) assert.match(renderer, new RegExp(phrase));
  assert.doesNotMatch(renderer, /'1\. Source records'|'2\. Adapter routes'/);
  assert.match(dashboard, /REPLAY RECONCILIATION/);
});
