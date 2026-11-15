'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { cheapestPrereqs, type PlanPrereq } from '@/lib/planCost';
export type { PlanPrereq } from '@/lib/planCost';

/**
 * The Application Planner shared by states that don't need Montana's combination-license section: one card per
 * application the hunter files, up to that application's number of choices in order, odds at saved points, suggested
 * hunts, and what applying costs. Montana's planner (MtPlanner) is the pattern; Idaho and Colorado keep their own.
 * The server works out every number; this component only orders, saves and adds up.
 */
export interface PlanOpt {
  id: string; href: string; code: string; where: string; app: string;
  odds: number | null; basis: string; success: number | null;
}
export interface PlanApp {
  key: string; label: string;
  /** "Apply Apr 20 – May 20 · results by end of June", as the agency prints it */
  when: string;
  what?: string;
  /** "Your bull elk points: 3 (16 entries)" */
  points?: string;
  choices: number;
  /** false: the agency prints no limit; `choices` is only this page's cap and isn't shown as the agency's */
  choicesKnown?: boolean;
  /** charged when you apply; null = the agency prints none */
  price: number | null;
  /** prerequisite license coverage this application needs (see PlanPrereq.covers) */
  needs: string[];
  group?: string;
  /** what a later choice means in this state's draw */
  later: string;
  /** hunt ids to offer as one-tap picks */
  suggest: string[];
  /** bought only if drawn */
  ifDrawn?: { label: string; amount: number }[];
}
export interface PlanTimelineStep { when: string; what: string; tone?: 'blaze' | 'good' }

