'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Section } from './FilterRail';

type Opt = [value: string, label: string];
const SPECIES: Opt[] = [['DEER', 'Deer'], ['ELK', 'Elk']];
const METHOD: Opt[] = [['R', 'Rifle'], ['A', 'Archery'], ['M', 'Muzzleloader']];
const SEX: Opt[] = [['M', 'Bucks & bulls'], ['F', 'Does & cows'], ['E', 'Either sex']];
const SEASON: Opt[] = [['1', '1st rifle'], ['2', '2nd rifle'], ['3', '3rd rifle'], ['4', '4th rifle'], ['E', 'Early'], ['L', 'Late'], ['K', 'Youth only']];
export const CHANCES: Opt[] = [['sure', 'Sure'], ['likely', 'Likely (60%+)'], ['possible', 'Possible (30-60%)'], ['longshot', 'Long shot'], ['none', 'No chance']];

/** Colorado's filter rail: the draw at your points first, then the hunt itself. Every change updates the URL. */
export function CoFilters({ nr, points, speciesLabel }: { nr: boolean; points: number; speciesLabel: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const push = (patch: Record<string, string | string[] | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      const val = Array.isArray(v) ? v.join(',') : v;
      if (val === null || val === '') p.delete(k);
      else p.set(k, val);
    }
    p.delete('page');
    router.push(`/hunts${p.size ? `?${p}` : ''}`, { scroll: false });
  };
  const get = (k: string) => sp.get(k) ?? '';
  const list = (k: string) => get(k).split(',').filter(Boolean);
  const toggle = (k: string, v: string) => push({ [k]: list(k).includes(v) ? list(k).filter((x) => x !== v) : [...list(k), v] });
  const many = (opts: Opt[], k: string, none: string) => (list(k).length ? list(k).map((v) => opts.find((o) => o[0] === v)?.[1] ?? v).join(', ') : none);
  const checks = (k: string, opts: Opt[]) => (
    <div className="checks2">
      {opts.map(([v, l]) => <label key={v}><input type="checkbox" checked={list(k).includes(v)} onChange={() => toggle(k, v)} /> {l}</label>)}
    </div>
  );
  const flag = (k: string, label: string, on = '1') => (
    <label><input type="checkbox" checked={get(k) === on} onChange={() => push({ [k]: get(k) === on ? null : on })} /> {label}</label>
  );
  const sp_ = get('species') || 'DEER';
  return (
    <aside className={`f-rail ${open ? 'open' : ''}`} aria-label="Filters">
      <div className="mobile-switch">
        <button className="btn" type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? 'Hide Filters' : 'Show Filters'}</button>
      </div>
      {[...sp.keys()].some((k) => !['sort', 'page', 'odds'].includes(k)) && <div className="rail-reset"><a href="/hunts?reset=1">Reset all filters</a></div>}
      <div className="rsec-wrap">
        <Section title="Species" value={SPECIES.find((s) => s[0] === sp_)?.[1] ?? 'Deer'} set={!!get('species')} defaultOpen>
          <div className="checks2">
            {SPECIES.map(([v, l]) => <label key={v}><input type="radio" name="co-species" checked={sp_ === v} onChange={() => push({ species: v === 'DEER' ? null : v })} /> {l}</label>)}
          </div>
          {sp_ === 'ELK' && <p className="small muted" style={{ margin: '6px 0 0' }}>Elk draw data is coming next; deer is loaded first.</p>}
        </Section>
        <Section title={`Draw At My Points (${points} ${speciesLabel})`} value={many(CHANCES, 'chance', 'Any')} set={list('chance').length > 0} defaultOpen>
          {checks('chance', CHANCES)}
          <p className="small muted" style={{ margin: '6px 0 0' }}>{nr ? 'Nonresident' : 'Resident'}, first choice, {get('odds') === 'last' ? 'last draw' : 'next draw (projected)'}. Change your points in the header.</p>
        </Section>
        <Section title={`Points Needed (${nr ? 'Nonres' : 'Res'})`} value={get('maxPts') ? `${get('maxPts')} or fewer` : 'Any'} set={!!get('maxPts')}>
          <MaxSlider value={get('maxPts') === '' ? null : Number(get('maxPts'))} max={25} onCommit={(v) => push({ maxPts: v === null ? null : String(v) })} />
          <p className="small muted" style={{ margin: '6px 0 0' }}>The level the licenses ran out at in the last draw. 0 = every first choice drew.</p>
        </Section>
        <Section title="Choice & Draw" value={[get('second') && '2nd choice', get('hybrid') && 'Hybrid', get('priv') && 'Private land shown'].filter(Boolean).join(', ') || 'Any'} set={!!(get('second') || get('hybrid') || get('priv'))}>
          <div className="checks2">
            {flag('second', 'Drew as a 2nd choice (keeps your points)')}
            {flag('hybrid', 'Has a hybrid draw (random draw for 5+ points)')}
            {flag('priv', 'Include private-land-only and Ranching for Wildlife')}
          </div>
        </Section>
        <Section title="Method" value={many(METHOD, 'method', 'All')} set={list('method').length > 0}>{checks('method', METHOD)}</Section>
        <Section title="Bucks/Bulls Or Antlerless" value={many(SEX, 'sex', 'Any')} set={list('sex').length > 0}>{checks('sex', SEX)}</Section>
        <Section title="Season" value={many(SEASON, 'season', 'Any')} set={list('season').length > 0}>{checks('season', SEASON)}</Section>
        <Section title="Unit" value={get('unit') ? `Unit ${get('unit')}` : 'Any'} set={!!get('unit')}>
          <UnitField value={get('unit')} onCommit={(v) => push({ unit: v })} />
          <p className="small muted" style={{ margin: '6px 0 0' }}>Or tap a unit on the map.</p>
        </Section>
      </div>
      {open && (
        <div className="rail-done">
          <button className="btn primary" type="button" onClick={() => { setOpen(false); document.querySelector('.f-list')?.scrollIntoView({ behavior: 'smooth' }); }}>Show Results</button>
        </div>
      )}
    </aside>
  );
}

function MaxSlider({ value, max, onCommit }: { value: number | null; max: number; onCommit: (v: number | null) => void }) {
  const [v, setV] = useState(value ?? max);
  useEffect(() => setV(value ?? max), [value, max]);
  const commit = () => onCommit(v >= max ? null : v);
  return (
    <div>
      <div style={{ textAlign: 'right', marginBottom: 4 }}><span className="slider-val">{v >= max ? 'Any' : `${v} or fewer`}</span></div>
      <input type="range" min={0} max={max} step={1} value={v} onChange={(e) => setV(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} aria-label="Most points needed" aria-valuetext={v >= max ? 'Any' : `${v} points`} />
      <div className="slider-ends"><span>0</span><span>Any</span></div>
    </div>
  );
}

function UnitField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onCommit(v.trim()); }} style={{ display: 'flex', gap: 6 }}>
      <input type="text" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} placeholder="70" aria-label="Unit number" style={{ width: 90 }} />
      <button className="btn" type="submit">Go</button>
      {value && <button className="btn" type="button" onClick={() => onCommit('')}>Clear</button>}
    </form>
  );
}
