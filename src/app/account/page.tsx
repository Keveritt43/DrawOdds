import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { doSignOut } from '@/app/actions';
import { ResidencySwitch } from '@/components/ResidencySwitch';
import { residencyFields } from '@/lib/finder';
import { pct, range } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Account() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const rf = residencyFields(session.user.residency);
  const saved = await db.savedHunt.findMany({
    where: { userId: session.user.id },
    include: { hunt: { include: { summaries: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return (
    <main className="wrap" style={{ margin: '24px auto 48px', maxWidth: 820 }}>
      <h1>Your account</h1>
      <p className="muted">{session.user.email}</p>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Residency</h3>
        <p className="small muted">Sets which draw odds you see everywhere: filters, sorting, charts and the map.</p>
        <ResidencySwitch value={session.user.residency} />
      </div>
      <h2>Saved hunts</h2>
      {!saved.length && <p className="muted">Nothing saved yet. Open a hunt from Find Hunts and press Save.</p>}
      {saved.map(({ hunt }) => {
        const s = hunt.summaries[0];
        return (
          <div key={hunt.idfgId} className="card" style={{ marginBottom: 8 }}>
            {s ? <Link href={`/hunts/${encodeURIComponent(s.id)}`}><b>{s.huntNumber ? `${s.species === 'DEER' ? 'Deer' : 'Elk'} ${s.huntNumber}` : s.name}</b></Link> : <b>{hunt.name}</b>}
            <span className="small muted"> · {range(hunt.openDate, hunt.closeDate)}{s ? ` · odds ${pct(s[rf.odds5], 1)} · success ${pct(s.success5)}` : ''}</span>
            {hunt.year < new Date().getFullYear() && <span className="pill warn">Not offered this year</span>}
          </div>
        );
      })}
      <form action={doSignOut} style={{ marginTop: 24 }}><button className="btn" type="submit">Sign out</button></form>
    </main>
  );
}
