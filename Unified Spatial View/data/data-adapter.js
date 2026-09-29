/* Normalized view model only. No old fixture, inferred geometry or generated identity. */
(() => {
  'use strict';
  const collections = ['parcels', 'sources', 'conflicts', 'recommendations', 'history', 'documents', 'comparisons'];
  function normalize(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Dataset must be an object.');
    const data = { metadata: {}, ...structuredClone(input) };
    for (const key of collections) {
      if (data[key] === undefined) data[key] = [];
      if (!Array.isArray(data[key])) throw new TypeError(`${key} must be an array.`);
    }
    const spatialCollections=['historicalParcels','cells','buildingFootprints','buildingRecords','sourceGeometry','observations','lineage','reconciliation','geoGitReferences','geometryVersions','sourceMetadata','sourceSchema','conflictEvidence'];
    for(const key of spatialCollections){data[key]??=[];if(!Array.isArray(data[key]))throw new TypeError(`${key} must be an array.`);}
    const ids = new Set();
    for (const parcel of [...data.parcels,...data.historicalParcels]) {
      if (!parcel || typeof parcel.id !== 'string' || !parcel.id.trim() || ids.has(parcel.id)) throw new Error('Parcel IDs must be nonempty unique strings.');
      if (typeof parcel.is_active !== 'boolean') throw new Error(`Explicit is_active required for ${parcel.id}.`);
      ids.add(parcel.id);
      if(parcel.geometry){
        const g=parcel.geometry,polygons=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:null;
        if(!Array.isArray(polygons)||!polygons.length)throw new Error(`Unsupported geometry for ${parcel.id}`);
        for(const rings of polygons){
          if(!Array.isArray(rings)||!rings.length)throw new Error(`Missing exterior for ${parcel.id}`);
          for(const ring of rings){
            if(!Array.isArray(ring)||ring.length<4||ring.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)))||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1]||new Set(ring.slice(0,-1).map(p=>p.join(','))).size<3)throw new Error(`Invalid ring for ${parcel.id}`);
          }
        }
      }
    }
    for (const key of collections.filter(key => key !== 'parcels')) {
      for (const row of data[key]) {
        if (!row || !ids.has(row.parcel_id)) throw new Error(`Unresolved parcel_id in ${key}.`);
      }
    }
    if (!data.metadata || typeof data.metadata !== 'object' || Array.isArray(data.metadata)) throw new TypeError('metadata must be an object.');
    const sourceGeometries=new Map(data.sourceGeometry.map(g=>[g.id,g]));
    const sourceDefinitions=new Map(data.sourceMetadata.map(s=>[s.type,s]));
    const layerByType={CADASTRAL_REVENUE:'revenue',GNSS_CORS_SURVEY:'survey',MUNICIPAL_PROPERTY:'ulb',DDA_DEVELOPMENT_AUTHORITY:'planning'};
    for(const source of data.sources){
      const g=sourceGeometries.get(source.geometryId),definition=sourceDefinitions.get(source.source_id);
      if(g?.normalized){source.geometry=g.normalized.geometry;source.crs='LOCAL_METRES';source.provenance=`${g.id}; normalized ${g.normalized.sourceCRS} → ${data.metadata.projectedCRS}; ${source.association}`;}
      if(definition)source.source_name=definition.name;
      if(layerByType[source.source_id])source.layer_id=layerByType[source.source_id];
    }
    const cellIds=new Set(data.cells.map(c=>c.id));
    if(cellIds.size!==data.cells.length)throw new Error('Duplicate cell IDs');
    for(const p of data.parcels){if(p.cellId&&!cellIds.has(p.cellId))throw new Error('Unresolved cell');}
    return data;
  }
  window.PRAMAN_DATA_ADAPTER = { normalize };
})();
