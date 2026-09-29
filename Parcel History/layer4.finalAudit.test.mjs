import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { historicalStateForEvent, hasExplicitAuthorityEvidence } from './src/historyStateSemantics.js';
const require = createRequire(import.meta.url);
const { Layer4HistoryLineageAdapter } = require('./layer4.historyLineage.adapter.cjs');
const datasetRoot = process.env.PRAMAN_DATASET_DIR;
assert(datasetRoot, 'PRAMAN_DATASET_DIR is required');
const adapter = new Layer4HistoryLineageAdapter({ datasetRoot });
const allIds = adapter.listParcels().map((row) => row.parcelId);
assert.equal(new Set(allIds).size, allIds.length, 'Parcel directory must contain one row per parcel identity');
const models = new Map(allIds.map((id) => [id, adapter.getParcelModel(id)]));
const values = [...models.values()];
const currentModels = values.filter((m) => m.states.currentAuthoritative);
const historicalModels = values.filter((m) => m.identityClass === 'HISTORICAL_RETIRED');
function event(m, type, subtype = null) { return m.events.find((e) => e.event_type === type && (!subtype || e.event_subtype === subtype)); }
function events(m, type) { return m.events.filter((e) => e.event_type === type); }
function pick(label, predicate) { const found = values.find(predicate); assert(found, `No real dataset record found for ${label}`); return found; }
function rawBy(rows, key, value) { return rows.filter((r) => String(r[key] ?? '').trim() === value); }
const ordinary = pick('ordinary active parcel', (m) => m.states.currentAuthoritative && !m.states.proposed && !m.lineage.edges.length && !m.conflicts.length && !m.events.some((e) => ['SURVEY_OBSERVATION','GEOMETRY_CHANGE','MUTATION','SPLIT','MERGE','CONFLICT'].includes(e.event_type)));
const survey = pick('survey history', (m) => Boolean(event(m, 'SURVEY_OBSERVATION')));
const corrected = pick('accepted geometry correction', (m) => events(m, 'GEOMETRY_CHANGE').some((e) => e.authority_status === 'ACCEPTED'));
const conflict = pick('open conflict', (m) => m.conflicts.some((c) => c.status === 'OPEN'));
const mutation = pick('mutation', (m) => Boolean(event(m, 'MUTATION', 'MUTATION_RECORDED')));
const split = pick('split parent', (m) => m.lineage.outgoingEdges.filter((e) => e.semanticType === 'SPLIT').length >= 2);
const merge = pick('merge result', (m) => m.lineage.incomingEdges.filter((e) => e.semanticType === 'MERGE').length >= 2);
const historical = pick('historical parcel', (m) => m.identityClass === 'HISTORICAL_RETIRED');
const pending = pick('pending proposed state', (m) => m.states.proposed?.proposalDisposition === 'PENDING');
const rejected = pick('rejected proposal', (m) => m.states.proposed?.proposalDisposition === 'REJECTED');
const accepted = pick('accepted proposal', (m) => Boolean(event(m, 'OFFICIAL_APPROVAL', 'PROPOSAL_ACCEPTED')));
const rollback = pick('rollback/restoration', (m) => Boolean(event(m, 'MUTATION', 'ROLLBACK')));
const cellById = new Map([...adapter.tables.canonicalParcels.map((r) => [r.canonical_parcel_id, r.cell_id]), ...adapter.tables.historicalParcels.map((r) => [r.canonical_parcel_id, r.cell_id])]);
const crossEdge = adapter.tables.parcelLineage.find((r) => cellById.get(r.parent_parcel_id) && cellById.get(r.child_parcel_id) && cellById.get(r.parent_parcel_id) !== cellById.get(r.child_parcel_id));
assert(crossEdge, 'No true cross-cell lineage edge found');
const crossCell = models.get(crossEdge.child_parcel_id);
const cases = { ordinary, survey, corrected, conflict, mutation, split, merge, historical, pending, rejected, accepted, crossCell, rollback };
for (const [label, m] of Object.entries(cases)) {
  assert(allIds.includes(m.parcelId), `${label}: selected parcel missing from directory`);
  assert(m.events.every((e) => e.parcel_id === m.parcelId), `${label}: timeline contains event for a different parcel`);
  if (m.states.currentAuthoritative) assert(hasExplicitAuthorityEvidence(m.states.currentAuthoritative), `${label}: current authority lacks explicit evidence`);
  else assert.equal(m.identityClass, 'HISTORICAL_RETIRED');
  for (const e of m.events) {
    if (e.related_geogit_event_id) assert(adapter.tables.geogitEvents.some((r) => r.event_id === e.related_geogit_event_id), `${label}: invalid GeoGit provenance reference`);
  }
}
for (const m of currentModels) {
  const current = m.states.currentAuthoritative;
  const canonical = adapter.canonicalById.get(m.parcelId);
  const geometry = adapter.geometryById.get(canonical.current_geometry_id);
  assert(canonical); assert(geometry);
  assert.equal(geometry.geometry_status, 'AUTHORITATIVE');
  assert.equal(geometry.accepted_status, 'ACCEPTED');
  assert.equal(current.geometry.geometryId, canonical.current_geometry_id);
  assert.equal(current.parcelVersion, canonical.canonical_state_version || null);
}
const adapterSource = fs.readFileSync('./layer4.historyLineage.adapter.cjs', 'utf8');
const authorityMethod = adapterSource.slice(adapterSource.indexOf('getCurrentAuthoritativeState'), adapterSource.indexOf('getHistoricalStates'));
assert(!/confidence|score/i.test(authorityMethod), 'Authority selector uses confidence/score heuristic');
for (const m of currentModels.filter((x) => x.states.historical.length)) {
  const before = JSON.stringify(m.states.currentAuthoritative);
  const qualifying = m.events.find((e) => historicalStateForEvent(e, m.states.historical));
  if (!qualifying) continue;
  assert.equal(historicalStateForEvent(qualifying, m.states.historical)?.stateType, 'HISTORICAL');
  assert.equal(JSON.stringify(m.states.currentAuthoritative), before, `${m.parcelId}: history mutated current`);
}
assert(pending.states.currentAuthoritative && pending.states.proposed);
assert.equal(pending.states.proposed.authorityStatus, 'NON_AUTHORITATIVE_PENDING');
assert.equal(rejected.states.proposed.authorityStatus, 'NON_AUTHORITATIVE_REJECTED');
assert.equal(rejected.states.proposed.reviewStatus, 'REJECTED');
assert(rejected.states.currentAuthoritative);
assert.notEqual(rejected.states.currentAuthoritative.geometry?.geometryStatus, 'REJECTED');
for (const m of values) {
  for (const approval of events(m, 'OFFICIAL_APPROVAL').filter((e) => e.event_subtype === 'PROPOSAL_ACCEPTED')) {
    assert.equal(approval.authority_status, 'ACCEPTED');
    const update = rawBy(adapter.tables.geogitEvents, 'parcel_id', m.parcelId).find((r) => r.event_type === 'CANONICAL_STATE_UPDATED' && r.resulting_version === approval.parcel_version_after);
    assert(update, `${m.parcelId}: accepted proposal missing canonical update`);
    assert.equal(m.states.currentAuthoritative?.parcelVersion, update.resulting_version);
  }
}
for (const m of values) {
  const rawEdges = adapter.tables.parcelLineage.filter((r) => r.parent_parcel_id === m.parcelId || r.child_parcel_id === m.parcelId).map((r) => `${r.lineage_event_id}|${r.parent_parcel_id}|${r.child_parcel_id}|${r.event_type}`).sort();
  const modelEdges = m.lineage.edges.map((r) => `${r.lineageEventId}|${r.parentParcelId}|${r.childParcelId}|${r.eventSubtype}`).sort();
  assert.deepEqual(modelEdges, rawEdges, `${m.parcelId}: lineage differs from PARCEL_LINEAGE`);
}
assert(split.lineage.children.length >= 2);
assert(merge.lineage.parents.length >= 2);
assert(historical.lineage.children.length > 0 || historical.lineage.parents.length > 0);
assert(crossCell.lineage.parents.includes(crossEdge.parent_parcel_id));
const rollbackEvent = event(rollback, 'MUTATION', 'ROLLBACK');
assert(rollbackEvent.parcel_version_before && rollbackEvent.parcel_version_after);
assert(!rollback.lineage.edges.some((e) => e.eventSubtype === 'ROLLBACK'));
for (const m of values) {
  for (const e of events(m, 'SURVEY_OBSERVATION')) assert(!e.geometry_version_before && !e.geometry_version_after);
  for (const e of events(m, 'OFFICIAL_APPROVAL')) { assert.equal(e.event_subtype, 'PROPOSAL_ACCEPTED'); assert.equal(e.authority_status, 'ACCEPTED'); }
  for (const e of events(m, 'CONFLICT')) assert.notEqual(e.authority_status, 'ACCEPTED');
}
assert(values.some((m) => m.events.some((e) => e.event_subtype === 'PROPOSAL_REJECTED' && e.event_type === 'ADMINISTRATIVE_METADATA')));
const timelineSource = fs.readFileSync('./src/ParcelTimeline.jsx', 'utf8');
assert(!timelineSource.includes('label="Transaction ID"'));
assert(timelineSource.includes('label="Lineage record ID"'));
const sourceFiles = ['./src/App.jsx','./src/ParcelHistoryLanding.jsx','./src/ParcelTimeline.jsx','./src/ParcelLineage.jsx','./src/SpatialHistory.jsx','./src/api.js','./src/historyStateSemantics.js','./src/lineageGraph.js','./src/layer4DeepLinks.js','./src/layer4NavigationState.js','./scripts/build-layer4-index.cjs','./layer4.historyLineage.adapter.cjs'];
const combined = sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
assert(!/IN-DL-\d{6}-\d+-\d+/.test(combined));
assert(!/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/.test(combined));
assert(!/\b(?:1060|1000|1143|5602|4366|715|243|121|83|74|731)\b/.test(combined));
assert(!combined.includes("recordStatus || 'ACTIVE'"));
console.log(JSON.stringify({ok:true,representativeCases:Object.fromEntries(Object.entries(cases).map(([k,m])=>[k,m.parcelId])),crossCellEdge:{lineageEventId:crossEdge.lineage_event_id,parent:crossEdge.parent_parcel_id,parentCell:cellById.get(crossEdge.parent_parcel_id),child:crossEdge.child_parcel_id,childCell:cellById.get(crossEdge.child_parcel_id),subtype:crossEdge.event_type},verified:{parcelIdentities:values.length,currentAuthoritativeStates:currentModels.length,historicalIdentities:historicalModels.length,pendingProposals:values.filter(m=>m.states.proposed?.proposalDisposition==='PENDING').length,rejectedProposals:values.filter(m=>m.states.proposed?.proposalDisposition==='REJECTED').length,acceptedProposalEvents:values.reduce((n,m)=>n+events(m,'OFFICIAL_APPROVAL').filter(e=>e.event_subtype==='PROPOSAL_ACCEPTED').length,0),rollbackEvents:values.reduce((n,m)=>n+events(m,'MUTATION').filter(e=>e.event_subtype==='ROLLBACK').length,0),explicitLineageEdges:adapter.tables.parcelLineage.length}},null,2));
