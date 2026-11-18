'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFinderRouter } from './FinderBusy';
import { enabledStates, STATES, stateConfig, type StateCode } from '@/lib/states';
import { searchStates, searchDraw, ID_RESTRICTIONS, CO_RESTRICTIONS } from '@/lib/searchStates';
import { useStateConfig } from './StateContext';

export function SearchStates({ draw }: { draw?: 'DEP' | 'MSG' } = {}) {
  const header = useStateConfig();
  const sp = useSearchParams();
  const router = useFinderRouter();
  const state = sp.get('state');
  const selected = searchStates(sp.get('states') ?? undefined, state ? stateConfig(state).code : header.code);
  const selKey = selected.join(',');
  // Ticking a box only changes this draft; one search runs when the hunter applies it.
  const [draft, setDraft] = useState<StateCode[]>(selected);
  useEffect(() => { setDraft(selKey.split(',') as StateCode[]); }, [selKey]);
  const all = enabledStates().map(s => s.code);
  const changed = [...draft].sort().join(',') !== selKey;
  const toggle = (code: StateCode) => setDraft(d => d.includes(code) ? (d.length > 1 ? d.filter(s => s !== code) : d) : [...d, code]);
  const apply = (next: StateCode[]) => {
    if (!next.length) return;
    next = [...next];
    const p = new URLSearchParams(sp.toString());
    p.set('states', next.sort().join(','));
    if ((draw ?? searchDraw(p.get('draw'), p.get('species'))) === 'MSG') p.set('draw', 'msg');
    if (p.get('unit')?.includes(':') && !next.some(s => p.get('unit')!.startsWith(s + ':'))) p.delete('unit');
    p.delete('page'); p.delete('reset'); p.delete('state'); p.delete('restore');
    if (!next.includes('ID')) for (const key of ID_RESTRICTIONS) p.delete(key);
    if (!next.includes('CO')) for (const key of [...CO_RESTRICTIONS, 'priv', 'odds']) p.delete(key);
    // Translate the existing Colorado-only controls into their shared equivalents.
    if (p.has('method') && !p.has('weapon')) p.set('weapon', (p.get('method') ?? '').split(',').map(m => ({ R: 'ANY', A: 'ARCHERY', M: 'MUZZLELOADER' })[m] ?? m).join(','));
    p.delete('method');
    if (p.has('minSucc') && !p.has('minSuccess')) p.set('minSuccess', p.get('minSucc')!);
    p.delete('minSucc');
    if (!p.has('sort')) p.set('sort', 'opp');
    if (!p.has('minScore')) p.set('minScore', '0');
    router.push(`/hunts?${p}`, { scroll: false });
  };
  return <fieldset className="search-states"><legend>Search states</legend><div className="checks2">
    {enabledStates().map(s => <label key={s.code}><input type="checkbox" checked={draft.includes(s.code)} disabled={draft.length === 1 && draft[0] === s.code} onChange={() => toggle(s.code)} /> {s.name}</label>)}
  </div>
  <div className="search-states-actions">
    {changed && <button type="button" className="btn primary small" onClick={() => apply(draft)}>Search {draft.length} {draft.length === 1 ? 'state' : 'states'}</button>}
    {draft.length < all.length && <button type="button" className="linkish small" onClick={() => setDraft(all)}>Pick all states</button>}
    {changed && <button type="button" className="linkish small" onClick={() => setDraft(selected)}>Undo</button>}
  </div>
  <p className="small muted">Tick states, then search. Header changes reset this search.</p></fieldset>;
}
