"""Analytic checks for the native-pixel distance calculation (optional GIS deps)."""
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
try:
    import numpy as np
    from build_spatial import distance_bins, landscape_distance_bins
except ModuleNotFoundError:
    distance_bins = None


@unittest.skipIf(distance_bins is None, 'Optional numpy/scipy/rasterio environment required')
class NativeDistanceTest(unittest.TestCase):
    def test_forest_edge_ignores_nodata_and_paddy_distance_is_independent(self):
        cover=np.zeros((3,90),dtype=np.uint8)
        cover[:,5:40]=6;cover[:,40:]=5;cover[:,75]=3
        edge,rice=landscape_distance_bins(cover,(10,10))
        # Missing data beside column 5 is not an observed forest boundary.
        self.assertEqual(int(edge[1,5]),2)
        self.assertEqual(int(edge[1,40]),0)
        self.assertEqual(int(edge[1,50]),0)
        self.assertEqual(int(edge[1,51]),1)
        self.assertEqual(int(rice[1,75]),0)
        self.assertEqual(int(rice[1,40]),2)
    def test_inclusive_thresholds_and_absent_target(self):
        cover = np.zeros((3, 105), dtype=np.uint8)
        cover[1, 1] = 1
        bins = distance_bins(cover, 1, (10, 10))
        self.assertEqual([int(bins[1, x]) for x in [1, 11, 12, 26, 27, 51, 52]],
                         [0, 0, 1, 1, 2, 2, 3])
        self.assertTrue((distance_bins(cover, 2, (10, 10)) == 3).all())

    def test_latitude_dependent_anisotropic_sampling(self):
        cover = np.zeros((25, 25), dtype=np.uint8)
        cover[1, 1] = 1
        bins = distance_bins(cover, 1, (8, 6))
        # sqrt(80² + 60²) = 100m. The next eastward pixel exceeds 100m.
        self.assertEqual(int(bins[11, 11]), 0)
        self.assertEqual(int(bins[11, 12]), 1)


if __name__ == '__main__':
    unittest.main()
