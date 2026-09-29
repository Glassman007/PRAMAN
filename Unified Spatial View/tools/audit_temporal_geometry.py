"""Compare lineage geometry without changing or repairing source geometry."""
import json,pathlib
from shapely.geometry import shape
from shapely.ops import unary_union
p=pathlib.Path(__file__).resolve().parents[1];d=json.loads((p/'data/normalized-map.json').read_text());gs={g['id']:g for g in d['geometryVersions']};records={r['id']:r for r in d['parcels']+d['historicalParcels']}
remaining=d['lineage'].copy();results=[]
while remaining:
 first=remaining.pop(0);rows=[first];ids={first['parentParcelId'],first['childParcelId']}
 while True:
  connected=[r for r in remaining if all(r[k]==first[k] for k in ['type','date','source','acceptedStatus']) and (r['parentParcelId'] in ids or r['childParcelId'] in ids)]
  if not connected:break
  for r in connected:remaining.remove(r);rows.append(r);ids.update([r['parentParcelId'],r['childParcelId']])
 parents=sorted({r['parentParcelId'] for r in rows});children=sorted({r['childParcelId'] for r in rows})
 def geometry(pid):
  vs=[g for g in gs.values() if g['parcelId']==pid and g['date']<=first['date'] and g['status'] in ['AUTHORITATIVE','SUPERSEDED','HISTORICAL']]
  g=sorted(vs,key=lambda g:g['date'])[-1];return shape(g['geometry']['geometry'])
 old=[geometry(i) for i in parents];new=[geometry(i) for i in children];a=unary_union(old);b=unary_union(new)
 shared=sum(old[i].boundary.intersection(old[j].boundary).length for i in range(len(old)) for j in range(i+1,len(old)))
 results.append({'id':min(r['id'] for r in rows),'type':first['type'],'date':first['date'],'parentIds':parents,'childIds':children,'parentAreaSqm':a.area,'childAreaSqm':b.area,'symmetricDifferenceSqm':a.symmetric_difference(b).area,'sharedParentEdgeMetres':shared,'crossCell':len({records[i]['cellId'] for i in ids})>1})
(p/'data/temporal-geometry-audit.json').write_text(json.dumps(results,indent=2)+'\n');print('Audited',len(results),'transactions. Max union difference m²:',max(r['symmetricDifferenceSqm'] for r in results));print('Merges with no shared parent edge:',sum('SPLIT' not in r['type'] and r['sharedParentEdgeMetres']==0 for r in results))
