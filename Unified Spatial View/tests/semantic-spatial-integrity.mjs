import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFlatLayerModel} from '../map/flat-layer-model.js';
import {createTemporalModel,isCurrentAuthority} from '../data/temporal-model.js';
import {createEvidenceModel} from '../data/evidence-model.js';
import {buildCitySearchIndex} from '../map/city-search.js';

const read=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const data=read('normalized-map.json'),derived=read('evidence-map.json'),details={...read('temporal-details.json'),lineageGeometryAudit:read('temporal-geometry-audit.json')};
const flat=buildFlatLayerModel(data),temporal=createTemporalModel(data,details),evidence=createEvidenceModel(data,derived,temporal),search=buildCitySearchIndex(data);
const geometryVersionById=new Map(data.geometryVersions.map(g=>[g.id,g]));
const sourceCounts=new Map();for(const s of data.sources)sourceCounts.set(s.parcel_id,(sourceCounts.get(s.parcel_id)||0)+1);
const conflictsByParcel=new Map();for(const c of data.conflicts){if(!conflictsByParcel.has(c.parcel_id))conflictsByParcel.set(c.parcel_id,[]);conflictsByParcel.get(c.parcel_id).push(c);}

const representative={
 ordinary:data.parcels.find(p=>isCurrentAuthority(p,geometryVersionById.get(p.geometryId))&&!conflictsByParcel.has(p.id)&&(sourceCounts.get(p.id)||0)>=4),
 multiple:[...data.parcels].sort((a,b)=>(sourceCounts.get(b.id)||0)-(sourceCounts.get(a.id)||0))[0],
 geometryConflict:data.conflicts.find(c=>['SHIFTED_GEOMETRY','BUILDING_FOOTPRINT_CROSSES_PARCEL','ROAD_WIDENING_BOUNDARY_CORRECTION','PARK_BOUNDARY_DISAGREEMENT'].includes(c.type)),
 historical:data.historicalParcels.find(p=>data.lineage.some(r=>r.parentParcelId===p.id||r.childParcelId===p.id)),
 corrected:data.parcels.find(p=>{const rows=data.geometryVersions.filter(g=>g.parcelId===p.id);return rows.some(g=>g.status==='SUPERSEDED')&&rows.some(g=>g.status==='AUTHORITATIVE'&&g.acceptedStatus==='ACCEPTED');}),
 conflict:data.conflicts.find(c=>c.review_status==='OPEN')||data.conflicts[0],
 split:data.lineage.find(r=>r.acceptedStatus==='ACCEPTED'&&r.type.includes('SPLIT')),
 merge:data.lineage.find(r=>r.acceptedStatus==='ACCEPTED'&&r.type.includes('MERGE')),
 proposed:data.geometryVersions.find(g=>g.status==='PROPOSED'||g.acceptedStatus==='PENDING_HUMAN_APPROVAL')
};
for(const [kind,row] of Object.entries(representative))assert(row,`dataset does not contain representative ${kind} case`);

test('canonical map source uses only explicit current authority and its linked accepted geometry',()=>{
 const layer=flat.layers.get('canonical'),expected=data.parcels.filter(p=>isCurrentAuthority(p,geometryVersionById.get(p.geometryId))&&geometryVersionById.get(p.geometryId)?.geometry?.geometry);
 assert.equal(layer.features.length,expected.length);
 for(const feature of layer.features){const p=flat.parcelById.get(feature.parcelId),g=geometryVersionById.get(feature.geometryId);assert(isCurrentAuthority(p,g));assert.equal(feature.geometryId,p.geometryId);assert.deepEqual(feature.geometry,g.geometry.geometry);}
});

test('corrected current parcel renders accepted current geometry while retaining superseded geometry as historical only',()=>{
 const p=representative.corrected,versions=data.geometryVersions.filter(g=>g.parcelId===p.id),current=versions.find(g=>g.status==='AUTHORITATIVE'&&g.acceptedStatus==='ACCEPTED'),old=versions.find(g=>g.status==='SUPERSEDED');
 assert(current&&old);const feature=flat.layers.get('canonical').features.find(f=>f.parcelId===p.id);assert.equal(feature.geometryId,current.id);assert.equal(temporal.geometryCategory(old),'HISTORICAL / SUPERSEDED');assert.notEqual(old.id,current.id);
});

