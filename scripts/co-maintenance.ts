/** One explicitly invoked Colorado maintenance run; no cron and no Idaho agency steps. */
import { db, runStep } from '../src/sync/core/context';
import { syncCoDraw, syncCoReports, buildCoSummaries } from '../src/sync/co';
import { REPORT_CATALOG } from '../src/sync/co/manifest';
const idDigest = async () =>
  JSON.stringify(
    await db.$queryRaw`SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id)::text,'[]')) AS digest FROM "HuntSummary" s WHERE state='ID'`,
  );
async function main() {
  const before = await idDigest();
  for (const [name, fn] of [
    ['co-draw', () => syncCoDraw({ full: false })],
    ['co-reports', () => syncCoReports({ full: false })],
  ] as const) {
    const result = await runStep(name, fn);
    if (result.status === 'ERROR') throw Error(`${name} failed; existing Colorado summaries were retained`);
  }
  const reports = new Map((await db.stateReport.findMany({ where: { state: 'CO' }, select: { id: true, data: true } })).map((r) => [r.id, r.data]));
  const parserVersion = (id: string) => (reports.get(id) as { parserVersion?: number } | undefined)?.parserVersion;
  const missing: string[] = [];
  for (const r of REPORT_CATALOG) {
    if (r.kind === 'draw') {
      if (parserVersion(`CO|draw-parser|${r.species}|${r.year}`) !== 2 || !(await db.drawRecap.count({ where: { state: 'CO', species: r.species, year: r.year } })))
        missing.push(`${r.species} ${r.year} primary`);
    } else if (r.kind === 'harvest') {
      if (!reports.has(`CO|harvest-code|${r.species}|${r.year}`) && parserVersion(`CO|harvest-unit|${r.species}|${r.year}`) !== 3)
        missing.push(`${r.species} ${r.year} harvest`);
    } else if (r.kind === 'secondary' && parserVersion(`CO|secondary|${r.species}|${r.year}`) !== 2) {
      missing.push(`${r.species} ${r.year} secondary`);
    } else if (!reports.has(`CO|${r.kind}|${r.species}|${r.year}`)) missing.push(`${r.species} ${r.year} ${r.kind}`);
  }
  if (missing.length) throw Error(`Missing CPW reports; summaries retained: ${missing.join(', ')}`);
  const result = await runStep('co-summary', buildCoSummaries);
  if (result.status === 'ERROR') throw Error('Colorado summary failed');
  if (before !== (await idDigest())) throw Error('Idaho summaries changed during Colorado maintenance; review concurrent writes');
  const counts = await db.huntSummary.groupBy({ by: ['species', 'type'], where: { state: 'CO' }, _count: { id: true } });
  const harvest = await db.huntSummary.count({ where: { state: 'CO', success5: { not: null } } });
  console.log(
    '[CO_MAINTENANCE_SUCCESS]',
    JSON.stringify({ reports: REPORT_CATALOG.length, counts, withHarvest: harvest, idahoUnchanged: true }),
  );
}
main()
  .catch((e) => {
    console.error('[CO_MAINTENANCE_FAILED]', e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
