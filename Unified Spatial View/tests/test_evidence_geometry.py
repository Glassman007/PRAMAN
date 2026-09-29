import hashlib,json,pathlib,unittest
from shapely.geometry import shape,LineString
P=pathlib.Path(__file__).resolve().parents[1];D=json.loads((P/'data/normalized-map.json').read_text());E=json.loads((P/'data/evidence-map.json').read_text());parcels={p['id']:shape(p['geometry']) for p in D['parcels']+D['historicalParcels']};sources={g['id']:shape(g['normalized']['geometry']) for g in D['sourceGeometry']}
class EvidenceGeometry(unittest.TestCase):
 def test_all_comparisons_preserve_actual_geometry(self):
  for c in E['comparisons'].values():
   a,b=parcels[c['parcelId']],sources[c['sourceGeometryId']];m=c['metrics'];self.assertAlmostEqual(m['canonicalOnlySqm']+m['overlapSqm'],a.area,places=5);self.assertAlmostEqual(m['sourceOnlySqm']+m['overlapSqm'],b.area,places=5)
   for k,g in [('canonicalOnly',a.difference(b)),('sourceOnly',b.difference(a)),('overlap',a.intersection(b))]:
    if c[k]:self.assertTrue(shape(c[k]).is_valid);self.assertLess(shape(c[k]).symmetric_difference(g).area,1e-6)
    else:self.assertLess(g.area,1e-6)
 def test_shared_edges_belong_to_both_neighbours_without_snapping(self):
  for e in E['sharedEdges']:
   for line in e['lines']:
    g=LineString(line)
    for pid in e['parcelIds']:self.assertLess(g.difference(parcels[pid].boundary).length,1e-6)
 def test_immutable_source_and_no_evaluation_truth(self):
  self.assertEqual(hashlib.sha256((P/'data/normalized-map.json').read_bytes()).hexdigest(),E['metadata']['cadastreSHA256'])
  self.assertFalse(any(k in json.dumps(E) for k in ['benchmark_case_ids','candidate_canonical_parcel_id','alternate_candidate_parcel_ids']))
if __name__=='__main__':unittest.main()
