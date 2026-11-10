import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { HuntSummary } from '@prisma/client';
import { ID_PRIVATE_ONLY_2026, isPrivateOnly, showPrivate } from '../src/lib/privateLand';
import { runSearch, type HunterSettings } from '../src/lib/multiStateSearch';
import { parseFilters, buildWhere, toQuery } from '../src/lib/finder';
import { enabledStates, STATES } from '../src/lib/states';

const json = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const settings: HunterSettings = { ID: 'RESIDENT', CO: { res: 'RESIDENT', DEER: 0, ELK: 0, PRONGHORN: 0, youth: false, set: true }, WY: { res: 'RESIDENT', DEER: 0, ELK: 0, PRONGHORN: 0, youth: false, set: true } };
const row = (patch: Partial<HuntSummary>) => ({
  id: 'x', state: 'ID', slug: 'x', huntId: 1, species: 'ELK', type: 'CONTROLLED', name: 'x', huntNumber: 2001, tagCode: null,
  areaName: null, unit: null, units: ['62'], weapon: 'ANY', antlerClass: 'ANTLERLESS', openDate: new Date('2027-10-15'),
  closeDate: new Date('2027-11-14'), youthOnly: false, nrTag: false, privateOnly: false, capped: false, tagSeasons: null,
  resOdds5: .5, nrOdds5: .1, resOddsLast: .5, nrOddsLast: .1, oddsLastYear: 2026, scoreQuality: 60, success5: .3,
  hunters5: 100, harvest5: 30, huntersSqMi: 1, publicPct: 50, bigPct5: null, tags: 50, pointOdds: null, oddsByPts: null,
  ptsRes: null, ptsNr: null, ...patch,
} as HuntSummary);

test('Idaho private-land-only list matches IDFG 2026 Seasons & Rules notes exactly', () => {
  const regs = json('../data/controlled-hunts-2026.json') as { hunts: { species: string; huntNumber: number; notes: string }[] };
  const derived = regs.hunts.filter(h => /private land only/i.test(h.notes)).map(h => `${h.species}:${h.huntNumber}`).sort();
  assert.deepEqual([...ID_PRIVATE_ONLY_2026].sort(), derived);
  // "within 1 mile of private agricultural lands" and "very limited access" hunts still allow public land
  for (const h of regs.hunts.filter(h => /private/i.test(h.notes) && !/private land only/i.test(h.notes)))
    assert.equal(isPrivateOnly(row({ species: h.species as 'ELK', huntNumber: h.huntNumber })), false, `${h.species} ${h.huntNumber}`);
});

test('every enabled state declares which hunts are private-land only (required for new states)', () => {
  for (const s of enabledStates()) assert.ok(STATES[s.code].privateLandOnly.trim().length > 10, s.code);
});

test('private-land-only hunts are hidden by default in every state and shown together with priv=1', () => {
  const rows = [
    row({ id: 'id-open' }), row({ id: 'id-priv', huntNumber: 2168 }),
    row({ id: 'co-priv', state: 'CO', privateOnly: true, tagCode: 'EF070P5R' }),
    row({ id: 'wy-priv', state: 'WY', privateOnly: true, units: ['E84'] }),
    row({ id: 'id-general', type: 'GENERAL', nrTag: true, huntNumber: 2168 }),
  ];
  const ids = (sp: Record<string, string>) => runSearch(rows, { states: 'ID,CO,WY', antler: 'ALL', minScore: '0', ...sp }, 'ID', settings).map(x => x.r.id).sort();
  assert.deepEqual(ids({}), ['id-general', 'id-open']);
  assert.deepEqual(ids({ priv: '1' }), ['co-priv', 'id-general', 'id-open', 'id-priv', 'wy-priv']);
  assert.deepEqual(ids({ wyPriv: '1' }), ids({ priv: '1' }), 'old Wyoming links keep showing private-land hunts');
});

test('single-state Idaho finder excludes the same hunts in its database query and keeps the choice in links', () => {
  const where = JSON.stringify(buildWhere(parseFilters({}), 'RESIDENT'));
  assert.match(where, /"privateOnly":false/);
  assert.match(where, /"huntNumber":2168/);
  assert.doesNotMatch(JSON.stringify(buildWhere(parseFilters({ priv: '1' }), 'RESIDENT')), /privateOnly/);
  assert.match(toQuery(parseFilters({ priv: '1' })), /priv=1/);
  assert.equal(showPrivate(k => ({ priv: '1' } as Record<string, string>)[k]), true);
  assert.equal(showPrivate(() => null), false);
});

test('Wyoming private-only means every season segment is limited to private land', () => {
  const hunts = json('../data/wy/hunts.json').hunts as { tagCode: string; privateOnly: boolean }[];
  const flagged = hunts.filter(h => h.privateOnly).map(h => h.tagCode).sort();
  assert.deepEqual(flagged, ['A23-2', 'A24-2', 'A29-2', 'A80-2', 'E84-1']);
  // open to the entire area for part of the season, so not private-only
  for (const code of ['D24-3', 'E16-4', 'E33-4', 'E78-2', 'E124-2']) assert.equal(hunts.find(h => h.tagCode === code)?.privateOnly, false, code);
});

test('private-land-only hunts score with no public land; unknown land stays unknown', async () => {
  const { scoreLand } = await import('../src/lib/privateLand');
  const base = { state: 'ID', privateOnly: false, species: 'ELK', type: 'CONTROLLED', publicPct: 40, huntablePct: 45 };
  assert.deepEqual(scoreLand({ ...base, huntNumber: 2168 }), { publicPct: 0, huntablePct: 0 });
  assert.deepEqual(scoreLand({ ...base, huntNumber: 2001 }), { publicPct: 40, huntablePct: 45 });
  assert.deepEqual(scoreLand({ ...base, huntNumber: 2168, publicPct: null, huntablePct: null }), { publicPct: null, huntablePct: null });
  assert.deepEqual(scoreLand({ ...base, state: 'CO', privateOnly: true, huntNumber: null }), { publicPct: 0, huntablePct: 0 });
});
