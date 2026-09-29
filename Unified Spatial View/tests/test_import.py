import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from import_dataset import validate_geometry
class GeometryValidation(unittest.TestCase):
 def test_hole(self):
  g,m,l=validate_geometry('POLYGON((77 28,77.01 28,77.01 28.01,77 28.01,77 28),(77.002 28.002,77.002 28.004,77.004 28.004,77.004 28.002,77.002 28.002))','EPSG:4326')
  self.assertEqual(len(l.interiors),1);self.assertTrue(l.is_valid)
 def test_multipart(self):
  g,m,l=validate_geometry('MULTIPOLYGON(((77 28,77.001 28,77.001 28.001,77 28)),((77.01 28,77.011 28,77.011 28.001,77.01 28)))','EPSG:4326');self.assertEqual(len(l.geoms),2)
 def test_reject(self):
  for text,crs in [('', 'EPSG:4326'),('POLYGON((77 28,77.01 28.01,77.01 28,77 28.01,77 28))','EPSG:4326'),('POLYGON((77 28,77.01 28,77.01 28.01,77 28))',''),('POLYGON((77 28,77.01 28,77.01 28.01))','EPSG:4326')]:
   with self.assertRaises(Exception):validate_geometry(text,crs)
if __name__=='__main__':unittest.main()
