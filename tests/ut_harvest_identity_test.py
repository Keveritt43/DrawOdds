import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('ut_harvest_identity', Path(__file__).parents[1] / 'scripts' / 'ut_harvest_identity.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

class UtahHarvestRows(unittest.TestCase):
    def test_adult_and_youth_do_not_depend_on_order(self):
        adult = {'code':'DB1530','type':'General Season','hunters':489,'harvest':263}
        youth = {'code':'DB1530','type':'General Season Youth** Any Legal Weapon','hunters':112,'harvest':64}
        for rows in ([adult,youth], [youth,adult]):
            selected, ambiguous = mod.index_harvest_records(rows)
            self.assertEqual(selected['DB1530'],adult); self.assertEqual(ambiguous,[])
    def test_ambiguous_duplicate_adults_are_not_guessed(self):
        rows=[{'code':'DB1','type':'General Season','hunters':1},{'code':'DB1','type':'General Season','hunters':2}]
        selected, ambiguous=mod.index_harvest_records(rows)
        self.assertNotIn('DB1',selected); self.assertEqual(ambiguous,['DB1'])

if __name__ == '__main__': unittest.main()
