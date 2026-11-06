'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { enabledStates, STATES, type StateCode } from '@/lib/states';
import { searchStates, ID_RESTRICTIONS, CO_RESTRICTIONS } from '@/lib/searchStates';
import { useStateConfig } from './StateContext';

export function SearchStates() {
  const header = useStateConfig();
  const sp = useSearchParams();
  const router = useRouter();
  const selected = searchStates(sp.get('states') ?? undefined, header.code);
  const toggle = (code: StateCode) => {
    const next = selected.includes(code) ? selected.filter(s => s !== code) : [...selected, code];
    if (!next.length) return;
    const p = new URLSearchParams(sp.toString());
    p.set('states', next.sort().join(','));
    p.delete('page'); p.delete('reset'); p.delete('state');
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
    {enabledStates().map(s => <label key={s.code}><input type="checkbox" checked={selected.includes(s.code)} disabled={selected.length === 1 && selected[0] === s.code} onChange={() => toggle(s.code)} /> {s.name}{s.beta ? ' (Beta)' : ''}</label>)}
  </div><p className="small muted">Header changes reset this search.</p></fieldset>;
}
