"""Derived display diagnostics. Never changes source geometry or assigns conflict/authority."""
import csv,hashlib,json,pathlib,sys,collections
from shapely.geometry import shape,mapping,Point
from shapely.strtree import STRtree
from shapely.ops import nearest_points
ROOT=pathlib.Path(__file__).resolve().parents[1];raw=pathlib.Path(sys.argv[1]);data=json.loads((ROOT/'data/normalized-map.json').read_text())
def read_table(name):
 spec=next(s for s in data['metadata']['sourceManifest'] if s['table']==name);f=raw/spec['path'];assert hashlib.sha256(f.read_bytes()).hexdigest()==spec['sha256'],f'Source changed: {name}';return list(csv.DictReader(f.open(encoding='utf-8-sig')))
confidence_keys=['overall_match_confidence','geometry_confidence','ownership_confidence','land_use_confidence','lineage_confidence','reconciliation_confidence']
reconciliation=[{'parcelId':r['canonical_parcel_id'],'confidence':{k:float(r[k]) for k in confidence_keys if r[k]},'criticality':r['criticality_level'],'reason':r['criticality_reason'],'unresolvedConflictIds':[v for v in r['unresolved_conflicts'].split(';') if v]} for r in read_table('RECONCILED_PARCELS')]
conflicts=[{'id':r['conflict_id'],'attributeOrGeometry':r['attribute_or_geometry'],'nextEvidence':r['recommended_next_evidence'],'requiresHumanReview':r['human_review_required'],'criticality':r['criticality']} for r in read_table('CONFLICTS')]
parcels={r['id']:r for r in data['parcels']+data['historicalParcels']};geoms={k:shape(r['geometry']) for k,r in parcels.items() if r.get('geometry')}
sources={r['id']:shape(r['normalized']['geometry']) for r in data['sourceGeometry'] if r.get('normalized',{}).get('geometry')};observations={r['id']:r for r in data['observations']};by_parcel=collections.defaultdict(list)
for r in data['sources']:by_parcel[r['parcel_id']].append(r['id'])
def polygons(g):
 if g.is_empty:return None
 if g.geom_type in ['Polygon','MultiPolygon']:return mapping(g)
 ps=[v for v in getattr(g,'geoms',[]) if v.geom_type=='Polygon'];return {'type':'MultiPolygon','coordinates':[mapping(v)['coordinates'] for v in ps]} if ps else None
def lines(g):
 if g.is_empty:return []
 if g.geom_type in ['LineString','LinearRing']:return [list(g.coords)]
 return [line for v in getattr(g,'geoms',[]) for line in lines(v)]
comparisons={};missing=[]
for pid,ids in by_parcel.items():
 a=geoms.get(pid)
 for oid in ids:
  o=observations[oid];b=sources.get(o['geometryId']);key=pid+'|'+oid
  if a is None or b is None:missing.append(key);continue
  if not a.is_valid or not b.is_valid:missing.append(key);continue
  overlap=a.intersection(b);only_a=a.difference(b);only_b=b.difference(a)
  comparisons[key]={'parcelId':pid,'observationId':oid,'canonicalGeometryId':parcels[pid]['geometryId'],'sourceGeometryId':o['geometryId'],'metrics':{'canonicalAreaSqm':a.area,'sourceAreaSqm':b.area,'signedAreaDifferenceSqm':b.area-a.area,'overlapSqm':overlap.area,'canonicalOnlySqm':only_a.area,'sourceOnlySqm':only_b.area,'intersectionOverUnion':overlap.area/a.union(b).area,'centroidOffsetMetres':a.centroid.distance(b.centroid),'discreteBoundaryHausdorffMetres':a.boundary.hausdorff_distance(b.boundary),'canonicalComponents':len(getattr(a,'geoms',[a])),'sourceComponents':len(getattr(b,'geoms',[b])),'canonicalHoles':sum(len(v.interiors) for v in getattr(a,'geoms',[a])),'sourceHoles':sum(len(v.interiors) for v in getattr(b,'geoms',[b]))},'canonicalOnly':polygons(only_a),'sourceOnly':polygons(only_b),'overlap':polygons(overlap),'canonicalUnmatchedEdges':lines(a.boundary.difference(b.boundary)),'sourceUnmatchedEdges':lines(b.boundary.difference(a.boundary)),'centroidVector':[list(a.centroid.coords)[0],list(b.centroid.coords)[0]],'classification':'Derived geometric comparison; not a conflict decision'}
active=[p for p in data['parcels'] if p['is_active']];shapes=[geoms[p['id']] for p in active];tree=STRtree(shapes);edges=[];overlaps=[]
for i,a in enumerate(shapes):
 for j0 in tree.query(a):
  j=int(j0)
  if j<=i:continue
  b=shapes[j];shared=a.boundary.intersection(b.boundary);ls=lines(shared)
  if a.intersection(b).area>0:overlaps.append({'parcelIds':[active[i]['id'],active[j]['id']],'overlapSqm':a.intersection(b).area})
  if not ls:continue
  pair=sorted([active[i]['id'],active[j]['id']]);normalized=sorted([min(v,list(reversed(v))) for v in ls]);eid='EDGE-'+hashlib.sha256(json.dumps([pair,normalized],separators=(',',':')).encode()).hexdigest()[:16]
  observations_for_edge=[]
  for pid in pair:
   for oid in by_parcel[pid]:
    o=observations[oid];g=sources.get(o['geometryId'])
    if g is None:continue
    samples=[]
    for line in ls:
     from shapely.geometry import LineString
     line=LineString(line)
     for fraction in [0,.5,1]:
      point=line.interpolate(fraction,normalized=True);near=nearest_points(point,g.boundary)[1];samples.append({'canonicalPoint':list(point.coords)[0],'sourcePoint':list(near.coords)[0],'distanceMetres':point.distance(near)})
    observations_for_edge.append({'parcelId':pid,'observationId':oid,'sampledMaxOffsetMetres':max(s['distanceMetres'] for s in samples),'samples':samples})
  edges.append({'id':eid,'parcelIds':pair,'lines':normalized,'lengthMetres':shared.length,'observations':observations_for_edge,'role':'Derived exact shared canonical boundary; source observations associated through parcels, not an edge-level authority decision'})
summary={'observations':len(observations),'sourceGeometryRecords':len(sources),'associations':len(data['sources']),'comparisons':len(comparisons),'missingComparisons':len(missing),'sharedEdges':len(edges),'canonicalOverlapPairs':len(overlaps),'conflicts':len(data['conflicts']),'conflictParcels':len({c['parcel_id'] for c in data['conflicts']}),'sourceFamilies':dict(collections.Counter(o['sourceType'] for o in observations.values()))}
result={'metadata':{'cadastreSHA256':hashlib.sha256((ROOT/'data/normalized-map.json').read_bytes()).hexdigest(),'method':'Shapely polygon intersection/difference; exact boundary intersection (no snap/repair); discrete Hausdorff; 3 nearest-boundary samples per shared segment','authority':'Read-only display diagnostics; no conflict labels or legal authority inferred','excluded':'Evaluation truth, benchmark IDs, candidate canonical hints, alternate candidates'},'summary':summary,'reconciliation':reconciliation,'conflictDetails':conflicts,'comparisons':comparisons,'sharedEdges':edges,'canonicalOverlaps':overlaps,'missingComparisons':missing}
(ROOT/'data/evidence-map.json').write_text(json.dumps(result,separators=(',',':'))+'\n');print(json.dumps(summary,indent=2))
