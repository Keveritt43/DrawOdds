/**
 * One explicitly invoked Oregon import: writes Oregon Unit, Hunt and HuntSummary rows from the checked files in data/or/
 * (built offline by scripts/or_build_land.py and scripts/or_build_hunts.py; see docs/states/or-onboarding.md).
 *
 *   npx tsx scripts/or-import.ts          dry run: validates and prints what would change
 *   npx tsx scripts/or-import.ts --apply  writes, in one transaction
 *   --keep-live-scores                     rows already live keep their live scores (new rows are scored)
 *
 * Scope: only rows with state 'OR' are replaced. Every other state's summaries are digested before and after; any
 * change aborts. No agency fetch, no schema change. Hunt ids are stable ("OR:<hunt number>", "OR:GWD-12" for a
 * general season and unit). Deer and elk. Unit rows are ODFW wildlife management units ("12") and 2026 Eastern
 * Oregon deer hunt areas ("DO-01").
 */
import { readFileSync } from 'node:fs';
import type { Prisma } from '@prisma/client';
import { db } from '../src/sync/core/context';
import { syntheticId } from '../src/sync/steps/hunts';
import { scoreHunts } from '../src/lib/score';

type Rec = Record<string, unknown> & { id: string; slug: string; species: 'DEER' | 'ELK' | 'MOOSE' | 'BIGHORN' | 'GOAT'; type: 'CONTROLLED' | 'GENERAL'; units: string[]; name: string; tagCode: string };
type Area = { name: string; acres: number | null; bbox: number[] | null; geometry: object | null; publicPct?: number | null; privatePct?: number | null; ownership?: { manager: string; pct: number }[] };

const apply = process.argv.includes('--apply');
const only: Rec['species'][] = [];
// --keep-live-scores: rows already live keep their live scores, so a data import doesn't also carry a scoring-model
// change nobody reviewed for Oregon (Nov 17: trophy v2 would move 783 WA scores). New rows are scored normally.
const keepScores = process.argv.includes('--keep-live-scores');
const SCORE_KEYS = ['scoreQuality', 'scoreSuccess', 'scoreAccess', 'scoreCrowd', 'scoreTrophy'] as const;
const allHunts = JSON.parse(readFileSync('data/or/hunts.json', 'utf8')) as { drawYear: number; regsYear: number; problems: string[]; hunts: Rec[] };
const hunts = only.length ? { ...allHunts, hunts: allHunts.hunts.filter((h) => only.includes(h.species)) } : allHunts;
// Unit rows: the GMUs and Deer/Elk Areas the imported hunts use (data/or/units.json). Deer and Elk Areas overlap
// GMUs; each is one Unit row with its own land shares.
const used = new Set(hunts.hunts.flatMap((h) => h.units));
const areas = (JSON.parse(readFileSync('data/or/units.json', 'utf8')) as { units: (Area & { label?: string })[] }).units.filter((a) => used.has(a.name));

const digest = async (state: string) =>
  JSON.stringify(await db.$queryRaw`SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id)::text,'[]')) AS digest FROM "HuntSummary" s WHERE state=${state}`);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const date = (v: unknown) => (typeof v === 'string' ? new Date(`${v}T12:00:00Z`) : null);

