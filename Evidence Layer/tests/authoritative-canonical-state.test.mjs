import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import {
  buildAuthoritativeCanonicalStateModel,
  buildCanonicalParcelTraceModel,
  createReplayProjector,
  CANONICAL_TRACE_PRINCIPLE
} from '../src/evidence-graph/replay/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataset = path.join(root, 'public', 'PRAMAN_DATA');
const loadLayer = () => loadEvidenceGraphDataLayerFromDirectory(dataset, { strict: false });

test('final summary is calculated from the current production tables', async () => {
  const layer = await loadLayer();
  const model = buildAuthoritativeCanonicalStateModel(layer);
  const s = model.summary;
  assert.equal(s.activeCanonicalParcels, layer.tables.canonicalParcels.length);
  assert.equal(s.historicalRetiredParcels, layer.tables.historicalParcels.length);
  assert.equal(s.sourceObservations, layer.tables.sourceObservations.length);
  assert.equal(s.conflicts, layer.tables.conflicts.length);
  assert.equal(s.reconciledCases, layer.tables.reconciledParcels.filter((r) => r.match_status === 'RECONCILED').length);
  assert.equal(s.unresolvedCases, layer.tables.reconciledParcels.filter((r) => (r.unresolvedConflictIds ?? []).length > 0).length);
  assert.equal(s.humanReviewCases, layer.tables.reconciledParcels.filter((r) => r.requiresHumanReview).length);
  assert.equal(s.acceptedMatches, layer.tables.reconciledParcels.filter((r) => ['AUTO_MATCHED','MATCHED_WITH_MINOR_CONFLICT','RECONCILED'].includes(r.match_status)).length);
  assert.equal(s.ambiguousCases, layer.tables.reconciledParcels.filter((r) => ['HUMAN_REVIEW_REQUIRED','TENTATIVE','NEEDS_ADDITIONAL_EVIDENCE'].includes(r.match_status)).length);
  assert.equal(s.unmatchedObservationCases, layer.tables.sourceObservations.filter((r) => !r.candidate_canonical_parcel_id).length);
});

test('Canonical-state operation converges governed state into one registry while retaining cell membership', async () => {
  const layer = await loadLayer();
  const projection = createReplayProjector(layer, { mode: 'run' }).project(7);
  const registry = projection.nodes.find((n) => n.id === 'cluster:canonical-state:registry');
  assert.ok(registry);
  assert.equal(registry.memberRecordIds.length, layer.tables.canonicalParcels.length);
  const cellNodes = projection.nodes.filter((n) => n.stageId === 'canonical-state' && n.data?.canonicalRole === 'cell');
  assert.equal(cellNodes.length, new Set(layer.tables.canonicalParcels.map((r) => r.cell_id || 'UNASSIGNED')).size);
  assert.equal(cellNodes.reduce((sum, n) => sum + n.count, 0), layer.tables.canonicalParcels.length);
  assert.ok(projection.edges.some((e) => e.type === 'MATERIALIZED_IN_REGISTRY' && e.to === registry.id));
  assert.ok(projection.edges.some((e) => e.type === 'REGISTRY_MEMBER' && e.from === registry.id));
});

test('canonical replay is cumulative and does not hide earlier evidence operations', async () => {
  const layer = await loadLayer();
  const projection = createReplayProjector(layer, { mode: 'run' }).project(7);
  const visibleStages = new Set(projection.nodes.map((n) => n.stageId));
  for (const operation of ['sources','adapters','normalization','matching','conflict-detection','reconciliation','authority-review','canonical-state']) {
    assert.ok(visibleStages.has(operation), `missing cumulative operation ${operation}`);
  }
  assert.ok(projection.edges.some((e) => e.type === 'RECONCILIATION_TO_GOVERNANCE'));
});

