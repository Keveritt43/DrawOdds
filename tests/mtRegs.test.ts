import { test } from 'node:test';
import assert from 'node:assert/strict';
import regs from '../data/mt/regs-2026.json';
import units from '../data/mt/units.json';

// Values below were read off the rendered 2026 regulations pages (pp. 53, 59, 60, 95, 137) on 2026-11-11.
type Opp = {
  page: number; license: string; code: string | null; opportunity: string | null; applyBy: string | null; otc: boolean;
  quota: number | 'UNL' | null; quotaRange: number[] | null; seasons: Record<string, string | null>;
  details: string | null; section?: string; landLimit?: string;
};
type Table = { hd: string; name: string; species: string; notes: string[]; opportunities: Opp[] };
const R = regs as unknown as { districts: Table[]; codes: Record<string, Record<string, unknown>> };
const table = (hd: string, species: string) => R.districts.find((t) => t.hd === hd && t.species === species)!;

test('every GIS district has a regulations table, and no table lacks a district', () => {
  const geo = (sp: string) => new Set((units as { units: { name: string; species: string; portionOf?: string }[] }).units
    .filter((u) => u.species === sp && !u.portionOf).map((u) => u.name));
  for (const sp of ['DEER', 'ELK']) {
    const regsHds = new Set(R.districts.filter((t) => t.species === sp).map((t) => t.hd));
    assert.deepEqual([...regsHds].sort(), [...geo('deer-elk')].sort(), sp);
  }
  // antelope: 700-705 are covered by Region 7's two "Portions of HDs" sections instead of district tables
  const an = new Set(R.districts.filter((t) => t.species === 'ANTELOPE' && /^\d/.test(t.hd)).map((t) => t.hd));
  const expected = [...geo('antelope')].filter((h) => !/^70[0-5]$/.test(h));
  assert.deepEqual([...an].sort(), expected.sort());
});

test('HD 261 deer reads exactly as printed (p. 60)', () => {
  const rows = table('261', 'DEER').opportunities;
  assert.equal(rows.length, 8);
  assert.equal(rows.filter((o) => o.license === 'General Deer License').length, 4);
  const p = rows.find((o) => o.code === '261-50')!;
  assert.deepEqual([p.license, p.applyBy, p.quota, p.quotaRange], ['Deer Permit', 'April 1', 10, null]);
  assert.deepEqual(p.seasons, { early: null, archery: 'Sep 05-Oct 18', general: 'Oct 24-Nov 29', heritage: 'Dec 12-Dec 20', late: null });
  const b = rows.find((o) => o.code === '261-01')!;
  assert.deepEqual([b.applyBy, b.otc, b.quota, b.quotaRange, b.landLimit], ['Jun 1', false, 10, [1, 150], 'private']);
});

test('a merged licence cell spanning rows with different restrictions (Elk B 201-01, 240-01)', () => {
  const e201 = table('260', 'ELK').opportunities.filter((o) => o.code === '201-01');
  assert.equal(e201.length, 2);
  assert.equal(e201[0].seasons.early, 'Aug 15-Sep 04');
  assert.equal(e201[1].seasons.archery, 'Sep 05-Oct 18');
  assert.match(e201[0].details!, /See HD 201 for more info/);
  assert.match(e201[1].details!, /as listed\.$/);
  const e240 = table('240', 'ELK').opportunities.filter((o) => o.code === '240-01');
  assert.deepEqual(e240.map((o) => o.landLimit ?? null), [null, 'private']); // only the late segment
});

test('drawing-only elk districts have no general elk licence', () => {
  const none = R.districts.filter((t) => t.species === 'ELK' && !t.opportunities.some((o) => o.license === 'General Elk License'))
    .map((t) => t.hd).sort();
  assert.deepEqual(none, ['250', '410', '455', '555', '620', '621', '622', '630', '700']);
});

test('licence codes are keyed by licence type: 005-00 is a drawn Deer B and an OTC Elk B', () => {
  const deer = R.codes['Deer B License 005-00'], elk = R.codes['Elk B License 005-00'];
  assert.deepEqual([deer.otc, deer.applyBy, deer.quota], [false, 'Jun 1', 4500]);
  assert.deepEqual([elk.otc, elk.applyBy, elk.quota], [true, 'Jun 15', 'UNL']);
  // FWP's own reference table (p. 122) says Elk B 005-00 is "June 1"; every district table says OTC
  assert.ok(elk.referenceConflict);
});

test('the reference table and the district tables name the same districts for every multi-district code', () => {
  const c397 = R.codes['Elk B License 397-00'] as { districts: string[]; validIn: { districts: string[] } };
  assert.deepEqual([...c397.districts].sort(), [...c397.validIn.districts].sort());
  assert.ok(c397.districts.includes('380'));
});

test('places the regulations contradict themselves are recorded, not resolved by guessing', () => {
  const c = R.codes['Elk B License 210-03'] as { quota: unknown; conflicts: { field: string; values: Record<string, string[]> }[] };
  assert.equal(c.quota, null);
  assert.deepEqual(c.conflicts[0].values, { '300': ['210'], '200': ['211', '212', '216'] });
  // each district keeps what its own table prints
  assert.equal(table('210', 'ELK').opportunities.find((o) => o.code === '210-03')!.quota, 300);
});

test('antelope restrictions sit only on the rows that carry them (p. 137)', () => {
  const rows = table('546', 'ANTELOPE').opportunities;
  assert.deepEqual(rows.map((o) => [o.code, o.quota, o.details]), [
    ['546-20', 400, null], ['546-30', 200, null], ['900-20', 5600, 'First and only choice. ArchEquip only.'],
  ]);
});
