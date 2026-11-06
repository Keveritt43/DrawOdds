'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setPoints } from '@/app/actions';
import type { StatePoints } from '@/lib/points';
import { CO_METHODS, CO_SEASONS } from '@/lib/coMapFilters';
import { CHANCES, PointRangeSlider } from './CoFilters';

export function CoQuickStart({ points }: { points: StatePoints }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [range, setRange] = useState([0, 40]);
  const opts = (name: string, values: readonly (readonly [string, string])[], multi = false) => <div className="opts">{values.map(([v, text], i) => <label key={v}><input type={multi ? 'checkbox' : 'radio'} name={name} value={v} defaultChecked={!multi && i === 0} /><span>{text}</span></label>)}</div>;
  return <form className="quick" onSubmit={e => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const query = new URLSearchParams({reset: '1', state: 'CO'});
    for (const name of ['species', 'type', 'antler', 'method', 'season', 'chance', 'sort']) {
      const value = data.getAll(name).map(String).filter(Boolean).join(',');
      if (value) query.set(name, value);
    }
    if (range[0] > 0) query.set('minPts', String(range[0]));
    if (range[1] < 40) query.set('maxPts', String(range[1]));
    setError('');
    start(async () => {
      try {
        await setPoints('CO', {res: data.get('res') === 'RESIDENT' ? 'RESIDENT' : 'NONRESIDENT', DEER: Number(data.get('DEER')), ELK: Number(data.get('ELK')), youth: data.has('youth')});
        router.push('/hunts?' + query);
      } catch { setError('Could not save your points. Please try again.'); }
    });
  }}>
    <h2>Quick Start</h2>
    <p className="small" style={{color: '#a9b0a7', margin: 0}}>Pick a few things. Refine everything else on the next page.</p>
    <label htmlFor="quick-res">I&apos;m Applying As</label>
    <select id="quick-res" name="res" defaultValue={points.res}><option value="RESIDENT">Resident</option><option value="NONRESIDENT">Nonresident</option></select>
    <label>My Preference Points</label>
    <div className="co-quick-points">{(['DEER', 'ELK'] as const).map(sp => <label key={sp}>{sp === 'DEER' ? 'Deer' : 'Elk'} <input aria-label={sp === 'DEER' ? 'My deer points' : 'My elk points'} type="number" name={sp} min="0" max="40" step="1" required defaultValue={points[sp]} style={{width: 70}} /></label>)}</div>
    <label><input type="checkbox" name="youth" defaultChecked={points.youth} /> Youth hunter (12–17)</label>
    <label>Species</label>{opts('species', [['ELK', 'Elk'], ['DEER', 'Deer']])}
    <label>Hunt Type</label>{opts('type', [['CONTROLLED', 'Controlled Draw'], ['GENERAL', 'General / OTC'], ['', 'Either']])}
    <label>What Are You After?</label>{opts('antler', [['ANTLERED', 'A Buck Or Bull (Incl. Either-Sex Hunts)'], ['ALL', 'Any Animal (Incl. Does / Cows)']])}
    <label>Weapon (Select Any)</label>{opts('method', CO_METHODS, true)}
    <label>Season Type (Select Any)</label>{opts('season', CO_SEASONS, true)}
    <label>Draw At My Points (Select Any)</label>{opts('chance', CHANCES, true)}
    <label>Points Needed (Last Draw)</label>
    <PointRangeSlider min={range[0]} max={range[1]} onCommit={(min, max) => setRange([min, max])} />
    <label>I Want</label>{opts('sort', [['odds', 'Best Chance To Get A Tag'], ['success', 'Highest Harvest Rate'], ['score', 'Best Overall Hunt (Quality)'], ['opp', 'Best Opportunity At My Points'], ['pts', 'Fewest Points Needed']])}
    <p className="hint">Your residency and species points are saved when you show hunts. Leave weapon, season or draw chance unchecked to include any.</p>
    {error && <p role="alert">{error}</p>}
    <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Finding Hunts…' : 'Show Me Hunts'}</button>
  </form>;
}
