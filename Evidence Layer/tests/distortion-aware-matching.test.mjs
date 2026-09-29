import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import {
  MATCH_OUTCOME_GROUPS,
  buildDistortionAwareMatchingModel,
  buildMatchingObservationModel,
  classifyMatchOutcome,
  createReplayProjector
} from '../src/evidence-graph/replay/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataset = path.join(root, 'public', 'PRAMAN_DATA');
const loadLayer = () => loadEvidenceGraphDataLayerFromDirectory(dataset, { strict: false });

function expectedCandidateAssociations(layer) {
  return layer.tables.sourceObservations.reduce((sum, row) => sum + (row.candidate_canonical_parcel_id ? 1 : 0) + row.alternateCandidateParcelIds.length, 0);
}

test('Matching operation uses the recorded candidate population rather than recalculating nearest polygons', async () => {
  const layer = await loadLayer();
  const model = buildDistortionAwareMatchingModel(layer);
  assert.equal(model.candidateAssociations.length, expectedCandidateAssociations(layer));
  assert.equal(model.primaryCandidateAssociationIds.length, layer.tables.sourceObservations.filter((row) => row.candidate_canonical_parcel_id).length);
  assert.equal(model.alternateCandidateAssociationIds.length, layer.tables.sourceObservations.reduce((sum, row) => sum + row.alternateCandidateParcelIds.length, 0));
  assert.equal(model.pairEvidenceObservationIds.length, layer.tables.sourceObservations.length);
  assert.equal(model.assignmentParcelIds.length, layer.tables.reconciledParcels.length);
  assert.equal(model.limitations.pairwiseScoreAvailable, false);
  assert.equal(model.limitations.pairwiseAcceptanceDecisionAvailable, false);
  assert.equal(model.limitations.solverCostAvailable, false);
});

test('accepted ambiguous and rejected groups are deterministic mappings of parcel-level match_status', async () => {
  const layer = await loadLayer();
  const model = buildDistortionAwareMatchingModel(layer);
  for (const row of layer.tables.reconciledParcels) {
    const group = classifyMatchOutcome(row.match_status);
    assert.ok(['ACCEPTED', 'AMBIGUOUS', 'REJECTED', 'OTHER'].includes(group));
    assert.ok(model.outcomeGroups[group].parcelIds.includes(row.canonical_parcel_id));
  }
  const acceptedExpected = layer.tables.reconciledParcels.filter((row) => MATCH_OUTCOME_GROUPS.ACCEPTED.includes(row.match_status)).length;
  const ambiguousExpected = layer.tables.reconciledParcels.filter((row) => MATCH_OUTCOME_GROUPS.AMBIGUOUS.includes(row.match_status)).length;
  const rejectedExpected = layer.tables.reconciledParcels.filter((row) => MATCH_OUTCOME_GROUPS.REJECTED.includes(row.match_status)).length;
  assert.equal(model.outcomeGroups.ACCEPTED.count, acceptedExpected);
  assert.equal(model.outcomeGroups.AMBIGUOUS.count, ambiguousExpected);
  assert.equal(model.outcomeGroups.REJECTED.count, rejectedExpected);
});

test('unmatched is not fabricated when every observation has a primary candidate', async () => {
  const layer = await loadLayer();
  const model = buildDistortionAwareMatchingModel(layer);
  const expected = layer.tables.sourceObservations.filter((row) => !row.candidate_canonical_parcel_id).map((row) => row.observation_id);
  assert.deepEqual(model.unmatchedObservationIds, expected);
  const projection = createReplayProjector(layer, { mode: 'run' }).project(3);
  assert.equal(projection.nodes.some((node) => node.id === 'cluster:matching:outcome:UNMATCHED'), expected.length > 0);
});

