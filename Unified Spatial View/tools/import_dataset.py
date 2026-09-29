#!/usr/bin/env python3
"""Offline, allowlisted PRAMAN CSV import. Never reads 99 Eval only.
Usage: python tools/import_dataset.py /path/to/PRAMAN_DATA
No geometry repair, relocation, simplification, or synthetic footprints.
"""
import csv,json,sys,re,hashlib,collections,math
from pathlib import Path
import shapely,pyproj
from shapely import wkt
from shapely.geometry import mapping
from shapely.ops import transform
from shapely.validation import explain_validity
from pyproj import Transformer,CRS
ROOT=Path(__file__).resolve().parents[1]
ORIGIN=(717000.0,3174000.0) # Fixed locality anchor; never recalculated from parcel ordering.
PROJECTED='EPSG:32643'

def validate_geometry(text,crs):
    if not text: raise ValueError('Missing geometry')
    if crs not in ('EPSG:4326','EPSG:32643'): raise ValueError('Unsupported or missing explicit CRS: '+crs)
    g=wkt.loads(text)
    if g.geom_type not in ('Polygon','MultiPolygon'): raise ValueError('Unsupported type '+g.geom_type)
    if g.is_empty or not g.is_valid: raise ValueError(explain_validity(g))
    for poly in ([g] if g.geom_type=='Polygon' else g.geoms):
        for ring in [poly.exterior,*poly.interiors]:
            coords=list(ring.coords)
            if len(coords)<4 or coords[0]!=coords[-1] or len(set(coords[:-1]))<3: raise ValueError('Invalid ring')
            if any(len(p)!=2 or not all(math.isfinite(v) for v in p) for p in coords):raise ValueError('Expected finite 2D coordinates')
            if crs=='EPSG:4326' and any(not(72<=p[0]<=78 and 0<=p[1]<=84) for p in coords):raise ValueError('Coordinates outside declared UTM 43N locality; check axis order')
    tr=Transformer.from_crs(crs,PROJECTED,always_xy=True)
    metric=transform(tr.transform,g)
    if not metric.is_valid:raise ValueError('Invalid projected geometry: '+explain_validity(metric))
    local=transform(lambda x,y:(x-ORIGIN[0],ORIGIN[1]-y),metric)
    return g,metric,local

