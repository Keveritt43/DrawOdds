'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setStateCode } from '@/app/actions';
import { enabledStates, STATES, type StateCode } from '@/lib/states';

export function HomeStatePicker({ selected }: { selected: StateCode[] }) {
  const [choices, setChoices] = useState(selected);
  const [pending, start] = useTransition();
  const router = useRouter();
  const menu = useRef<HTMLDetailsElement>(null);
  return <details ref={menu} className="home-state-picker">
    <summary aria-label={`Search states: ${selected.map(s => STATES[s].name).join(', ')}. Choose states`}>{selected.map(s => STATES[s].name).join(' & ')} <span aria-hidden="true">▾</span></summary>
    <div className="home-state-menu"><strong>Choose states</strong><p>Search one or multiple states.</p>
      {enabledStates().map(s => <label key={s.code}><input type="checkbox" checked={choices.includes(s.code)} disabled={choices.length === 1 && choices.includes(s.code)} onChange={() => setChoices(choices.includes(s.code) ? choices.filter(c => c !== s.code) : [...choices, s.code])} /> {s.name}</label>)}
      <button type="button" className="btn primary" disabled={pending} onClick={() => start(async () => {
        if (menu.current) menu.current.open = false;
        if (choices.length === 1) { await setStateCode(choices[0]); router.push('/'); router.refresh(); }
        else router.push('/?states=' + choices.sort().join(','));
      })}>Apply states</button>
    </div>
  </details>;
}
