import Link from 'next/link';
import { huntHref } from '@/lib/huntSlug';
import { SPECIES_LABEL } from '@/lib/format';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { unitKey, STATES, type StateCode } from '@/lib/states';
import { doSignOut } from '@/app/actions';
import { HuntingPreferences } from '@/components/HuntingPreferences';
import { getResidency } from '@/lib/residency';
import { getPoints } from '@/lib/points';
import { residencyFields } from '@/lib/finder';
import { pct, pctOdds, pct100, range, int, density, drawFillLine, antlerLabel, WEAPON } from '@/lib/format';
import { seasonsSummary } from '@/lib/tagSeasons';
import { Star } from '@/components/Star';
import { MyApplications } from '@/components/MyApplications';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Account' };

export default async function Account() {
  const [session, { residency }, colorado] = await Promise.all([auth(), getResidency(undefined, 'ID'), getPoints('CO')]);
  const preferences = <HuntingPreferences idaho={residency} colorado={colorado} />;
  if (!session?.user) return (
    <main className="wrap" style={{ margin: '24px auto 48px', maxWidth: 820 }}>
      <h1>Your account</h1>
      <p className="muted">You can test these settings without signing in. Preferences are saved in this browser.</p>
      {preferences}
      <p className="small muted">Favorites and application history require sign-in.{process.env.AUTH_RESEND_KEY && <> <Link href="/login">Sign in</Link></>}</p>
    </main>
  );
  const rf = residencyFields(residency);
  const nr = residency === 'NONRESIDENT';
  const [saved, savedUnits] = await Promise.all([
    db.savedHunt.findMany({
      where: { userId: session.user.id },
      include: { hunt: { include: { summaries: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.savedUnit.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  const apps = await db.application.findMany({ where: { userId: session.user.id }, orderBy: [{ year: 'desc' }, { createdAt: 'desc' }] });
  const units = new Map(
    (await db.unit.findMany({ where: { OR: savedUnits.map((u) => ({ state: u.state, name: u.unit })) }, select: { state: true, name: true, elkZone: true, publicPct: true, acres: true } })).map((u) => [unitKey(u.state, u.name), u]),
  );
  return (
    <main className="wrap" style={{ margin: '24px auto 48px', maxWidth: 820 }}>
      <h1>Your account</h1>
      <p className="muted">{session.user.email}</p>
      {preferences}
      <MyApplications apps={apps} />
      <p className="small"><a href="/planner">Plan this year&apos;s applications →</a> · <a href="/api/calendar">Deadlines to your calendar</a></p>
      <h2>Favorite Units</h2>
      {!savedUnits.length && <p className="muted">No favorite units yet. Tap the ☆ next to a unit on the map, a unit page or Filtering.</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {savedUnits.map(({ state, unit: name }) => {
          const unit = unitKey(state, name);
          const u = units.get(unit);
          return (
            <div key={unit} className="card star-head" style={{ padding: '8px 12px' }}>
              <Star kind="unit" id={unit} saved signedIn />
              <Link href={`/units/${encodeURIComponent(unit)}`}><b>{state === 'ID' ? '' : `${STATES[state as StateCode]?.name ?? state} `}Unit {name}</b></Link>
              <span className="small muted">{u?.elkZone ? `${u.elkZone} · ` : ''}{pct100(u?.publicPct ?? null)} public</span>
              <Link className="small" href={`/hunts?unit=${encodeURIComponent(unit)}`}>Hunts</Link>
            </div>
          );
        })}
      </div>

      <h2>Favorite Hunts</h2>
      {!saved.length && <p className="muted">No favorite hunts yet. Tap the ☆ next to any hunt, then compare them here side by side.</p>}
      {saved.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="results compare">
            <thead>
              <tr>
                <th>Hunt</th><th>Season</th><th className="num">Odds latest</th><th className="num">Odds 5-yr</th><th className="num">Success 5-yr</th>
                <th className="num">Hunters/mi²</th><th className="num">Draw + fill</th><th>Apply with</th>
              </tr>
            </thead>
            <tbody>
              {saved.map(({ hunt }) => {
                const s = hunt.summaries[0];
                if (!s) {
                  return (
                    <tr key={hunt.idfgId}>
                      <td><span className="star-head"><Star kind="hunt" id={hunt.idfgId} saved signedIn /><b>{hunt.name}</b></span></td>
                      <td colSpan={7}><span className="pill warn">Not offered this season</span></td>
                    </tr>
                  );
                }
                const ctl = s.type === 'CONTROLLED';
                const oddsLast = ctl ? s[rf.oddsLast] : s.nrTag && nr ? s.nrOddsLast : null;
                const odds5 = ctl ? s[rf.odds5] : s.nrTag && nr ? s.nrOdds5 : null;
                return (
                  <tr key={hunt.idfgId}>
                    <td>
                      <span className="star-head">
                        <Star kind="hunt" id={hunt.idfgId} saved signedIn />
                        <Link href={huntHref(s)}><b>{s.huntNumber ? `${SPECIES_LABEL[s.species]} ${s.huntNumber}` : s.name}</b></Link>
                      </span>
                      <span className="small muted">{s.nrTag ? `Units ${s.units.join(', ')}` : `${WEAPON[s.weapon]} · ${antlerLabel(s.species, s.antlerClass)}${s.areaName ? ` · Area ${s.areaName}` : ''}`}</span>
                    </td>
                    <td className="small">{seasonsSummary(s.tagSeasons, 2) || (hunt.openDate ? range(hunt.openDate, hunt.closeDate) : 'See regulations')}</td>
                    <td className="num">{ctl || (s.nrTag && nr) ? pctOdds(oddsLast) : 'OTC'}</td>
                    <td className="num">{ctl || (s.nrTag && nr) ? pctOdds(odds5) : '-'}</td>
                    <td className="num">{pct(s.success5)}{s.smallSample ? '*' : ''}</td>
                    <td className="num">{density(s.huntersSqMi)}</td>
                    <td className="num">{ctl ? drawFillLine(s[rf.tagAndFill]) ?? '-' : '-'}</td>
                    <td>{ctl ? (s.huntNumber ?? '-') : s.tagCode ?? (s.nrTag ? '-' : 'OTC')}{ctl && s.tags ? <span className="small muted"> · {int(s.tags)} tags</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="small muted">Odds are {nr ? 'nonresident' : 'resident'} first-choice odds. * small sample (under 50 hunters in 5 years).</p>
        </div>
      )}
      <form action={doSignOut} style={{ marginTop: 24 }}><button className="btn" type="submit">Sign out</button></form>
    </main>
  );
}
