/**
 * Nightly IDFG sync.  Usage:  npm run sync [-- <steps...>] [--full]
 *   steps: odds harvest general gis land hunts nrdraw summary migrations   (default: all, in that order)
 *   --full  re-pull every year instead of just the last two + missing years
 *
 * Railway: a separate Cron service runs `npm run sync` (e.g. 0 10 * * * = 3am Pacific).
 */
import { db, runStep, type StepOptions } from './core/context';
import { syncOdds } from './steps/odds';
import { syncControlledHarvest, syncGeneralHarvest } from './steps/harvest';
import { syncGis } from './steps/gis';
import { syncLand } from './steps/land';
import { syncHunts } from './steps/hunts';
import { buildSummaries } from './steps/summary';
import { syncNrDraw } from './steps/nrdraw';
import { syncMigrations } from './steps/migrations';

const STEPS: Record<string, (o: StepOptions) => Promise<{ rows: number }>> = {
  odds: syncOdds,
  harvest: syncControlledHarvest,
  general: syncGeneralHarvest,
  gis: () => syncGis(),
  land: syncLand,
  hunts: () => syncHunts(),
  nrdraw: () => syncNrDraw(),
  summary: () => buildSummaries(),
  migrations: () => syncMigrations(),
};

async function main() {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const asked = args.filter((a) => !a.startsWith('--') && a !== 'all');
  const order = asked.length ? asked : Object.keys(STEPS);
  const unknown = order.filter((s) => !STEPS[s]);
  if (unknown.length) throw new Error(`Unknown step(s): ${unknown.join(', ')}. Valid: ${Object.keys(STEPS).join(', ')}`);

  let failed = 0;
  for (const name of order) {
    const r = await runStep(name, () => STEPS[name]({ full }) as never);
    if ((r as { status?: string }).status === 'ERROR') failed++;
  }
  await db.$disconnect();
  // non-zero exit makes Railway mark the cron run as failed, so you get notified
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