test('every active canonical parcel has a supported trace back to source observations', async () => {
  const layer = await loadLayer();
  const model = buildAuthoritativeCanonicalStateModel(layer);
  assert.equal(model.traceCoverage.totalActiveCanonicalParcels, layer.tables.canonicalParcels.length);
  assert.equal(model.traceCoverage.complete, layer.tables.canonicalParcels.length);
  assert.equal(model.traceCoverage.incomplete, 0);
  assert.deepEqual(model.traceCoverage.gaps, []);
  assert.equal(model.traceCoverage.parcelsWithExplicitConflicts + model.traceCoverage.parcelsWithNoRecordedConflict, layer.tables.canonicalParcels.length);
});

test('clean parcels pass conflict detection without a fabricated conflict node', async () => {
  const layer = await loadLayer();
  const clean = layer.tables.canonicalParcels.find((parcel) => !layer.tables.conflicts.some((c) => c.canonical_parcel_id === parcel.canonical_parcel_id));
  assert.ok(clean);
  const trace = buildCanonicalParcelTraceModel(layer, clean.canonical_parcel_id);
  assert.equal(trace.found, true);
  assert.equal(trace.conflictDetection.status, 'NO_RECORDED_CONFLICT');
  assert.equal(trace.conflictDetection.conflictIds.length, 0);
  assert.equal(trace.traceComplete, true);
  const stage5 = createReplayProjector(layer, { mode: 'run' }).project(4);
  assert.equal(stage5.nodes.some((n) => n.id === 'cluster:conflict-detection:no-recorded-conflict'), false);
});

test('canonical materialization does not relabel pending governance as accepted', async () => {
  const layer = await loadLayer();
  const projection = createReplayProjector(layer, { mode: 'run' }).project(7);
  const pending = projection.edges.find((e) => e.from === 'cluster:authority-review:state:UNCHANGED_PENDING' && e.to === 'cluster:canonical-state:registry');
  assert.ok(pending);
  assert.equal(pending.type, 'MATERIALIZED_IN_REGISTRY');
  assert.equal(projection.edges.some((e) => e.type === 'ACCEPTED_AS' && e.from === 'cluster:authority-review:state:UNCHANGED_PENDING'), false);
});

test('expected active count is optional and discrepancies are reported rather than hidden', async () => {
  const layer = await loadLayer();
  const current = buildAuthoritativeCanonicalStateModel(layer);
  assert.equal(current.consistency.specificationExpectationAvailable, false);
  assert.equal(current.consistency.specificationDiscrepancy, null);
  const expected = layer.tables.canonicalParcels.length + 1;
  const compared = buildAuthoritativeCanonicalStateModel(layer, { expectedActiveCanonicalParcels: expected });
  assert.equal(compared.consistency.specificationExpectationAvailable, true);
  assert.deepEqual(compared.consistency.specificationDiscrepancy, { expected, actual: layer.tables.canonicalParcels.length, difference: -1 });
});

test('dashboard renders the final dataset summary and parcel trace inspector without hardcoding the active total', () => {
  const dashboard = fs.readFileSync(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs'), 'utf8');
  const model = fs.readFileSync(path.join(root, 'src/evidence-graph/replay/authoritativeCanonicalState.mjs'), 'utf8');
  assert.match(dashboard, /AUTHORITATIVE CANONICAL STATE/);
  assert.match(dashboard, /data-role="canonical-search-form"/);
  assert.match(dashboard, /CANONICAL_TRACE_PRINCIPLE/);
  assert.match(renderer, /FINAL DATASET SUMMARY/);
  assert.match(renderer, /Accepted matches/);
  assert.match(renderer, /Ambiguous matches/);
  assert.match(renderer, /Unmatched observations/);
  assert.equal(CANONICAL_TRACE_PRINCIPLE, 'CANONICAL STATE PRESERVES THE EVIDENCE CHAIN');
  assert.doesNotMatch(model, /expectedActiveCanonicalParcels\s*=\s*1000|activeCanonicalParcels\s*:\s*1000/);
});
