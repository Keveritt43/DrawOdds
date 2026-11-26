import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idahoV2Tier, trophyForHunt } from '../src/lib/trophyHunt';
import general from '../data/id/trophy-v2-general.json';

// Rows from the Nov 26 production snapshot (data/id/trophy-shadow-2026-11-26.json).
const base = { state: 'ID', species: 'DEER', type: 'GENERAL', antlerClass: 'EITHER', units: ['36'], openDate: '2026-10-10', closeDate: '2026-10-24', tagSeasons: null, takeMethod: null };

test('Unit 36 general deer: own ranking among Idaho general hunts, not "demand unknown"', () => {
  const r = idahoV2Tier({ ...base, id: 'g:-1202273542:36', weapon: 'ANY' } as never)!;
  assert.equal(r.score, 80);
  assert.match(r.reason, /^Ranks 14 of 311 Idaho general deer hunts on demand \(871 hunters a year, 5\.3 nonresident 1st-choice applicants per tag in 2026\)/);
  assert.match(r.reason, /45\.2% from this general hunt's own harvest/);
});

test('the Unit 36 Regular Deer Tag (RD36) takes the best general hunt it opens', () => {
  const r = idahoV2Tier({ ...base, id: 't:RD36', nrTag: true } as never)!;
  assert.equal(r.score, 80);
  assert.match(r.reason, /^Best general hunt this tag opens: any-weapon in Unit 36, which ranks 14 of 311 Idaho general deer hunts/);
  assert.equal(trophyForHunt({ ...base, id: 't:RD36', nrTag: true, name: 'Unit 36 Regular Deer Tag', deerType: null, huntNumber: null, oddsLastYear: 2026 } as never), 80);
});

test('general tiers: rank shares by species, nonresident tags point at a ranked general hunt, other states untouched', () => {
  const t = general.tiers as Record<string, { tier: number; of: number; via?: string }>;
  const counts = Object.values(t).filter((r) => !r.via).reduce<Record<number, number>>((a, r) => { a[r.tier] = (a[r.tier] ?? 0) + 1; return a; }, {});
  assert.equal(counts[100] + counts[80] + counts[65] + counts[50], 502);
  for (const r of Object.values(t)) if (r.via) assert.ok(t[r.via] && !t[r.via].via);
  assert.equal(idahoV2Tier({ ...base, state: 'WA', id: 'g:-1202273542:36' } as never), null);
  assert.equal(idahoV2Tier({ ...base, id: 'g:not-in-table' } as never), null);
});
