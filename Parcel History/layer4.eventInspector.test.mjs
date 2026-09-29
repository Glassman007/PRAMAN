import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { historicalStateForEvent } from './src/historyStateSemantics.js';
import { buildLayer4ContextLink } from './src/layer4DeepLinks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const detailRoot = path.join(__dirname, 'public/layer4-data/parcels');
const index = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/layer4-data/index.json'), 'utf8'));

let surveys = 0;
let geometryChanges = 0;
let conflicts = 0;
let conflictsWithDetails = 0;
let mutationsWithoutFieldDelta = 0;
let splitEvents = 0;
let mergeEvents = 0;
let eventsWithHistoricalState = 0;

for (const summary of index.parcels) {
  const detail = JSON.parse(fs.readFileSync(path.join(detailRoot, `${encodeURIComponent(summary.parcelId)}.json`), 'utf8'));
  for (const event of detail.events) {
    if (event.event_type === 'SURVEY_OBSERVATION') {
      surveys += 1;
      assert(event.observation_id, `${summary.parcelId}: survey missing observation ID`);
      assert(event.observation_geometry_id, `${summary.parcelId}: survey missing observation geometry relation`);
      assert(event.survey_status, `${summary.parcelId}: survey missing dataset-backed status`);
      assert.notEqual(event.observed_area_sqm, null, `${summary.parcelId}: survey missing observed area`);
    }

    if (event.event_type === 'GEOMETRY_CHANGE') {
      geometryChanges += 1;
      assert(event.geometry_version_before, `${summary.parcelId}: geometry change missing before version`);
      assert(event.geometry_version_after, `${summary.parcelId}: geometry change missing after version`);
      assert(event.geometry_before?.geometryId, `${summary.parcelId}: geometry change missing before detail`);
      assert(event.geometry_after?.geometryId, `${summary.parcelId}: geometry change missing after detail`);
      assert.notEqual(event.area_before_sqm, null, `${summary.parcelId}: geometry change missing before area`);
      assert.notEqual(event.area_after_sqm, null, `${summary.parcelId}: geometry change missing after area`);
    }

    if (event.event_type === 'CONFLICT') {
      conflicts += 1;
      if ((event.related_conflict_ids || []).length) {
        assert(Array.isArray(event.conflict_details), `${summary.parcelId}: conflict details payload missing`);
        assert(event.conflict_details.length > 0, `${summary.parcelId}: referenced conflict has no structured detail`);
        conflictsWithDetails += 1;
        for (const conflict of event.conflict_details) {
          assert(conflict.conflictId, 'Conflict detail missing ID');
          assert(conflict.conflictType, 'Conflict detail missing type');
          assert(conflict.status, 'Conflict detail missing status');
          assert(Array.isArray(conflict.evidence), 'Conflict evidence must remain structured');
        }
      }
    }

    if (event.event_type === 'MUTATION' && !event.geometry_version_before && !event.geometry_version_after) {
      mutationsWithoutFieldDelta += 1;
    }
    if (event.event_type === 'SPLIT') splitEvents += 1;
    if (event.event_type === 'MERGE') mergeEvents += 1;

    if (historicalStateForEvent(event, detail.historicalStates || [])) eventsWithHistoricalState += 1;
  }
}

assert(surveys > 0, 'No survey events available for inspector validation');
assert(geometryChanges > 0, 'No geometry-change events available for inspector validation');
assert(conflicts > 0 && conflictsWithDetails > 0, 'No structured conflict events available');
assert(mutationsWithoutFieldDelta > 0, 'Dataset must exercise mutation without inferred field changes');
assert(splitEvents > 0 && mergeEvents > 0, 'Lineage inspector cases missing');
assert(eventsWithHistoricalState > 0, 'No event can enter historical-state mode');

const screenSource = fs.readFileSync(path.join(__dirname, 'src/ParcelTimeline.jsx'), 'utf8');
assert(screenSource.includes('VIEW STATE AT THIS POINT'), 'Historical-state action is missing');
assert(screenSource.includes('Technical Provenance'), 'Technical provenance disclosure is missing');
assert(screenSource.includes('Open Conflict Case'), 'Conflict Explorer deep link is missing');
assert(screenSource.includes('VIEW SUPPORTING EVIDENCE'), 'Evidence Graph deep link is missing');
const integrationSource = fs.readFileSync(path.join(__dirname, 'src/layer4DeepLinks.js'), 'utf8');
assert(integrationSource.includes("VITE_CONFLICT_EXPLORER_PATH"), 'Conflict Explorer route is not configurable');
assert(integrationSource.includes("VITE_EVIDENCE_GRAPH_PATH"), 'Evidence Graph route is not configurable');
assert(screenSource.includes('The dataset does not record a field-level or geometry delta for this mutation'), 'Mutation inspector may infer unrecorded changed fields');
assert(!screenSource.includes('JSON.stringify(event'), 'Event inspector dumps raw event JSON');


const returnLocation = {
  origin: 'https://praman.example',
  pathname: '/parcel-history',
  search: '?parcel=IN-DL-110054-1-26&q=CELL-01&status=ACTIVE',
  hash: '#history'
};
const conflictLink = buildLayer4ContextLink('/conflict-explorer', {
  conflictId: 'CNF-00001',
  parcelId: 'IN-DL-110054-1-26'
}, returnLocation);
const parsedConflictLink = new URL(conflictLink, returnLocation.origin);
assert.equal(parsedConflictLink.searchParams.get('conflictId'), 'CNF-00001');
assert.equal(parsedConflictLink.searchParams.get('parcelId'), 'IN-DL-110054-1-26');
assert.equal(parsedConflictLink.searchParams.get('returnTo'), '/parcel-history?parcel=IN-DL-110054-1-26&q=CELL-01&status=ACTIVE#history');

const inspectMatch = screenSource.match(/const inspectEvent = \(event\) => \{([\s\S]*?)\n  \};/);
assert(inspectMatch, 'inspectEvent handler not found');
assert(inspectMatch[1].includes('setSelectedEvent(event)'), 'Event click does not open inspector');
assert(!inspectMatch[1].includes('setSelectedHistoricalState'), 'Event click silently changes historical state');

const stateActionMatch = screenSource.match(/VIEW STATE AT THIS POINT[\s\S]{0,700}/);
assert(stateActionMatch || screenSource.includes('onViewHistoricalState(historicalState)'), 'Historical state action is not wired');
assert(screenSource.includes('onViewHistoricalState(historicalState)'), 'Historical state changes without explicit action');

console.log(JSON.stringify({
  ok: true,
  surveys,
  geometryChanges,
  conflicts,
  conflictsWithDetails,
  mutationsWithoutFieldDelta,
  splitEvents,
  mergeEvents,
  eventsWithHistoricalState
}, null, 2));
