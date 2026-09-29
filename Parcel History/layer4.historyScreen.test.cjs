'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EVENT_CLASSES, Layer4HistoryLineageAdapter } = require('./layer4.historyLineage.adapter.cjs');

const datasetRoot = process.env.PRAMAN_DATASET_DIR || process.argv[2];
if (!datasetRoot) throw new Error('Pass PRAMAN_DATA directory as argv[2] or PRAMAN_DATASET_DIR.');

const adapter = new Layer4HistoryLineageAdapter({ datasetRoot });
const index = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'public/layer4-data/index.json'), 'utf8'));
const detailRoot = path.resolve(__dirname, 'public/layer4-data/parcels');

let geometryChangeEvents = 0;
let mutationWithoutGeometryTransition = 0;
let historicalWithoutCurrent = 0;
let activeWithCurrent = 0;
let splitEvents = 0;
let mergeEvents = 0;
let undatedEvents = 0;
let acceptedApprovalEvents = 0;
let rejectedDecisionEvents = 0;

for (const summary of index.parcels) {
  const model = adapter.getParcelModel(summary.parcelId);
  assert(model, `Adapter model missing for ${summary.parcelId}.`);

  const file = path.join(detailRoot, `${encodeURIComponent(summary.parcelId)}.json`);
  const detail = JSON.parse(fs.readFileSync(file, 'utf8'));

  assert.strictEqual(detail.schemaVersion, 'layer4-history-v3');
  assert.strictEqual(detail.parcel.parcelId, summary.parcelId);
  assert.strictEqual(detail.parcel.primaryStatus, summary.primaryStatus);
  assert.strictEqual(detail.parcel.landUse, summary.landUse);
  assert(Array.isArray(detail.events));

  if (model.states.currentAuthoritative) {
    activeWithCurrent += 1;
    assert(detail.currentAuthoritative, `${summary.parcelId} lost authoritative-current state.`);
    assert.strictEqual(detail.currentAuthoritative.authorityStatus, 'AUTHORITATIVE');
    assert.strictEqual(detail.currentAuthoritative.geometry.geometryStatus, 'AUTHORITATIVE');
    assert.strictEqual(detail.currentAuthoritative.geometry.acceptedStatus, 'ACCEPTED');
    assert.strictEqual(detail.currentAuthoritative.parcelId, summary.parcelId);
  } else {
    historicalWithoutCurrent += 1;
    assert.strictEqual(model.identityClass, 'HISTORICAL_RETIRED');
    assert.strictEqual(detail.currentAuthoritative, null, `${summary.parcelId} fabricated a current authoritative state.`);
  }

  const adapterByKey = new Map(model.events.map((event) => [event.adapter_event_key, event]));
  let sawUndated = false;
  let previousDated = null;

  for (const event of detail.events) {
    assert(EVENT_CLASSES.includes(event.event_type), `Unsupported event class ${event.event_type} for ${summary.parcelId}.`);
    const sourceEvent = adapterByKey.get(event.adapter_event_key);
    assert(sourceEvent, `Detail event ${event.adapter_event_key} is not dataset-adapter derived.`);
    assert.strictEqual(event.event_type, sourceEvent.event_type);
    assert.strictEqual(event.event_subtype, sourceEvent.event_subtype);
    assert.strictEqual(event.effective_date, sourceEvent.effective_date);
    assert.strictEqual(event.recorded_date, sourceEvent.recorded_date);

    const date = event.effective_date || event.recorded_date || null;
    if (!date) {
      sawUndated = true;
      undatedEvents += 1;
    } else {
      assert(!sawUndated, `Dated event appears after undated history for ${summary.parcelId}.`);
      if (previousDated) assert(previousDated <= date, `Timeline is not chronological for ${summary.parcelId}.`);
      previousDated = date;
    }

    if (event.event_subtype === 'PROPOSAL_ACCEPTED') {
      acceptedApprovalEvents += 1;
      assert.strictEqual(event.event_type, 'OFFICIAL_APPROVAL', 'Accepted proposal must be shown as official approval.');
      assert.strictEqual(event.authority_status, 'ACCEPTED');
    }

    if (event.event_subtype === 'PROPOSAL_REJECTED') {
      rejectedDecisionEvents += 1;
      assert.notStrictEqual(event.event_type, 'OFFICIAL_APPROVAL', 'Rejected proposal must not be rendered as approval.');
      assert.strictEqual(event.authority_status, 'REJECTED');
    }

    if (event.event_type === 'GEOMETRY_CHANGE') {
      geometryChangeEvents += 1;
      assert(event.geometry_version_before, `Geometry change missing prior geometry for ${summary.parcelId}.`);
      assert(event.geometry_version_after, `Geometry change missing resulting geometry for ${summary.parcelId}.`);
      assert.notStrictEqual(event.event_subtype, 'CANONICAL_BASELINE', 'Baseline geometry must not be labelled as a change.');
      assert.notStrictEqual(event.event_subtype, 'RECONSTRUCTED_LINEAGE', 'Historical reconstructed geometry must not be labelled as a change.');
      assert.strictEqual(event.geometry?.supersedesGeometryId, event.geometry_version_before);
      assert.strictEqual(event.geometry?.geometryId, event.geometry_version_after);
    }

    if (event.event_type === 'MUTATION') {
      if (!event.geometry_version_before && !event.geometry_version_after) mutationWithoutGeometryTransition += 1;
    }

    if (event.event_type === 'SPLIT') {
      splitEvents += 1;
      assert((event.related_parent_parcels || []).length > 0, `Split missing parent relation for ${summary.parcelId}.`);
      assert((event.related_child_parcels || []).length > 0, `Split missing child relation for ${summary.parcelId}.`);
    }

    if (event.event_type === 'MERGE') {
      mergeEvents += 1;
      assert((event.related_parent_parcels || []).length > 0, `Merge missing parent relation for ${summary.parcelId}.`);
      assert((event.related_child_parcels || []).length > 0, `Merge missing child relation for ${summary.parcelId}.`);
    }
  }
}

