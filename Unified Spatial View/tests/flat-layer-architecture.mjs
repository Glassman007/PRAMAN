import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFlatLayerModel,SOURCE_LAYER_META} from '../map/flat-layer-model.js';
import {isCurrentAuthority} from '../data/temporal-model.js';

const data=JSON.parse(fs.readFileSync(new URL('../data/normalized-map.json',import.meta.url),'utf8'));
const model=buildFlatLayerModel(data);
const byId=id=>model.layers.get(id);
const sourceGeometryById=new Map(data.sourceGeometry.map(g=>[g.id,g.normalized?.geometry||null]));
const geometryVersionById=new Map(data.geometryVersions.map(g=>[g.id,g]));
const activeCanonical=data.parcels.filter(p=>isCurrentAuthority(p,geometryVersionById.get(p.geometryId))&&geometryVersionById.get(p.geometryId)?.geometry?.geometry);

test('canonical layer is dataset-derived and identity-preserving',()=>{
 const layer=byId('canonical');assert(layer);assert.equal(layer.features.length,activeCanonical.length);assert.equal(layer.features.length,1000);
 assert.deepEqual(new Set(layer.features.map(f=>f.id)),new Set(activeCanonical.map(p=>p.id)));
 for(const f of layer.features){const p=data.parcels.find(p=>p.id===f.id),g=geometryVersionById.get(p.geometryId);assert.deepEqual(f.geometry,g.geometry.geometry);assert.equal(f.geometryId,g.id);assert.equal(f.parcelId,p.id);assert(isCurrentAuthority(p,g));}
});

test('building footprints are real flat dataset geometry',()=>{
 const layer=byId('buildings');const usable=data.buildingFootprints.filter(b=>b.geometry);assert.equal(layer.features.length,usable.length);assert.equal(layer.features.length,765);
 const sourceIds=new Set(data.sourceGeometry.map(g=>g.id));for(const f of layer.features){assert(sourceIds.has(f.geometryId));assert(f.parcelId);assert(f.cellId);}
});

test('every real source family has an independent deduplicated geometry source',()=>{
 const associations=new Map(data.sources.map(s=>[s.id,s.parcel_id]));
 for(const [sourceType,meta] of Object.entries(SOURCE_LAYER_META)){
  const observations=data.observations.filter(o=>o.sourceType===sourceType&&sourceGeometryById.get(o.geometryId));
  const uniqueGeometryIds=new Set(observations.map(o=>o.geometryId));const layer=byId(meta.id);assert(layer,meta.id);assert.equal(layer.features.length,uniqueGeometryIds.size,meta.id);
  assert(layer.features.length>0,meta.id);for(const feature of layer.features){assert(uniqueGeometryIds.has(feature.geometryId));assert(sourceGeometryById.get(feature.geometryId));assert(feature.parcelId);assert(feature.cellId);assert(feature.observationIds.length>=1);for(const oid of feature.observationIds)assert.equal(associations.get(oid),feature.parcelId);}
 }
});

test('no arbitrary geometry is manufactured by the flat layer model',()=>{
 const allDatasetGeometry=new Set();for(const p of data.parcels)if(p.geometry)allDatasetGeometry.add(p.geometry);for(const b of data.buildingFootprints)if(b.geometry)allDatasetGeometry.add(b.geometry);for(const g of data.sourceGeometry)if(g.normalized?.geometry)allDatasetGeometry.add(g.normalized.geometry);for(const g of data.geometryVersions)if(g.geometry?.geometry)allDatasetGeometry.add(g.geometry.geometry);
 for(const layer of model.layers.values())for(const f of layer.features)assert(allDatasetGeometry.has(f.geometry),`${layer.id}:${f.id} is not backed by a dataset geometry object`);
});