test('proposed geometry never replaces current authoritative map geometry',()=>{
 const proposal=representative.proposed,p=flat.parcelById.get(proposal.parcelId),feature=flat.layers.get('canonical').features.find(f=>f.parcelId===p.id);
 assert(feature);assert.equal(feature.geometryId,p.geometryId);assert.notEqual(feature.geometryId,proposal.id);assert(['PROPOSED','UNDER REVIEW'].includes(temporal.geometryCategory(proposal)));assert.equal(temporal.selected(p.id).category,'CURRENT / AUTHORITATIVE');
});

test('building footprint layer is source-observed data and independent of current authority geometry',()=>{
 const feature=flat.layers.get('buildings').features[0],record=data.buildingFootprints.find(b=>(b.buildingId||b.id)===feature.id);assert(record);assert.deepEqual(feature.geometry,record.geometry);assert.equal(feature.geometryId,record.geometryId);assert.match(feature.role,/Source-observed building footprint/i);
});

test('actual source families only are rendered and retain real observation membership',()=>{
 const actualTypes=new Set(data.observations.filter(o=>flat.geometryById.get(o.geometryId)).map(o=>o.sourceType));assert.deepEqual(new Set(flat.sourceMeta.keys()),actualTypes);
 for(const [type,meta] of flat.sourceMeta){const layer=flat.layers.get(meta.id);assert(layer&&layer.features.length>0,type);for(const feature of layer.features)for(const oid of feature.observationIds){const o=evidence.observations.get(oid);assert.equal(o.sourceType,type);assert.equal(evidence.sources(feature.parcelId).some(row=>row.id===oid),true);}}
});

test('derived geometry comparison is diagnostic and does not create a conflict record',()=>{
 const c=representative.geometryConflict,oid=c.observationIds.find(id=>evidence.comparison(c.parcel_id,id));assert(oid);const comparison=evidence.comparison(c.parcel_id,oid);assert(comparison);assert.match(comparison.classification,/not a conflict decision/i);assert.equal(evidence.conflictsFor(c.parcel_id).some(row=>row.id===c.id),true);assert.equal(evidence.conflicts.size,data.conflicts.length);
});

test('ordinary and multiple-source parcels expose only their associated real observations',()=>{
 for(const p of [representative.ordinary,representative.multiple]){const expected=new Set(data.sources.filter(s=>s.parcel_id===p.id).map(s=>s.id)),actual=new Set(evidence.sources(p.id).map(s=>s.id));assert.deepEqual(actual,expected);}
 assert((sourceCounts.get(representative.multiple.id)||0)>=(sourceCounts.get(representative.ordinary.id)||0));
});

test('historical, split and merge records remain lineage/history data rather than current canonical parcels',()=>{
 const historical=representative.historical;assert.equal(flat.layers.get('canonical').features.some(f=>f.parcelId===historical.id),false);assert.equal(temporal.selected(historical.id).category,'HISTORICAL / SUPERSEDED');
 for(const relation of [representative.split,representative.merge]){assert.equal(relation.acceptedStatus,'ACCEPTED');const parent=temporal.localLineage(relation.parentParcelId),child=temporal.localLineage(relation.childParcelId);assert(parent.children.includes(relation.childParcelId));assert(child.parents.includes(relation.parentParcelId));}
});

test('recorded conflict state is sourced only from conflict records',()=>{
 const c=representative.conflict,selected=evidence.selected(c.parcel_id);assert(selected.conflicts.some(row=>row.id===c.id));assert.equal(selected.conflicts.find(row=>row.id===c.id).review_status,c.review_status);assert.equal(selected.authority,temporal.selected(c.parcel_id).category);
});

test('search resolves representative real identifiers to the same parcel identity used by map/evidence',()=>{
 const p=representative.multiple,source=evidence.sources(p.id)[0],queries=[p.id,source.id,source.sourceRecordId,source.sourceParcelId].filter(Boolean);
 for(const q of queries){const hit=search.search(q).find(r=>r.term===String(q)&&r.id===p.id);assert(hit,`${q} did not resolve to ${p.id}`);}
});

export {representative};
