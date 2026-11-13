'use client';
import { useState } from 'react';
import { DateRange } from './FilterRail';
import { DAY_MIN, DAY_MAX, toMonthDay } from '@/lib/seasonDays';
import Link from 'next/link';
import { HomeStatePicker } from './HomeStatePicker';
import { STATES, type StateCode } from '@/lib/states';
import type { SpeciesKey } from '@/lib/species';

const SPECIES: [SpeciesKey, string][] = [['ELK', 'Elk'], ['DEER', 'Deer'], ['PRONGHORN', 'Pronghorn'], ['MOOSE', 'Moose'], ['BIGHORN', 'Bighorn sheep'], ['GOAT', 'Mountain goat'], ['BISON', 'Bison']];

export function QuickSeasonDates() {
  const [dates, setDates] = useState<{from: number; to: number; mode: 'open' | 'end'}>({ from: DAY_MIN, to: DAY_MAX, mode: 'open' });
  const active = dates.from !== DAY_MIN || dates.to !== DAY_MAX;
  return <><label>Season dates</label><DateRange {...dates} onCommit={(from, to, mode) => setDates({ from, to, mode })} />{active && <><input type="hidden" name="from" value={toMonthDay(dates.from)} /><input type="hidden" name="to" value={toMonthDay(dates.to)} />{dates.mode === 'end' && <input type="hidden" name="dmode" value="end" />}</>}</>;
}

export function SharedQuickStartForm({ states }: { states: StateCode[] }) {
  const [limits, setLimits] = useState({ minOdds: 0, minSuccess: 0, minAccessLand: 0, density: 0 });
  const densities = [0, 8, 5, 3, 2, 1.5, 1, 0.5, 0.25];
  const slider = (id: string, key: keyof typeof limits, label: string, max: number, step: number, display: string) => <div><label htmlFor={id}>{label}: {display}</label><input id={id} type="range" min="0" max={max} step={step} value={limits[key]} onChange={e => setLimits({ ...limits, [key]: Number(e.target.value) })} /></div>;
  const available = new Set(states.flatMap(state => STATES[state].species));
  return <form className="quick" action="/hunts" method="get">
    <input type="hidden" name="states" value={states.join(',')} /><input type="hidden" name="minScore" value="0" />
    <h2>Quick Start</h2><p className="small">Pick a few things. Refine your search on the next page.</p>
    <label htmlFor="multi-species">Species</label><select id="multi-species" name="species" defaultValue="ELK">{SPECIES.filter(([key]) => available.has(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
    <label htmlFor="multi-type">Hunt type</label><select id="multi-type" name="type"><option value="">Any</option><option value="CONTROLLED">Limited / controlled draw</option><option value="GENERAL">General season (draw or OTC)</option></select>
    <p className="hint">General does not always mean over the counter: nonresident general deer and elk tags can require a draw.{states.includes('UT') ? ' Utah general buck deer is drawn.' : ''}</p>
    <label htmlFor="multi-weapon">Weapon</label><select id="multi-weapon" name="weapon"><option value="">Any</option><option value="ANY">Any weapon / rifle</option><option value="ARCHERY">Archery</option><option value="MUZZLELOADER">Muzzleloader</option><option value="SHORT_RANGE">Short range</option></select>
    <label htmlFor="multi-antler">Antler class</label><select id="multi-antler" name="antler" defaultValue="ALL"><option value="ALL">Any</option><option value="ANTLERED">Antlered</option><option value="ANTLERLESS">Antlerless</option></select>
    <QuickSeasonDates />
    <label htmlFor="multi-sort">What matters most?</label><select id="multi-sort" name="sort"><option value="opp">Best overall opportunity</option><option value="score">Hunt quality</option><option value="odds">Draw odds</option><option value="success">Harvest rate</option><option value="public">Public land</option><option value="densityLow">Fewest hunters per square mile</option></select>
    <details><summary>Optional minimums and maximums</summary>
      {slider('multi-odds', 'minOdds', 'Minimum draw odds', 100, 1, limits.minOdds ? `${limits.minOdds}%` : 'Any')}
      {slider('multi-success', 'minSuccess', 'Minimum harvest rate', 100, 5, limits.minSuccess ? `${limits.minSuccess}%` : 'Any')}
      {slider('multi-public', 'minAccessLand', 'Minimum public and accessible land', 100, 5, limits.minAccessLand ? `${limits.minAccessLand}%` : 'Any')}
      <p className="hint">Includes Idaho Access Yes! and Montana Type 1 Block Management where data is available. Other states use available public-land data. Access rules still apply.</p>
      {slider('multi-density', 'density', 'Maximum hunters per square mile', 8, 1, limits.density ? String(densities[limits.density]) : 'Any')}
      {limits.minOdds > 0 && <input type="hidden" name="minOdds" value={limits.minOdds} />}
      {limits.minSuccess > 0 && <input type="hidden" name="minSuccess" value={limits.minSuccess} />}
      {limits.minAccessLand > 0 && <input type="hidden" name="minAccessLand" value={limits.minAccessLand} />}
      {limits.density > 0 && <input type="hidden" name="maxDensity" value={densities[limits.density]} />}
    </details><p className="hint">Odds and other measures depend on each state’s data and your hunting preferences. Missing data is shown as unavailable.</p>
    <p className="hint">On the results page, use Show Filters to fine-tune hunts by dates, land, odds and more.</p>
    <button className="btn primary" type="submit">Show hunts in selected states</button>
  </form>;
}

export function MultiQuickStart({ states }: { states: StateCode[] }) {
  return <main><section className="home-hero"><div className="inner"><div>
    <h1>Find Your <HomeStatePicker key={states.join(",")} selected={states} /> Hunt. <em>Know Your Odds.</em></h1>
    <p className="small">Tap the state name above to search one state or several.</p>
    <p>Compare hunts across states using draw odds, harvest rates, public land and hunter density.</p>
    <p>Each state has its own draw rules. Set your residency and points in your <Link href="/account#hunting-preferences">hunting preferences</Link> or on the results page.</p>
    {states.length === 1 && states[0] === 'UT' && <><p>General buck deer is a preference-point draw; general bull elk can be sold over the counter. Limited-entry hunts use a separate bonus-point draw. Eligibility and fees differ.</p><p><Link href="/guide">How the Utah draw works and what it costs</Link> · <Link href="/map">Explore the unit map</Link></p></>}
    {states.length === 1 && states[0] === 'WY' && <><p>Nonresidents select a regular or higher-priced special draw, each with its own quota. General deer requires a regional draw for nonresidents. Past results and projections are not guarantees.</p><p><Link href="/guide">How the Wyoming draw works</Link> · <a href="https://wgfd.wyo.gov/licenses-applications/license-fee-list">WGFD license fees</a> · <Link href="/map">Explore the unit map</Link></p></>}
  </div><SharedQuickStartForm states={states} /></div></section></main>;
}
