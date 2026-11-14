'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CO_METHODS, CO_SEASONS } from '@/lib/coMapFilters';
import { CHANCES, PointRangeSlider } from './CoFilters';
import { QuickSeasonDates, QuickTrophyChoices } from './MultiQuickStart';

export function CoQuickStart() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [range, setRange] = useState([0, 40]);
  const opts = (name: string, values: readonly (readonly [string, string])[], multi = false) => <div className="opts">{values.map(([v, text], i) => <label key={v}><input type={multi ? 'checkbox' : 'radio'} name={name} value={v} defaultChecked={!multi && i === 0} /><span>{text}</span></label>)}</div>;
  return <form className="quick" onSubmit={e => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const query = new URLSearchParams({reset: '1', state: 'CO'});
    for (const name of ['species', 'type', 'antler', 'method', 'season', 'chance', 'sort', 'from', 'to', 'dmode', 'trophy']) {
      const value = data.getAll(name).map(String).filter(Boolean).join(',');
      if (value) query.set(name, value);
    }
    if (range[0] > 0) query.set('minPts', String(range[0]));
    if (range[1] < 40) query.set('maxPts', String(range[1]));
    start(() => router.push('/hunts?' + query));
  }}>
    <h2>Quick Start</h2>
    <p className="small" style={{color: '#a9b0a7', margin: 0}}>Pick a few things. Refine everything else on the next page.</p>
    <p className="hint"><Link href="/account#hunting-preferences">Edit your residency and points in Account</Link></p>
    <label>Species</label>{opts('species', [['ELK', 'Elk'], ['DEER', 'Deer'], ['PRONGHORN', 'Pronghorn']])}
    <label>Hunt Type</label>{opts('type', [['CONTROLLED', 'Controlled Draw'], ['GENERAL', 'General / OTC'], ['', 'Either']])}
    <p className="hint">Colorado OTC white-tailed deer licenses are not currently included in these results. <a href="https://cpw.state.co.us/activities/hunting/nonresidents">Check eligibility and available licenses with CPW</a>.</p>
    <label>What Are You After?</label>{opts('antler', [['ANTLERED', 'A Buck Or Bull (Incl. Either-Sex Hunts)'], ['ANTLERLESS', 'Antlerless (Incl. Either-Sex Hunts)'], ['ALL', 'Any Animal (Incl. Does / Cows)']])}
    <label>Weapon (Select Any)</label>{opts('method', CO_METHODS, true)}
    <label>Season Type (Select Any)</label>{opts('season', CO_SEASONS, true)}
    <QuickSeasonDates />
    <QuickTrophyChoices />
    <label>Draw At My Points (Select Any)</label>{opts('chance', CHANCES, true)}
    <label>Points Needed (Last Draw)</label>
    <PointRangeSlider min={range[0]} max={range[1]} onCommit={(min, max) => setRange([min, max])} />
    <label>I Want</label>{opts('sort', [['odds', 'Best Chance To Get A Tag'], ['success', 'Highest Harvest Rate'], ['score', 'Best Overall Hunt (Quality)'], ['opp', 'Best Opportunity At My Points'], ['pts', 'Fewest Points Needed']])}
    <p className="hint">Leave weapon, season or draw chance unchecked to include any.</p>
    <p className="hint">On the results page, use Show Filters to fine-tune hunts by dates, land, odds and more.</p>
    <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Finding Hunts…' : 'Show Me Hunts'}</button>
  </form>;
}
