from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from spatial_rules import spatial_rule, accepts

class SpatialRuleTest(unittest.TestCase):
    def test_riverbed_is_explicit_grass_proxy_not_generic_water(self):
        r=spatial_rule('河川敷')
        self.assertTrue(r['supported']);self.assertTrue(r['river']);self.assertTrue(r['proxy'])
        self.assertEqual(r['classes'],[5]);self.assertFalse(r['water'])
        self.assertTrue(accepts(5*64+3*4+65536,[r],distance=1))
        self.assertFalse(accepts(5*64+3*65536,[r],distance=2))
        self.assertFalse(spatial_rule('河口')['supported'])
    def test_vegetation_required_in_every_matching_pixel(self):
        for label,group,cover in [('植林地',2,6),('牧草地',3,5),('果樹園',1,4),('ハイマツ帯',4,5),('薮',5,5)]:
            r=spatial_rule(label)
            self.assertTrue(r['supported'],label)
            self.assertFalse(accepts(cover*64,[r]))
            self.assertTrue(accepts(cover*64+group*262144,[r]))
    def test_coastal_grass_is_distinct_from_inland_water(self):
        r=spatial_rule('海岸の草地')
        self.assertEqual(r['classes'],[5]);self.assertTrue(r['coast']);self.assertFalse(r['water'])
        self.assertTrue(accepts(5*64+3*4,[r],distance=0))
        self.assertFalse(accepts(3072+5*64,[r],distance=2))
    def test_compound_modifiers_are_not_discarded(self):
        self.assertTrue(spatial_rule('林縁の草地')['edge'])
        self.assertEqual(spatial_rule('林縁の草地')['classes'],[5])
        self.assertTrue(spatial_rule('市街地の芝生')['built'])
        self.assertTrue(spatial_rule('市街地の芝生')['proxy'])
        self.assertNotIn(2,spatial_rule('建造物の周囲')['classes'])
        self.assertTrue(spatial_rule('都市部の丘陵')['built'])
        self.assertEqual(spatial_rule('市街地の緑地林')['classes'],[6,7,8,9])
        self.assertTrue(spatial_rule('水田およびその周囲')['rice'])
        self.assertTrue(spatial_rule('平地の水田の畦')['rice'])
    def test_ranges_are_not_intersections(self):
        r=spatial_rule('海岸～低山地の森林')
        self.assertFalse(r['coast']);self.assertEqual(r['elevation'],[0,1])
    def test_unavailable_modifiers_exclude_the_entire_habitat(self):
        for label in ['海岸の岩場','海岸(潮間帯)','里山の森林','市街地の良い林','山地の渓流','平地～山地の湖沼','港湾周辺']:
            r=spatial_rule(label)
            self.assertFalse(r['supported'],label);self.assertEqual(r['classes'],[],label);self.assertTrue(r['pending'],label)
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