def main(source):
    source=Path(source); tables={};manifest=[]
    names=['CANONICAL_PARCELS','HISTORICAL_PARCELS','GEOMETRY_VERSIONS','SOURCE_GEOMETRIES','MATCHING_INPUT_VIEW','CONFLICTS','CONFLICT_EVIDENCE','RECONCILED_PARCELS','PARCEL_LINEAGE','GEOGIT_EVENTS','SOURCE_METADATA','SOURCE_SPECIFIC_SCHEMA','BUILDINGS','SOCIETIES_AND_COMPLEXES']
    for name in names:
        paths=[p for p in source.rglob(name+'.csv') if '99 Eval only' not in p.parts]
        if len(paths)!=1:raise ValueError('Expected exactly one operational table '+name)
        p=paths[0];rows=list(csv.DictReader(p.open(encoding='utf-8-sig',newline='')));tables[name]=rows
        manifest.append({'table':name,'path':str(p.relative_to(source)),'records':len(rows),'columns':list(rows[0]) if rows else [],'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    errors=[];missing=[];geometries={};metric_by_id={};native_by_id={}
    def geo(row,idkey,wktkey,crskey):
        ident=row[idkey];text=row[wktkey]
        if not text:missing.append({'table':idkey,'id':ident});return None
        try:g,m,l=validate_geometry(text,row[crskey])
        except Exception as e:errors.append({'table':idkey,'id':ident,'reason':str(e)});return None
        native_by_id[ident]=g;metric_by_id[ident]=m
        return {'id':ident,'sourceCRS':row[crskey],'sourceWKT':text,'geometry':mapping(l),'bounds':list(l.bounds)}
    for r in tables['GEOMETRY_VERSIONS']:
        if r['geometry_id'] in geometries:raise ValueError('Duplicate geometry ID')
        geometries[r['geometry_id']]=geo(r,'geometry_id','geometry_wkt','crs')
    version_rows={r['geometry_id']:r for r in tables['GEOMETRY_VERSIONS']}
    parcels=[];historical=[];ids=[];badids=[];join_errors=[]
    for name,target in [('CANONICAL_PARCELS',parcels),('HISTORICAL_PARCELS',historical)]:
        for r in tables[name]:
            ident=r['canonical_parcel_id'];ids.append(ident)
            if not re.fullmatch(r'IN-DL-\d{6}-[1-9]\d*-[1-9]\d*',ident):badids.append(ident)
            gid=r.get('current_geometry_id',r.get('historical_geometry_id'));g=geometries.get(gid)
            if gid not in geometries:missing.append({'table':name,'id':ident,'geometry_id':gid})
            v=version_rows.get(gid)
            if v and v['canonical_parcel_id']!=ident:join_errors.append({'id':ident,'geometry_id':gid,'reason':'Parcel/geometry identity mismatch'});g=None
            active=r.get('parcel_status')=='ACTIVE'
            if active and v and (v['geometry_status']!='AUTHORITATIVE' or v['accepted_status']!='ACCEPTED'):
                join_errors.append({'id':ident,'geometry_id':gid,'reason':'Current geometry is not accepted authoritative'});g=None
            p={'id':ident,'cellId':r['cell_id'],'parcelNumber':r['parcel_number'],'is_active':active,'recordStatus':r.get('parcel_status',r.get('record_status')),'geometryId':gid,'geometry':g['geometry'] if g else None,'crs':'LOCAL_METRES','provenance':{'table':name,'geometryTable':'GEOMETRY_VERSIONS','geometryId':gid},'authority_status':v['geometry_status'] if v else None}
            for src,dst in [('land_use','land_use'),('owner_entity','current_owner'),('former_owner','formerOwner'),('locality','address'),('authoritative_version','authoritativeVersion'),('canonical_state_version','stateVersion'),('retired_date','retiredDate'),('retirement_reason','retirementReason'),('lineage_status','lineageStatus')]:
                if r.get(src):p[dst]=r[src]
            for src,dst in [('area_sqm','area_sqm'),('built_up_area_sqm','builtUpArea'),('building_count','buildingCount'),('floor_count','floorCount')]:
                if r.get(src):p[dst]=float(r[src])
            target.append(p)
    duplicates=[i for i,c in collections.Counter(ids).items() if c>1]
    if duplicates or badids or join_errors:raise ValueError(json.dumps({'duplicates':duplicates,'malformed':badids,'joins':join_errors}))
    allids=set(ids)
    cellids=sorted({p['cellId'] for p in parcels+historical});cells=[]
    for ident in cellids:
        members=[p for p in parcels if p['cellId']==ident and p['is_active']];bounds=[geometries[p['geometryId']]['bounds'] for p in members if p['geometry']]
        cells.append({'id':ident,'parcelIds':[p['id'] for p in members],'historicalParcelIds':[p['id'] for p in historical if p['cellId']==ident],'bounds':[min(b[0] for b in bounds),min(b[1] for b in bounds),max(b[2] for b in bounds),max(b[3] for b in bounds)] if bounds else None,'boundsRole':'Derived bounding box, not an authoritative cell polygon'})
    # Allowlist matching input only: SOURCE_OBSERVATIONS candidate hints and Eval only never enter runtime.
    observations=[]
    fieldmap={'observation_id':'id','source_type':'sourceType','source_record_id':'sourceRecordId','source_parcel_id':'sourceParcelId','owner_name':'owner','address':'address','land_use':'landUse','geometry_id':'geometryId','observed_area':'observedArea','observation_date':'date','source_reliability':'sourceReliability','geometry_confidence':'geometryConfidence','attribute_confidence':'attributeConfidence','temporal_freshness':'temporalFreshness','identifier_confidence':'identifierConfidence','positional_accuracy_m':'positionalAccuracyMetres','source_specific_details':'sourceDetails'}
    for r in tables['MATCHING_INPUT_VIEW']:observations.append({v:r[k] for k,v in fieldmap.items() if r.get(k)})
    obs={r['id']:r for r in observations}
    reconciliation=[];sources=[]
    for r in tables['RECONCILED_PARCELS']:
        pid=r['canonical_parcel_id']
        if pid not in allids:raise ValueError('Unknown reconciliation parcel '+pid)
        links=[s for s in r['matched_source_ids'].split(';') if s]
        reconciliation.append({'parcelId':pid,'recordStatus':r['record_status'],'matchStatus':r['match_status'],'sourceObservationIds':links,'proposedState':json.loads(r['proposed_state']),'authoritativeState':json.loads(r['authoritative_state']),'requiresHumanReview':r['requires_human_review'],'timestamp':r['reconciliation_timestamp']})
        for oid in links:
            if oid not in obs:raise ValueError('Unknown matched observation '+oid)
            o=obs[oid];sources.append({'id':oid,'parcel_id':pid,'source_id':o['sourceType'],'source_name':o['sourceType'],'holder':o.get('owner'),'area_sqm':o.get('observedArea'),'date':o.get('date'),'geometryId':o.get('geometryId'),'association':'RECONCILED_PARCELS.matched_source_ids','verification_status':r['match_status']})
    sg=[]
    for r in tables['SOURCE_GEOMETRIES']:
        g=geo(r,'geometry_id','normalized_geometry_wkt','normalized_crs')
        sg.append({'id':r['geometry_id'],'sourceType':r['source_type'],'observationIds':r['observation_ids'].split(';'),'originalCRS':r['original_crs'],'originalWKT':r['original_geometry_wkt'],'normalizationMethod':r['normalization_method'],'qualityFlag':r['geometry_quality_flag'],'normalized':g})
    conflicts=[{'id':r['conflict_id'],'parcel_id':r['canonical_parcel_id'],'type':r['conflict_type'],'severity':r['severity'],'source_a':r['source_a'],'source_b':r['source_b'],'observed_a':r['source_a_value'],'observed_b':r['source_b_value'],'description':r['explanation'],'review_status':r['status'],'observationIds':[r['source_a_observation_id'],r['source_b_observation_id']]} for r in tables['CONFLICTS']]
    history=[{'id':r['event_id'],'parcel_id':r['parcel_id'],'date':r['timestamp'],'event_type':r['event_type'],'event_note':r['reason'],'previousVersion':r['previous_version'],'resultingVersion':r['resulting_version'],'source':r['source'],'actorType':r['actor_type'],'relatedParcelIds':[s for s in r['related_parcel_ids'].split(';') if s]} for r in tables['GEOGIT_EVENTS']]
    lineage=[{'id':r['lineage_event_id'],'type':r['event_type'],'parentParcelId':r['parent_parcel_id'],'childParcelId':r['child_parcel_id'],'date':r['effective_date'],'reason':r['reason'],'source':r['source'],'acceptedStatus':r['accepted_status']} for r in tables['PARCEL_LINEAGE']]
    bounds=[g['bounds'] for p in parcels if (g:=geometries.get(p['geometryId']))];extent=[min(b[0] for b in bounds),min(b[1] for b in bounds),max(b[2] for b in bounds),max(b[3] for b in bounds)]
    maxerr=0
    inverse=Transformer.from_crs(PROJECTED,'EPSG:4326',always_xy=True)
    for p in parcels+historical:
        g=geometries.get(p['geometryId'])
        if g:
            local=shapely.geometry.shape(g['geometry']);back=transform(lambda x,z:inverse.transform(x+ORIGIN[0],ORIGIN[1]-z),local)
            maxerr=max(maxerr,back.hausdorff_distance(native_by_id[p['geometryId']]))
    # Compare pair topology before/after projection; no snapping or shape correction.
    native=[native_by_id[p['geometryId']] for p in parcels if p['geometry']];projected=[metric_by_id[p['geometryId']] for p in parcels if p['geometry']]
    tree=shapely.STRtree(native);touches=overlaps=mismatches=0;overlap_pairs=[]
    for i,g in enumerate(native):
        for j in tree.query(g):
            if j<=i:continue
            a=g.relate(native[j]);b=projected[i].relate(projected[j]);mismatches+=a!=b
            touches+=g.touches(native[j]);has_overlap=g.intersection(native[j]).area>0;overlaps+=has_overlap
            if has_overlap:overlap_pairs.append({'parcelA':parcels[i]['id'],'parcelB':parcels[int(j)]['id'],'overlapAreaSqm':projected[i].intersection(projected[int(j)]).area})
    meta={'study_area':parcels[0].get('address'),'sourceCRS':'EPSG:4326','projectedCRS':PROJECTED,'projectedWKT':CRS(PROJECTED).to_wkt(),'origin':{'easting':ORIGIN[0],'northing':ORIGIN[1],'crs':PROJECTED},'axisConvention':'source WKT longitude,latitude; X=E-originE; Z=originN-N; Y=0 display plane (no surveyed elevation supplied)','units':'metres','extentXZ':extent,'sourceManifest':manifest,'importerVersions':{'shapely':shapely.__version__,'pyproj':pyproj.__version__},'evaluationPolicy':'All 99 Eval only files, candidate canonical hints and benchmark_case_ids excluded; matching observations come only from MATCHING_INPUT_VIEW.'}
    source_by_id={g['id']:g for g in sg}
    building_ids={r['building_id'] for r in tables['BUILDINGS']}
    footprints=[]
    for o in observations:
        if o['sourceType']!='BUILDING_GIS':continue
        details=json.loads(o.get('sourceDetails','{}'));g=source_by_id.get(o.get('geometryId'))
        footprints.append({'id':o['id'],'buildingId':details.get('building_id'),'buildingRecordResolved':details.get('building_id') in building_ids,'geometryId':o.get('geometryId'),'geometry':g['normalized']['geometry'] if g and g['normalized'] else None,'role':'Source-observed building footprint evidence, not accepted canonical footprint','observationId':o['id']})
    data={'metadata':meta,'parcels':parcels,'historicalParcels':historical,'cells':cells,'buildingFootprints':footprints,'buildingRecords':[{'id':r['building_id'],'parcelId':r['canonical_parcel_id'],'type':r['building_type'],'footprintArea':float(r['footprint_area']),'floors':r['floors'],'constructionStatus':r['construction_status'],'source':r['source'],'confidence':r['confidence']} for r in tables['BUILDINGS']],'sourceGeometry':sg,'observations':observations,'sources':sources,'conflicts':conflicts,'history':history,'lineage':lineage,'reconciliation':reconciliation,'geoGitReferences':[{'eventId':h['id'],'parcelId':h['parcel_id'],'previousVersion':h['previousVersion'],'resultingVersion':h['resultingVersion']} for h in history],'geometryVersions':[{'id':r['geometry_id'],'parcelId':r['canonical_parcel_id'],'version':r['version_label'],'status':r['geometry_status'],'acceptedStatus':r['accepted_status'],'date':r['effective_date'],'geometry':geometries[r['geometry_id']]} for r in tables['GEOMETRY_VERSIONS']],'conflictEvidence':[{'id':r['conflict_evidence_id'],'conflictId':r['conflict_id'],'observationId':r['observation_id'],'role':r['evidence_role'],'sourceType':r['source_type'],'attribute':r['attribute_name'],'value':r['observed_value'],'geometryId':r['geometry_id'],'temporalRole':r['temporal_role'],'relation':r['supports_or_contradicts'],'notes':r['notes'],'evidenceType':r['evidence_type'],'evidenceId':r['evidence_id'],'sourceTable':r['source_table']} for r in tables['CONFLICT_EVIDENCE']], 'sourceMetadata':[{'id':r['source_id'],'name':r['source_name'],'type':r['source_type'],'authority':r['authority'],'date':r['acquisition_date'],'crs':r['CRS'],'reliability':r['reliability'],'nominalAccuracy':r['nominal_accuracy'],'currency':r['temporal_currency'],'updateFrequency':r['update_frequency']} for r in tables['SOURCE_METADATA']],'sourceSchema':[{'sourceType':r['source_type'],'keys':r['source_specific_keys'],'requiredKeys':r['required_keys'],'historicalNullableKeys':r['historical_nullable_keys'],'lifecycleFields':r['lifecycle_metadata_fields'],'purpose':r['purpose']} for r in tables['SOURCE_SPECIFIC_SCHEMA']]}
    report={'canonicalRecords':len(parcels),'active':sum(p['is_active'] for p in parcels),'canonicalInactive':sum(not p['is_active'] for p in parcels),'historical':len(historical),'totalStoredParcels':len(ids),'duplicateIds':duplicates,'malformedIds':badids,'idValidation':'Observed IN-DL-six-digit-postcode-positive-cell-positive-parcel format; no numeric parcel upper bound','cells':{c['id']:len(c['parcelIds']) for c in cells},'missingGeometry':missing,'invalidGeometry':errors,'joinErrors':join_errors,'activeMissingOrInvalid':sum(p['geometry'] is None for p in parcels),'historicalMissingOrInvalid':sum(p['geometry'] is None for p in historical),'extentMetres':{'width':extent[2]-extent[0],'depth':extent[3]-extent[1],'boundsXZ':extent},'maxRoundTripErrorDegrees':maxerr,'topology':{'touchingPairs':int(touches),'positiveAreaOverlapPairs':int(overlaps),'pairRelationChanges':int(mismatches),'overlapPairs':overlap_pairs},'geometryTypes':dict(collections.Counter(g.geom_type for g in native_by_id.values())),'crs':meta['sourceCRS'],'projectedCRS':PROJECTED,'origin':meta['origin'],'sourceTables':manifest}
    (ROOT/'data/normalized-map.json').write_text(json.dumps(data,separators=(',',':'),allow_nan=False))
    (ROOT/'docs/dataset-validation.json').write_text(json.dumps(report,indent=2,allow_nan=False))
    print(json.dumps({k:v for k,v in report.items() if k not in ('sourceTables','invalidGeometry')},indent=2));print('Invalid geometries:',len(errors))
if __name__=='__main__':main(sys.argv[1])
