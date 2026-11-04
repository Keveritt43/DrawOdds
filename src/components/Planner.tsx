'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { tagChances } from '@/lib/plan';
import { unitOrder } from '@/lib/format';

/** One hunt or tag as the planner API returns it. */
export interface PlanOpt {
  id: string; name: string; species: string; huntNumber: number | null; areaName: string | null; units: string[]; weapon: string; antlerClass: string;
  tagCode: string | null; resOdds5: number | null; nrOdds5: number | null; resOddsLast: number | null; nrOddsLast: number | null;
  secondDrewLast: number | null; secondAppsLast: number | null; nrDraw: { year?: number; applied?: number[]; drew?: number[] } | null; quota: number | null;
  tags: number | null; success5: number | null; resTagAndFill: number | null; nrTagAndFill: number | null; scoreQuality: number | null;
}
export interface Plan { elkTags: string[]; deerTags: string[]; ctl: Record<string, [string, string]>; updatedAt?: number }
const EMPTY: Plan = { elkTags: [], deerTags: [], ctl: {} };
const KEY = 'applicationPlan';
const EVT = 'plan-change';

export function readPlan(): Plan {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return p && typeof p === 'object' ? { ...EMPTY, ...p, ctl: p.ctl ?? {} } : EMPTY;
  } catch {
    return EMPTY;
  }
}
export function writePlan(p: Plan, fromServer = false) {
  const stamped = fromServer ? p : { ...p, updatedAt: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(stamped)); } catch { /* not saved */ }
  window.dispatchEvent(new Event(EVT));
  // signed in: keep the account's copy in step (visitors get a 401 and the plan stays in this browser)
  if (!fromServer) fetch('/api/plan', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: stamped, updatedAt: stamped.updatedAt }), keepalive: true }).catch(() => {});
}

/** Signed in: take the account's plan if it is newer than this browser's, or send this one up if it is newer. */
export async function syncPlan(): Promise<'pulled' | 'pushed' | 'same' | 'visitor'> {
  try {
    const r = await fetch('/api/plan', { cache: 'no-store' });
    if (r.status === 401) return 'visitor';
    const { plan, updatedAt } = (await r.json()) as { plan: Plan | null; updatedAt: number };
    const local = readPlan();
    const localAt = local.updatedAt ?? 0;
    if (plan && updatedAt > localAt) {
      writePlan({ ...EMPTY, ...plan, ctl: plan.ctl ?? {}, updatedAt }, true);
      return 'pulled';
    }
    const hasLocal = local.elkTags.length || local.deerTags.length || Object.keys(local.ctl).length;
    if (hasLocal && localAt > updatedAt) {
      await fetch('/api/plan', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: local, updatedAt: localAt || Date.now() }) });
      return 'pushed';
    }
    return 'same';
  } catch {
    return 'visitor';
  }
}

/** "Add to my plan" on a hunt page. */
export function AddToPlan({ id, kind, species }: { id: string; kind: 'tag' | 'controlled'; species: string }) {
  const [state, setState] = useState<'out' | 'in' | 'full'>('out');
  const check = () => {
    const p = readPlan();
    if (kind === 'tag') {
      const l = species === 'ELK' ? p.elkTags : p.deerTags;
      setState(l.includes(id) ? 'in' : l.length >= 5 ? 'full' : 'out');
    } else {
      const c = p.ctl[species] ?? ['', ''];
      setState(c.includes(id) ? 'in' : c[0] && c[1] ? 'full' : 'out');
    }
  };
  useEffect(() => {
    check();
    window.addEventListener(EVT, check);
    return () => window.removeEventListener(EVT, check);
  });
  const add = () => {
    const p = readPlan();
    if (kind === 'tag') {
      const k = species === 'ELK' ? 'elkTags' : 'deerTags';
      if (!p[k].includes(id) && p[k].length < 5) p[k] = [...p[k], id];
    } else {
      const c = [...(p.ctl[species] ?? ['', ''])] as [string, string];
      if (!c.includes(id)) { if (!c[0]) c[0] = id; else if (!c[1]) c[1] = id; }
      p.ctl = { ...p.ctl, [species]: c };
    }
    writePlan(p);
  };
  if (state === 'in') return <Link className="btn" href="/planner">In your plan ✓</Link>;
  if (state === 'full') return <Link className="btn" href="/planner" title={kind === 'tag' ? 'Your 5 choices are full' : 'Your 1st and 2nd choices are taken'}>Plan full: edit</Link>;
  return <button type="button" className="btn" onClick={add}>+ Add to my plan</button>;
}

