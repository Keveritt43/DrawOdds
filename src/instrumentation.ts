/**
 * Runs once when the Next.js server starts. If the database has no draw-odds data yet (fresh deploy),
 * start the IDFG sync in a background child process so the site fills itself in.
 * Nightly refreshes are the separate `sync` cron service's job. Set BOOTSTRAP_SYNC=0 to disable.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.BOOTSTRAP_SYNC === '0') return;
  // give the server a moment to come up and pass its healthcheck first
  setTimeout(() => void bootstrap().catch((e) => console.error('[bootstrap-sync] failed to start', e)), 15_000);
}

async function bootstrap() {
  const { db } = await import('./lib/db');
  // A sync started by a previous web container died with it; mark it so it doesn't block this one.
  await db.syncLog.updateMany({
    where: { status: 'RUNNING', startedAt: { gt: new Date(Date.now() - 6 * 3600_000) } },
    data: { status: 'ABANDONED', finishedAt: new Date() },
  });
  const [odds, summaries, lastOdds] = await Promise.all([
    db.drawOdds.count(),
    db.huntSummary.count(),
    db.syncLog.findFirst({ where: { step: 'odds' }, orderBy: { startedAt: 'desc' } }),
  ]);
  // fill in when empty, or when the last load of the core data failed part-way
  const incomplete = !lastOdds || lastOdds.status === 'ERROR' || lastOdds.status === 'ABANDONED';
  if (odds > 0 && summaries > 0 && !incomplete) return;

  const { spawn } = await import('node:child_process');
  console.log('[bootstrap-sync] empty database: starting first IDFG data load in the background');
  const child = spawn('npx', ['tsx', 'src/sync/index.ts'], { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
  child.on('exit', (code) => console.log(`[bootstrap-sync] finished with exit code ${code}`));
}
