import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  hasExplicitAuthorityEvidence,
  historicalStateForEvent,
  proposalComparisons
} from './src/historyStateSemantics.js';

const require = createRequire(import.meta.url);
const { Layer4HistoryLineageAdapter } = require('./layer4.historyLineage.adapter.cjs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const datasetRoot = process.env.PRAMAN_DATASET_DIR || process.argv[2];
if (!datasetRoot) throw new Error('Pass PRAMAN_DATA directory as argv[2] or PRAMAN_DATASET_DIR.');

const adapter = new Layer4HistoryLineageAdapter({ datasetRoot });
const index = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/layer4-data/index.json'), 'utf8'));
const detailRoot = path.join(__dirname, 'public/layer4-data/parcels');

let authoritativeCount = 0;
let historicalIdentityCount = 0;
let pendingProposalCount = 0;
let rejectedProposalCount = 0;
let proposalDiffCount = 0;
let historicalStateCount = 0;
let acceptedEventCount = 0;
let acceptedEventWithCanonicalUpdateCount = 0;

for (const summary of index.parcels) {
  const model = adapter.getParcelModel(summary.parcelId);
  const detail = JSON.parse(fs.readFileSync(path.join(detailRoot, `${encodeURIComponent(summary.parcelId)}.json`), 'utf8'));

  assert.equal(detail.schemaVersion, 'layer4-history-v3');
  assert(Array.isArray(detail.historicalStates), `${summary.parcelId}: historicalStates missing`);

  if (detail.currentAuthoritative) {
    authoritativeCount += 1;
    assert(hasExplicitAuthorityEvidence(detail.currentAuthoritative), `${summary.parcelId}: current state lacks explicit authority evidence`);
    assert.equal(detail.currentAuthoritative.sourceTable, 'CANONICAL_PARCELS');
    assert.equal(detail.currentAuthoritative.parcelId, summary.parcelId);
    assert.equal(detail.currentAuthoritative.acceptedParcelVersion, model.states.currentAuthoritative.parcelVersion);
    assert.equal(detail.currentAuthoritative.geometry.geometryId, model.states.currentAuthoritative.geometry.geometryId);
    assert.equal(detail.currentAuthoritative.geometry.acceptedStatus, 'ACCEPTED');
    assert.equal(detail.currentAuthoritative.geometry.geometryStatus, 'AUTHORITATIVE');
  } else {
    historicalIdentityCount += 1;
    assert.equal(model.identityClass, 'HISTORICAL_RETIRED');
  }

  historicalStateCount += detail.historicalStates.length;
  for (const historical of detail.historicalStates) {
    assert.equal(historical.stateType, 'HISTORICAL');
    assert.notEqual(historical.stateType, 'CURRENT_AUTHORITATIVE');
    // Inspecting a historical object must not alter the separately serialized current state.
    if (detail.currentAuthoritative) {
      assert.equal(detail.currentAuthoritative.geometry.geometryStatus, 'AUTHORITATIVE');
      assert.equal(detail.currentAuthoritative.geometry.acceptedStatus, 'ACCEPTED');
    }
  }

  const proposal = detail.proposedChange;
  if (proposal) {
    assert.equal(proposal.stateType, 'PROPOSED');
    assert.match(proposal.authorityStatus, /^NON_AUTHORITATIVE_/);
    assert.notEqual(proposal.sourceTable, 'CANONICAL_PARCELS');

    if (proposal.proposalDisposition === 'PENDING') pendingProposalCount += 1;
    if (proposal.proposalDisposition === 'REJECTED') {
      rejectedProposalCount += 1;
      assert.equal(proposal.reviewStatus, 'REJECTED');
      assert.equal(proposal.authorityStatus, 'NON_AUTHORITATIVE_REJECTED');
    }

    if (proposal.geometry) {
      assert.notEqual(proposal.geometry.geometryStatus, 'AUTHORITATIVE', `${summary.parcelId}: proposal geometry relabelled authoritative`);
      assert.notEqual(proposal.geometry.acceptedStatus, 'ACCEPTED', `${summary.parcelId}: proposal geometry relabelled accepted`);
    }

    const comparisons = proposalComparisons(detail.currentAuthoritative, proposal);
    proposalDiffCount += comparisons.length;

    // Proposal values are serialized separately; current values must continue to match the adapter's canonical state.
    if (detail.currentAuthoritative) {
      assert.equal(detail.currentAuthoritative.owner, model.states.currentAuthoritative.owner);
      assert.equal(detail.currentAuthoritative.landUse, model.states.currentAuthoritative.landUse);
      assert.equal(detail.currentAuthoritative.areaSqM, model.states.currentAuthoritative.areaSqM);
      assert.equal(detail.currentAuthoritative.geometry.geometryId, model.states.currentAuthoritative.geometry.geometryId);
    }
  }

  const acceptedEvents = model.events.filter((event) => event.event_subtype === 'PROPOSAL_ACCEPTED');
  acceptedEventCount += acceptedEvents.length;
  for (const accepted of acceptedEvents) {
    assert.equal(accepted.authority_status, 'ACCEPTED');
    const update = model.events.find((event) => (
      event.event_subtype === 'CANONICAL_STATE_UPDATED'
      && event.parcel_version_after === accepted.parcel_version_after
    ));
    assert(update, `${summary.parcelId}: accepted proposal has no corresponding canonical-state update`);
    acceptedEventWithCanonicalUpdateCount += 1;
    assert(detail.currentAuthoritative, `${summary.parcelId}: accepted proposal did not result in explicit current authority`);
    assert.equal(detail.currentAuthoritative.acceptedParcelVersion, accepted.parcel_version_after);
  }
}

assert.equal(authoritativeCount, 1000, 'Expected 1,000 explicitly authoritative current states');
assert.equal(historicalIdentityCount, 60, 'Expected 60 historical identities without current authority');
assert.equal(pendingProposalCount, 243, 'Pending proposal count changed unexpectedly');
assert.equal(rejectedProposalCount, 26, 'Rejected proposals must remain separately inspectable');
assert(historicalStateCount >= 121, 'Expected retired and superseded historical states');
assert.equal(acceptedEventCount, 731, 'Accepted proposal event count changed unexpectedly');
assert.equal(acceptedEventWithCanonicalUpdateCount, acceptedEventCount, 'Approval must be backed by canonical-state update evidence');

// A real geometry-history case proves that clicking a historical transition selects only historical inspector context.
const historyCase = JSON.parse(fs.readFileSync(path.join(detailRoot, 'IN-DL-110054-1-26.json'), 'utf8'));
const beforeCurrentGeometry = historyCase.currentAuthoritative.geometry.geometryId;
const geometryEvent = historyCase.events.find((event) => event.event_type === 'GEOMETRY_CHANGE' && event.geometry_version_before === 'GEO-01-026-G1');
assert(geometryEvent, 'Expected geometry transition for IN-DL-110054-1-26');
const historicalSelection = historicalStateForEvent(geometryEvent, historyCase.historicalStates);
assert(historicalSelection, 'Historical geometry transition did not resolve to a historical state');
assert.equal(historicalSelection.geometry.geometryId, 'GEO-01-026-G1');
assert.equal(historyCase.currentAuthoritative.geometry.geometryId, beforeCurrentGeometry, 'Historical selection overwrote current geometry');
assert.equal(historyCase.currentAuthoritative.geometry.geometryId, 'GEO-01-026-G2');

// A retired parcel can be inspected historically without becoming current.
const retiredCase = JSON.parse(fs.readFileSync(path.join(detailRoot, 'IN-DL-110054-1-101.json'), 'utf8'));
assert.equal(retiredCase.currentAuthoritative, null);
const retiredVersionEvent = retiredCase.events.find((event) => event.parcel_version_after === 'V1');
assert(retiredVersionEvent, 'Retired parcel lacks a recorded V1 event');
const retiredHistorical = historicalStateForEvent(retiredVersionEvent, retiredCase.historicalStates);
assert(retiredHistorical, 'Retired parcel history could not be selected');
assert.equal(retiredHistorical.stateType, 'HISTORICAL');
assert.equal(retiredCase.currentAuthoritative, null, 'Historical state became current after selection');

// Rejected geometry must never become the official geometry.
const rejectedGeometryCase = JSON.parse(fs.readFileSync(path.join(detailRoot, 'IN-DL-110054-5-88.json'), 'utf8'));
assert.equal(rejectedGeometryCase.proposedChange.proposalDisposition, 'REJECTED');
assert.notEqual(rejectedGeometryCase.currentAuthoritative.geometry.geometryId, 'GEO-05-088-G2');
assert.equal(rejectedGeometryCase.currentAuthoritative.geometry.geometryStatus, 'AUTHORITATIVE');
assert.equal(rejectedGeometryCase.currentAuthoritative.geometry.acceptedStatus, 'ACCEPTED');

const screenSource = fs.readFileSync(path.join(__dirname, 'src/ParcelTimeline.jsx'), 'utf8');
assert(screenSource.includes('CURRENT AUTHORITATIVE STATE'));
assert(screenSource.includes('HISTORICAL STATE'));
assert(screenSource.includes('RETURN TO CURRENT STATE'));
assert(screenSource.includes('PROPOSED CHANGE'));
assert(screenSource.includes('NOT AUTHORITATIVE'));
assert(screenSource.includes('setSelectedHistoricalState(null)'), 'Return-to-current interaction missing');
assert(screenSource.includes('historicalStateForEvent(event'), 'Timeline event does not switch historical inspector context');
assert(screenSource.includes('current={data.currentAuthoritative}'), 'Current panel is not bound to authoritative-current payload');
assert(screenSource.includes('proposal={data.proposedChange}'), 'Proposal panel is not independently bound');

console.log(JSON.stringify({
  ok: true,
  authoritativeCount,
  historicalIdentityCount,
  historicalStateCount,
  pendingProposalCount,
  rejectedProposalCount,
  proposalDiffCount,
  acceptedEventCount,
  acceptedEventWithCanonicalUpdateCount,
  historySelectionExample: {
    parcelId: 'IN-DL-110054-1-26',
    selectedHistoricalGeometry: historicalSelection.geometry.geometryId,
    currentGeometryAfterSelection: historyCase.currentAuthoritative.geometry.geometryId
  }
}, null, 2));
