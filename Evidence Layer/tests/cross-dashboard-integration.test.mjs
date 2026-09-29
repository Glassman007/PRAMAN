import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';
import {
  buildContextualDashboardActions,
  buildDashboardHref,
  buildEvidenceGraphState,
  readEvidenceGraphStateFromUrl,
  resolveEvidenceNodeContext,
  writeEvidenceGraphStateToUrl,
} from '../src/evidence-graph/integration/dashboardLinks.mjs';
import { applyUnifiedSpatialViewContext, readPramanNavigationContext } from '../src/evidence-graph/integration/targetBridges.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const datasetRoot = path.join(root, 'public', 'PRAMAN_DATA');
const loadLayer = () => loadEvidenceGraphDataLayerFromDirectory(datasetRoot);

function params(href) { return new URL(href, 'http://praman.local').searchParams; }

test('dashboard deep links carry only relevant PRAMAN context plus exact returnTo', () => {
  const context = { parcelId: 'P-1', conflictId: 'C-1', openConflictIds: ['C-1','C-2'], sourceId: 'S-1', geometryId: 'G-1', versionId: 'V-2', eventId: 'E-7', stageId: 'history-lineage' };
  const returnTo = '/evidence-graph?parcel=P-1&egStage=history-lineage&egPosition=8.4&egSearch=P-1&status=ACTIVE';

  const spatial = buildDashboardHref('unified-spatial-view', context, { returnTo });
  assert.equal(new URL(spatial, 'http://x').pathname, '/unified-spatial-view');
  assert.equal(params(spatial).get('parcel'), 'P-1');
  assert.equal(params(spatial).get('geometry'), 'G-1');
  assert.equal(params(spatial).get('version'), 'V-2');
  assert.equal(params(spatial).get('source'), 'S-1');
  assert.equal(params(spatial).get('returnTo'), returnTo);

  const conflict = buildDashboardHref('conflict-explorer', context, { returnTo });
  assert.equal(new URL(conflict, 'http://x').pathname, '/conflict-explorer');
  assert.equal(params(conflict).get('view'), 'conflicts');
  assert.equal(params(conflict).get('conflict'), 'C-1');
  assert.equal(params(conflict).get('parcel'), 'P-1');
  assert.equal(params(conflict).has('source'), false);

  const reconciliation = buildDashboardHref('reconciliation', context, { returnTo });
  assert.equal(new URL(reconciliation, 'http://x').pathname, '/conflict-explorer');
  assert.equal(params(reconciliation).get('view'), 'reconcile');
  assert.equal(params(reconciliation).get('parcel'), 'P-1');
  assert.equal(params(reconciliation).get('conflict'), 'C-1');
  assert.equal(params(reconciliation).get('open_conflicts'), 'C-1,C-2');
  assert.equal(params(reconciliation).get('context'), 'parcel-conflict-case');

  const mapping = buildDashboardHref('source-schema-mapping', context, { returnTo });
  assert.equal(new URL(mapping, 'http://x').pathname, '/source-schema-mapping');
  assert.equal(params(mapping).get('ssm_source'), 'S-1');
  assert.equal(params(mapping).has('parcel'), false);

  const history = buildDashboardHref('parcel-history-lineage', context, { returnTo });
  assert.equal(new URL(history, 'http://x').pathname, '/layer4');
  assert.equal(params(history).get('parcel'), 'P-1');
  assert.equal(params(history).get('view'), 'lineage');
  assert.equal(params(history).get('event'), 'E-7');
  assert.equal(params(history).get('version'), 'V-2');
});

test('Evidence Graph URL state round-trips parcel, stage, search, selection, speed and replay position without deleting host filters', () => {
  const snapshot = {
    mode: 'parcel', parcelId: 'P-1', currentStage: { id: 'matching' }, timelinePosition: 3.625,
    playbackSpeed: 1.5, selectedNodeId: 'MatchDecision:P-1'
  };
  const state = buildEvidenceGraphState(snapshot, { selectedParcelId: 'P-1', search: 'P-1', searchOpen: true });
  const href = writeEvidenceGraphStateToUrl(state, '/evidence-graph?status=ACTIVE&criticality=HIGH');
  const p = params(href);
  assert.equal(p.get('status'), 'ACTIVE');
  assert.equal(p.get('criticality'), 'HIGH');
  assert.equal(p.get('parcel'), 'P-1');
  assert.equal(p.get('egStage'), 'matching');
  assert.equal(p.get('egPosition'), '3.625');
  assert.equal(p.get('egSpeed'), '1.5');
  assert.equal(p.get('egNode'), 'MatchDecision:P-1');
  assert.equal(p.get('egSearch'), 'P-1');
  assert.equal(p.get('egSearchOpen'), '1');

  const restored = readEvidenceGraphStateFromUrl(href);
  assert.equal(restored.mode, 'parcel');
  assert.equal(restored.parcelId, 'P-1');
  assert.equal(restored.stageId, 'matching');
  assert.equal(restored.timelinePosition, 3.625);
  assert.equal(restored.playbackSpeed, 1.5);
  assert.equal(restored.selectedNodeId, 'MatchDecision:P-1');
  assert.equal(restored.search, 'P-1');
  assert.equal(restored.searchOpen, true);
});

