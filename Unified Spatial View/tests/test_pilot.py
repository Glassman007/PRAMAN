import unittest,json,collections,hashlib
from pathlib import Path
from shapely.geometry import shape,LineString
R=Path(__file__).resolve().parents[1]
class Pilot(unittest.TestCase):
 def test_plan(self):
  d=json.loads((R/'data/normalized-map.json').read_text());p=json.loads((R/'data/pilot-plan.json').read_text());g={r['id']:shape(r['geometry']) for r in d['parcels']};ids=set(p['parcelIds']);self.assertLess(len(ids),100)
  visited=set();queue=[p['parcelIds'][0]]
  while queue:
   i=queue.pop()
   if i in visited:continue
   visited.add(i)
   for j in p['adjacency'][i]:
    self.assertGreater(g[i].boundary.intersection(g[j].boundary).length,.05);queue.append(j) if j not in visited else None
  self.assertEqual(visited,ids)
  shapes=[];counts=collections.Counter();sourceCounts=collections.Counter(b['parcelId'] for b in d['buildingRecords'] if b['parcelId'] in ids)
  for item in p['placements']:
   self.assertEqual(item['scale'],1);self.assertIn(item['parcelId'],ids);f=shape(item['footprint']);self.assertTrue(g[item['parcelId']].buffer(-item['setback']).covers(f),item['id']);self.assertTrue(all(not f.intersects(old) for old in shapes));shapes.append(f)
   if item['kind']=='building':counts[item['parcelId']]+=1
   if item['assetId'] and item['assetId'].startswith('apartments'):self.assertIn(p['propertyTypes'][item['parcelId']],['APARTMENT_BLOCK','GROUP_HOUSING_BLOCK','DDA_FLAT_BLOCK'])
   if item['assetId'] and 'bench' in item['assetId']:self.assertIn(p['propertyTypes'][item['parcelId']],['PUBLIC_PARK','GREEN_BELT','PLAYGROUND'])
  self.assertEqual(counts,sourceCounts);self.assertIn(2,counts.values());self.assertTrue(ids-set(counts))
  for mark in p['parkingMarkings']:self.assertTrue(g[mark['parcelId']].covers(LineString(mark['points'])))
  print('Pilot:',len(ids),'connected parcels;',len(shapes),'contained non-overlapping placements; 0/1/multiple building records validated.')
if __name__=='__main__':unittest.main()