function validate(): string[] {
  const errors: string[] = [];
  if (hunts.problems.length) errors.push(...hunts.problems);
  const ids = new Set<string>(), slugs = new Set<string>(), huntIds = new Set<number>();
  const unitNames = new Set(areas.map((a) => a.name));
  for (const h of hunts.hunts) {
    if (ids.has(h.id) || slugs.has(h.slug)) errors.push(`duplicate ${h.id}`);
    ids.add(h.id); slugs.add(h.slug);
    const hid = syntheticId(h.id);
    if (huntIds.has(hid)) errors.push(`hunt id collision ${h.id}`);
    huntIds.add(hid);
    if (!h.units.length) errors.push(`${h.id}: no district`);
    for (const u of h.units) if (!unitNames.has(u)) errors.push(`${h.id}: unit ${u} not in data/or/units.json`);
    const s5 = num(h.success5), hu = num(h.hunters5), hv = num(h.harvest5);
    if (s5 !== null && (hu === null || hv === null || hv > hu || Math.abs(s5 - hv / hu) > 1e-6)) errors.push(`${h.id}: success inconsistent`);
    const t = h.oddsByPts as { proj: Record<string, number[]>; last: Record<string, number[]>; noBuy?: Record<string, number | null> };
    for (const m of ['proj', 'last'] as const) for (const [pool, arr] of Object.entries(t[m] ?? {})) {
      if (arr.some((o) => !(o >= 0 && o <= 1))) errors.push(`${h.id}: bad ${m} ${pool} odds`);
      // bonus- and preference-point odds can never fall with more points
      for (let i = 1; i < arr.length; i++) if (arr[i] + 1e-9 < arr[i - 1]) errors.push(`${h.id}: ${m} ${pool} odds fall with more points`);
    }
    for (const v of Object.values(t.noBuy ?? {})) if (v !== null && !(v >= 0 && v <= 1)) errors.push(`${h.id}: bad no-purchase odds`);
    if (h.state !== 'OR') errors.push(`${h.id}: state ${String(h.state)}`);
  }
  for (const a of areas) {
    if (!/^(\d{2}|[A-Z]{2}-\d{2})$/.test(a.name)) errors.push(`bad unit name ${a.name}`);
    // every district has measured land (scripts/mt_build_land.py); never import a missing share as 0% public
    for (const v of [a.publicPct, a.privatePct]) if (!(typeof v === 'number' && v >= 0 && v <= 100)) errors.push(`${a.name}: land share missing`);
  }
  for (const h of hunts.hunts) if (num(h.publicPct) === null) errors.push(`${h.id}: public land missing`);
  return errors;
}

