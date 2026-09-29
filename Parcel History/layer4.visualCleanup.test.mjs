import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

const timeline = read('./src/ParcelTimeline.jsx');
const timelineCss = read('./src/parcelTimeline.css');
const landing = read('./src/ParcelHistoryLanding.jsx');
const landingCss = read('./src/parcelHistoryLanding.css');
const lineage = read('./src/ParcelLineage.jsx');
const lineageCss = read('./src/parcelLineage.css');
const spatial = read('./src/SpatialHistory.jsx');
const appCss = read('./src/app.css');

assert(timeline.includes("parcel-history-event--selected"), 'Selected timeline event needs persistent visual state.');
assert(timeline.includes('aria-pressed={isSelected}'), 'Selected event needs colour-independent accessible state.');
assert(timeline.includes('role="dialog"') && timeline.includes('aria-modal="true"'), 'Event Inspector must expose dialog semantics.');
assert(timeline.includes('closeButtonRef.current?.focus()'), 'Event Inspector should receive keyboard focus when opened.');
assert(timeline.includes('ParcelHistoryLoadingSkeleton'), 'Parcel History needs a restrained skeleton state.');
assert(timelineCss.includes('.parcel-state-column { position: static; order: 1; }'), 'Responsive layout must place current state before timeline.');
assert(timelineCss.includes('.history-column { order: 2; }'), 'Responsive timeline ordering missing.');
assert(timelineCss.includes('.parcel-history-event--geometry .event-node'), 'Geometry event must have a colour-independent marker shape.');
assert(timelineCss.includes('.parcel-history-event--merge .event-node'), 'Merge event must have a colour-independent marker shape.');
assert(timelineCss.includes('.parcel-history-event--mutation .event-node'), 'Mutation event must have a colour-independent marker shape.');
assert(timelineCss.includes('.parcel-history-event--split .event-node'), 'Split event must have a colour-independent marker shape.');
assert(timelineCss.includes('.state-panel--current'), 'Authoritative visual treatment missing.');
assert(timelineCss.includes('.state-panel--historical'), 'Historical visual treatment missing.');
assert(timelineCss.includes('.proposal-panel'), 'Proposal visual treatment missing.');

assert(landing.includes('ParcelDirectoryLoadingSkeleton'), 'Parcel directory needs a restrained skeleton state.');
assert(landingCss.includes('.history-parcel-row:hover .row-chevron'), 'Directory rows need restrained interaction feedback.');

assert(lineage.includes('Math.max(0.84, nextScale)'), 'Fit Graph must preserve readable labels instead of over-shrinking.');
assert(lineage.includes('lineage-skeleton--graph'), 'Lineage needs a restrained loading state.');
assert(lineageCss.includes('touch-action: pan-x pan-y'), 'Small-screen lineage graph should preserve pan interaction.');

assert(spatial.includes('closeButtonRef.current?.focus()'), 'Geometry dialog should receive keyboard focus.');
assert(appCss.includes('@media (prefers-reduced-motion: reduce)'), 'Reduced-motion accessibility rule missing.');
assert(appCss.includes('.sr-only'), 'Screen-reader-only utility missing.');

// Cleanup must stay presentation-focused: do not introduce a city-map renderer into Layer 4.
for (const source of [timeline, landing, lineage, spatial]) {
  assert(!/three|mapbox|maplibre|leaflet/i.test(source), 'Visual cleanup must not turn Layer 4 into a broad spatial dashboard.');
}

console.log(JSON.stringify({
  ok: true,
  checks: {
    selectedEventHierarchy: true,
    responsiveStateBeforeTimeline: true,
    colorIndependentEventMarkers: true,
    stateVisualSeparation: true,
    restrainedSkeletons: true,
    dialogKeyboardFocus: true,
    lineageReadableFitFloor: 0.84,
    lineagePanPreserved: true,
    reducedMotion: true
  }
}, null, 2));
