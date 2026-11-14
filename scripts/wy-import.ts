/**
 * One explicitly invoked Wyoming import: writes Wyoming Unit, Hunt and HuntSummary rows from the checked files in
 * data/wy/ (built offline by scripts/wy_build_*.py from WGFD and BLM sources; see docs/states/wy-draw-model.md).
 *
 *   npx tsx scripts/wy-import.ts          dry run: validates and prints what would change
 *   npx tsx scripts/wy-import.ts --apply  writes, in one transaction
 *
 * Scope: only rows with state 'WY' are replaced. Idaho and Colorado summaries are digested before and after; any
 * change aborts. No agency fetch, no schema change. Saved Wyoming hunts survive because hunt ids are stable
 * (hash of the Wyoming hunt key).
 */
import { readFileSync } from 'node:fs';
import type { Prisma } from '@prisma/client';
import { db } from '../src/sync/core/context';
import { syntheticId } from '../src/sync/steps/hunts';
import { scoreHunts } from '../src/lib/score';

type Rec = Record<string, unknown> & { id: string; slug: string; species: 'DEER' | 'ELK' | 'PRONGHORN'; type: 'CONTROLLED' | 'GENERAL'; units: string[]; name: string; tagCode: string };
type Area = { name: string; geometry: object | null; bbox: number[] | null; acres: number | null; publicPct: number | null; privatePct: number | null; ownership: { manager: string; pct: number }[]; accessAcres: number | null; accessCount: number | null };

const apply = process.argv.includes('--apply');
const hunts = JSON.parse(readFileSync('data/wy/hunts.json', 'utf8')) as { drawYear: number; regsYear: number; problems: string[]; hunts: Rec[] };
let areas: Area[] = [];
try {
  areas = (JSON.parse(readFileSync('data/wy/units.json', 'utf8')) as { units: Area[] }).units;
} catch {
  console.log('[WY] data/wy/units.json not found: hunt areas will have no boundaries or land yet');
}

const digest = async (state: string) =>
  JSON.stringify(await db.$queryRaw`SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id)::text,'[]')) AS digest FROM "HuntSummary" s WHERE state=${state}`);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const date = (v: unknown) => (typeof v === 'string' ? new Date(`${v}T12:00:00Z`) : null);

function validate() {
  const errors: string[] = [];
  if (hunts.problems.length) errors.push(...hunts.problems);
  const ids = new Set<string>(), slugs = new Set<string>(), huntIds = new Set<number>();
  for (const h of hunts.hunts) {
    if (ids.has(h.id) || slugs.has(h.slug)) errors.push(`duplicate ${h.id}`);
    ids.add(h.id); slugs.add(h.slug);
    const hid = syntheticId(h.id);
    if (huntIds.has(hid)) errors.push(`hunt id collision ${h.id}`);
    huntIds.add(hid);
    if (!h.units.length) errors.push(`${h.id}: no hunt area`);
    const s5 = num(h.success5), hu = num(h.hunters5), hv = num(h.harvest5);
    if (s5 !== null && (hu === null || hv === null || hv > hu || Math.abs(s5 - hv / hu) > 1e-6)) errors.push(`${h.id}: success inconsistent`);
    for (const k of ['publicPct', 'privatePct', 'accessYesPct'] as const) {
      const v = num(h[k]);
      if (v !== null && (v < 0 || v > 100.01)) errors.push(`${h.id}: ${k} ${v}`);
    }
    const t = h.oddsByPts as { proj: Record<string, number[]>; last: Record<string, number[]> };
    for (const m of ['proj', 'last'] as const) for (const [pool, arr] of Object.entries(t[m] ?? {})) {
      if (!arr.length || arr.some((o) => !(o >= 0 && o <= 1))) errors.push(`${h.id}: bad ${m} ${pool} odds`);
      for (let i = 1; i < arr.length; i++) if (arr[i] + 1e-9 < arr[i - 1]) errors.push(`${h.id}: ${m} ${pool} odds fall with more points`);
    }
  }
  for (const a of areas) if (!/^[ADE](\d+)$/.test(a.name)) errors.push(`bad area name ${a.name}`);
  return errors;
}

