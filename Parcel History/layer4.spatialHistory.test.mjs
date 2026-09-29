import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { areaDifference, parsePolygonWkt, selectGeometryRefFromParcelDetail } from './src/spatialGeometry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.join(__dirname, 'public/layer4-data');
const detailRoot = path.join(dataRoot, 'parcels');
const geometryRoot = path.join(dataRoot, 'geometries');
const index = JSON.parse(fs.readFileSync(path.join(dataRoot, 'index.json'), 'utf8'));

const geometryFiles = fs.readdirSync(geometryRoot).filter((name) => name.endsWith('.json'));
assert.equal(geometryFiles.length, 1143, 'Expected one lazy geometry resource per GEOMETRY_VERSIONS row');

let parsedGeometryCount = 0;
for (const filename of geometryFiles) {
  const geometry = JSON.parse(fs.readFileSync(path.join(geometryRoot, filename), 'utf8'));
  assert.equal(geometry.schemaVersion, 'layer4-geometry-v1');
  assert(geometry.geometryId, `${filename}: geometry ID missing`);
  assert.equal(typeof geometry.geometryWkt, 'string', `${filename}: WKT missing`);
  assert(parsePolygonWkt(geometry.geometryWkt).length > 0, `${filename}: WKT not renderable by Layer 4 geometry renderer`);
  parsedGeometryCount += 1;
}

let currentGeometryRefs = 0;
let historicalGeometryRefs = 0;
let proposedGeometryRefs = 0;
let geometryChangeEvents = 0;
let lineageEvents = 0;
let lineageParcelRefs = 0;
let lineageRefsWithGeometry = 0;

for (const summary of index.parcels) {
  const detailPath = path.join(detailRoot, `${encodeURIComponent(summary.parcelId)}.json`);
  const raw = fs.readFileSync(detailPath, 'utf8');
  assert(!raw.includes('geometryWkt'), `${summary.parcelId}: initial parcel payload contains geometry coordinates`);
  const detail = JSON.parse(raw);

  if (detail.currentAuthoritative?.geometry?.geometryId) {
    currentGeometryRefs += 1;
    const ref = detail.currentAuthoritative.geometry;
    const geometry = JSON.parse(fs.readFileSync(path.join(geometryRoot, `${encodeURIComponent(ref.geometryId)}.json`), 'utf8'));
    assert.equal(geometry.geometryStatus, 'AUTHORITATIVE');
    assert.equal(geometry.acceptedStatus, 'ACCEPTED');
  }

  for (const state of detail.historicalStates || []) {
    if (!state.geometry?.geometryId) continue;
    historicalGeometryRefs += 1;
    assert(fs.existsSync(path.join(geometryRoot, `${encodeURIComponent(state.geometry.geometryId)}.json`)), `${summary.parcelId}: historical geometry resource missing`);
  }

  if (detail.proposedChange?.geometry?.geometryId) {
    proposedGeometryRefs += 1;
    const geometry = JSON.parse(fs.readFileSync(path.join(geometryRoot, `${encodeURIComponent(detail.proposedChange.geometry.geometryId)}.json`), 'utf8'));
    assert.notEqual(geometry.geometryStatus, 'AUTHORITATIVE', `${summary.parcelId}: proposal geometry resource is authoritative`);
    assert.notEqual(geometry.acceptedStatus, 'ACCEPTED', `${summary.parcelId}: proposal geometry resource is accepted`);
  }

  for (const event of detail.events || []) {
    if (event.event_type === 'GEOMETRY_CHANGE') {
      geometryChangeEvents += 1;
      for (const ref of [event.geometry_before, event.geometry_after]) {
        assert(ref?.geometryId, `${summary.parcelId}: geometry change missing referenced geometry`);
        assert(fs.existsSync(path.join(geometryRoot, `${encodeURIComponent(ref.geometryId)}.json`)), `${summary.parcelId}: geometry change lazy resource missing`);
      }
      const difference = areaDifference(event.area_before_sqm, event.area_after_sqm);
      assert.notEqual(difference, null, `${summary.parcelId}: geometry change area delta unavailable`);
    }

    if (event.event_type === 'SPLIT' || event.event_type === 'MERGE') {
      lineageEvents += 1;
      const ids = [...new Set([...(event.related_parent_parcels || []), ...(event.related_child_parcels || [])])];
      for (const parcelId of ids) {
        lineageParcelRefs += 1;
        const relatedPath = path.join(detailRoot, `${encodeURIComponent(parcelId)}.json`);
        assert(fs.existsSync(relatedPath), `${summary.parcelId}: related parcel ${parcelId} missing from Layer 4 directory`);
        const relatedDetail = JSON.parse(fs.readFileSync(relatedPath, 'utf8'));
        const eventDate = event.effective_date || event.recorded_date;
        const reference = selectGeometryRefFromParcelDetail(relatedDetail, eventDate);
        if (reference?.geometryId) {
          lineageRefsWithGeometry += 1;
          assert(fs.existsSync(path.join(geometryRoot, `${encodeURIComponent(reference.geometryId)}.json`)), `${parcelId}: related geometry resource missing`);
          if (eventDate && reference.effectiveDate) {
            assert(String(reference.effectiveDate).slice(0, 10) <= String(eventDate).slice(0, 10), `${parcelId}: lineage viewer selected a geometry newer than the relationship event`);
          }
        }
      }
    }
  }
}

