'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Layer4HistoryLineageAdapter } = require('./layer4.historyLineage.adapter.cjs');

const datasetRoot = process.env.PRAMAN_DATASET_DIR || process.argv[2];
if (!datasetRoot) throw new Error('Pass PRAMAN_DATA directory as argv[2] or PRAMAN_DATASET_DIR.');

const indexPath = path.resolve(__dirname, 'public/layer4-data/index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const adapter = new Layer4HistoryLineageAdapter({ datasetRoot });

const parcelList = adapter.listParcels();
assert.strictEqual(index.parcels.length, parcelList.length, 'Landing index must contain exactly one row per parcel identity.');
assert.strictEqual(new Set(index.parcels.map((row) => row.parcelId)).size, index.parcels.length, 'Landing index contains duplicate parcel rows.');

const activeCount = parcelList.filter((row) => row.registryState === 'CURRENT_AUTHORITATIVE').length;
const historicalCount = parcelList.filter((row) => row.registryState === 'HISTORICAL').length;
assert.strictEqual(index.counts.currentCanonical, activeCount, 'Current canonical count differs from adapter.');
assert.strictEqual(index.counts.historicalRetired, historicalCount, 'Historical count differs from adapter.');
assert.strictEqual(index.counts.totalIdentities, parcelList.length, 'Total identity count differs from adapter.');

const meaningful = new Set([
  'SURVEY_OBSERVATION', 'GEOMETRY_CHANGE', 'OFFICIAL_APPROVAL', 'MUTATION', 'SPLIT', 'MERGE', 'CONFLICT'
]);

for (const summary of index.parcels) {
  const model = adapter.getParcelModel(summary.parcelId);
  assert(model, `Missing adapter model for ${summary.parcelId}.`);

  if (model.states.currentAuthoritative) {
    assert.strictEqual(summary.primaryStatus, model.states.currentAuthoritative.recordStatus || 'ACTIVE', `Active status mismatch for ${summary.parcelId}.`);
    assert.notStrictEqual(summary.primaryStatus, 'PROPOSED', `Pending proposal replaced current status for ${summary.parcelId}.`);
    assert.notStrictEqual(summary.primaryStatus, 'SUPERSEDED', `Historical geometry replaced current status for ${summary.parcelId}.`);
  } else {
    assert.strictEqual(model.identityClass, 'HISTORICAL_RETIRED');
    assert.strictEqual(summary.primaryStatus, 'HISTORICAL', `Historical UI state mismatch for ${summary.parcelId}.`);
  }

  assert.strictEqual(summary.stateMarkers.includes('PROPOSED'), model.states.proposed?.proposalDisposition === 'PENDING', `Proposed marker mismatch for ${summary.parcelId}.`);
  const hasSuperseded = model.states.historical.some((state) => state.stateScope === 'GEOMETRY_ONLY' || state.recordStatus === 'SUPERSEDED_GEOMETRY');
  assert.strictEqual(summary.stateMarkers.includes('SUPERSEDED'), hasSuperseded, `Superseded marker mismatch for ${summary.parcelId}.`);

  const expectedSourceIds = [...new Set(model.sourceProvenance.map((row) => row.sourceParcelId).filter(Boolean))].sort();
  assert.deepStrictEqual(summary.sourceParcelIds, expectedSourceIds, `Source/legacy ID index mismatch for ${summary.parcelId}.`);
  assert(!Object.prototype.hasOwnProperty.call(summary, 'owner'), `Landing index must not expose owner as a search field (${summary.parcelId}).`);

  assert(summary.historyTypes.every((type) => meaningful.has(type)), `Unsupported History Type in landing index for ${summary.parcelId}.`);
  if (summary.latestMeaningfulEvent) {
    assert(meaningful.has(summary.latestMeaningfulEvent.type), `Latest event is not meaningful for ${summary.parcelId}.`);
    assert.notStrictEqual(summary.latestMeaningfulEvent.type, 'ADMINISTRATIVE_METADATA');
  }

  const parcelFile = path.resolve(__dirname, 'public/layer4-data/parcels', `${encodeURIComponent(summary.parcelId)}.json`);
  assert(fs.existsSync(parcelFile), `Static detail payload missing for ${summary.parcelId}.`);
  const detail = JSON.parse(fs.readFileSync(parcelFile, 'utf8'));
  assert.strictEqual(detail.parcel.parcelId, summary.parcelId, `Detail payload identity mismatch for ${summary.parcelId}.`);
  assert.strictEqual(detail.schemaVersion, 'layer4-history-v3', `Detail schema mismatch for ${summary.parcelId}.`);
  assert(Array.isArray(detail.events), `Detail events missing for ${summary.parcelId}.`);
}

const historicalWithDescendants = index.parcels.filter((row) => (
  row.identityClass === 'HISTORICAL_RETIRED' && row.lineage && row.lineage.childCount > 0
));
assert(historicalWithDescendants.length > 0, 'Dataset has no historical parcel with descendants to exercise the landing state.');

const derivedStatuses = [...new Set(index.parcels.flatMap((row) => row.stateMarkers))].sort();
const derivedLandUses = [...new Set(index.parcels.map((row) => row.landUse).filter(Boolean))].sort();
const derivedCells = [...new Set(index.parcels.map((row) => row.cellId).filter(Boolean))].sort();
const derivedHistoryTypes = [...new Set(index.parcels.flatMap((row) => row.historyTypes))].sort();
assert.deepStrictEqual(index.facets.statuses, derivedStatuses, 'Status filters are not dataset-derived.');
assert.deepStrictEqual(index.facets.landUses, derivedLandUses, 'Land-use filters are not dataset-derived.');
assert.deepStrictEqual(index.facets.cells, derivedCells, 'Cell filters are not dataset-derived.');
assert.deepStrictEqual(index.facets.historyTypes, derivedHistoryTypes, 'History-type filters are not dataset-derived.');

console.log(JSON.stringify({
  ok: true,
  rows: index.parcels.length,
  currentCanonical: index.counts.currentCanonical,
  historicalRetired: index.counts.historicalRetired,
  historicalWithDescendants: historicalWithDescendants.length,
  facets: index.facets
}, null, 2));
