import unittest,json,hashlib,collections
from pathlib import Path
from shapely.geometry import shape,LineString
from shapely import STRtree
R=Path(__file__).resolve().parents[1]
class CityValidation(unittest.TestCase):
 def test_all_placements(self):
  data=json.loads((R/'data/normalized-map.json').read_text());manifest=json.loads((R/'data/city/manifest.json').read_text());active={p['id']:p for p in data['parcels'] if p['is_active']};geoms={i:shape(p['geometry']) for i,p in active.items()};self.assertEqual(hashlib.sha256((R/'data/normalized-map.json').read_bytes()).hexdigest(),manifest['sourceSHA256'])
  chunks=[json.loads((R/c['path'].removeprefix('./')).read_text()) for c in manifest['cells']];ids=[i for c in chunks for i in c['parcelIds']];self.assertEqual(len(ids),len(set(ids)));self.assertEqual(set(ids),set(active))
  placements=[p for c in chunks for p in c['placements']];shapes=[];placementids=[];buildings={b['id']:b for b in data['buildingRecords'] if b['parcelId'] in active};represented=set();counts=collections.Counter()
  for p in placements:
   self.assertIn(p['parcelId'],active);self.assertEqual(p['scale'],1);s=shape(p['footprint']);self.assertTrue(geoms[p['parcelId']].buffer(-p['setback']).covers(s),p['id']);shapes.append(s);placementids.append(p['id'])
   if p['kind']=='building':self.assertIn(p['id'],buildings);self.assertEqual(p['parcelId'],buildings[p['id']]['parcelId']);represented.add(p['id']);counts[p['parcelId']]+=1
   typ=manifest['propertyTypes'][p['parcelId']]
   if p['assetId'] and p['assetId'].startswith('apartments'):self.assertIn(typ,('APARTMENT_BLOCK','GROUP_HOUSING_BLOCK','DDA_FLAT_BLOCK'))
   if p['assetId'] and 'construction' in p['assetId']:self.assertEqual(typ,'UNDER_CONSTRUCTION_PLOT')
   if p['assetId'] and 'bench' in p['assetId']:self.assertIn(typ,('PUBLIC_PARK','GREEN_BELT','PLAYGROUND'))
  self.assertEqual(len(set(placementids)),len(placementids));self.assertEqual(represented,set(buildings));self.assertEqual(len(placements),manifest['summary']['placements'])
  tree=STRtree(shapes)
  for i,g in enumerate(shapes):
   buffered=g.buffer(.6)
   for j in tree.query(buffered):
    if int(j)>i:self.assertFalse(buffered.intersects(shapes[int(j)]),(placementids[i],placementids[int(j)]))
  for chunk in chunks:
   for mark in chunk['parkingMarkings']:self.assertTrue(geoms[mark['parcelId']].covers(LineString(mark['points'])))
   for i in chunk['roadParcelIds']:self.assertEqual(manifest['propertyTypes'][i],'ROAD_ACCESS_CORRIDOR')
  calculated={'active':len(active),'storedHistorical':len(data['historicalParcels']),'buildingRecords':len(buildings),'placements':len(placements),'buildingModels':sum(p['kind']=='building' and bool(p['assetId']) for p in placements),'markers':sum(p['kind']=='building' and not p['assetId'] for p in placements),'cells':len(chunks),'setbackViolations':0,'overlapOrClearanceViolations':0,'missingBuildingIdentities':0,'cadastreSHA256':manifest['sourceSHA256']}
  (R/'docs/city-placement-validation.json').write_text(json.dumps(calculated,indent=2));print(calculated)
if __name__=='__main__':unittest.main()
