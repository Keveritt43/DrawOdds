'use client';
import { useTransition } from 'react';
import { PointTracker } from './PointTracker';
import { setPoints, setResidency } from '@/app/actions';
import type { HunterSettings } from '@/lib/multiStateSearch';
import type { StateCode } from '@/lib/states';

export function SearchSettings({ states, settings, historical }: { states: StateCode[]; settings: HunterSettings; historical?: boolean }) {
  const [pending, start] = useTransition();
  return <div className="search-settings">
    {states.includes('ID') && <div><b>Idaho residency</b><div className="seg light" role="group" aria-label="Idaho search residency">{(['RESIDENT', 'NONRESIDENT'] as const).map(r => <button key={r} type="button" disabled={pending} aria-pressed={settings.ID === r} onClick={() => start(() => setResidency(r, 'ID'))}>{r === 'RESIDENT' ? 'Resident' : 'Nonresident'}</button>)}</div></div>}
    {states.includes('CO') && historical && <div>
      <b>Colorado draw pool</b><div className="seg light" role="group" aria-label="Colorado search residency">{(['RESIDENT', 'NONRESIDENT'] as const).map(res => <button key={res} type="button" disabled={pending} aria-pressed={settings.CO.res === res} onClick={() => start(() => setPoints('CO', { res }))}>{res === 'RESIDENT' ? 'Resident' : 'Nonresident'}</button>)}</div>
      <label><input type="checkbox" checked={settings.CO.youth} disabled={pending} onChange={e => { const youth = e.target.checked; start(() => setPoints('CO', { youth })); }} /> Youth draw results</label>
    </div>}
    {states.includes('CO') && !historical && <div><PointTracker state="CO" value={settings.CO} />{!settings.CO.set && <p className="small muted">Colorado preview: nonresident, zero points until you set your details.</p>}</div>}
  </div>;
}
