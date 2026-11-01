import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Sync health. Visible only to emails in ADMIN_EMAILS (comma-separated). */
export default async function Admin() {
  const session = await auth();
  const admins = (process.env.ADMIN_EMAILS ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (!session?.user?.email || !admins.includes(session.user.email.toLowerCase())) notFound();
  const [logs, counts] = await Promise.all([
    db.syncLog.findMany({ orderBy: { startedAt: 'desc' }, take: 60 }),
    Promise.all([db.drawOdds.count(), db.controlledHarvest.count(), db.generalHarvest.count(), db.unit.count(), db.huntArea.count(), db.hunt.count(), db.huntSummary.count(), db.user.count()]),
  ]);
  const labels = ['Odds rows', 'Controlled harvest', 'General harvest', 'Units', 'Hunt areas', 'Hunts', 'Summaries', 'Users'];
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>Sync health</h1>
      <div className="stats">{counts.map((c, i) => <div key={i} className="stat"><div className="k">{labels[i]}</div><div className="v">{c.toLocaleString()}</div></div>)}</div>
      <table className="results">
        <thead><tr><th>Started</th><th>Step</th><th>Status</th><th className="num">Rows</th><th>Details</th></tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="small">{l.startedAt.toISOString().replace('T', ' ').slice(0, 16)}</td>
              <td>{l.step}</td>
              <td><span className={`pill ${l.status === 'OK' ? 'good' : 'warn'}`}>{l.status}</span></td>
              <td className="num">{l.rows.toLocaleString()}</td>
              <td className="small"><pre style={{ whiteSpace: 'pre-wrap', margin: 0, maxHeight: 120, overflow: 'auto' }}>{l.details}</pre></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
