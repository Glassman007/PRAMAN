import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import {
  auditProjectionProvenance,
  candidateRelationshipExists,
  createReplayProjector
} from '../src/evidence-graph/replay/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataset = path.join(root, 'public', 'PRAMAN_DATA');
const loadLayer = () => loadEvidenceGraphDataLayerFromDirectory(dataset, { strict: false });

function firstParcel(layer, predicate) {
  return layer.tables.reconciledParcels.find(predicate)?.canonical_parcel_id ?? null;
}

function representativeParcels(layer) {
  const conflictParcels = new Set(layer.tables.conflicts.map((row) => row.canonical_parcel_id));
  const split = layer.tables.parcelLineage.find((row) => ['SPLIT','CROSS_CELL_SPLIT'].includes(row.event_type));
  const merge = layer.tables.parcelLineage.find((row) => ['MERGE','CROSS_CELL_MERGE','REDEVELOPMENT_CONSOLIDATION'].includes(row.event_type));
  const human = layer.tables.geogitEvents.find((row) => row.event_type === 'HUMAN_REVIEW');
  const rejected = layer.tables.geogitEvents.find((row) => row.event_type === 'PROPOSAL_REJECTED');
  const rollback = layer.tables.geogitEvents.find((row) => row.event_type === 'ROLLBACK');
  const resurvey = layer.tables.geometryVersions.find((row) => /resurvey/i.test(row.change_reason || ''));
  const historical = layer.tables.historicalParcels[0];
  return [
    ['clean', firstParcel(layer, (row) => !conflictParcels.has(row.canonical_parcel_id))],
    ['conflict', firstParcel(layer, (row) => conflictParcels.has(row.canonical_parcel_id))],
    ['human-review', human?.parcel_id],
    ['rejected', rejected?.parcel_id],
    ['split', split?.parent_parcel_id],
    ['merge', merge?.parent_parcel_id],
    ['rollback', rollback?.parcel_id],
    ['resurvey', resurvey?.canonical_parcel_id],
    ['historical', historical?.canonical_parcel_id]
  ].filter(([, id]) => id);
}

test('header summary and overview aggregates derive from the same loaded PRAMAN_DATA tables', async () => {
  const layer = await loadLayer();
  const summary = layer.getEvidenceRunSummary();
  assert.equal(summary.sources, layer.tables.sourceMetadata.length);
  assert.equal(summary.sourceObservations, layer.tables.sourceObservations.length);
  assert.equal(summary.normalizedObservations, layer.tables.matchingInput.length);
  assert.equal(summary.conflicts.total, layer.tables.conflicts.length);
  assert.equal(summary.reconciliationRecords, layer.tables.reconciledParcels.length);
  assert.equal(summary.canonicalParcels, layer.tables.canonicalParcels.length);
  assert.equal(summary.historicalParcels, layer.tables.historicalParcels.length);
  assert.equal(summary.geometryVersions, layer.tables.geometryVersions.length);
  assert.equal(summary.lineageEvents, layer.tables.parcelLineage.length);
  assert.equal(summary.geogitEvents, layer.tables.geogitEvents.length);

  const projection = createReplayProjector(layer, { mode: 'run' }).project(8);
  const sourceNodes = projection.nodes.filter((node) => node.stageId === 'sources');
  assert.equal(sourceNodes.length, summary.sources);
  assert.equal(sourceNodes.reduce((sum, node) => sum + node.count, 0), summary.sourceObservations);
  const normalized = projection.nodes.find((node) => node.id === 'cluster:normalization:global-evidence-space');
  assert.equal(normalized.count, summary.normalizedObservations);
  const candidate = projection.nodes.find((node) => node.data?.matchingRole === 'candidate-generation');
  assert.equal(candidate.count, summary.candidateAssociations.total);
  assert.equal(candidate.data.derivedRelationshipIds.length, summary.candidateAssociations.total);
  const conflictNodes = projection.nodes.filter((node) => node.data?.conflictRole === 'category');
  assert.equal(conflictNodes.reduce((sum, node) => sum + node.count, 0), summary.conflicts.total);
  const registry = projection.nodes.find((node) => node.data?.canonicalRole === 'registry');
  assert.equal(registry.count, summary.canonicalParcels);
});