async function main() {
  const errors = validate();
  if (errors.length) throw Error(`Oregon data failed validation:\n${errors.slice(0, 30).join('\n')}`);
  // ODFW Access & Habitat shares are measured (data/or/land.json accessPct) but not scored yet: huntable = public
  // (0% for private-land-only permits)
  const huntable = (h: Rec) => (h.privateOnly ? 0 : num(h.publicPct));
  const scores = scoreHunts(hunts.hunts.map((h) => ({
    id: h.id, state: 'OR', units:h.units, name:h.name, tagCode:h.tagCode, takeMethod:typeof h.takeMethod==='string'?h.takeMethod:null, openDate:date(h.openDate), closeDate:date(h.closeDate), tagSeasons:h.tagSeasons, pointOdds:h.pointOdds, species: h.species, type: h.type, nrTag: false, weapon: String(h.weapon), antlerClass: String(h.antlerClass),
    harvestYears:num(h.harvestYears), nrOddsLast:num(h.nrOddsLast), resOddsLast:num(h.resOddsLast), oddsLastYear:num(h.oddsLastYear), appsLast:num(h.appsLast), youthOnly:h.youthOnly===true, privateOnly:h.privateOnly===true,
    hunters5: num(h.hunters5), harvest5: num(h.harvest5), huntersSqMi: num(h.huntersSqMi),
    // Wyoming's rule: a licence valid on private land only scores as 0% public, whatever the district holds
    publicPct: h.privateOnly ? (num(h.publicPct) === null ? null : 0) : num(h.publicPct), huntablePct: huntable(h), bigPct5: num(h.bigPct5), deerType: typeof h.deerType === 'string' ? h.deerType : null,
    resOdds5: null, nrOdds5: null,
  })));
  const huntRows: Prisma.HuntCreateManyInput[] = hunts.hunts.map((h) => ({
    idfgId: syntheticId(h.id), state: 'OR', year: hunts.drawYear + 1, species: h.species, type: h.type, code: h.tagCode,
    source: 'or-import', name: h.name, takeMethod: String(h.takeMethod ?? ''), weapon: h.weapon as Prisma.HuntCreateManyInput['weapon'],
    antlerClass: h.antlerClass as Prisma.HuntCreateManyInput['antlerClass'], sexText: String(h.takeMethod ?? ''),
    openDate: date(h.openDate), closeDate: date(h.closeDate), tags: num(h.tags), youthOnly: h.youthOnly === true, units: h.units,
  }));
  const summaryRows: Prisma.HuntSummaryCreateManyInput[] = hunts.hunts.map((h) => {
    const sc = scores.get(h.id)!;
    return {
      id: h.id, state: 'OR', slug: h.slug, huntId: syntheticId(h.id), species: h.species, type: h.type, name: h.name,
      areaName: typeof h.areaName === 'string' ? h.areaName : null,
      unit: h.units[0] ?? null, units: h.units, weapon: h.weapon as Prisma.HuntSummaryCreateManyInput['weapon'], takeMethod: String(h.takeMethod ?? ''),
      antlerClass: h.antlerClass as Prisma.HuntSummaryCreateManyInput['antlerClass'], openDate: date(h.openDate), closeDate: date(h.closeDate),
      months: [], seasonDays: [], tags: num(h.tags), youthOnly: h.youthOnly === true, tagCode: h.tagCode, privateOnly: h.privateOnly === true,
      oddsYears: num(h.oddsYears) ?? 0, oddsLastYear: num(h.oddsLastYear),
      resOddsLast: num(h.resOddsLast), nrOddsLast: num(h.nrOddsLast), resOdds5: num(h.resOdds5), nrOdds5: num(h.nrOdds5),
      resOddsPrev: num(h.resOddsPrev), nrOddsPrev: num(h.nrOddsPrev),
      resAppsLast: num(h.resAppsLast), nrAppsLast: num(h.nrAppsLast), appsLast: num(h.appsLast),
      nrPermitsLast: num(h.nrPermitsLast), permitsLast: num(h.permitsLast), secondDrewLast: num(h.secondDrewLast), secondAppsLast: num(h.secondAppsLast),
      success5: num(h.success5), hunters5: num(h.hunters5), harvest5: num(h.harvest5), harvestYears: num(h.harvestYears) ?? 0,
      harvestLastYear: num(h.harvestLastYear), successLast: num(h.successLast), daysPerHunter5: num(h.daysPerHunter5),
      smallSample: h.smallSample === true, huntersSqMi: num(h.huntersSqMi), acres: num(h.acres), publicPct: num(h.publicPct),
      privatePct: num(h.privatePct),
      huntablePct: huntable(h),
      bigPct5: num(h.bigPct5), whitetailPct5: num(h.whitetailPct5), deerType: typeof h.deerType === 'string' ? h.deerType : null,
      tagSeasons: h.tagSeasons as object, pointOdds: h.pointOdds as object, oddsByPts: h.oddsByPts as object,
      scoreQuality: sc.scoreQuality, scoreSuccess: sc.scoreSuccess, scoreAccess: sc.scoreAccess, scoreCrowd: sc.scoreCrowd, scoreTrophy: sc.scoreTrophy,
    };
  });
  const unitRows: Prisma.UnitCreateManyInput[] = areas.map((a) => ({
    state: 'OR', name: a.name, acres: a.acres, geometry: (a.geometry ?? undefined) as object | undefined, bbox: (a.bbox ?? undefined) as object | undefined,
    landOwnership: (a.ownership ?? undefined) as object | undefined, publicPct: a.publicPct ?? null, privatePct: a.privatePct ?? null,
  }));
  const counts = { hunts: huntRows.length, summaries: summaryRows.length, units: unitRows.length, scored: summaryRows.filter((r) => r.scoreQuality !== null).length };
  console.log('[OR] plan', JSON.stringify(counts));
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
  const diffs = (a: unknown, b: unknown, path: string, out: string[]) => {
    a = iso(a ?? null); b = iso(b ?? null);
    if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a))) out.push(`${path}: ${a} -> ${b}`); return; }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffs((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
      return;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${path}: ${JSON.stringify(a)?.slice(0, 60)} -> ${JSON.stringify(b)?.slice(0, 60)}`);
  };
  const live = new Map((await db.huntSummary.findMany({ where: { state: 'OR', ...(only.length ? { species: { in: only } } : {}) } })).map((r) => [r.id, r as unknown as Record<string, unknown>]));
  if (keepScores) for (const r of summaryRows) {
    const cur = live.get(r.id);
    if (cur) for (const k of SCORE_KEYS) (r as Record<string, unknown>)[k] = cur[k] ?? null;
  }
  const liveUnits = await db.unit.count({ where: { state: 'OR' } });
  const added = summaryRows.filter((r) => !live.has(r.id)).map((r) => r.id);
  const removed = [...live.keys()].filter((id) => !summaryRows.some((r) => r.id === id));
  let changedRows = 0;
  for (const r of summaryRows) {
    const cur = live.get(r.id);
    if (!cur) continue;
    const out: string[] = [];
    for (const [k, v] of Object.entries(r)) diffs(cur[k], v, k, out);
    if (out.length) { changedRows++; console.log('[OR] changed', r.id, out.slice(0, 12).join(' | '), out.length > 12 ? `(+${out.length - 12} more)` : ''); }
  }
  // the reviewed plan: every summary's id, odds table and score, hashed, so an apply can be gated on the dry run
  const { createHash } = await import('node:crypto');
  const planDigest = createHash('sha256').update(JSON.stringify(summaryRows.map((r) => [r.id, r.oddsByPts, r.scoreQuality, r.success5, r.privateOnly, r.publicPct, r.huntablePct]))).digest('hex').slice(0, 16);
  console.log('[OR] diff', JSON.stringify({ scope: only.length ? only.join(',') : 'all', keepLiveScores: keepScores, live: live.size, liveUnits, added: added.length, removed: removed.length, changed: changedRows, planDigest }));
  if (removed.length) console.log('[OR] removed', removed.join(', '));
  // ids are hashed (syntheticId): refuse to overwrite another state's Hunt row on a hash collision
  const clash = await db.hunt.findMany({ where: { idfgId: { in: huntRows.map((h) => h.idfgId) }, NOT: { state: 'OR' } }, select: { idfgId: true, state: true } });
  if (clash.length) throw Error(`hunt id collision with other states: ${JSON.stringify(clash.slice(0, 5))}`);
  if (!apply) {
    console.log('[OR] dry run only; pass --apply to write');
    return;
  }
  const others = ['ID', 'CO', 'WY', 'MT', 'UT', 'WA'];
  const digestOthers = async () => Object.fromEntries(await Promise.all(others.map(async (st) => [st, await digest(st)])));
  const before = await digestOthers();
  await db.$transaction(async (tx) => {
    if (only.length) {
      // scoped: replace only these species; add or refresh their units, delete no unit
      await tx.huntSummary.deleteMany({ where: { state: 'OR', species: { in: only } } });
      await tx.hunt.deleteMany({ where: { state: 'OR', source: 'or-import', species: { in: only }, idfgId: { notIn: huntRows.map((h) => h.idfgId) } } });
      for (const h of huntRows) await tx.hunt.upsert({ where: { idfgId: h.idfgId }, create: h, update: { ...h, idfgId: undefined } });
      await tx.huntSummary.createMany({ data: summaryRows });
      const otherUnits = new Set(allHunts.hunts.filter((h) => !only.includes(h.species)).flatMap((h) => h.units));
      for (const u of unitRows) if (!otherUnits.has(u.name)) await tx.unit.upsert({ where: { state_name: { state: 'OR', name: u.name } }, create: u, update: { ...u, state: undefined, name: undefined } });
      return;
    }
    await tx.huntSummary.deleteMany({ where: { state: 'OR' } });
    await tx.hunt.deleteMany({ where: { state: 'OR', source: 'or-import', idfgId: { notIn: huntRows.map((h) => h.idfgId) } } });
    for (const h of huntRows) await tx.hunt.upsert({ where: { idfgId: h.idfgId }, create: h, update: { ...h, idfgId: undefined } });
    await tx.huntSummary.createMany({ data: summaryRows });
    await tx.unit.deleteMany({ where: { state: 'OR', name: { notIn: unitRows.map((u) => u.name) } } });
    for (const u of unitRows) await tx.unit.upsert({ where: { state_name: { state: 'OR', name: u.name } }, create: u, update: { ...u, state: undefined, name: undefined } });
  }, { timeout: 180_000 });
  const after = await digestOthers();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('another state\'s summaries changed during the Oregon import; review concurrent writes');
  const written = await db.huntSummary.count({ where: { state: 'OR', ...(only.length ? { species: { in: only } } : {}) } });
  if (written !== summaryRows.length) throw Error(`expected ${summaryRows.length} Oregon summaries, found ${written}`);
  console.log('[OR_IMPORT_SUCCESS]', JSON.stringify({ ...counts, planDigest, otherStatesUnchanged: true }));
}

if (process.argv[1]?.endsWith('or-import.ts')) {
  main()
    .catch((e) => { console.error('[OR_IMPORT_FAILED]', e); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
