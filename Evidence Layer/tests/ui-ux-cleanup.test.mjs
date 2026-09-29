import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboardPath = new URL('../src/evidence-graph/dashboard/EvidenceGraphDashboard.mjs', import.meta.url);
const rendererPath = new URL('../src/evidence-graph/dashboard/EvidenceGraphRenderer.mjs', import.meta.url);
const cssPath = new URL('../src/evidence-graph/dashboard/evidenceGraph.css', import.meta.url);
const [dashboard, renderer, css] = await Promise.all([
  readFile(dashboardPath, 'utf8'), readFile(rendererPath, 'utf8'), readFile(cssPath, 'utf8'),
]);

test('landing state presents one clear lifecycle action without implying a replay already happened', () => {
  assert.match(dashboard, /Evidence Graph/);
  assert.match(dashboard, /data-role="lifecycle-play" disabled/);
  assert.match(dashboard, /PLAY FULL RECONCILIATION LIFECYCLE/);
  assert.match(dashboard, /data-role="replay" hidden disabled>REPLAY RECONCILIATION/);
  assert.match(dashboard, /SEARCH PARCEL/);
  assert.match(dashboard, /FILTERS/);
  assert.match(dashboard, /Watch PRAMAN turn source evidence into authoritative canonical parcels/);
  assert.doesNotMatch(dashboard, /Ready to explain the reconciliation lifecycle/);
  assert.doesNotMatch(dashboard, /eg-empty-mark/);
  assert.doesNotMatch(dashboard, /eg-landing-flow/);
  assert.match(css, /\.eg-lifecycle-play/);
  assert.doesNotMatch(css, /\.eg-empty-mark/);
  assert.match(dashboard, /Loading PRAMAN evidence/);
});

test('central lifecycle action starts the existing real replay controller and replay appears only after completion', () => {
  assert.match(dashboard, /const lifecyclePlayHandler = \(\) => beginOverviewLifecycle\(\{ autoplay: true \}\)/);
  assert.match(dashboard, /startController\(\{ mode: 'run', autoplay \}\)/);
  assert.match(dashboard, /overviewLifecycleComplete/);
  assert.match(dashboard, /hasCompletedOverviewLifecycle = true/);
  assert.match(dashboard, /els\.replay\.hidden = !hasCompletedOverviewLifecycle/);
  assert.match(dashboard, /praman:evidence-graph:replay-requested/);
});

test('parcel mode exposes an explicit return-to-overview treatment without adding another route', () => {
  assert.match(dashboard, /BACK TO RECONCILIATION OVERVIEW/);
  assert.match(dashboard, /returningFromParcel/);
  assert.match(dashboard, /beginOverviewLifecycle\(\{ autoplay: false \}\)/);
});

test('selected-node UX preserves upstream/downstream context instead of hiding graph evidence', () => {
  assert.match(renderer, /directParentIds/);
  assert.match(renderer, /directChildIds/);
  assert.match(renderer, /is-parent-neighbor/);
  assert.match(renderer, /is-child-neighbor/);
  assert.match(css, /has-selection \.eg-graph-node:not\(\.is-selected\):not\(\.is-direct-neighbor\)/);
  assert.match(css, /\.eg-graph-surface\.has-selection \.eg-edge\.is-selection-edge/);
});

test('edge styling distinguishes candidate, rejected, conflict and historical relationships', () => {
  assert.match(renderer, /is-candidate-relation/);
  assert.match(renderer, /is-rejected-relation/);
  assert.match(css, /\.eg-edge\.is-candidate-relation/);
  assert.match(css, /\.eg-edge\.is-rejected-relation/);
  assert.match(css, /\.eg-edge\.is-conflict-route/);
  assert.match(css, /\.eg-edge\.is-history-route/);
});

test('continuous lifecycle uses a single waterfall surface with lightweight operation wayfinding', () => {
  assert.match(renderer, /eg-waterfall-operation/);
  assert.match(renderer, /TRACE RETAINED/);
  assert.match(renderer, /FLOWING/);
  assert.match(renderer, /buildWaterfallLayout/);
  assert.match(css, /\.eg-waterfall-operation\.is-active/);
  assert.match(css, /data-replay-open="true"\] \.eg-canvas/);
  assert.doesNotMatch(renderer, /eg-lifecycle-section/);
  assert.doesNotMatch(css, /\.eg-lifecycle-section/);
  assert.doesNotMatch(dashboard, /data-role="stage-jumps"|data-role="scrubber"/);
  assert.doesNotMatch(css, /\.eg-stage-jump|\.eg-scrubber/);
});

test('inspector remains usable with document-flow scrolling and collapses advanced audit detail', () => {
  assert.match(css, /data-replay-open="true"\] \.eg-drawer \{/);
  assert.match(css, /position: fixed/);
  assert.match(dashboard, /eg-inspector-advanced/);
  assert.match(dashboard, /Time & version metadata\|Recorded limitations/);
  assert.match(css, /@media \(max-width: 1100px\)/);
  assert.match(css, /@media \(max-height: 820px\) and \(min-width: 901px\)/);
});

test('confidence remains dimension-specific in the renderer', () => {
  assert.match(renderer, /source reliability/);
  assert.match(renderer, /matching confidence/);
  assert.match(renderer, /correction confidence/);
  assert.match(renderer, /reconciliation confidence/);
  assert.doesNotMatch(renderer, /universal confidence/i);
});

test('dataset load failure shows a polished user-facing state while retaining the real error event', () => {
  assert.match(dashboard, /Evidence Graph could not load the PRAMAN dataset/);
  assert.match(dashboard, /Verify the PRAMAN_DATA path and reload this view/);
  assert.match(dashboard, /praman:evidence-graph:error/);
});
