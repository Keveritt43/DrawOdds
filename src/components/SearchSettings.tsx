'use client';
import { useTransition } from 'react';
import { PointTracker } from './PointTracker';
import { setResidency } from '@/app/actions';
import type { HunterSettings } from '@/lib/multiStateSearch';
import type { StateCode } from '@/lib/states';

export function SearchSettings({ states, settings }: { states: StateCode[]; settings: HunterSettings }) {
  const [pending, start] = useTransition();
  return <div className="search-settings">
    {states.includes('ID') && <div><b>Idaho residency</b><div className="seg light" role="group" aria-label="Idaho search residency">{(['RESIDENT', 'NONRESIDENT'] as const).map(r => <button key={r} type="button" disabled={pending} aria-pressed={settings.ID === r} onClick={() => start(() => setResidency(r, 'ID'))}>{r === 'RESIDENT' ? 'Resident' : 'Nonresident'}</button>)}</div></div>}
    {states.includes('CO') && <div><PointTracker state="CO" value={settings.CO} />{!settings.CO.set && <p className="small muted">Colorado preview: nonresident, zero points until you set your details.</p>}</div>}
  </div>;
}
