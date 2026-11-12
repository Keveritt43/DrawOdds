'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

/** One drawn Montana hunt as the planner offers it, with the hunter's odds already worked out on the server. */
export interface MtPlanOpt {
  id: string; href: string; name: string; code: string; where: string; app: string;
  /** this application's draw at the hunter's points (a nonresident permit: the permit draw alone) */
  odds: number | null;
  /** nonresident deer/elk permit: permit draw x combination draw */
  both: number | null;
  /** 2nd-choice applicants who drew, and who applied, in the last draw */
  second: number | null; secondApps: number | null;
  basis: string;
}
export interface MtPlanApp { key: string; label: string; deadline: string; day: string; results: string; what: string; points: number; buying: boolean; nrNeedsCombo: boolean }
export interface MtPlanCombo { name: string; points: number; odds: number | null; label: string; year: number | null }

const KEY = 'drawodds.mt.plan';
const pct = (o: number | null | undefined) => (o == null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);

export function MtPlanner({ opts, apps, combo, nr, signedIn, set, year, choices }: {
  opts: MtPlanOpt[]; apps: MtPlanApp[]; combo: MtPlanCombo | null; nr: boolean; signedIn: boolean; set: boolean; year: number; choices: number;
}) {
  const [ids, setIds] = useState<string[]>([]), [loaded, setLoaded] = useState(false), [pick, setPick] = useState<Record<string, string>>({}), [status, setStatus] = useState('');
  const byId = new Map(opts.map((o) => [o.id, o]));

  useEffect(() => {
    let active = true;
    (async () => {
      let got: unknown = null;
      if (signedIn) {
        try { const r = await fetch('/api/mt-plan', { cache: 'no-store' }); if (r.ok) got = (await r.json()).ids; } catch { /* keep empty */ }
      } else {
        try { got = JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { /* storage blocked */ }
      }
      if (active) { setIds(Array.isArray(got) ? got.filter((x): x is string => typeof x === 'string') : []); setLoaded(true); }
    })();
    return () => { active = false; };
  }, [signedIn]);

  async function save(next: string[]) {
    setIds(next);
    if (signedIn) {
      try {
        const r = await fetch('/api/mt-plan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: next }) });
        setStatus(r.ok ? 'Saved to your account' : 'Could not save; retry your change');
      } catch { setStatus('Could not save; retry your change'); }
    } else {
      try { localStorage.setItem(KEY, JSON.stringify(next)); setStatus('Saved in this browser'); } catch { setStatus('Browser storage unavailable'); }
    }
  }

  const chosen = (app: string) => ids.filter((id) => byId.get(id)?.app === app);
  const move = (app: string, id: string) => {
    const list = chosen(app), i = list.indexOf(id);
    if (i < 1) return;
    [list[i - 1], list[i]] = [list[i], list[i - 1]];
    void save([...ids.filter((x) => byId.get(x)?.app !== app), ...list]);
  };
  const dates = [...new Set(apps.map((a) => a.deadline))].sort();

  return (
    <>
      <p className="muted" style={{ maxWidth: '72ch' }}>
        Up to {choices} choices on each application, in order. Odds are projected for the next draw from the {year} draw, at {set ? 'your saved points' : 'zero points'}, as a {nr ? 'nonresident' : 'resident'}.{' '}
        {signedIn ? 'Your Montana plan is saved to your account.' : <>Your plan stays in this browser; <a href="/login">sign in</a> to keep it on every device.</>} Montana plans are kept apart from other states&apos;.
      </p>
      {!set && <p className="note"><Link href="/account#hunting-preferences">Save your Montana points</Link> first: with squared bonus points, your balance changes every number below.</p>}

      <div className="stats">
        {dates.map((d) => {
          const here = apps.filter((a) => a.deadline === d);
          const n = here.reduce((t, a) => t + chosen(a.key).length, 0) + (combo && here.some((a) => a.key === 'COMBO') ? 1 : 0);
          return (
            <div key={d} className="stat" style={{ borderColor: 'var(--blaze)', borderWidth: 2 }}>
              <div className="k">Apply by {here[0].day}, {year}</div>
              <div className="v">{loaded ? n : '…'}</div>
              <div className="small muted">{here.map((a) => a.label.replace(/ \(drawn\)$/, '')).join(' · ')}</div>
            </div>
          );
        })}
        <div className="stat"><div className="k">On sale Jun 15</div><div className="v" style={{ fontSize: '1.2rem' }}>No draw</div><div className="small muted"><Link href="/hunts?states=MT&mtLic=b">Over-the-counter B licenses</Link></div></div>
      </div>

      {combo && (
        <section className="card plan-sec">
          <h2>Nonresident Combination License</h2>
          <p className="small muted" style={{ marginTop: -6 }}>Apply by {apps.find((a) => a.key === 'COMBO')?.day} · results {apps.find((a) => a.key === 'COMBO')?.results} · preference points, max 3</p>
          <p style={{ fontSize: '1.1rem' }}><b>{combo.name}</b> at <b>{combo.points}</b> point{combo.points === 1 ? '' : 's'}: <b>{pct(combo.odds)}</b> in the {combo.year} draw. <span className="muted">{combo.label}</span></p>
          {combo.odds === 0 && <p className="note">You are between zero and the cutoff: in {combo.year} nobody at your level drew. Apply and buy a point to climb, or skip a year and come back at 0 for the random draw. <Link href="/guide">Why</Link></p>}
          <p className="small">Your deer and elk permits below only count if you also draw this. <Link href="/account#hunting-preferences">Change which combination you apply for</Link> · <Link href="/montana">The combination draw</Link></p>
        </section>
      )}

      {apps.filter((a) => a.key !== 'COMBO').map((a) => {
        const list = chosen(a.key);
        const avail = opts.filter((o) => o.app === a.key && !ids.includes(o.id));
        return (
          <section key={a.key} className="card plan-sec">
            <h2>{a.label}</h2>
            <p className="small muted" style={{ marginTop: -6 }}>Apply by {a.day}{a.results ? ` · results ${a.results}` : ''} · {a.what}</p>
            <p className="small">Your {a.label.replace(/ \(drawn\)$/, '').toLowerCase()} bonus points: <b>{a.points}</b>{a.buying ? ', buying a point this year' : <>, <b>not buying a point</b>: your banked points don&apos;t count this year</>}. <Link href="/account#hunting-preferences">Change</Link></p>
            {list.length > 0 && (
              <ol className="plan-choices">
                {list.map((id, i) => {
                  const o = byId.get(id)!;
                  return (
                    <li key={id}>
                      <Link href={o.href}><b>{o.code}</b></Link> · {o.where}
                      <div className="small">
                        {i === 0
                          ? <>First choice: <b>{pct(o.odds)}</b> to draw{nr && a.nrNeedsCombo && o.both !== null ? <> · <b>{pct(o.both)}</b> to hunt it with your combination license</> : ''} <span className="muted">({o.basis})</span></>
                          : o.second
                            ? <>Later choice: {o.second} of {o.secondApps ?? '?'} 2nd-choice applicants drew in {year}</>
                            : <span className="muted">Later choice: no 2nd-choice applicant drew in {year}, so this slot is unlikely to matter</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        {i > 0 && <button className="btn small" onClick={() => move(a.key, id)}>Move up</button>}
                        <button className="btn small" onClick={() => void save(ids.filter((x) => x !== id))}>Remove</button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {list.length < choices && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                <select aria-label={`${a.label} choice ${list.length + 1}`} value={pick[a.key] ?? ''} onChange={(e) => setPick({ ...pick, [a.key]: e.target.value })} style={{ maxWidth: '100%' }}>
                  <option value="">{list.length ? `Add choice ${list.length + 1}` : 'Choose your first choice'}</option>
                  {avail.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.where} · {o.odds == null ? 'no odds' : pct(o.odds)}</option>)}
                </select>
                <button className="btn small" disabled={!loaded || !pick[a.key]} onClick={() => { void save([...ids, pick[a.key]]); setPick({ ...pick, [a.key]: '' }); }}>Add</button>
              </div>
            )}
          </section>
        );
      })}
      <p role="status" className="small">{status}</p>
      <p className="small muted">Odds are first choice: projected for the next draw from the last one (the combination license as it last drew). Later choices only get licenses first choices left. A nonresident&apos;s permit chance to hunt multiplies the permit and combination draws as if independent. Confirm every choice and deadline with FWP before you apply.</p>
    </>
  );
}
