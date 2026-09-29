import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import { buildAuthorityReviewModel, buildAuthorityInspectionModel, createReplayProjector, AUTHORITY_PRINCIPLE } from '../src/evidence-graph/replay/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataset = path.join(root, 'public', 'PRAMAN_DATA');
const loadLayer = () => loadEvidenceGraphDataLayerFromDirectory(dataset, { strict: false });

test('Authority / Review uses explicit governance vocabulary and counts from production tables', async () => {
  const layer = await loadLayer();
  const model = buildAuthorityReviewModel(layer);
  const events = layer.tables.geogitEvents.filter((e) => ['HUMAN_REVIEW','PROPOSAL_ACCEPTED','PROPOSAL_REJECTED'].includes(e.event_type));
  assert.equal(model.governanceEvents.length, events.length);
  assert.equal(model.reviewEvents.length, events.filter((e) => e.event_type === 'HUMAN_REVIEW').length);
  assert.equal(model.acceptedEvents.length, events.filter((e) => e.event_type === 'PROPOSAL_ACCEPTED').length);
  assert.equal(model.rejectedEvents.length, events.filter((e) => e.event_type === 'PROPOSAL_REJECTED').length);
  assert.equal(model.authorityStateCounts.AUTHORITATIVE, layer.tables.reconciledParcels.filter((r) => r.authoritativeState?.state === 'AUTHORITATIVE').length);
  assert.equal(model.authorityStateCounts.UNCHANGED_PENDING, layer.tables.reconciledParcels.filter((r) => r.authoritativeState?.state === 'UNCHANGED_PENDING').length);
  assert.equal(model.principle, AUTHORITY_PRINCIPLE);
});

test('confidence is explicitly independent of authority state', async () => {
  const layer = await loadLayer();
  const model = buildAuthorityReviewModel(layer);
  assert.equal(model.confidenceAuthorityCrosscheck.overlapExists, true);
  assert.ok(model.confidenceAuthorityCrosscheck.pendingOverallMatchRange[1] >= model.confidenceAuthorityCrosscheck.authoritativeOverallMatchRange[0]);
});

test('authority flow separates inference, proposal, recorded governance path, decisions and authority state', async () => {
  const layer = await loadLayer();
  const projection = createReplayProjector(layer, { mode: 'run' }).project(6);
  const stageNodes = projection.nodes.filter((n) => n.stageId === 'authority-review');
  const roles = new Set(stageNodes.map((n) => n.data?.details?.authorityRole).filter(Boolean));
  for (const role of ['system-inference','proposed-state','governance-path','human-review','authorized-decision','authoritative-state']) assert.ok(roles.has(role), `missing ${role}`);
  assert.equal(stageNodes.some((n) => n.status === 'AUTO_RESOLVED'), false);
  assert.ok(projection.edges.some((e) => e.stageId === 'authority-review' && e.type === 'ENTERS_GOVERNANCE_PATH'));
  assert.ok(projection.edges.some((e) => e.stageId === 'authority-review' && e.type === 'GOVERNANCE_OUTCOME'));
  assert.ok(projection.edges.some((e) => e.stageId === 'authority-review' && e.type === 'AUTHORITY_STATE_WITHOUT_EXPLICIT_GOVERNANCE_EVENT'));
});

test('review decision inspection exposes proposal, evidence, confidence, action, timestamp and resulting authority state', async () => {
  const layer = await loadLayer();
  const event = layer.tables.geogitEvents.find((e) => e.event_type === 'PROPOSAL_ACCEPTED');
  assert.ok(event);
  const model = buildAuthorityInspectionModel(layer, event.event_id);
  assert.equal(model.found, true);
  assert.equal(model.parcelId, event.parcel_id);
  assert.ok(model.proposedState);
  assert.ok(model.systemInference.confidence);
  assert.ok(model.evidence.sourceCount > 0);
  assert.equal(model.decision.eventType, 'PROPOSAL_ACCEPTED');
  assert.equal(model.decision.timestamp, event.timestamp);
  assert.ok(model.authoritativeState?.state);
  assert.equal(Object.hasOwn(model.decision, 'officerName'), false);
});

test('human review remains a review event and is not silently treated as acceptance', async () => {
  const layer = await loadLayer();
  const event = layer.tables.geogitEvents.find((e) => e.event_type === 'HUMAN_REVIEW');
  const model = buildAuthorityInspectionModel(layer, event.event_id);
  assert.equal(model.decision.eventType, 'HUMAN_REVIEW');
  assert.equal(model.authoritativeState.state, 'UNCHANGED_PENDING');
});

test('dashboard makes the authority principle explicit and never asks for officer names', () => {
  const source = fs.readFileSync(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  assert.match(source, /AUTHORITY_PRINCIPLE/);
  assert.equal(AUTHORITY_PRINCIPLE, 'AI CONFIDENCE ≠ LEGAL / AUTHORITATIVE STATUS');
  assert.match(source, /Actor type/);
  assert.doesNotMatch(source, /officer_name|officerName|Officer name/);
});