async function main() {
  const errors = validate();
  if (errors.length) throw Error(`Wyoming data failed validation:\n${errors.slice(0, 30).join('\n')}`);
  const scores = scoreHunts(hunts.hunts.map((h) => ({
    id: h.id, state: 'WY', units:h.units, name:h.name, tagCode:h.tagCode, takeMethod:typeof h.takeMethod==='string'?h.takeMethod:null, openDate:date(h.openDate), closeDate:date(h.closeDate), tagSeasons:h.tagSeasons, pointOdds:h.pointOdds, species: h.species, type: h.type, nrTag: false, weapon: String(h.weapon), antlerClass: String(h.antlerClass),
    harvestYears:num(h.harvestYears), nrOddsLast:num(h.nrOddsLast), resOddsLast:num(h.resOddsLast), oddsLastYear:num(h.oddsLastYear), youthOnly:h.youthOnly===true, privateOnly:h.privateOnly===true,
    hunters5: num(h.hunters5), harvest5: num(h.harvest5), huntersSqMi: num(h.huntersSqMi),
    publicPct: h.privateOnly ? (num(h.publicPct) === null ? null : 0) : num(h.publicPct),
    huntablePct: null, bigPct5: null, resOdds5: null, nrOdds5: null,
  })));
  const huntRows: Prisma.HuntCreateManyInput[] = hunts.hunts.map((h) => ({
    idfgId: syntheticId(h.id), state: 'WY', year: hunts.drawYear + 1, species: h.species, type: h.type, code: h.tagCode,
    source: 'wy-import', name: h.name, takeMethod: String(h.takeMethod ?? ''), weapon: h.weapon as Prisma.HuntCreateManyInput['weapon'],
    antlerClass: h.antlerClass as Prisma.HuntCreateManyInput['antlerClass'], sexText: String(h.takeMethod ?? ''),
    openDate: date(h.openDate), closeDate: date(h.closeDate), tags: num(h.tags), youthOnly: false, units: h.units,
  }));
  const summaryRows: Prisma.HuntSummaryCreateManyInput[] = hunts.hunts.map((h) => {
    const sc = scores.get(h.id)!;
    return {
      id: h.id, state: 'WY', slug: h.slug, huntId: syntheticId(h.id), species: h.species, type: h.type, name: h.name,
      unit: h.units[0] ?? null, units: h.units, weapon: h.weapon as Prisma.HuntSummaryCreateManyInput['weapon'], takeMethod: String(h.takeMethod ?? ''),
      antlerClass: h.antlerClass as Prisma.HuntSummaryCreateManyInput['antlerClass'], openDate: date(h.openDate), closeDate: date(h.closeDate),
      months: [], seasonDays: [], tags: num(h.tags), youthOnly: false, tagCode: h.tagCode, privateOnly: h.privateOnly === true,
      oddsYears: num(h.oddsYears) ?? 0, oddsLastYear: num(h.oddsLastYear), resOddsLast: num(h.resOddsLast), resOdds5: num(h.resOddsLast),
      resAppsLast: num(h.resAppsLast), nrAppsLast: num(h.nrAppsLast),
      ptsNr: num(h.ptsNr), effNr: num(h.effNr), projNr: num(h.projNr), creepNr: num(h.creepNr),
      success5: num(h.success5), hunters5: num(h.hunters5), harvest5: num(h.harvest5), harvestYears: num(h.harvestYears) ?? 0,
      harvestLastYear: num(h.harvestLastYear), successLast: num(h.successLast), daysPerHunter5: num(h.daysPerHunter5),
      smallSample: h.smallSample === true, huntersSqMi: num(h.huntersSqMi), acres: num(h.acres), publicPct: num(h.publicPct),
      privatePct: num(h.privatePct), accessYesAcres: num(h.accessYesAcres), accessYesCount: num(h.accessYesCount), accessYesPct: num(h.accessYesPct),
      pointOdds: h.pointOdds as object, oddsByPts: h.oddsByPts as object,
      scoreQuality: sc.scoreQuality, scoreSuccess: sc.scoreSuccess, scoreAccess: sc.scoreAccess, scoreCrowd: sc.scoreCrowd, scoreTrophy: sc.scoreTrophy,
    };
  });
  const unitRows: Prisma.UnitCreateManyInput[] = areas.map((a) => ({
    state: 'WY', name: a.name, acres: a.acres, geometry: (a.geometry ?? undefined) as object | undefined, bbox: (a.bbox ?? undefined) as object | undefined,
    landOwnership: a.ownership as object, publicPct: a.publicPct, privatePct: a.privatePct, accessYesAcres: a.accessAcres, accessYesCount: a.accessCount,
    landUpdatedAt: new Date(),
  }));
  const counts = { hunts: huntRows.length, summaries: summaryRows.length, units: unitRows.length, scored: summaryRows.filter((r) => r.scoreQuality !== null).length };
  console.log('[WY] plan', JSON.stringify(counts));
  // Field-by-field comparison with the live Wyoming rows, so a dry run shows exactly what --apply would change.
  // Numbers within 1e-9 (relative) are equal: Postgres hands back doubles printed to fewer digits than JS writes.
  // JSON (jsonb reorders keys) is compared deeply, and each difference is reported by its path.
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
  const live = new Map((await db.huntSummary.findMany({ where: { state: 'WY' } })).map((r) => [r.id, r as unknown as Record<string, unknown>]));
  const added = summaryRows.filter((r) => !live.has(r.id)).map((r) => r.id);
  const removed = [...live.keys()].filter((id) => !summaryRows.some((r) => r.id === id));
  let changedRows = 0;
  for (const r of summaryRows) {
    const cur = live.get(r.id);
    if (!cur) continue;
    const out: string[] = [];
    for (const [k, v] of Object.entries(r)) diffs(cur[k], v, k, out);
    if (out.length) { changedRows++; console.log('[WY] changed', r.tagCode ?? r.id, out.slice(0, 12).join(' | '), out.length > 12 ? `(+${out.length - 12} more)` : ''); }
  }
  console.log('[WY] diff', JSON.stringify({ live: live.size, added: added.length, removed: removed.length, changed: changedRows }));
  if (added.length) console.log('[WY] added', added.join(', '));
  if (removed.length) console.log('[WY] removed', removed.join(', '));
  if (!apply) {
    console.log('[WY] dry run only; pass --apply to write');
    return;
  }
  const before = { ID: await digest('ID'), CO: await digest('CO') };
  await db.$transaction(async (tx) => {
    await tx.huntSummary.deleteMany({ where: { state: 'WY' } });
    await tx.hunt.deleteMany({ where: { state: 'WY', source: 'wy-import', idfgId: { notIn: huntRows.map((h) => h.idfgId) } } });
    for (const h of huntRows) await tx.hunt.upsert({ where: { idfgId: h.idfgId }, create: h, update: { ...h, idfgId: undefined } });
    await tx.huntSummary.createMany({ data: summaryRows });
    if (unitRows.length) {
      await tx.unit.deleteMany({ where: { state: 'WY', name: { notIn: unitRows.map((u) => u.name) } } });
      for (const u of unitRows) await tx.unit.upsert({ where: { state_name: { state: 'WY', name: u.name } }, create: u, update: { ...u, state: undefined, name: undefined } });
    }
  }, { timeout: 120_000 });
  const after = { ID: await digest('ID'), CO: await digest('CO') };
  if (before.ID !== after.ID || before.CO !== after.CO) throw Error('Idaho or Colorado summaries changed during the Wyoming import; review concurrent writes');
  const written = await db.huntSummary.count({ where: { state: 'WY' } });
  if (written !== summaryRows.length) throw Error(`expected ${summaryRows.length} Wyoming summaries, found ${written}`);
  console.log('[WY_IMPORT_SUCCESS]', JSON.stringify({ ...counts, idahoUnchanged: true, coloradoUnchanged: true }));
}

main()
  .catch((e) => { console.error('[WY_IMPORT_FAILED]', e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
