import { test } from 'node:test';
import assert from 'node:assert/strict';
import land from '../data/mt/land.json';
import units from '../data/mt/units.json';
import hunts from '../data/mt/hunts.json';
import history from '../data/mt/district-history.json';

type Rec = { acres: number; sqmi: number; publicPct: number; privatePct: number; tribalPct: number; undeterminedPct: number; ownership: Record<string, number> };
const L = land as unknown as { statewide: { federalPct: number; statePct: number; coveragePct: number }; districts: Record<string, Rec>; antelope: Record<string, Rec> };
const U = (units as unknown as { units: { name: string; species: string; acres: number; bbox: number[]; portionOf?: string; publicPct?: number; privatePct?: number }[] }).units;
type Hunt = { id: string; species: string; units: string[]; publicPct: number | null; privatePct: number | null; harvestYears: number; harvestLastYear: number | null; success5: number | null; bigPct5: number | null; pointOdds: { needsGeneral?: boolean; harvest: { year: number }[] } };
const H = (hunts as unknown as { hunts: Hunt[] }).hunts;
const rec = (u: string) => (u.startsWith('A') ? L.antelope[u.slice(1)] : L.districts[u]);

test('every deer/elk district has land, and its shares add up', () => {
  const de = U.filter((u) => u.species === 'deer-elk');
  assert.equal(Object.keys(L.districts).length, de.length);
  for (const u of de) {
    const r = L.districts[u.name];
    assert.ok(r, u.name);
    const sum = Object.values(r.ownership).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 0.2, `${u.name} sums to ${sum}`);
    assert.ok(r.publicPct + r.privatePct + r.tribalPct + r.undeterminedPct <= 100.2);
    assert.equal(u.publicPct, r.publicPct);
    // the 10 m district outlines and the ~100 m display outlines agree on size
    assert.ok(Math.abs(r.acres - u.acres) / u.acres < 0.02, `${u.name}: ${r.acres} vs ${u.acres}`);
  }
});

test('district-wide shares match published federal and state acreage (see scripts/mt_build_land.py)', () => {
  assert.ok(L.statewide.federalPct >= 29 && L.statewide.federalPct <= 34, String(L.statewide.federalPct));
  assert.ok(L.statewide.statePct >= 5.5 && L.statewide.statePct <= 8, String(L.statewide.statePct));
  assert.ok(L.statewide.coveragePct >= 99.5);
});

test('hunts carry acre-weighted public land, never a missing share', () => {
  for (const h of H) assert.equal(typeof h.publicPct, 'number', h.id);
  const general = H.find((h) => h.id === 'MT:elk-general:261')!;
  assert.equal(general.publicPct, L.districts['261'].publicPct);
  const multi = H.find((h) => h.units.length > 3)!;
  const rs = multi.units.map(rec);
  const w = rs.reduce((a, r) => a + r.publicPct * r.acres, 0) / rs.reduce((a, r) => a + r.acres, 0);
  assert.ok(Math.abs(multi.publicPct! - w) < 0.06, multi.id);
});

test('antelope: every district and Region 7 portion has land; portions make up their district', () => {
  const an = U.filter((u) => u.species === 'antelope');
  assert.equal(an.filter((u) => !u.portionOf).length, 61);
  for (const u of an) assert.equal(u.publicPct, L.antelope[u.name].publicPct, u.name);
  for (const hd of ['701', '703']) {
    const sum = L.antelope[`${hd}N`].acres + L.antelope[`${hd}S`].acres;
    assert.ok(Math.abs(sum - L.antelope[hd].acres) / L.antelope[hd].acres < 0.01, hd);
  }
  // the inverse Albers projection puts the portions on FWP's own lon/lat outline of the district
  const whole = (n: string) => an.find((u) => u.name === n && !u.portionOf)!.bbox;
  const n = an.find((u) => u.name === '701N')!.bbox, s = an.find((u) => u.name === '701S')!.bbox;
  const join = [Math.min(n[0], s[0]), Math.min(n[1], s[1]), Math.max(n[2], s[2]), Math.max(n[3], s[3])];
  whole('701').forEach((v, i) => assert.ok(Math.abs(v - join[i]) < 0.002, `701 bbox ${i}: ${v} vs ${join[i]}`));
});

test('antelope harvest counts only seasons whose district outline matches today\'s', () => {
  const hist = (history as unknown as { stableIou: number; antelope: Record<string, Record<string, number | null>> });
  // HD 480 was redrawn for 2026 (overlap with every earlier outline 37%): no earlier season describes today's 480
  assert.ok((hist.antelope['480']['2024'] ?? 0) < 0.5);
  const h480 = H.find((h) => h.id === 'MT:antelope:480-20')!;
  assert.equal(h480.harvestYears, 0);
  assert.equal(h480.success5, null);
  // HD 546 changed in 2022 and has not since: only the 2022 and 2024 seasons
  const h546 = H.find((h) => h.id === 'MT:antelope:546-20')!;
  assert.deepEqual(h546.pointOdds.harvest.map((x) => x.year), [2022, 2024]);
  for (const h of H.filter((x) => x.species === 'PRONGHORN')) {
    assert.equal(h.bigPct5, null, h.id); // FWP's antelope estimates have no horn-size class
    assert.notEqual(h.pointOdds.needsGeneral, true, h.id); // no combination licence for antelope
    for (const u of h.units) assert.match(u, /^A\d{3}[NS]?$/, h.id);
  }
});