test('matching projection is aggregated and follows normalized → candidate relationships → recorded evidence → parcel outcomes', async () => {
  const layer = await loadLayer();
  const projection = createReplayProjector(layer, { mode: 'run' }).project(3);
  const stage4 = projection.nodes.filter((node) => node.stageId === 'matching');
  assert.ok(stage4.length < 20, 'Matching operation should remain locality-scale aggregated');
  const candidate = stage4.find((node) => node.data?.matchingRole === 'candidate-generation');
  const pair = stage4.find((node) => node.data?.matchingRole === 'recorded-evidence');
  const assignment = stage4.find((node) => node.data?.matchingRole === 'recorded-outcomes');
  assert.ok(candidate && pair && assignment);
  assert.equal(stage4.some((node) => node.data?.matchingRole === 'distortion-context'), false);
  assert.ok(candidate.memberRecordIds.every((id) => layer.tables.sourceObservations.some((row) => row.observation_id === id)));
  assert.equal(candidate.data.derivedRelationshipIds.length, expectedCandidateAssociations(layer));
  assert.ok(projection.edges.some((edge) => edge.from === 'cluster:normalization:global-evidence-space' && edge.to === candidate.id));
  assert.ok(projection.edges.some((edge) => edge.from === candidate.id && edge.to === pair.id));
  assert.ok(projection.edges.some((edge) => edge.from === pair.id && edge.to === assignment.id && edge.type === 'RECORDED_MATCH_OUTCOME'));
  for (const outcome of stage4.filter((node) => node.data?.matchingRole === 'outcome-group')) {
    assert.ok(projection.edges.some((edge) => edge.from === assignment.id && edge.to === outcome.id));
  }
});

test('no structured distortion population is fabricated from narrative phrases', async () => {
  const layer = await loadLayer();
  const model = buildDistortionAwareMatchingModel(layer);
  assert.equal(model.distortion.structuredOutputAvailable, false);
  assert.deepEqual(model.distortion.observationIds, []);
  assert.deepEqual(model.distortion.parcelIds, []);
  assert.equal(model.distortion.correctionAppliedBeforeIdentity, false);
  const projection = createReplayProjector(layer, { mode: 'run' }).project(3);
  assert.equal(projection.nodes.some((node) => node.data?.matchingRole === 'distortion-context'), false);
  assert.ok(projection.notes.some((note) => /no structured matching-distortion output/i.test(note.note)));
});

test('individual observation inspection exposes recorded evidence and marks unsupported pair features unavailable', async () => {
  const layer = await loadLayer();
  const observation = layer.tables.sourceObservations.find((row) => row.alternateCandidateParcelIds.length > 0) ?? layer.tables.sourceObservations[0];
  const model = buildMatchingObservationModel(layer, observation.observation_id);
  assert.equal(model.found, true);
  assert.equal(model.candidates[0].role, 'PRIMARY');
  assert.equal(model.candidates[0].pairwiseScore, null);
  assert.equal(model.candidates[0].pairwiseDecision, null);
  assert.equal(model.evidence.identifier.identifierConfidence, observation.identifierConfidence);
  assert.equal(model.evidence.temporal.temporalFreshness, observation.temporalFreshness);
  assert.equal(model.evidence.sourceQuality.sourceReliability, observation.sourceReliability);
  assert.equal(model.evidence.neighbourhoodAdjacency.available, false);
  assert.equal(model.evidence.topology.available, false);
  assert.equal(model.evidence.distortion.geometryCorrectionAppliedAtMatching, false);
  assert.equal(model.limitations.solverCostAvailable, false);
});

test('area comparison is inspectable but never labelled as a recorded classifier score', async () => {
  const layer = await loadLayer();
  const observation = layer.tables.sourceObservations.find((row) => Number.isFinite(row.observedArea) && row.candidate_canonical_parcel_id);
  const model = buildMatchingObservationModel(layer, observation.observation_id);
  const primary = model.candidates.find((row) => row.role === 'PRIMARY');
  assert.ok(primary);
  assert.equal(primary.areaComparisonIsDerived, true);
  assert.equal(primary.pairwiseScore, null);
  assert.equal(model.evidence.area.recordedAreaSimilarityScore, null);
});

test('dashboard matching inspector names only stored or explicitly unavailable evidence', () => {
  const dashboard = fs.readFileSync(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  assert.match(dashboard, /RECORDED MATCHING EVIDENCE/);
  assert.match(dashboard, /RECORDED PARCEL MATCH OUTCOMES/);
  assert.match(dashboard, /No structured distortion-model output is stored/);
  assert.match(dashboard, /Pair score: unavailable/);
  assert.match(dashboard, /No pair-level adjacency\/neighbourhood feature vector is stored/);
  assert.match(dashboard, /data-role="matching-observation-form"/);

  const renderer = fs.readFileSync(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs'), 'utf8');
  assert.match(renderer, /MATCHING EVIDENCE/);
  assert.doesNotMatch(renderer, /DISTORTION CONTEXT/);
  assert.match(renderer, /PARCEL OUTCOMES/);
  assert.match(renderer, /is-matching-route/);
});
