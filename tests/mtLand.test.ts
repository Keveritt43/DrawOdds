import { test } from 'node:test';
import assert from 'node:assert/strict';
import land from '../data/mt/land.json';
import units from '../data/mt/units.json';
import hunts from '../data/mt/hunts.json';

type Rec = { acres: number; sqmi: number; publicPct: number; privatePct: number; tribalPct: number; undeterminedPct: number; ownership: Record<string, number> };
const L = land as unknown as { statewide: { federalPct: number; statePct: number; coveragePct: number }; districts: Record<string, Rec> };
const U = (units as unknown as { units: { name: string; species: string; acres: number; publicPct?: number; privatePct?: number }[] }).units;
const H = (hunts as unknown as { hunts: { id: string; units: string[]; publicPct: number | null; privatePct: number | null }[] }).hunts;

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
  const rs = multi.units.map((u) => L.districts[u]);
  const w = rs.reduce((a, r) => a + r.publicPct * r.acres, 0) / rs.reduce((a, r) => a + r.acres, 0);
  assert.ok(Math.abs(multi.publicPct! - w) < 0.06, multi.id);
});
