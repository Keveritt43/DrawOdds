import { test } from 'node:test';
import assert from 'node:assert/strict';
import hunts from '../data/mt/hunts.json';
import { mtProjected, mtSolve, mtChance } from '../src/lib/mtProj';
import { mtPersonal, type MtPointOdds } from '../src/lib/mtHunt';
import { readMtPoints } from '../src/lib/mtPoints';

type H = { id: string; oddsByPts: unknown; pointOdds: MtPointOdds; oddsLastYear: number | null };
const HS = (hunts as unknown as { hunts: H[] }).hunts;
const byId = (id: string) => HS.find((h) => h.id === id)!;

test('the projection gives the pool exactly its licences, and never falls as points rise', () => {
  for (const h of HS.filter((x) => x.pointOdds.kind === 'bonus')) {
    const pr = mtProjected(h.pointOdds);
    for (const pool of ['res', 'nr'] as const) {
      const x = h.pointOdds.pools?.[pool];
      const arr = pr?.[pool];
      if (!x || !x.levels.length || !arr) continue;
      for (let i = 1; i < arr.length; i++) assert.ok(arr[i] >= arr[i - 1], `${h.id} ${pool}`);
      const counts = x.levels.map(([p, n]) => ({ level: p === '' || p === '0' ? 0 : Number(p), buying: !(p === '' || p === '0'), n }));
      const t = mtSolve(counts, x.succ[0]);
      const expected = counts.reduce((a, c) => a + c.n * mtChance(t, c.level, c.buying), 0);
      const total = counts.reduce((a, c) => a + c.n, 0);
      assert.ok(Math.abs(expected - Math.min(x.succ[0], total)) < 0.01 * Math.max(1, x.succ[0]), `${h.id} ${pool}: ${expected} vs ${x.succ[0]}`);
    }
  }
});

test('Elk Permit 380-20: projected odds are smooth where the printed ones jump, and match squared weights', () => {
  const h = byId('MT:elk-permit:380-20');
  const pr = mtProjected(h.pointOdds)!;
  // more chances, more odds: level 11 (10 banked) has 122 chances against level 1's 2
  const x = h.pointOdds.pools!.res;
  const t = mtSolve(x.levels.map(([p, n]) => ({ level: p === '0' || p === '' ? 0 : Number(p), buying: !(p === '0' || p === ''), n })), x.succ[0]);
  assert.ok(Math.abs(pr.res![10] - (1 - Math.exp(-122 * t))) < 1e-4);
  assert.ok(pr.res![10] > pr.res![0] * 30, 'level 11 has 61x the chances of level 1');
  // the no-purchase row gets one chance: half the 1-point row's, near enough at these odds
  assert.ok(Math.abs(pr.noBuy.res! - pr.res![0] / 2) < 1e-3);
});

test('mtPersonal: projected by default, last draw on request; the combination part is never projected', () => {
  const h = byId('MT:elk-permit:380-20');
  const pts = readMtPoints({ MT: { res: 'RESIDENT', mtCombo: 0, mtBonus: { ELK_PERMIT: 10 }, set: true } });
  const proj = mtPersonal(h, pts, false), last = mtPersonal(h, pts, false, 'last');
  assert.match(proj.basis, /^Next draw, projected from the 2026 draw/);
  assert.match(last.basis, /^2026 draw/);
  assert.equal(last.odds, (h.oddsByPts as { last: { res: number[] } }).last.res[10]);
  assert.notEqual(proj.odds, last.odds);
  const nrPts = readMtPoints({ MT: { res: 'NONRESIDENT', mtCombo: 0, mtBonus: { ELK_PERMIT: 10 }, set: true } });
  const nr = mtPersonal(h, nrPts, true);
  assert.match(nr.basis, /last draw\) at 0 preference points/);
  assert.equal(nr.parts!.combo, mtPersonal(h, nrPts, true, 'last').parts!.combo);
  // general licences and over-the-counter B licences are unchanged by mode
  const g = byId('MT:elk-general:261');
  assert.deepEqual(mtPersonal(g, nrPts, true), mtPersonal(g, nrPts, true, 'last'));
});
