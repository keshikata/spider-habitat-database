import importlib.util
from pathlib import Path
import unittest
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))

spec = importlib.util.spec_from_file_location('build_data',Path(__file__).resolve().parents[1]/'scripts/build_data.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RulesTest(unittest.TestCase):
    def test_bank_is_not_water(self):
        self.assertEqual(module.classify('川辺')['classes'], [])
        r = module.classify('低山地の水辺の草原')
        self.assertEqual(r['classes'], [5])
        self.assertIn('水際・海岸への距離', r['pending'])

    def test_bamboo_is_not_all_forest(self):
        self.assertEqual(module.classify('平地～低山地の竹林')['classes'], [11])
        self.assertEqual(module.classify('山地の森林')['classes'], [6,7,8,9])

    def test_unmapped_is_explicit(self):
        for text in ['洞窟','建造物内','里山','果樹園','平地の水田の畦']:
            r=module.classify(text)
            self.assertEqual(r['classes'],[])
            self.assertTrue(r['pending'])

    def test_area_and_mesh(self):
        self.assertGreater(module.pixel_area_km2(25),module.pixel_area_km2(45))
        self.assertEqual(module.mesh_xy('53394525'),(3175,4282))

    @unittest.skipUnless((Path(__file__).resolve().parents[1]/'site/data/taxonomy-crosswalk.json').exists(), 'Requires research taxonomy crosswalk')
    def test_taxonomy_does_not_merge_ambiguous_or_subspecies(self):
        import json
        root=Path(__file__).resolve().parents[1]
        cross={r['sourceName']:r for r in json.loads((root/'site/data/taxonomy-crosswalk.json').read_text(encoding='utf-8'))['rows']}
        names={'Trichonephila clavata':{},'Trichonephila clavata clavata':{},'Platnickina adamsoni':{},'Yaginumaella striatipes':{}}
        self.assertEqual(module.resolve_name('Nephila clavata L. Koch 1878',names,cross),'Trichonephila clavata')
        self.assertEqual(module.resolve_name('Platnickina mneon (Bösenberg & Strand 1906)',names,cross),'Platnickina adamsoni')
        self.assertEqual(module.resolve_name('Yaginumaella ususudi (Yaginuma 1972)',names,cross),'Yaginumaella striatipes')
        self.assertIsNone(module.resolve_name('Diaea sp.',names,cross))
        self.assertIsNone(module.resolve_name('Ryuthela tanikawai',names,cross))
        self.assertEqual(module.scientific_key('Trichonephila clavata clavata (L. Koch, 1878)'),'Trichonephila clavata clavata')
        self.assertEqual(module.scientific_key('Neriene brongersmai van Helsdingen 1969'),'Neriene brongersmai')
        self.assertIsNone(module.resolve_name('Trichonephila clavata imaginary Author 1900',names,cross))

    @unittest.skipUnless((Path(__file__).resolve().parents[1]/'site/data/taxonomy-crosswalk.json').exists(), 'Requires research taxonomy crosswalk')
    def test_review_has_evidence_and_stable_targets(self):
        import json
        root=Path(__file__).resolve().parents[1]
        rows=json.loads((root/'site/data/taxonomy-crosswalk.json').read_text(encoding='utf-8'))['rows']
        self.assertEqual(len({r['sourceName'] for r in rows}),84)
        self.assertEqual(sum(r['status']=='mapped' for r in rows),82)
        for r in rows:
            if r['status']=='mapped':
                self.assertTrue(r['catalogName'] and r['catalogId'] and r['evidence'])
                self.assertTrue(all(e['url'].startswith('https://wsc.nmbe.ch/spec-data/') for e in r['evidence']))

if __name__=='__main__':unittest.main()