assert.equal(currentGeometryRefs, 1000, 'All current canonical states should reference one official geometry');
assert(historicalGeometryRefs > 0, 'Historical geometry references missing');
assert(proposedGeometryRefs > 0, 'Dataset-backed proposed geometry cases missing');
assert.equal(geometryChangeEvents, 83, 'Geometry-change event count changed unexpectedly');
assert(lineageEvents > 0 && lineageRefsWithGeometry > 0, 'Lineage spatial geometry could not be resolved');

const apiSource = fs.readFileSync(path.join(__dirname, 'src/api.js'), 'utf8');
const spatialSource = fs.readFileSync(path.join(__dirname, 'src/SpatialHistory.jsx'), 'utf8');
const timelineSource = fs.readFileSync(path.join(__dirname, 'src/ParcelTimeline.jsx'), 'utf8');
assert(apiSource.includes('fetchGeometryVersion'), 'Lazy geometry API missing');
assert(apiSource.includes('/geometries/${encodeURIComponent(geometryId)}.json'), 'Geometry API is not using separate lazy resources');
assert(timelineSource.includes('OFFICIAL GEOMETRY'), 'Official geometry label missing');
assert(timelineSource.includes('HISTORICAL GEOMETRY'), 'Historical geometry label missing');
assert(timelineSource.includes('PROPOSED GEOMETRY'), 'Proposed geometry label missing');
assert(timelineSource.includes('NOT AUTHORITATIVE'), 'Proposal authority warning missing');
assert(spatialSource.includes('View spatial change'), 'Geometry-change spatial disclosure action missing');
assert(spatialSource.includes('Side by side'), 'Side-by-side comparison missing');
assert(spatialSource.includes('Overlay'), 'Overlay comparison missing');
assert(spatialSource.includes('ONE PARENT → MULTIPLE CHILDREN'), 'Split spatial semantics missing');
assert(spatialSource.includes('MULTIPLE PARENTS → ONE RESULT'), 'Merge spatial semantics missing');
assert(spatialSource.includes('Geometry version unavailable for this historical event'), 'Missing-geometry state is not explicit');
assert(!timelineSource.includes('geometryWkt'), 'Parcel timeline should not directly bind raw geometry coordinates');

console.log(JSON.stringify({
  ok: true,
  parsedGeometryCount,
  currentGeometryRefs,
  historicalGeometryRefs,
  proposedGeometryRefs,
  geometryChangeEvents,
  lineageEvents,
  lineageParcelRefs,
  lineageRefsWithGeometry
}, null, 2));