const pct = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? '-' : `${(v * 100).toFixed(v > 0 && v < 0.1 ? 1 : d)}%`);
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function Planner({ nr, windows, costs }: {
  nr: boolean;
  windows: { title: string; start: string; end: string; note?: string }[];
  costs: { year: number; license: number; accessFee: number; generalDrawApp: number; deerTag: number; elkTag: number; note: string; feeSchedule: string };
}) {
  const [plan, setPlan] = useState<Plan>(EMPTY);
  const [opts, setOpts] = useState<Record<string, PlanOpt[]>>({});
  const [ctlSpecies, setCtlSpecies] = useState<string[]>(['DEER', 'ELK']);
  useEffect(() => {
    const sync = () => setPlan(readPlan());
    sync();
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, []);
  useEffect(() => {
    const p = readPlan();
    setCtlSpecies((s) => [...new Set([...s, ...Object.keys(p.ctl)])]);
    // signed in: the same plan on every device
    syncPlan().then((r) => {
      if (r === 'pulled') setCtlSpecies((s) => [...new Set([...s, ...Object.keys(readPlan().ctl)])]);
    });
  }, []);
  const need = useMemo(() => [...(nr ? ['tag:ELK', 'tag:DEER'] : []), ...ctlSpecies.map((s) => `controlled:${s}`)], [nr, ctlSpecies]);
  useEffect(() => {
    for (const k of need) {
      if (opts[k]) continue;
      const [kind, species] = k.split(':');
      fetch(`/api/planner?kind=${kind}&species=${species}`).then((r) => r.json()).then((rows: PlanOpt[]) => setOpts((o) => ({ ...o, [k]: rows })));
    }
  }, [need, opts]);
  const save = (p: Plan) => { setPlan(p); writePlan(p); };
  const byId = (k: string, id: string) => opts[k]?.find((o) => o.id === id);
  const odds5 = (o: PlanOpt) => (nr ? o.nrOdds5 : o.resOdds5);
  const WEAPON_LABEL: Record<string, string> = { ANY: 'any weapon', ARCHERY: 'archery', MUZZLELOADER: 'muzzleloader', SHORT_RANGE: 'short range' };
  const tagLabel = (o: PlanOpt) => `${o.species === 'ELK' ? o.name.replace(/^Elk (?!City)/, '') : o.name} · ${o.tagCode ?? ''} · ${pct(o.nrOdds5)} 1st-choice${o.quota !== null ? ` · ${o.quota} tags` : ''}`;
  const ctlLabel = (o: PlanOpt) => `${o.huntNumber} · area ${o.areaName} · ${WEAPON_LABEL[o.weapon] ?? o.weapon.toLowerCase()} · ${o.antlerClass === 'ANTLERED' ? (o.species === 'ELK' ? 'bull' : o.species === 'DEER' ? 'buck' : 'male') : o.antlerClass === 'ANTLERLESS' ? 'antlerless' : 'either sex'} · ${odds5(o) === null ? 'no odds yet' : `${pct(odds5(o))} odds`}${o.success5 === null ? '' : ` · ${pct(o.success5)} success`}`;

  // ---- nonresident general tags
  const tagSection = (species: 'ELK' | 'DEER') => {
    const k = `tag:${species}`;
    const listKey = species === 'ELK' ? 'elkTags' : 'deerTags';
    const ids = plan[listKey];
    const chosen = ids.map((id) => byId(k, id));
    const ch = tagChances(chosen);
    // deer: Regular Deer tags first, then White-tailed, each by unit (1, 2 ... 10, 11, 20, 20A); elk: by zone, A then B
    const all = (opts[k] ?? []).slice().sort((a, b) => species === 'DEER'
      ? (a.tagCode ?? '').slice(0, 2).localeCompare((b.tagCode ?? '').slice(0, 2)) || unitOrder(a.units[0], b.units[0])
      : a.name.localeCompare(b.name));
    const later = (o: PlanOpt) => (o.nrDraw?.drew ?? []).slice(1).reduce((a, b) => a + (b ?? 0), 0);
    return (
      <section className="card plan-sec">
        <h2>{species === 'ELK' ? 'Elk' : 'Deer'} General Tag Application <span className="small muted">(nonresident draw, up to 5 choices)</span></h2>
        <ol className="plan-choices">
          {[0, 1, 2, 3, 4].map((i) => {
            const o = chosen[i];
            return (
              <li key={i}>
                <select value={ids[i] ?? ''} onChange={(e) => {
                  const next = ids.slice();
                  if (e.target.value) next[i] = e.target.value; else next.splice(i, 1);
                  save({ ...plan, [listKey]: next.filter(Boolean).filter((v, j, a) => a.indexOf(v) === j) });
                }} disabled={i > ids.length}>
                  <option value="">{i === 0 ? 'Pick your 1st choice…' : i > ids.length ? '-' : `Add choice ${i + 1}…`}</option>
                  {all.map((x) => <option key={x.id} value={x.id} disabled={ids.includes(x.id) && ids[i] !== x.id}>{tagLabel(x)}{later(x) > 0 ? ' · reaches later choices' : ''}</option>)}
                </select>
                {o && <span className="plan-p">{pct(ch.at[i], 1)} chance you draw this one{i > 0 && later(o) === 0 ? ' (filled on 1st choices last year: a wasted slot)' : ''}</span>}
              </li>
            );
          })}
        </ol>
        {ids.length > 0 && <p className="plan-total">Chance of drawing {species === 'ELK' ? 'an elk' : 'a deer'} tag: <b>{pct(ch.any, 1)}</b></p>}
        <p className="small muted">Idaho draws everyone&apos;s 1st choices, then 2nd choices for those still without a tag, and so on, so a tag that fills on 1st choices never reaches your later ones. Chances use the last drawing at each choice; there are no points.</p>
      </section>
    );
  };

  // ---- controlled hunts (one application per species, 1st + 2nd choice)
  const ctlSection = (species: string) => {
    const k = `controlled:${species}`;
    const [a, b] = plan.ctl[species] ?? ['', ''];
    const oa = a ? byId(k, a) : undefined;
    const ob = b ? byId(k, b) : undefined;
    const p1 = oa ? odds5(oa) ?? 0 : 0;
    const p2 = ob && (ob.secondAppsLast ?? 0) > 0 ? Math.min(1, (ob.secondDrewLast ?? 0) / ob.secondAppsLast!) : 0;
    const all = (opts[k] ?? []).slice().sort((x, y) => (x.huntNumber ?? 0) - (y.huntNumber ?? 0));
    const set = (i: 0 | 1, v: string) => {
      const c: [string, string] = [a, b];
      c[i] = v;
      if (c[0] && c[0] === c[1]) c[1] = ''; // the same hunt can't be both choices
      save({ ...plan, ctl: { ...plan.ctl, [species]: c } });
    };
    const label = { DEER: 'Deer', ELK: 'Elk', PRONGHORN: 'Pronghorn', MOOSE: 'Moose', BIGHORN: 'Bighorn Sheep', GOAT: 'Mountain Goat' }[species] ?? species;
    return (
      <section key={species} className="card plan-sec">
        <h2>{label} Controlled Hunt <span className="small muted">(1st and 2nd choice)</span>
          <button type="button" className="btn small" style={{ marginLeft: 8 }} onClick={() => { const c = { ...plan.ctl }; delete c[species]; save({ ...plan, ctl: c }); setCtlSpecies((s) => s.filter((x) => x !== species)); }}>Remove</button>
        </h2>
        {!opts[k] ? <p className="small muted">Loading hunts…</p> : (
          <ol className="plan-choices">
            {([0, 1] as const).map((i) => (
              <li key={i}>
                <select value={[a, b][i]} onChange={(e) => set(i, e.target.value)}>
                  <option value="">{i === 0 ? 'Pick your 1st choice…' : 'Optional 2nd choice…'}</option>
                  {all.map((x) => <option key={x.id} value={x.id} disabled={x.id === [a, b][1 - i]}>{ctlLabel(x)}{i === 1 && (x.secondDrewLast ?? 0) > 0 ? ` · ${x.secondDrewLast} tags to 2nd choices` : ''}</option>)}
                </select>
                {i === 0 && oa && <span className="plan-p">{pct(p1, 1)} 1st-choice odds (5-yr) · draw and fill {pct(nr ? oa.nrTagAndFill : oa.resTagAndFill, 1)}</span>}
                {i === 1 && ob && <span className="plan-p">{p2 > 0 ? `${pct(p2, 1)} of 2nd-choice applicants drew last time` : 'No tags reached 2nd choices last time: this slot likely won’t help'}</span>}
              </li>
            ))}
          </ol>
        )}
        {oa && <p className="plan-total">Chance of a {label.toLowerCase()} tag: <b>{pct(1 - (1 - p1) * (1 - p2), 1)}</b></p>}
      </section>
    );
  };

  // ---- totals
  const elk = tagChances(plan.elkTags.map((id) => byId('tag:ELK', id))).any;
  const deer = tagChances(plan.deerTags.map((id) => byId('tag:DEER', id))).any;
  const nrApps = (plan.elkTags.length ? 1 : 0) + (plan.deerTags.length ? 1 : 0);
  const upfront = nr ? costs.license + costs.accessFee + nrApps * costs.generalDrawApp : 0;
  const expectedTags = nr ? elk * costs.elkTag + deer * costs.deerTag : 0;
  const codes: { what: string; list: string[] }[] = [
    ...(plan.elkTags.length ? [{ what: 'Elk general tag (NR draw)', list: plan.elkTags.map((id) => byId('tag:ELK', id)?.tagCode ?? id) }] : []),
    ...(plan.deerTags.length ? [{ what: 'Deer general tag (NR draw)', list: plan.deerTags.map((id) => byId('tag:DEER', id)?.tagCode ?? id) }] : []),
    ...Object.entries(plan.ctl).filter(([, c]) => c[0]).map(([sp, c]) => ({ what: `${sp[0]}${sp.slice(1).toLowerCase()} controlled`, list: c.filter(Boolean).map((id) => String(byId(`controlled:${sp}`, id)?.huntNumber ?? id)) })),
  ];

  return (
    <>
      {nr && tagSection('ELK')}
      {nr && tagSection('DEER')}
      {!nr && <p className="note">Residents buy general deer and elk tags over the counter: no draw. Plan your controlled hunt applications below.</p>}
      {ctlSpecies.map(ctlSection)}
      <p>
        Add a controlled application:{' '}
        {['DEER', 'ELK', 'PRONGHORN'].filter((s) => !ctlSpecies.includes(s)).map((s) => <button key={s} type="button" className="btn small" onClick={() => setCtlSpecies((x) => [...x, s])} style={{ marginRight: 6 }}>{s[0]}{s.slice(1).toLowerCase()}</button>)}
        <span className="small muted"> Moose, sheep and goat are a separate drawing: see their hunt pages.</span>
      </p>

      <section className="card plan-sec plan-sheet">
        <h2>Your Application Sheet</h2>
        {codes.length === 0 ? <p className="muted">Pick some hunts above.</p> : (
          <table className="cmp-table">
            <tbody>
              {codes.map((c) => <tr key={c.what}><th>{c.what}</th><td>{c.list.map((x, i) => <span key={i} className="pill">{i + 1}. {x}</span>)}</td></tr>)}
            </tbody>
          </table>
        )}
        {nr && (
          <div className="plan-cost">
            <h3>Cost ({costs.year} prices)</h3>
            <ul>
              <li>Nonresident hunting license + access fee: <b>{money(costs.license + costs.accessFee)}</b> (required to apply; nonrefundable)</li>
              {nrApps > 0 && <li>General tag draw application{nrApps > 1 ? 's' : ''}: <b>{money(nrApps * costs.generalDrawApp)}</b></li>}
              {plan.elkTags.length > 0 && <li>Elk tag if you draw: {money(costs.elkTag)} × {pct(elk)} chance</li>}
              {plan.deerTags.length > 0 && <li>Deer tag if you draw: {money(costs.deerTag)} × {pct(deer)} chance</li>}
              <li>Up front: <b>{money(upfront)}</b> · expected total with tags: <b>{money(upfront + expectedTags)}</b></li>
            </ul>
            <p className="small muted">{costs.note} Controlled hunt application fees and controlled / pronghorn tag prices: <a href={costs.feeSchedule} target="_blank" rel="noreferrer">IDFG fee schedule</a>.</p>
          </div>
        )}
        <h3>Deadlines</h3>
        <ul>
          {windows.map((w) => <li key={w.title + w.start}><b>{new Date(w.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} – {new Date(w.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</b>: {w.title.replace(/^Idaho: /, '')}</li>)}
        </ul>
        <p className="no-print">
          <a className="btn" href="/api/calendar">Add all deadlines to my calendar (.ics)</a>{' '}
          <button type="button" className="btn" onClick={() => window.print()}>Print this sheet</button>{' '}
          <button type="button" className="btn" onClick={() => save(EMPTY)}>Start over</button>
        </p>
      </section>
    </>
  );
}
