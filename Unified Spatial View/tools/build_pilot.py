"""Deterministic illustrative pilot placement; cadastral geometry is read-only."""
import json,math,hashlib,collections,csv,sys
from pathlib import Path
from shapely.geometry import shape,box,Point,LineString,mapping
from shapely.affinity import rotate,translate
ROOT=Path(__file__).resolve().parents[1]
def seed(s):return int(hashlib.sha256(s.encode()).hexdigest()[:8],16)
def main():
 full="--all" in sys.argv
 data=json.loads((ROOT/'data/normalized-map.json').read_text());registry=json.loads((ROOT/'data/asset-registry.json').read_text());assets={a['id']:a for a in registry}
 # Enrich the normalized boundary with supplied property classification, not inferred categories.
 source=Path(sys.argv[1]);rows=list(csv.DictReader(next(source.rglob('CANONICAL_PARCELS.csv')).open(encoding='utf-8-sig')));props={r['canonical_parcel_id']:r['property_type'] for r in rows}
 allp={p['id']:p for p in data['parcels'] if p['is_active']};geom={i:shape(p['geometry']) for i,p in allp.items()};candidates=[p for p in data['parcels'] if p['cellId']=='CELL-10']
 # Seed is the actual access corridor, not array position. Neighbours share boundary length.
 root=next(p['id'] for p in candidates if props[p['id']]=='ROAD_ACCESS_CORRIDOR');adj={p['id']:[] for p in candidates}
 for i in adj:
  for j in adj:
   if i<j and geom[i].boundary.intersection(geom[j].boundary).length>0.05:adj[i].append(j);adj[j].append(i)
 required={'UNDER_CONSTRUCTION_PLOT','APARTMENT_BLOCK','PUBLIC_PARK','PARKING_AREA','COLLEGE_TRAINING_CENTRE','OFFICE_COMMERCIAL_PLOT','GOVERNMENT_LAND','BUILDER_FLOOR'}
 selected=[];queue=[root];seen={root}
 while queue:
  i=queue.pop(0);selected.append(i)
  if required<={props[j] for j in selected}:break
  for j in sorted(adj[i],key=lambda j:(geom[j].centroid.distance(geom[root].centroid),j)):
   if j not in seen:seen.add(j);queue.append(j)
 if not required<={props[j] for j in selected}:raise ValueError('Connected pilot lacks required categories')
 if full:selected=sorted(allp)
 parcels=[allp[i] for i in selected];roads=[i for i in selected if props[i]=='ROAD_ACCESS_CORRIDOR'];placements=[];issues=[];occupied=[];occupancy=collections.defaultdict(list)
 def bins(g):
  x0,z0,x1,z1=g.bounds
  return [(x,z) for x in range(math.floor(x0/20),math.floor(x1/20)+1) for z in range(math.floor(z0/20),math.floor(z1/20)+1)]
 buildings=collections.defaultdict(list)
 for b in data['buildingRecords']:buildings[b['parcelId']].append(b)
 evidence=collections.defaultdict(list)
 for f in data['buildingFootprints']:
  if f.get('buildingRecordResolved') and f.get('geometry'):evidence[f['buildingId']].append(f)
 def orient(g):
  ring=list(g.minimum_rotated_rectangle.exterior.coords);edges=[(math.dist(a,b),a,b) for a,b in zip(ring,ring[1:])];_,a,b=max(edges);return math.atan2(b[1]-a[1],b[0]-a[0])
 def place(p,assetid,kind,key,setback=2,building=None,preferred=None):
  g=geom[p['id']];a=assets.get(assetid);w=a['footprintWidth'] if a else 4;d=a['footprintDepth'] if a else 4;angle=orient(g);basis='parcel longest oriented envelope edge'
  if building:
   ev=[f for f in evidence[building['id']] if g.covers(shape(f['geometry']))]
   if ev:preferred=shape(ev[0]['geometry']).representative_point();angle=orient(shape(ev[0]['geometry']));basis='contained source-observed footprint '+ev[0]['id']
   elif evidence[building['id']]:issues.append({'parcelId':p['id'],'buildingId':building['id'],'reason':'Observed footprint crosses parcel; not used for placement'})
  close=sorted(roads,key=lambda i:g.distance(geom[i]))
  road=close[0] if close else None
  if road and g.distance(geom[road])<0.1:
   edges=list(g.exterior.coords);a0,b0=min(zip(edges,edges[1:]),key=lambda ab:LineString(ab).distance(geom[road]));angle=math.atan2(b0[1]-a0[1],b0[0]-a0[0]);basis='edge adjoining actual road parcel '+road
  safe=g.buffer(-setback);points=[]
  if preferred:points.append(preferred)
  # Search candidates in metric space, ranked towards nearest actual access and stable ID phase.
  minx,minz,maxx,maxz=g.bounds;step=2.0
  for ix in range(math.ceil((maxx-minx)/step)):
   for iz in range(math.ceil((maxz-minz)/step)):
    q=Point(minx+(ix+0.5)*step,minz+(iz+0.5)*step)
    if safe.contains(q):points.append(q)
  points.sort(key=lambda q:(q.distance(preferred) if preferred else q.distance(geom[road]) if road else q.distance(g.boundary),seed(key+f':{q.x:.3f}:{q.y:.3f}')))
  for q in points:
   footprint=translate(rotate(box(-w/2,-d/2,w/2,d/2),math.degrees(angle),origin=(0,0)),q.x,q.y)
   if not safe.covers(footprint):continue
   clearance=footprint.buffer(.6);near={i for k in bins(clearance) for i in occupancy[k]}
   if all(not clearance.intersects(occupied[i]) for i in near):
    item={'id':key,'parcelId':p['id'],'assetId':assetid,'kind':kind,'position':[q.x,0,q.y],'rotationY':-angle,'footprint':mapping(footprint),'setback':setback,'orientationBasis':basis,'illustrative':True,'buildingId':building['id'] if building else None,'height':assets[assetid]['approxHeight'] if assetid else 0,'scale':1}
    placements.append(item)
    for k in bins(footprint):occupancy[k].append(len(occupied))
    occupied.append(footprint);return True
  return False
 for p in parcels:
  typ=props[p['id']];records=buildings[p['id']]
  for b in records:
   family=[]
   if typ in ('APARTMENT_BLOCK','GROUP_HOUSING_BLOCK','DDA_FLAT_BLOCK'):family=[a['id'] for a in registry if a['category']=='apartments']
   elif typ in ('INDEPENDENT_HOUSE','BUILDER_FLOOR','MIXED_USE_BUILDING') and float(b['floors'])>=4:family=['buildings-building-9']
   elif typ in ('RETAIL_SHOP','OFFICE_COMMERCIAL_PLOT','LOCAL_SHOPPING_COMPLEX'):family=['commercial-com-1']
   elif typ in ('GOVERNMENT_OFFICE','GOVERNMENT_LAND','MUNICIPAL_PROPERTY'):family=['government-gov-1','government-gov-3']
   elif typ=='UNDER_CONSTRUCTION_PLOT':family=['props-construction','props-construction_prop']
   elif typ in ('PUBLIC_PARK','GREEN_BELT','UTILITY_PARCEL','ELECTRICAL_SUBSTATION','WATER_INFRASTRUCTURE'):family=[]
   family=sorted(family,key=lambda a:seed(b['id']+a))
   ok=any(place(p,a,'building',b['id'],building=b) for a in family)
   if not ok:
    issues.append({'parcelId':p['id'],'buildingId':b['id'],'reason':'No semantically suitable calibrated GLB fits; flat record marker only'})
    if not place(p,None,'building',b['id'],building=b):issues.append({'parcelId':p['id'],'buildingId':b['id'],'reason':'No valid marker position; record retained in inspector only'})
  if typ in ('PUBLIC_PARK','GREEN_BELT','PLAYGROUND'):
   if typ=='PUBLIC_PARK':
    ok=any(place(p,a,'park',p['id']+':park') for a in ['parks-park-1','parks-park-3','parks-park-2'])
    if not ok:issues.append({'parcelId':p['id'],'reason':'Park assembly does not fit; planting and benches used'})
   for n in range(4):place(p,'trees-tree-'+str(1+seed(p['id']+str(n))%4),'tree',p['id']+':tree:'+str(n),1.5,preferred=geom[p['id']].buffer(-4).boundary.interpolate((n+.5)/4,normalized=True))
   for n in range(2):place(p,'props-park_bench','prop',p['id']+':bench:'+str(n),1.2)
  elif typ=='PARKING_AREA':
   if not any(place(p,a,'parking',p['id']+':parking',1) for a in ['props-parking_lot','props-toninos_parking_lots']):
    issues.append({'parcelId':p['id'],'reason':'Calibrated parking assemblies too large; parcel surface only'})
  elif typ in ('APARTMENT_BLOCK','COLLEGE_TRAINING_CENTRE','BUILDER_FLOOR'):
   for n in range(2):place(p,'trees-tree-'+str(1+seed(p['id']+str(n))%4),'tree',p['id']+':tree:'+str(n),1.5)
  if typ=='ROAD_ACCESS_CORRIDOR':
   for n in range(4):place(p,'props-lantern-3','prop',p['id']+':light:'+str(n),.8,preferred=geom[p['id']].buffer(-1).boundary.interpolate((n+.5)/4,normalized=True))
 markings=[]
 for p in parcels:
  if props[p['id']]!='PARKING_AREA':continue
  g=geom[p['id']];angle=orient(g);center=g.centroid
  local=rotate(translate(g,-center.x,-center.y),-math.degrees(angle),origin=(0,0));safe=local.buffer(-2)
  if safe.is_empty:continue
  x0,z0,x1,z1=safe.bounds
  # Illustrative 2.5m-wide, 5m-deep parking bays along an inset edge; no capacity claim.
  for n in range(int((x1-x0)/2.5)+1):
   line=LineString([(x0+n*2.5,z0),(x0+n*2.5,min(z0+5,z1))]).intersection(safe)
   if line.geom_type=='LineString' and not line.is_empty:
    world=translate(rotate(line,math.degrees(angle),origin=(0,0)),center.x,center.y)
    markings.append({'parcelId':p['id'],'points':list(world.coords),'role':'Illustrative parking bay paint, not surveyed geometry'})
 issues=list({json.dumps(i,sort_keys=True):i for i in issues}.values())
 plan={'parkingMarkings':markings,'seedAlgorithm':'SHA256 stable identity; deterministic candidate ranking','selectionMethod':'Breadth-first shared-edge adjacency from actual CELL-10 road until declared semantic coverage is reached','parcelIds':selected,'propertyTypes':{i:props[i] for i in selected},'adjacency':{i:[j for j in adj[i] if j in selected] for i in selected if i in adj},'roadParcelIds':roads,'placements':placements,'issues':issues,'policy':{'buildingSetbackMetres':2,'treeSetbackMetres':1.5,'interObjectClearanceMetres':.6,'note':'Illustrative placement parameters, not statutory setbacks. Registry scales unchanged; no parcel moved. Flat markers are records, not measured building footprints.'}}
 if full:
  plan['selectionMethod']='All active canonical parcels; no fixed count or cadastral edits'
  plan['adjacency']={}
  out=ROOT/'data/city';out.mkdir(exist_ok=True)
  cellSummaries=[]
  categories={a['id']:a['category'] for a in registry}
  sourcecounts=collections.Counter(b['parcelId'] for b in data['buildingRecords'] if b['parcelId'] in allp)
  def summary(rows,ids):
   return {'activeParcels':len(ids),'buildingInstances':sum(p['kind']=='building' and bool(p['assetId']) for p in rows),'markerOnlyBuildings':sum(p['kind']=='building' and not p['assetId'] for p in rows),'buildingRecords':sum(sourcecounts[i] for i in ids),'parcelsByBuildingCount':{'zero':sum(sourcecounts[i]==0 for i in ids),'one':sum(sourcecounts[i]==1 for i in ids),'multiple':sum(sourcecounts[i]>1 for i in ids)},'instancesByCategory':dict(collections.Counter(categories[p['assetId']] for p in rows if p['assetId'])),'trees':sum(p['kind']=='tree' for p in rows),'props':sum(p['kind'] in ('prop','parking') for p in rows),'placements':len(rows)}
  for cell in data['cells']:
   ids=set(cell['parcelIds'])&set(selected);items=[p for p in placements if p['parcelId'] in ids]
   chunk={**plan,'parcelIds':sorted(ids),'placements':items,'propertyTypes':{i:props[i] for i in ids},'issues':[i for i in issues if i['parcelId'] in ids],'roadParcelIds':[i for i in roads if i in ids],'parkingMarkings':[m for m in markings if m['parcelId'] in ids]}
   filename=cell['id']+'.json';(out/filename).write_text(json.dumps(chunk,separators=(',',':')))
   cellSummaries.append({'id':cell['id'],'path':'./data/city/'+filename,'bounds':cell['bounds'],'summary':summary(items,ids)})
  manifest={'cells':cellSummaries,'summary':summary(placements,selected),'historicalRecords':len(data['historicalParcels']),'propertyTypes':{i:props[i] for i in selected},'issues':issues,'policy':plan['policy'],'sourceSHA256':hashlib.sha256((ROOT/'data/normalized-map.json').read_bytes()).hexdigest()}
  (out/'manifest.json').write_text(json.dumps(manifest,indent=2))
 else:(ROOT/'data/pilot-plan.json').write_text(json.dumps(plan,indent=2))
 print('parcels',len(selected),'types',collections.Counter(props[i] for i in selected),'placements',collections.Counter(p['kind'] for p in placements),'GLBs',collections.Counter(p['assetId'] for p in placements),'issues',len(issues))
if __name__=='__main__':main()
