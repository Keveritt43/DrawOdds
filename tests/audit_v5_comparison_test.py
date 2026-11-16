import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('audit', Path(__file__).resolve().parent.parent / 'scripts/audit_v5_comparison.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class ScopeTest(unittest.TestCase):
    def test_zion_reference_explicitly_includes_general(self):
        ref = {'hunt_scope':'Limited-Entry & Dedicated Hunter / General Buck Hunts'}
        self.assertEqual(audit.scope(ref, {'Hunt':'Zion General Buck','Season dates':''})[0], 'scope unverified')
    def test_general_and_limited_only_are_different(self):
        ref = {'hunt_scope':'Limited-Entry Buck Hunts'}
        self.assertEqual(audit.scope(ref, {'Hunt':'Zion General Buck','Season dates':''})[0], 'different scope')
    def test_partial_units_remain_distinct(self):
        refs = [{'state':'CO','species':'Deer','unit_id':'44'},{'state':'CO','species':'Deer','unit_id':'444'}]
        matches = audit.candidates({'State':'CO','Species':'Deer','Units':'44'}, audit.reference_index(refs), {})
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0][1]['unit_id'], '44')
    def test_spreadsheet_formula_is_escaped(self):
        self.assertEqual(audit.spreadsheet_cell('=1+1'), "'=1+1")

if __name__ == '__main__':
    unittest.main()
