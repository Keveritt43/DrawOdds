'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { setPoints } from '@/app/actions';
import { useStateConfig } from './StateContext';
import type { StatePoints } from '@/lib/points';
import { STATES, type StateCode } from '@/lib/states';

const SPECIES = [
  { key: 'DEER', label: 'Deer' },
  { key: 'ELK', label: 'Elk' },
  { key: 'PRONGHORN', label: 'Pronghorn' },
] as const;

/**
 * "Points: Deer 3 · Elk 0" in the header (states with preference points). Every odds number on the site reads
 * these, so it opens on its own the first time someone looks at Colorado.
 */
export function PointTracker({ value, state }: { value: StatePoints; state?: StateCode }) {
  const header = useStateConfig();
  const st = state ? STATES[state] : header;
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (!state && !value.set && ref.current) ref.current.open = true;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [value.set, state]);
  const save = (patch: Partial<StatePoints>) => {
    setV((o) => ({ ...o, ...patch, set: true }));
    start(() => setPoints(st.code, patch));
  };
  const nr = v.res === 'NONRESIDENT';
  return (
    <details ref={ref} className="pt-tracker">
      <summary aria-label={`Your ${st.name} preference points. Change`}>
        <span className="pt-k">{st.code} points</span>
        {SPECIES.map((s) => <span key={s.key} className="pt-v">{s.label} <b>{v[s.key]}</b></span>)}
        <span aria-hidden="true">▾</span>
      </summary>
      <div className="pt-menu card" aria-busy={pending}>
        <p className="pt-title">Your {st.name} preference points</p>
        <div className="seg light" role="group" aria-label={`${st.name} residency`}>
          <button type="button" aria-pressed={!nr} onClick={() => save({ res: 'RESIDENT' })}>Resident</button>
          <button type="button" aria-pressed={nr} onClick={() => save({ res: 'NONRESIDENT' })}>Nonresident</button>
        </div>
        <div className="pt-rows">
          {SPECIES.map((s) => (
            <div key={s.key} className="pt-row">
              <span>{s.label}</span>
              <span className="pt-step">
                <button type="button" aria-label={`Fewer ${s.label.toLowerCase()} points`} disabled={v[s.key] <= 0} onClick={() => save({ [s.key]: v[s.key] - 1 })}>−</button>
                <output aria-live="polite">{v[s.key]}</output>
                <button type="button" aria-label={`More ${s.label.toLowerCase()} points`} onClick={() => save({ [s.key]: v[s.key] + 1 })}>+</button>
              </span>
            </div>
          ))}
        </div>
        <label className="pt-youth"><input type="checkbox" checked={v.youth} onChange={(e) => save({ youth: e.target.checked })} /> Youth hunter (12–17): show youth odds</label>
        <p className="small muted" style={{ margin: 0 }}>
          Your points are on your {st.agency.short} account under preference points. Bear, moose, sheep and goat come later.
          {!value.set && ' Until you set them, odds assume 0 points.'}
        </p>
        <button type="button" className="btn small" onClick={() => { if (!v.set) save({}); if (ref.current) ref.current.open = false; }}>Done</button>
      </div>
    </details>
  );
}
