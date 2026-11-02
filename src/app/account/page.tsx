import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { doSignOut } from '@/app/actions';
import { ResidencySwitch } from '@/components/ResidencySwitch';
import { residencyFields } from '@/lib/finder';
import { pct, pct100, range } from '@/lib/format';
import { Star } from '@/components/Star';

export const dynamic = 'force-dynamic';

export default async function Account() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const rf = residencyFields(session.user.residency);
  const [saved, savedUnits] = await Promise.all([
    db.savedHunt.findMany({
      where: { userId: session.user.id },
      include: { hunt: { include: { summaries: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.savedUnit.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  const units = new Map(
    (await db.unit.findMany({ where: { name: { in: savedUnits.map((u) => u.unit) } }, select: { name: true, elkZone: true, publicPct: true, acres: true } })).map((u) => [u.name, u]),
  );
  return (
    <main className="wrap" style={{ margin: '24px auto 48px', maxWidth: 820 }}>
      <h1>Your account</h1>
      <p className="muted">{session.user.email}</p>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Residency</h3>
        <p className="small muted">Sets which draw odds you see everywhere: filters, sorting, charts and the map.</p>
        <ResidencySwitch value={session.user.residency} />
      </div>
      <h2>Favorite Units</h2>
      {!savedUnits.length && <p className="muted">No favorite units yet. Tap the ☆ next to a unit on the map, a unit page or Filtering.</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {savedUnits.map(({ unit }) => {
          const u = units.get(unit);
          return (
            <div key={unit} className="card star-head" style={{ padding: '8px 12px' }}>
              <Star kind="unit" id={unit} saved signedIn />
              <Link href={`/units/${encodeURIComponent(unit)}`}><b>Unit {unit}</b></Link>
              <span className="small muted">{u?.elkZone ? `${u.elkZone} · ` : ''}{pct100(u?.publicPct ?? null)} public</span>
              <Link className="small" href={`/hunts?unit=${encodeURIComponent(unit)}`}>Hunts</Link>
            </div>
          );
        })}
      </div>

      <h2>Favorite Hunts</h2>
      {!saved.length && <p className="muted">No favorite hunts yet. Tap the ☆ next to any hunt.</p>}
      {saved.map(({ hunt }) => {
        const s = hunt.summaries[0];
        return (
          <div key={hunt.idfgId} className="card star-head" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
            <Star kind="hunt" id={hunt.idfgId} saved signedIn />
            {s ? <Link href={`/hunts/${encodeURIComponent(s.id)}`}><b>{s.huntNumber ? `${s.species === 'DEER' ? 'Deer' : 'Elk'} ${s.huntNumber}` : s.name}</b></Link> : <b>{hunt.name}</b>}
            <span className="small muted">{hunt.openDate ? range(hunt.openDate, hunt.closeDate) : 'dates: see regulations'}{s ? ` · odds ${pct(s[rf.odds5], 1)} · success ${pct(s.success5)}` : ''}</span>
            {!s && <span className="pill warn">Not offered this season</span>}
          </div>
        );
      })}
      <form action={doSignOut} style={{ marginTop: 24 }}><button className="btn" type="submit">Sign out</button></form>
    </main>
  );
}
