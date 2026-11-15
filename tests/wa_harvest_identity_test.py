import importlib.util
from pathlib import Path
import unittest
import json

spec = importlib.util.spec_from_file_location('wa_build_hunts', Path(__file__).parents[1] / 'scripts' / 'wa_build_hunts.py')
wa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wa)

class HarvestIdentityTest(unittest.TestCase):
    def setUp(self):
        self.hunt = dict(species='Deer', category='Quality Deer', name='Desert', tag='Archery', area='GMU 290', legal='Any Buck', dates='Sept. 1-27', choice=1079)
    def test_renumbered_same_season(self):
        old = dict(self.hunt, choice=1080, dates='Sept. 1-28')
        self.assertIs(wa.harvest_predecessor(self.hunt, [old]), old)
    def test_other_season_and_weapon_rejected(self):
        self.assertIsNone(wa.harvest_predecessor(self.hunt, [dict(self.hunt, dates='Nov. 15-30')]))
        self.assertIsNone(wa.harvest_predecessor(self.hunt, [dict(self.hunt, tag='Muzzleloader')]))
    def test_ambiguous_and_new_not_joined(self):
        self.assertIsNone(wa.harvest_predecessor(self.hunt, [dict(self.hunt), dict(self.hunt)]))
        self.assertIsNone(wa.harvest_predecessor(dict(self.hunt, is_new=True), [self.hunt]))
    def test_desert_real_pamphlet_history(self):
        rows = json.loads((Path(__file__).parents[1] / 'data/wa/source/permit-tables-2021-2026.json').read_text(encoding='utf8'))['rows']
        for number, expected in [(1079, [1080, 1080, 1080, 1080, 1080]), (1080, [1081, 1081, 1081, 1081, 1081]), (1091, [1092, 1092, 1092, 1092, 1093])]:
            current = next(r for r in rows if r['year'] == 2026 and r['choice'] == number and r['species'] == 'Deer')
            for year, choice in zip(range(2025, 2020, -1), expected):
                previous = wa.harvest_predecessor(current, [r for r in rows if r['year'] == year])
                self.assertIsNotNone(previous)
                self.assertEqual(previous['choice'], choice)
                current = previous
    def test_changed_area_and_legal_not_joined(self):
        self.assertIsNone(wa.harvest_predecessor(self.hunt, [dict(self.hunt, area='GMU 291')]))
        self.assertIsNone(wa.harvest_predecessor(self.hunt, [dict(self.hunt, legal='Antlerless')]))

if __name__ == '__main__':
    unittest.main()
