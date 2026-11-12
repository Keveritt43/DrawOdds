import { test } from 'node:test';
import assert from 'node:assert/strict';
import data from '../data/mt/hunts.json';
import { mtHarvestSeries, mtDrawSeries } from '../src/lib/mtSeries';
import type { MtPointOdds } from '../src/lib/mtHunt';

type H = { id: string; species: string; units: string[]; pointOdds: MtPointOdds };
const by = (id: string) => (data as unknown as { hunts: H[] }).hunts.find((h) => h.id === id)!;

test('chart series: Idaho shapes from Montana rows; deer split by FWP species estimates of the same seasons', () => {
  const g = by('MT:deer-general:270');
  const s = mtHarvestSeries(g.pointOdds, 'DEER', ['270']);
  assert.equal(s.length, g.pointOdds.harvest.length);
  const y25 = s.find((r) => r.year === 2025)!;
  assert.equal(y25.mule! + y25.whitetail! > 0, true);
  assert.ok(y25.success! > 0 && y25.success! < 1);
  // mule-buck permits: hunters are permits issued, and no species split is drawn
  const p = by('MT:deer-permit:261-50');
  assert.ok(mtHarvestSeries(p.pointOdds, 'DEER', ['261']).every((r) => r.mule === null));
  const d = mtDrawSeries(by('MT:elk-permit:217-10').pointOdds);
  const d26 = d.find((r) => r.year === 2026)!;
  assert.equal(d26.resApps, 649);
  assert.ok(Math.abs(d26.resOdds! - 159 / 649) < 1e-9);
  assert.equal(d26.permits, 175);
});
