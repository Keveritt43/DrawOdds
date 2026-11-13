import Link from 'next/link';
import { HomeStatePicker } from './HomeStatePicker';
import { STATES, type StateCode } from '@/lib/states';
import type { SpeciesKey } from '@/lib/species';

const SPECIES: [SpeciesKey, string][] = [['ELK', 'Elk'], ['DEER', 'Deer'], ['PRONGHORN', 'Pronghorn'], ['MOOSE', 'Moose'], ['BIGHORN', 'Bighorn sheep'], ['GOAT', 'Mountain goat'], ['BISON', 'Bison']];

export function SharedQuickStartForm({ states }: { states: StateCode[] }) {
  const available = new Set(states.flatMap(state => STATES[state].species));
  return <form className="quick" action="/hunts" method="get">
    <input type="hidden" name="states" value={states.join(',')} /><input type="hidden" name="minScore" value="0" />
    <h2>Quick Start</h2><p className="small">Pick a few things. Refine your search on the next page.</p>
    <label htmlFor="multi-species">Species</label><select id="multi-species" name="species" defaultValue="ELK">{SPECIES.filter(([key]) => available.has(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
    <label htmlFor="multi-type">Hunt type</label><select id="multi-type" name="type"><option value="">Any</option><option value="CONTROLLED">Limited / controlled draw</option><option value="GENERAL">General season (draw or OTC)</option></select>
    <p className="hint">General does not always mean over the counter: nonresident general deer and elk tags can require a draw. Utah general buck deer is drawn.</p>
    <label htmlFor="multi-weapon">Weapon</label><select id="multi-weapon" name="weapon"><option value="">Any</option><option value="ANY">Any weapon / rifle</option><option value="ARCHERY">Archery</option><option value="MUZZLELOADER">Muzzleloader</option><option value="SHORT_RANGE">Short range</option></select>
    <label htmlFor="multi-sort">What matters most?</label><select id="multi-sort" name="sort"><option value="opp">Best overall opportunity</option><option value="score">Hunt quality</option><option value="odds">Draw odds</option><option value="success">Harvest rate</option><option value="public">Public land</option><option value="densityLow">Fewest hunters per square mile</option></select>
    <details><summary>Optional minimums and maximums</summary><label htmlFor="multi-odds">Minimum draw odds (%)</label><input id="multi-odds" name="minOdds" type="number" min="0" max="100" /><label htmlFor="multi-success">Minimum harvest rate (%)</label><input id="multi-success" name="minSuccess" type="number" min="0" max="100" /><label htmlFor="multi-public">Minimum public land (%)</label><input id="multi-public" name="minPublic" type="number" min="0" max="100" /><label htmlFor="multi-density">Maximum hunters per square mile</label><input id="multi-density" name="maxDensity" type="number" min="0" max="100" step="0.1" /></details><p className="hint">Odds and other measures depend on each state’s data and your hunting preferences. Missing data is shown as unavailable.</p>
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