assert.strictEqual(activeWithCurrent, index.counts.currentCanonical, 'Current-state binding count differs from parcel index.');
assert.strictEqual(historicalWithoutCurrent, index.counts.historicalRetired, 'Historical parcels are not kept non-current.');
assert(geometryChangeEvents > 0, 'No real geometry-change events found.');
assert(mutationWithoutGeometryTransition > 0, 'Dataset does not exercise non-geometry mutation semantics.');
assert(splitEvents > 0, 'No split events available for branch indicator.');
assert(mergeEvents > 0, 'No merge events available for convergence indicator.');
assert(acceptedApprovalEvents > 0, 'No accepted approval events found.');
assert(rejectedDecisionEvents > 0, 'No rejected decision events found.');

const screenSource = fs.readFileSync(path.resolve(__dirname, 'src/ParcelTimeline.jsx'), 'utf8');
assert(screenSource.includes('lineage-mini--split'), 'Split branch indicator is not implemented.');
assert(screenSource.includes('lineage-mini--merge'), 'Merge convergence indicator is not implemented.');
assert(screenSource.includes('EventInspector'), 'Event inspector is not implemented.');
assert(screenSource.includes('currentAuthoritative'), 'Current-state shell is not bound to authoritative-current data.');
assert(!screenSource.includes('confidence'), 'Parcel History screen should not add confidence analytics.');

console.log(JSON.stringify({
  ok: true,
  parcels: index.parcels.length,
  activeWithCurrent,
  historicalWithoutCurrent,
  geometryChangeEvents,
  mutationWithoutGeometryTransition,
  splitEvents,
  mergeEvents,
  undatedEvents,
  acceptedApprovalEvents,
  rejectedDecisionEvents
}, null, 2));