const pct = (o: number | null | undefined) => (o == null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.001 ? '<0.1%' : o < 0.01 ? `${(o * 100).toFixed(1)}%` : `${Math.round(o * 100)}%`);
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function StatePlanner({ state, apps, opts, prereq, timeline, intro, costNote, signedIn, set, setLabel }: {
  state: string; apps: PlanApp[]; opts: PlanOpt[]; prereq: PlanPrereq[]; timeline: PlanTimelineStep[];
  intro: ReactNode; costNote: ReactNode; signedIn: boolean; set: boolean; setLabel: string;
}) {
  const KEY = `drawodds.${state.toLowerCase()}.plan`;
  const API = `/api/state-plan?state=${state}`;
  const [ids, setIds] = useState<string[]>([]), [loaded, setLoaded] = useState(false), [pick, setPick] = useState<Record<string, string>>({}), [status, setStatus] = useState('');
  const byId = new Map(opts.map((o) => [o.id, o]));

  useEffect(() => {
    let active = true;
    (async () => {
      let got: unknown = null;
      if (signedIn) {
        try { const r = await fetch(API, { cache: 'no-store' }); if (r.ok) got = (await r.json()).ids; } catch { /* keep empty */ }
      } else {
        try { got = JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { /* storage blocked */ }
      }
      // drop ids that no longer exist (a hunt left the data) so they don't hold a choice slot
      const known = new Set(opts.map((o) => o.id));
      if (active) { setIds(Array.isArray(got) ? got.filter((x): x is string => typeof x === 'string' && known.has(x)) : []); setLoaded(true); }
    })();
    return () => { active = false; };
  }, [signedIn, API, KEY, opts]);

  async function save(next: string[]) {
    setIds(next);
    if (signedIn) {
      try {
        const r = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: next }) });
        setStatus(r.ok ? 'Saved to your account' : 'Could not save; retry your change');
      } catch { setStatus('Could not save; retry your change'); }
    } else {
      try { localStorage.setItem(KEY, JSON.stringify(next)); setStatus('Saved in this browser'); } catch { setStatus('Browser storage unavailable'); }
    }
  }

  const chosen = (app: string) => ids.filter((id) => byId.get(id)?.app === app);
  const add = (app: PlanApp, id: string) => { if (id && chosen(app.key).length < app.choices && !ids.includes(id)) void save([...ids, id]); };
  const move = (app: string, id: string) => {
    const list = chosen(app), i = list.indexOf(id);
    if (i < 1) return;
    [list[i - 1], list[i]] = [list[i], list[i - 1]];
    void save([...ids.filter((x) => byId.get(x)?.app !== app), ...list]);
  };

  const used = apps.filter((a) => chosen(a.key).length > 0);
  const group = used.some((a) => a.group) ? used.find((a) => a.group)!.group : undefined;
  const pre = cheapestPrereqs(prereq, used.flatMap((a) => a.needs), group) ?? [];
  const known = used.every((a) => a.price !== null);
  const total = used.reduce((t, a) => t + (a.price ?? 0), 0) + pre.reduce((t, p) => t + p.amount, 0);
  const drawn = used.flatMap((a) => a.ifDrawn ?? []);

  return (
    <>
      <div className="muted" style={{ maxWidth: '72ch' }}>{intro}{' '}
        {signedIn ? 'Your plan is saved to your account.' : <>Your plan stays in this browser; <a href="/login">sign in</a> to keep it on every device.</>} Each state&apos;s plan is kept apart.
      </div>
      {!set && <p className="note"><Link href="/account#hunting-preferences">{setLabel}</Link> first: the odds below assume zero points.</p>}

      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {timeline.map((s) => (
          <div key={s.when + s.what} className="stat" style={s.tone === 'blaze' ? { borderColor: 'var(--blaze)', borderWidth: 2 } : s.tone === 'good' ? { borderColor: 'var(--sage)', borderWidth: 2 } : undefined}>
            <div className="k">{s.when}</div>
            <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{s.what}</div>
          </div>
        ))}
      </div>

      {apps.map((a) => {
        const list = chosen(a.key);
        const avail = opts.filter((o) => o.app === a.key && !ids.includes(o.id)).sort((x, y) => (y.odds ?? -1) - (x.odds ?? -1) || x.code.localeCompare(y.code));
        const sugg = a.suggest.map((id) => byId.get(id)).filter((o): o is PlanOpt => !!o && !ids.includes(o.id)).slice(0, 4);
        return (
          <section key={a.key} className="card plan-sec">
            <h2>{a.label}</h2>
            <p className="small muted" style={{ marginTop: -6 }}>{a.when}{a.choicesKnown === false ? '' : ` · up to ${a.choices} choice${a.choices === 1 ? '' : 's'}`}{a.price !== null ? ` · ${money(a.price)} to apply` : ''}</p>
            {a.what && <p className="small">{a.what}</p>}
            {a.points && <p className="small">{a.points}. <Link href="/account#hunting-preferences">Change</Link></p>}
            {list.length > 0 && (
              <ol className="plan-choices">
                {list.map((id, i) => {
                  const o = byId.get(id)!;
                  return (
                    <li key={id}>
                      <Link href={o.href}><b>{o.code}</b></Link> · {o.where}
                      <div className="small">
                        {i === 0
                          ? <>First choice: <b>{pct(o.odds)}</b> to draw{o.success !== null ? ` · ${pct(o.success)} harvest success` : ''} <span className="muted">({o.basis})</span></>
                          : <>Choice {i + 1}: {pct(o.odds)} as a first choice. <span className="muted">{a.later}</span></>}
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
            {list.length < a.choices && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                  <select aria-label={`${a.label} choice ${list.length + 1}`} value={pick[a.key] ?? ''} onChange={(e) => setPick({ ...pick, [a.key]: e.target.value })} style={{ maxWidth: '100%' }}>
                    <option value="">{list.length ? `Add choice ${list.length + 1}` : 'Choose your first choice'}</option>
                    {avail.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.where} · {o.odds == null ? 'no odds' : pct(o.odds)}</option>)}
                  </select>
                  <button className="btn small" disabled={!loaded || !pick[a.key]} onClick={() => { add(a, pick[a.key]); setPick({ ...pick, [a.key]: '' }); }}>Add</button>
                </div>
                {sugg.length > 0 && (
                  <p className="small" style={{ marginBottom: 0 }}>Best draw and fill at your points:{' '}
                    {sugg.map((o, i) => <span key={o.id}>{i ? ' · ' : ''}<button className="linklike" disabled={!loaded} onClick={() => add(a, o.id)} title={`Add ${o.code} to this application`}>+ {o.code}</button> <span className="muted">{pct(o.odds)}{o.success !== null ? `, ${pct(o.success)} success` : ''}</span></span>)}
                  </p>
                )}
              </>
            )}
          </section>
        );
      })}

      <section className="card plan-sec">
        <h2>What You Pay When You Apply</h2>
        {!used.length ? <p className="muted">Add a choice to see what it costs.</p> : <>
          <div className="cost-lines" style={{ margin: 0 }}><dl>
            {used.map((a) => <dd key={a.key}><span>{a.label} application</span><b>{a.price === null ? 'not printed' : money(a.price)}</b></dd>)}
            {pre.map((p) => <dd key={p.label}><span>{p.label} (needed to apply)</span><b>{money(p.amount)}</b></dd>)}
            <dd><span><b>{known ? 'Total when you apply' : 'Total of the prices printed'}</b></span><b>{money(total)}</b></dd>
          </dl></div>
          {drawn.length > 0 && <p className="small">If you draw: {drawn.map((d) => `${d.label} ${money(d.amount)}`).join(' · ')}.</p>}
        </>}
        <div className="small" style={{ marginBottom: 0 }}>{costNote}</div>
      </section>
      <p role="status" className="small">{status}</p>
    </>
  );
}
