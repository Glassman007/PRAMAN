'use strict';

const assert = require('assert');
const path = require('path');
const { EVENT_CLASSES, Layer4HistoryLineageAdapter } = require('./layer4.historyLineage.adapter.cjs');

const datasetRoot = process.env.PRAMAN_DATASET_DIR
  || path.resolve(__dirname, '../dataset/PRAMAN_DATA');

const adapter = new Layer4HistoryLineageAdapter({ datasetRoot });
const audit = adapter.getAuditMetadata();

assert.strictEqual(audit.rowCounts.canonicalParcels, 1000, 'Expected 1,000 active canonical parcels');
assert.strictEqual(audit.rowCounts.historicalParcels, 60, 'Expected 60 historical retired parcels');
assert.strictEqual(audit.rowCounts.parcelLineage, 74, 'Expected 74 lineage edges');

for (const parcel of adapter.listParcels().filter((item) => item.registryState === 'CURRENT_AUTHORITATIVE')) {
  const state = adapter.getCurrentAuthoritativeState(parcel.parcelId);
  assert(state, `${parcel.parcelId} must have current authoritative state`);
  assert.strictEqual(state.geometry.geometryStatus, 'AUTHORITATIVE');
  assert.strictEqual(state.geometry.acceptedStatus, 'ACCEPTED');
}

const pending = adapter.getParcelModel('IN-DL-110054-1-23');
assert.strictEqual(pending.states.currentAuthoritative.geometry.geometryId, 'GEO-01-023-G1');
assert.strictEqual(pending.states.proposed.authorityStatus, 'NON_AUTHORITATIVE_PENDING');
assert.strictEqual(pending.states.proposed.geometry.geometryId, 'GEO-01-023-G2');
assert.strictEqual(pending.states.proposed.geometry.geometryStatus, 'PROPOSED');

const geometryAcceptedButStatePending = adapter.getParcelModel('IN-DL-110054-1-26');
assert.strictEqual(geometryAcceptedButStatePending.states.currentAuthoritative.geometry.geometryId, 'GEO-01-026-G2');
assert.strictEqual(geometryAcceptedButStatePending.states.proposed.authorityStatus, 'NON_AUTHORITATIVE_PENDING');
assert.strictEqual(geometryAcceptedButStatePending.states.proposed.geometry, null, 'Accepted geometry must not be relabelled as proposed geometry');
assert(geometryAcceptedButStatePending.states.historical.some((state) => state.geometry?.geometryId === 'GEO-01-026-G1'));

const acceptedG2 = adapter.getParcelModel('IN-DL-110054-1-90');
assert.strictEqual(acceptedG2.states.currentAuthoritative.geometry.geometryId, 'GEO-01-090-G2');
assert.strictEqual(acceptedG2.states.proposed, null);

const rejectedG2 = adapter.getParcelModel('IN-DL-110054-5-88');
assert.notStrictEqual(rejectedG2.states.currentAuthoritative.geometry.geometryId, 'GEO-05-088-G2');
assert(rejectedG2.states.proposed, 'Rejected proposal must remain inspectable as non-authoritative proposal history');
assert.strictEqual(rejectedG2.states.proposed.proposalDisposition, 'REJECTED');
assert.strictEqual(rejectedG2.states.proposed.authorityStatus, 'NON_AUTHORITATIVE_REJECTED');
assert.strictEqual(rejectedG2.reconciliation.proposalDisposition, 'REJECTED');
assert(rejectedG2.events.some((event) => event.geometry_status === 'REJECTED' && event.source_record_id === 'GEO-05-088-G2'));

const splitParent = adapter.getParcelModel('IN-DL-110054-1-101');
assert.strictEqual(splitParent.states.currentAuthoritative, null);
assert.deepStrictEqual(new Set(splitParent.lineage.children), new Set(['IN-DL-110054-1-91', 'IN-DL-110054-1-92']));
assert(splitParent.states.historical.some((state) => state.stateScope === 'RETIRED_PARCEL'));

const mergeChild = adapter.getParcelModel('IN-DL-110054-1-93');
assert.deepStrictEqual(new Set(mergeChild.lineage.parents), new Set(['IN-DL-110054-1-102', 'IN-DL-110054-1-103']));
assert(mergeChild.events.some((event) => event.event_type === 'MERGE' && event.event_subtype === 'MERGE'));

for (const parcelId of ['IN-DL-110054-1-23', 'IN-DL-110054-1-101', 'IN-DL-110054-1-93']) {
  const model = adapter.getParcelModel(parcelId);
  for (const event of model.events) {
    assert(EVENT_CLASSES.includes(event.event_type), `Unsupported event type ${event.event_type}`);
  }
}

assert(adapter.getParcelModel('IN-DL-110054-1-1').sourceProvenance.some((item) => item.sourceParcelId === 'SRC-1-1'));
assert.strictEqual(adapter.getParcelModel('NOT-A-PARCEL'), null);

console.log('Layer 4 history/lineage adapter tests: PASS');
console.log(JSON.stringify(audit.rowCounts, null, 2));
