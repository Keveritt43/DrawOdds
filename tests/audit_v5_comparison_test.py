import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('audit', Path(__file__).resolve().parent.parent / 'scripts/audit_v5_comparison.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class ScopeTest(unittest.TestCase):
    def test_numeric_identifiers_and_zone_prefixes(self):
        self.assertEqual(audit.norm('Unit 061'), '61')
        self.assertEqual(audit.norm('HD 270'), '270')
        self.assertEqual(audit.norm('Zone B1'), 'B1')
        self.assertNotEqual(audit.norm('44'), audit.norm('444'))
        self.assertEqual(audit.norm('DA1008'), 'DA1008')
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
    def test_washington_deer_area_is_parent_context_not_exact(self):
        refs = [{'state':'WA','species':'Deer','unit_id':'169'}]
        matches = audit.candidates({'State':'WA','Species':'Deer','Units':'DA1008'}, audit.reference_index(refs), {})
        self.assertEqual(len(matches), 1)
        self.assertIn('portion',matches[0][2])
        self.assertIn('verify other years',matches[0][2])
        self.assertEqual(audit.candidates({'State':'WA','Species':'Elk','Units':'DA1008'}, audit.reference_index(refs), {}), [])
    def test_washington_explicit_deer_type_filters_only_matching_reference(self):
        refs = [{'state':'WA','species':'Deer','unit_id':'117','subspecies':'Whitetail'},
                {'state':'WA','species':'Deer','unit_id':'117','subspecies':'Mule Deer'}]
        index = audit.reference_index(refs)
        hunt = {'State':'WA','Species':'Deer','Units':'117','Hunt':'49 Degrees North White-tailed Buck Quality Deer'}
        self.assertEqual([r[1]['subspecies'] for r in audit.candidates(hunt,index,{})],['Whitetail'])
        hunt['Hunt'] = '49 Degrees North Mule Deer Buck Quality Deer'
        self.assertEqual([r[1]['subspecies'] for r in audit.candidates(hunt,index,{})],['Mule Deer'])
        hunt['Hunt'] = '49 Degrees North Buck Deer'
        self.assertEqual(len(audit.candidates(hunt,index,{})),2)
        hunt['Hunt'] = 'White-tailed or Mule Deer Buck'
        self.assertEqual(len(audit.candidates(hunt,index,{})),2)
    def test_explicit_type_does_not_inherit_another_subspecies(self):
        refs = [{'state':'WA','species':'Deer','unit_id':'117','subspecies':'Whitetail'}]
        hunt = {'State':'WA','Species':'Deer','Units':'117','Hunt':'Mule Deer Buck'}
        self.assertEqual(audit.candidates(hunt,audit.reference_index(refs),{}),[])
    def test_spreadsheet_formula_is_escaped(self):
        self.assertEqual(audit.spreadsheet_cell('=1+1'), "'=1+1")

if __name__ == '__main__':
    unittest.main()
