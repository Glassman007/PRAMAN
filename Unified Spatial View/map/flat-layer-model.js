import {isCurrentAuthority} from '../data/temporal-model.js';

export const SOURCE_LAYER_META={
 BUILDING_GIS:{id:'building-gis',name:'BUILDING GIS',color:'#c07809'},
 CADASTRAL_REVENUE:{id:'revenue',name:'CADASTRAL REVENUE',color:'#bc387c'},
 DDA_DEVELOPMENT_AUTHORITY:{id:'planning',name:'DDA DEVELOPMENT AUTHORITY',color:'#2577ba'},
 DRONE_ORTHOPHOTO:{id:'drone',name:'DRONE ORTHOPHOTO',color:'#18866b'},
 GNSS_CORS_SURVEY:{id:'survey',name:'GNSS CORS SURVEY',color:'#704caf'},
 MUNICIPAL_PROPERTY:{id:'ulb',name:'MUNICIPAL PROPERTY',color:'#326d90'},
 UTILITY_INFRASTRUCTURE:{id:'utilities',name:'UTILITY INFRASTRUCTURE',color:'#755136'}
};
const SOURCE_PALETTE=['#c07809','#bc387c','#2577ba','#18866b','#704caf','#326d90','#755136'];
const sourceLabel=type=>String(type||'SOURCE').replaceAll('_',' ');
const fallbackId=type=>'source-'+String(type||'unknown').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

export function sourceLayerMetaForData(data){
 const types=[...new Set((data.observations||[]).map(o=>o.sourceType).filter(Boolean))].sort();
 return new Map(types.map((type,i)=>[type,{...(SOURCE_LAYER_META[type]||{id:fallbackId(type),name:sourceLabel(type),color:SOURCE_PALETTE[i%SOURCE_PALETTE.length]}),sourceType:type}]));
}

export function buildFlatLayerModel(data){
 const parcels=[...data.parcels,...data.historicalParcels],parcelById=new Map(parcels.map(p=>[p.id,p]));
 const geometryVersionById=new Map(data.geometryVersions.map(g=>[g.id,g]));
 const geometryById=new Map(data.sourceGeometry.map(g=>[g.id,g.normalized?.geometry||null]));
 const associationByObservation=new Map();
 for(const row of data.sources){
  if(!associationByObservation.has(row.id))associationByObservation.set(row.id,row.parcel_id);
  else if(associationByObservation.get(row.id)!==row.parcel_id)throw new Error(`Observation ${row.id} is associated with multiple canonical parcels; flat rendering cannot silently choose one.`);
 }
 const layers=new Map(),sourceMeta=sourceLayerMetaForData(data),authoritativeGeometryByParcel=new Map();
 const addLayer=(id,meta={})=>{if(!layers.has(id))layers.set(id,{id,features:[],...meta});return layers.get(id);};
 addLayer('canonical',{name:'Canonical Parcels',kind:'canonical'});
 addLayer('buildings',{name:'Building Footprints',kind:'building'});
 for(const meta of sourceMeta.values())addLayer(meta.id,{...meta,kind:'source'});
 const add=(layerId,feature)=>{if(feature.geometry)layers.get(layerId)?.features.push(feature);};

 // CURRENT canonical geometry is accepted only through PRAMAN's explicit authority/effective-state rule.
 for(const p of data.parcels){
  const g=geometryVersionById.get(p.geometryId);
  if(!isCurrentAuthority(p,g))continue;
  const geometry=g.geometry?.geometry||null;
  if(!geometry)continue;
  authoritativeGeometryByParcel.set(p.id,geometry);
  add('canonical',{id:p.id,parcelId:p.id,cellId:p.cellId,geometry,geometryId:g.id,geometryStatus:g.status,geometryAcceptance:g.acceptedStatus,authorityStatus:p.authority_status,recordStatus:p.recordStatus,landUse:p.land_use});
 }

 for(const b of data.buildingFootprints){
  if(!b.geometry)continue;
  const parcelId=associationByObservation.get(b.observationId);
  add('buildings',{id:b.buildingId||b.id,parcelId,cellId:parcelById.get(parcelId)?.cellId||null,geometry:b.geometry,geometryId:b.geometryId,observationId:b.observationId,role:b.role||'Source-observed building footprint evidence'});
 }

 const sourceFeatureByGeometry=new Map();
 for(const o of data.observations){
  const meta=sourceMeta.get(o.sourceType),geometry=geometryById.get(o.geometryId);if(!meta||!geometry)continue;
  const parcelId=associationByObservation.get(o.id),key=meta.id+'|'+o.geometryId;
  let feature=sourceFeatureByGeometry.get(key);
  if(feature){
   if(feature.parcelId!==parcelId)throw new Error(`Source geometry ${o.geometryId} spans multiple parcel associations; refusing to collapse its identity.`);
   feature.observationIds.push(o.id);continue;
  }
  feature={id:o.id,observationIds:[o.id],parcelId,cellId:parcelById.get(parcelId)?.cellId||null,geometry,geometryId:o.geometryId,sourceType:o.sourceType};
  sourceFeatureByGeometry.set(key,feature);add(meta.id,feature);
 }
 return {layers,sourceMeta,parcelById,geometryVersionById,geometryById,associationByObservation,authoritativeGeometryByParcel,allGeometries:[...layers.values()].flatMap(layer=>layer.features.map(f=>f.geometry))};
}
