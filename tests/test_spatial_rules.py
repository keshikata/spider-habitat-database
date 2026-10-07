from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from spatial_rules import spatial_rule, accepts

class SpatialRuleTest(unittest.TestCase):
    def test_water_grass_is_land_with_distance(self):
        r=spatial_rule('低山地の水辺の草原')
        self.assertEqual(r['classes'],[5]); self.assertTrue(r['water']); self.assertEqual(r['elevation'],[1])
    def test_garden_is_an_explicit_built_green_proxy(self):
        r=spatial_rule('公園や庭')
        self.assertEqual(r['classes'],[5,6,7,8,9,11]);self.assertTrue(r['built']);self.assertTrue(r['proxy'])
    def test_indoor_is_not_a_green_proxy(self):
        self.assertEqual(spatial_rule('公園の建造物内')['classes'],[])
    def test_span_and_missing_elevation(self):
        r=spatial_rule('平地～低山地の森林');self.assertEqual(r['elevation'],[0,1])
        self.assertTrue(accepts(6*64+3*16,[r],elevation=False))
        self.assertFalse(accepts(6*64+3*16,[r],elevation=True))

if __name__=='__main__':unittest.main()