test('inbound contextual parameters do not invent replay position and can infer direct context', () => {
  const state = readEvidenceGraphStateFromUrl('/evidence-graph?conflict=CNF-1&ssm_source=SRC-1&version=V2');
  assert.equal(state.timelinePosition, null);
  assert.equal(state.inboundContext.conflictId, 'CNF-1');
  assert.equal(state.inboundContext.sourceId, 'SRC-1');
  assert.equal(state.inboundContext.versionId, 'V2');
});

test('node context resolver derives parcel, source, conflict and version IDs from actual evidence records', async () => {
  const layer = await loadLayer();
  const conflict = layer.tables.conflicts[0];
  const conflictNode = { entityType: 'Conflict', datasetRecordId: conflict.conflict_id, canonicalParcelId: conflict.canonical_parcel_id, stageId: 'conflict-detection', id: `Conflict:${conflict.conflict_id}` };
  const conflictContext = resolveEvidenceNodeContext(conflictNode, layer);
  assert.equal(conflictContext.parcelId, conflict.canonical_parcel_id);
  assert.equal(conflictContext.conflictId, conflict.conflict_id);

  const obs = layer.tables.sourceObservations[0];
  const sourceMeta = layer.tables.sourceMetadata.find((s) => s.source_type === obs.source_type);
  const obsContext = resolveEvidenceNodeContext({ entityType: 'SourceObservation', datasetRecordId: obs.observation_id, canonicalParcelId: obs.candidate_canonical_parcel_id, stageId: 'sources', id: `SourceObservation:${obs.observation_id}` }, layer);
  assert.equal(obsContext.sourceId, sourceMeta.source_id);
  assert.equal(obsContext.parcelId, obs.candidate_canonical_parcel_id);

  const geometry = layer.tables.geometryVersions[0];
  const geometryContext = resolveEvidenceNodeContext({ entityType: 'GeometryVersion', datasetRecordId: geometry.geometry_id, canonicalParcelId: geometry.canonical_parcel_id, stageId: 'history-lineage', id: `GeometryVersion:${geometry.geometry_id}`, data: { versionLabel: geometry.version_label } }, layer);
  assert.equal(geometryContext.geometryId, geometry.geometry_id);
  assert.equal(geometryContext.versionId, geometry.version_label);
});

test('contextual actions are restrained to identifiers available for the selected evidence node', () => {
  const sourceActions = buildContextualDashboardActions({ sourceId: 'SRC-1', stageId: 'sources' });
  assert.deepEqual(sourceActions.map((a) => a.id), ['source-schema-mapping']);

  const conflictActions = buildContextualDashboardActions({ parcelId: 'P-1', conflictId: 'C-1', stageId: 'conflict-detection' });
  assert.deepEqual(conflictActions.map((a) => a.id), ['unified-spatial-view','conflict-explorer','reconciliation','parcel-history-lineage']);

  const historyActions = buildContextualDashboardActions({ parcelId: 'P-1', versionId: 'V-2', eventId: 'E-2', stageId: 'history-lineage' });
  assert.deepEqual(historyActions.map((a) => a.id), ['unified-spatial-view','parcel-history-lineage']);
});



test('Unified Spatial bridge applies transferred parcel context through the existing stable spatial API', () => {
  const calls = [];
  const result = applyUnifiedSpatialViewContext({
    locationLike: '/unified-spatial-view?parcel=P-1&geometry=G-1&version=V-2&source=S-1&returnTo=%2Fevidence-graph%3Fparcel%3DP-1',
    spatialApi: { selectParcel(parcelId, openPanel) { calls.push([parcelId, openPanel]); return parcelId === 'P-1'; } },
  });
  assert.equal(result.applied, true);
  assert.deepEqual(calls, [['P-1', true]]);
  assert.equal(result.context.geometryId, 'G-1');
  assert.equal(result.context.versionId, 'V-2');
  assert.equal(result.context.sourceId, 'S-1');
  assert.equal(result.context.returnTo, '/evidence-graph?parcel=P-1');
});

test('generic target context reader understands the dashboard-specific source-selection parameter', () => {
  const context = readPramanNavigationContext('/source-schema-mapping?ssm_source=SRC-7&returnTo=%2Fevidence-graph%3FegStage%3Dsources');
  assert.equal(context.sourceId, 'SRC-7');
  assert.equal(context.returnTo, '/evidence-graph?egStage=sources');
});

test('dashboard exposes all five contextual actions and return-state navigation without importing target dashboards', async () => {
  const dashboard = await fs.readFile(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  const links = await fs.readFile(path.join(root, 'src/evidence-graph/integration/dashboardLinks.mjs'), 'utf8');
  for (const label of ['View on Unified Spatial View','Open Conflict Explorer','Open Reconciliation','View Source & Schema Mapping','View Parcel History & Lineage']) assert.match(links, new RegExp(label));
  assert.match(dashboard, /praman:evidence-graph:navigate-dashboard/);
  assert.match(dashboard, /persistNavigationState/);
  assert.match(dashboard, /restoreInitialNavigationState/);
  assert.match(links, /returnTo/);
  assert.doesNotMatch(dashboard, /import .*UnifiedSpatial|import .*ConflictExplorer|import .*Reconciliation|import .*ParcelTimeline/);
});
