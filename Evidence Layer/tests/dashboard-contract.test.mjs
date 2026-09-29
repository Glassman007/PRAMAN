import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvidenceGraphDataLayerFromDirectory } from './nodeLoader.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataset = path.join(root, 'public', 'PRAMAN_DATA');

test('landing summary is fully dataset-derived', async () => {
  const layer = await loadEvidenceGraphDataLayerFromDirectory(dataset, { strict: false });
  const summary = layer.getEvidenceRunSummary();
  assert.equal(summary.sources, layer.tables.sourceMetadata.length);
  assert.equal(summary.sourceObservations, layer.tables.sourceObservations.length);
  assert.equal(summary.canonicalParcels, layer.tables.canonicalParcels.length);
  assert.equal(summary.conflicts.total, layer.tables.conflicts.length);
  assert.equal(layer.getDiagnostics({ severity: 'ERROR' }).length, 0);
});

test('dashboard source contains no hardcoded production totals', () => {
  const source = fs.readFileSync(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  for (const forbidden of ['4,366', '4366', '1,000', '1000', '715', '7 source']) {
    assert.equal(source.includes(forbidden), false, `hardcoded dataset total found: ${forbidden}`);
  }
  assert.match(source, /getEvidenceRunSummary\(\)/);
});

test('landing state leaves the drawer closed and has no stage timeline UI', () => {
  const source = fs.readFileSync(path.join(root, 'src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs'), 'utf8');
  assert.match(source, /data-role="drawer" data-open="false"/);
  assert.doesNotMatch(source, /data-role="timeline"/);
  assert.doesNotMatch(source, /data-role="stage-jumps"/);
  assert.doesNotMatch(source, /data-role="scrubber"/);
});

test('integration is additive and route-scoped', () => {
  const nav = fs.readFileSync(path.join(root, 'src/evidence-graph/integration/navigation.mjs'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'src/evidence-graph/integration/route.jsx'), 'utf8');
  assert.match(nav, /Evidence Graph/);
  assert.match(nav, /\/evidence-graph/);
  assert.match(route, /EvidenceGraphPage/);
});
