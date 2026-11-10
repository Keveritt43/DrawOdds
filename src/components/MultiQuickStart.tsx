import Link from 'next/link';
import { HomeStatePicker } from './HomeStatePicker';
import type { StateCode } from '@/lib/states';

export function MultiQuickStart({ states }: { states: StateCode[] }) {
  return <main><section className="home-hero"><div className="inner"><div>
    <h1>Find Your <HomeStatePicker key={states.join(",")} selected={states} /> Hunt. <em>Know Your Odds.</em></h1>
    <p className="small">Tap the state name above to search one state or several.</p>
    <p>Compare hunts across states using draw odds, harvest rates, public land and hunter density.</p>
    <p>Each state has its own draw rules. Set your residency and points in your <Link href="/account#hunting-preferences">hunting preferences</Link> or on the results page.</p>
  </div><form className="quick" action="/hunts" method="get">
    <input type="hidden" name="states" value={states.join(',')} /><input type="hidden" name="minScore" value="0" />
    <h2>Quick Start</h2><p className="small">Pick a few things. Refine your search on the next page.</p>
    <label htmlFor="multi-species">Species</label><select id="multi-species" name="species" defaultValue="ELK"><option value="ELK">Elk</option><option value="DEER">Deer</option><option value="PRONGHORN">Pronghorn</option><option value="MOOSE">Moose</option><option value="BIGHORN">Bighorn sheep</option><option value="GOAT">Mountain goat</option></select>
    <label htmlFor="multi-type">Hunt type</label><select id="multi-type" name="type"><option value="">Any</option><option value="CONTROLLED">Controlled draw</option><option value="GENERAL">General / OTC</option></select>
    <label htmlFor="multi-weapon">Weapon</label><select id="multi-weapon" name="weapon"><option value="">Any</option><option value="ANY">Any weapon / rifle</option><option value="ARCHERY">Archery</option><option value="MUZZLELOADER">Muzzleloader</option><option value="SHORT_RANGE">Short range</option></select>
    <label htmlFor="multi-sort">What matters most?</label><select id="multi-sort" name="sort"><option value="opp">Best overall opportunity</option><option value="odds">Draw odds</option><option value="success">Harvest rate</option><option value="public">Public land</option><option value="densityLow">Fewest hunters per square mile</option></select>
    <details><summary>Optional minimums and maximums</summary><label htmlFor="multi-odds">Minimum draw odds (%)</label><input id="multi-odds" name="minOdds" type="number" min="0" max="100" /><label htmlFor="multi-success">Minimum harvest rate (%)</label><input id="multi-success" name="minSuccess" type="number" min="0" max="100" /><label htmlFor="multi-public">Minimum public land (%)</label><input id="multi-public" name="minPublic" type="number" min="0" max="100" /><label htmlFor="multi-density">Maximum hunters per square mile</label><input id="multi-density" name="maxDensity" type="number" min="0" max="100" step="0.1" /></details><p className="hint">Odds and other measures depend on each state’s data and your hunting preferences. Missing data is shown as unavailable.</p>
    <button className="btn primary" type="submit">Show hunts in selected states</button>
  </form></div></section></main>;
}
