import unittest
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from jsc_geography import record_geography

class GeographyTest(unittest.TestCase):
    def test_unknown_is_not_mainland_and_duplicate_islands_are_not_counted_twice(self):
        def row(island, accuracy='通常'):
            return {'sci':'Test species','pref':'鹿児島県','island':island,'record_accuracy':accuracy}
        g=record_geography([row('奄美大島'),row('奄美大島'),row('不明'),row('九州','要確認')],{'Test species'},['鹿児島県'])
        self.assertEqual(g['Test species']['1'],{'mainland':False,'islands':['奄美大島'],'unspecified':True})
        g=record_geography([row('九州'),row('奄美大島')],{'Test species'},['鹿児島県'])
        self.assertTrue(g['Test species']['1']['mainland'])
