import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildConflictExplorerLink,
  buildEvidenceGraphLink,
  buildUnifiedSpatialViewLink,
  PRAMAN_ROUTE_PATHS
} from './src/layer4DeepLinks.js';
import {
  layer4EventSelectionKey,
  readLayer4SelectedEvent,
  urlWithLayer4SelectedEvent
} from './src/layer4NavigationState.js';

const root = process.cwd();
const fakeLocation = {
  href: 'https://praman.local/layer4?q=110054&status=ACTIVE&landUse=RESIDENTIAL&cell=CELL-01&historyType=SPLIT&historical=1&parcel=IN-DL-110054-1-91&event=EVT-91',
  origin: 'https://praman.local',
  pathname: '/layer4',
  search: '?q=110054&status=ACTIVE&landUse=RESIDENTIAL&cell=CELL-01&historyType=SPLIT&historical=1&parcel=IN-DL-110054-1-91&event=EVT-91',
  hash: ''
};
const expectedReturn = '/layer4?q=110054&status=ACTIVE&landUse=RESIDENTIAL&cell=CELL-01&historyType=SPLIT&historical=1&parcel=IN-DL-110054-1-91&event=EVT-91';

function parseLocal(link) {
  return new URL(link, fakeLocation.origin);
}

const conflict = parseLocal(buildConflictExplorerLink({
  parcelId: 'IN-DL-110054-1-91',
  conflictId: 'CNF-00001',
  eventId: 'EVT-91'
}, fakeLocation));
assert.equal(conflict.pathname, PRAMAN_ROUTE_PATHS.conflictExplorer);
assert.equal(conflict.searchParams.get('parcelId'), 'IN-DL-110054-1-91');
assert.equal(conflict.searchParams.get('conflictId'), 'CNF-00001');
assert.equal(conflict.searchParams.get('eventId'), 'EVT-91');
assert.equal(conflict.searchParams.get('returnTo'), expectedReturn);

const evidence = parseLocal(buildEvidenceGraphLink({
  parcelId: 'IN-DL-110054-1-91',
  eventId: 'EVT-91',
  source: 'MUNICIPAL_GIS',
  sourceRecordId: 'SRC-1',
  state: 'current-authoritative'
}, fakeLocation));
assert.equal(evidence.pathname, PRAMAN_ROUTE_PATHS.evidenceGraph);
assert.equal(evidence.searchParams.get('parcelId'), 'IN-DL-110054-1-91');
assert.equal(evidence.searchParams.get('state'), 'current-authoritative');
assert.equal(evidence.searchParams.get('returnTo'), expectedReturn);

const spatial = parseLocal(buildUnifiedSpatialViewLink({
  parcelId: 'IN-DL-110054-1-91',
  geometryId: 'GEO-01-091-G1',
  geometryVersion: 'G1',
  state: 'historical'
}, fakeLocation));
assert.equal(spatial.pathname, PRAMAN_ROUTE_PATHS.unifiedSpatialView);
assert.equal(spatial.searchParams.get('geometryId'), 'GEO-01-091-G1');
assert.equal(spatial.searchParams.get('state'), 'historical');
assert.equal(spatial.searchParams.get('returnTo'), expectedReturn);

assert.equal(readLayer4SelectedEvent(fakeLocation), 'EVT-91');
const event = { adapter_event_key: 'ADAPTER-42', event_id: 'RAW-1' };
assert.equal(layer4EventSelectionKey(event), 'ADAPTER-42');
const changed = urlWithLayer4SelectedEvent(fakeLocation, event);
assert.equal(changed.searchParams.get('event'), 'ADAPTER-42');
assert.equal(changed.searchParams.get('q'), '110054');
assert.equal(changed.searchParams.get('cell'), 'CELL-01');
const cleared = urlWithLayer4SelectedEvent({ ...fakeLocation, href: changed.href, search: changed.search }, null);
assert.equal(cleared.searchParams.has('event'), false);
assert.equal(cleared.searchParams.get('q'), '110054');

const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const historySource = fs.readFileSync(path.join(root, 'src/ParcelTimeline.jsx'), 'utf8');
const lineageSource = fs.readFileSync(path.join(root, 'src/ParcelLineage.jsx'), 'utf8');
const spatialSource = fs.readFileSync(path.join(root, 'src/SpatialHistory.jsx'), 'utf8');

// Lineage remains a Layer 4 sub-view, not a second top-level dashboard route.
assert.match(appSource, /searchParams\.set\('view', 'lineage'\)/);
assert.doesNotMatch(appSource, /pathname\s*=\s*['"][^'"]*lineage/i);
assert.doesNotMatch(appSource, /\/parcel-lineage/);

// Switching parcel identities clears stale selected-event context; toggling the lineage sub-view does not.
assert.match(appSource, /openHistoryForParcel[\s\S]*searchParams\.delete\('event'\)/);
assert.match(appSource, /openParcel[\s\S]*searchParams\.delete\('event'\)/);
assert.doesNotMatch(appSource.match(/const openLineage[\s\S]*?\n  };/)?.[0] || '', /delete\('event'\)/);

// Neighboring dashboards are linked, not imported/embedded.
for (const source of [historySource, lineageSource, spatialSource]) {
  assert.doesNotMatch(source, /from ['"].*(ConflictExplorer|EvidenceGraph|UnifiedSpatial)/i);
}
assert.match(historySource, /VIEW SUPPORTING EVIDENCE/);
assert.match(historySource, /OPEN CONFLICT (?:CASE|EXPLORER)/);
assert.match(lineageSource, /VIEW SUPPORTING EVIDENCE/);
assert.match(spatialSource, /OPEN IN UNIFIED SPATIAL VIEW/);

// GeoGit stays behind Technical Provenance rather than becoming a dashboard section.
const technicalStart = historySource.indexOf('function TechnicalProvenance');
const inspectorStart = historySource.indexOf('function EventInspector');
assert.ok(technicalStart >= 0 && inspectorStart > technicalStart);
const beforeTechnical = historySource.slice(0, technicalStart);
const afterTechnical = historySource.slice(inspectorStart);
assert.doesNotMatch(beforeTechnical, /GeoGit commit|GeoGit event/);
assert.doesNotMatch(afterTechnical, /GeoGit commit|GeoGit event/);
assert.match(historySource.slice(technicalStart, inspectorStart), /GeoGit commit/);

// Focused SVG geometry remains Layer 4's only spatial renderer; no city-map engine is embedded.
assert.doesNotMatch(spatialSource, /from ['"]three['"]|mapbox|maplibre|leaflet/i);

console.log(JSON.stringify({
  ok: true,
  routePaths: PRAMAN_ROUTE_PATHS,
  preservedReturnTo: expectedReturn,
  selectedEvent: 'EVT-91',
  responsibilities: {
    history: 'events/state/version/proposals',
    lineage: 'identity relationships',
    conflict: 'linked only',
    evidence: 'linked only',
    spatial: 'focused geometry + linked broad context',
    geogit: 'technical provenance only'
  }
}, null, 2));