test('every complete-overview node and edge resolves to a real record or deterministic candidate relationship', async () => {
  const layer = await loadLayer();
  const projection = createReplayProjector(layer, { mode: 'run' }).project(8);
  const audit = auditProjectionProvenance(layer, projection);
  assert.equal(audit.ok, true, audit.errors.join('\n'));

  const candidate = projection.nodes.find((node) => node.data?.matchingRole === 'candidate-generation');
  assert.ok(candidate.memberRecordIds.every((id) => layer.tables.sourceObservations.some((row) => row.observation_id === id)));
  assert.ok(candidate.data.derivedRelationshipIds.every((id) => candidateRelationshipExists(layer, id)));
  assert.equal(projection.nodes.some((node) => node.data?.matchingRole === 'distortion-context'), false);
});

test('representative clean, conflict, review, rejection, lineage, rollback, resurvey and historical traces are provenance-clean', async () => {
  const layer = await loadLayer();
  const cases = representativeParcels(layer);
  assert.ok(cases.length >= 8, `expected representative data cases; found ${cases.length}`);
  for (const [kind, parcelId] of cases) {
    const projection = createReplayProjector(layer, { mode: 'parcel', parcelId }).project(8);
    const audit = auditProjectionProvenance(layer, projection);
    assert.equal(audit.ok, true, `${kind} ${parcelId}: ${audit.errors.join('; ')}`);
  }
});

test('optional paths remain optional rather than generating placeholder evidence', async () => {
  const layer = await loadLayer();
  const conflictParcels = new Set(layer.tables.conflicts.map((row) => row.canonical_parcel_id));
  const cleanId = firstParcel(layer, (row) => !conflictParcels.has(row.canonical_parcel_id));
  const cleanProjection = createReplayProjector(layer, { mode: 'parcel', parcelId: cleanId }).project(8);
  assert.equal(cleanProjection.nodes.some((node) => node.stageId === 'conflict-detection'), false);

  const reviewParcels = new Set(layer.tables.geogitEvents.filter((row) => row.event_type === 'HUMAN_REVIEW').map((row) => row.parcel_id));
  const noReviewId = firstParcel(layer, (row) => !reviewParcels.has(row.canonical_parcel_id));
  const noReviewProjection = createReplayProjector(layer, { mode: 'parcel', parcelId: noReviewId }).project(8);
  assert.equal(noReviewProjection.nodes.some((node) => node.entityType === 'ReviewEvent'), false);

  const lineageParcels = new Set(layer.tables.parcelLineage.flatMap((row) => [row.parent_parcel_id, row.child_parcel_id]));
  const noLineageId = firstParcel(layer, (row) => !lineageParcels.has(row.canonical_parcel_id));
  const noLineageProjection = createReplayProjector(layer, { mode: 'parcel', parcelId: noLineageId }).project(8);
  assert.equal(noLineageProjection.nodes.some((node) => node.data?.historyRole === 'lineage-transaction'), false);
});

test('no fake lifecycle-data arrays or phrase-based distortion classifier remain', () => {
  const sourceFiles = [
    'src/evidence-graph/replay/projection.mjs',
    'src/evidence-graph/replay/distortionAwareMatching.mjs',
    'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'
  ].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  assert.doesNotMatch(sourceFiles, /\b(?:demoNodes|sampleFlow|mockEvidence|lifecycleSteps)\b/);
  assert.doesNotMatch(sourceFiles, /DISTORTION_OBSERVATION_TERMS|DISTORTION_PARCEL_TERMS/);
  assert.doesNotMatch(sourceFiles, /Global assignment \/ solver output|PAIR EVIDENCE \/ CLASSIFIER INPUTS/);
});
