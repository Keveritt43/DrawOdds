// Idaho history repair: follow IDFG area relabels and winter-hunt harvest years (lineage() and
// lineageHarvest() in src/sync/core/math.ts; owner-approved corrective data change, Nov 25, 2026).
//
//   tsx scripts/id-history-repair.ts --dry-run          read only; prints REPAIR_SUMMARY with a digest
//   tsx scripts/id-history-repair.ts --apply <digest>   recomputes the plan and writes only if the digest matches
//
// The plan builds the Idaho summary rows twice, with the old history rule and the new one, and keeps
// only rows where they differ. A row is changed only if its stored values equal what the old rule
// builds for every field that differs (proof the stored row came from this code and data); otherwise
// it is reported and skipped. Score columns and slugs are never written here: run
// scripts/recalculate-idaho-scores.ts afterwards (docs/idaho-scoring-rollout.md).
import { createHash } from 'node:crypto';
import { computeSummaries } from '../src/sync/steps/summary';
import { db } from '../src/sync/core/context';

const NEVER = new Set(['id', 'slug', 'state', 'createdAt', 'updatedAt', 'scoreQuality', 'scoreSuccess', 'scoreAccess', 'scoreCrowd', 'scoreTrophy', 'scoreOppRes', 'scoreOppNr']);
const J = (v: unknown) => JSON.stringify(v instanceof Date ? v.toISOString() : v ?? null);
// equal, allowing float noise between a stored double and a freshly computed one
const same = (a: unknown, b: unknown) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) : J(a) === J(b);
type Row = Record<string, unknown>;

async function plan() {
  const [before, after] = [await computeSummaries({ relabels: false }), await computeSummaries({ relabels: true })];
  const stored = (await db.huntSummary.findMany({ where: { state: 'ID' } })) as unknown as Row[];
  const oldBy = new Map((before.rows as unknown as Row[]).map((r) => [r.id as string, r]));
  const storedBy = new Map(stored.map((r) => [r.id as string, r]));
  const newIds = new Set((after.rows as unknown as Row[]).map((r) => r.id as string));
  const changes: { id: string; hunt: string; set: Row; was: Row }[] = [];
  const skipped: { id: string; hunt: string; fields: string[] }[] = [];
  const notStored: string[] = [];
  for (const nr of after.rows as unknown as Row[]) {
    const id = nr.id as string, or = oldBy.get(id), st = storedBy.get(id);
    const hunt = `${nr.species} ${nr.huntNumber ?? nr.unit ?? ''}`;
    if (!or || !st) { if (or || st) notStored.push(id); continue; }
    const keys = [...new Set([...Object.keys(nr), ...Object.keys(or)])].filter((k) => !NEVER.has(k) && !same(nr[k], or[k]));
    if (!keys.length) continue;
    // a field the old rule left empty is stored as the column default (0 / false)
    const off = keys.filter((k) => !same(st[k], or[k]) && !(or[k] == null && (st[k] === 0 || st[k] === false)));
    if (off.length) { skipped.push({ id, hunt, fields: off.map((k) => `${k} stored ${J(st[k])} old ${J(or[k])} new ${J(nr[k])}`) }); continue; }
    changes.push({ id, hunt, set: Object.fromEntries(keys.map((k) => [k, nr[k] ?? null])), was: Object.fromEntries(keys.map((k) => [k, st[k] ?? null])) });
  }
  const sameRowSet = before.rows.length === after.rows.length && (before.rows as unknown as Row[]).every((r) => newIds.has(r.id as string));
  const body = JSON.stringify(changes, (_k, v) => (v instanceof Date ? v.toISOString() : v));
  // REPAIR_EXPLAIN=ELK:2281,DEER:1074 prints the three versions of a few fields for those hunts
  const explain = (process.env.REPAIR_EXPLAIN ?? '').split(',').filter(Boolean);
  for (const nr of after.rows as unknown as Row[]) {
    if (!explain.includes(`${nr.species}:${nr.huntNumber}`)) continue;
    const id = nr.id as string, or = oldBy.get(id) ?? {}, st = storedBy.get(id) ?? {};
    const f = ['areaName', 'units', 'oddsYears', 'oddsLastYear', 'hunters5', 'harvest5', 'harvestYears', 'appsTrend', 'resOdds5'];
    console.log('REPAIR_EXPLAIN ' + id + ' ' + JSON.stringify(Object.fromEntries(f.map((k) => [k, [st[k] ?? null, or[k] ?? null, nr[k] ?? null]]))));
  }
  return { changes, skipped, notStored, sameRowSet, digest: createHash('sha256').update(body).digest('hex').slice(0, 16) };
}

async function main() {
  const [mode, want] = process.argv.slice(2);
  if (!['--dry-run', '--apply'].includes(mode) || (mode === '--apply' && !/^[0-9a-f]{16}$/.test(want ?? ''))) throw new Error('Usage: --dry-run | --apply <digest>');
  const p = await plan();
  const brief = (c: (typeof p.changes)[number]) => `${c.hunt}: ${Object.keys(c.set).join(',')}; hunters5 ${J(c.was.hunters5)}->${J(c.set.hunters5 ?? c.was.hunters5)}; years ${J(c.was.harvestYears)}->${J(c.set.harvestYears ?? c.was.harvestYears)}; oddsLastYear ${J(c.was.oddsLastYear)}->${J(c.set.oddsLastYear ?? c.was.oddsLastYear)}`;
  console.log('REPAIR_SUMMARY ' + JSON.stringify({ digest: p.digest, changed: p.changes.length, skipped: p.skipped.length, notStored: p.notStored.length, sameRowSet: p.sameRowSet }));
  for (let i = 0; i < p.changes.length; i += 15) console.log('REPAIR_ROWS ' + JSON.stringify(p.changes.slice(i, i + 15).map(brief)));
  for (const sk of p.skipped) console.log('REPAIR_SKIPPED ' + sk.hunt + ' ' + JSON.stringify(sk.fields.slice(0, 4)));
  if (mode === '--dry-run') { console.log('Dry run: no database writes.'); return; }
  if (p.digest !== want) throw new Error(`Digest ${p.digest} does not match the reviewed ${want}; nothing written`);
  if (!p.sameRowSet) throw new Error('Row set differs between rules; nothing written');
  const n = await db.$transaction(async (tx) => {
    let count = 0;
    for (const c of p.changes) {
      await tx.huntSummary.update({ where: { id: c.id }, data: c.set as never });
      count++;
    }
    return count;
  }, { timeout: 120_000 });
  console.log(`REPAIR_APPLIED ${n} Idaho rows; history fields only, scores untouched.`);
}
main().finally(() => db.$disconnect());
