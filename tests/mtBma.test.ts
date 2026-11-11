import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { mtBma, mtBmaDistrict, mtAccessPct } from '../src/lib/mtBma';
import { matchesMtBma } from '../src/lib/multiStateSearch';

const bma = JSON.parse(readFileSync('data/mt/bma.json', 'utf8'));
const land = JSON.parse(readFileSync('data/mt/land.json', 'utf8'));
const hunts = JSON.parse(readFileSync('data/mt/hunts.json', 'utf8')).hunts as Record<string, any>[];

test('every district with land has a Block Management record, and a species never exceeds all BMAs', () => {
  assert.deepEqual(Object.keys(bma.districts).sort(), Object.keys(land.districts).sort());
  assert.deepEqual(Object.keys(bma.antelope).sort(), Object.keys(land.antelope).map((k: string) => `A${k}`).sort());
  for (const d of [...Object.values(bma.districts), ...Object.values(bma.antelope)] as any[]) {
    for (const sp of ['deer', 'elk', 'antelope']) if (d[sp]) {
      assert.ok(d[sp].t1 <= d.all.t1 && d[sp].t2 <= d.all.t2);
    }
    // not-public BMA acres are part of all BMA acres
    assert.ok(d.all.t1 <= d.all.t1All && d.all.t2 <= d.all.t2All);
  }
});

test('stored access fields are Type 1 only and agree with the render-time library', () => {
  for (const h of hunts) {
    const b = mtBma(h.units, h.species)!;
    assert.ok(b, h.id);
    assert.ok(Math.abs(b.t1Pct - h.accessYesPct) < 0.051, `${h.id}: ${b.t1Pct} vs ${h.accessYesPct}`);
    assert.equal(b.t1, h.accessYesAcres);
    // Type 2 never reaches the combined share
    assert.ok(Math.abs(h.huntablePct - Math.min(100, h.publicPct + h.accessYesPct)) <= 0.11, h.id);
  }
});

test('species come from the guide: HD 400 BMAs list deer but no elk', () => {
  const [deer, elk] = ['DEER', 'ELK'].map((s) => mtBma(['400'], s)!);
  assert.ok(deer.t1 > 100000);
  assert.equal(elk.t1, 0);
  assert.deepEqual(mtBmaDistrict('A338').map((x) => x.species), ['PRONGHORN']);
  assert.deepEqual(mtBmaDistrict('261').map((x) => x.species), ['DEER', 'ELK']);
});

test('filters count Type 1 by default and Type 2 only when asked', () => {
  // HD 101 deer: no Type 1, one Type 2 BMA
  const b = mtBma(['101'], 'DEER')!;
  assert.equal(b.n1, 0); assert.ok(b.n2 > 0);
  const r = { units: ['101'], species: 'DEER', publicPct: 78.6, privateOnly: false };
  assert.equal(matchesMtBma(r, { mtHasBma: '1' }), false);
  assert.equal(matchesMtBma(r, { mtHasBma: '1', mtBma2: '1' }), true);
  assert.equal(mtAccessPct(b, false), 0);
  // HD 339: 36% Type 1 on top of 29% public
  const r339 = { units: ['339'], species: 'ELK', publicPct: 28.8, privateOnly: false };
  assert.equal(matchesMtBma(r339, { mtMinHuntable: '60' }), true);
  assert.equal(matchesMtBma(r339, { mtMinBma: '40' }), false);
  // a private-land-only licence has no public land, but BMA ground still counts
  assert.equal(matchesMtBma({ ...r339, privateOnly: true }, { mtMinHuntable: '35' }), true);
  assert.equal(matchesMtBma({ ...r339, privateOnly: true }, { mtMinHuntable: '40' }), false);
  // HD 290: one Type 1 BMA touches the district, but only on public parcels, so it adds no access
  const b290 = mtBma(['290'], 'ELK')!;
  assert.equal(b290.n1, 1); assert.equal(b290.t1, 0);
  assert.equal(matchesMtBma({ units: ['290'], species: 'ELK', publicPct: 18, privateOnly: false }, { mtHasBma: '1' }), false);
  // no filter set: everything passes, including districts without BMAs
  assert.equal(matchesMtBma({ units: ['999'], species: 'DEER', publicPct: null, privateOnly: false }, {}), true);
});

test("guide species rules on FWP's own rows", () => {
  const ctx: any = { window: {} };
  runInNewContext(readFileSync('scripts/mt_parse_bma_guide.browser.js', 'utf8'), ctx);
  const sp = ctx.window.mtBmaGuide.species;
  const row = (prim: string, add = '', dist = '') => JSON.parse(JSON.stringify(sp({ prim, add, dist })));
  // 3-143: printed as "Elk & Antelope", with "All species except Elk & Antelope are Prohibited" in another column
  assert.deepEqual(row('Elk & Antelope', '', 'All species except Elk & Antelope are D/E 319 Prohibited on this BMA.'), { deer: false, elk: true, ant: true });
  assert.deepEqual(row('Antelope', 'Black Bear and Moose hunting prohibited'), { deer: false, elk: false, ant: true });
  assert.deepEqual(row('White-Tailed Deer, Turkey, Waterfowl & Upland Birds'), { deer: true, elk: false, ant: false });
  assert.deepEqual(row('WT/M Deer Antelope Upland Birds'), { deer: true, elk: false, ant: true });
  assert.deepEqual(row('White-tailed Deer, Mule Deer, Elk', 'NO DEER HUNTING'), { deer: false, elk: true, ant: false });
  // "Elk and deer hunting only allowed during archery-only and general season" is a season limit, not a ban
  assert.deepEqual(row('White-tailed Deer, Mule Deer, Elk', 'Elk and deer hunting only allowed during archery-only and general season.'), { deer: true, elk: true, ant: false });
  assert.deepEqual(row('Upland Game Birds Only'), { deer: false, elk: false, ant: false });
});
