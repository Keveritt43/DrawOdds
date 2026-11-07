import type { HuntSummary } from '@prisma/client';
import Link from 'next/link';
import { CoLand } from '@/components/CoLand';
import { CoSpecialReports } from '@/components/CoSpecialReports';
import { CompareToggle } from '@/components/Compare';
import { ScoreRow } from '@/components/HuntCards';
import { FindHuntsLink, HuntLink } from '@/components/HuntNavigation';
import { Star } from '@/components/Star';
import { getFavorites } from '@/lib/favorites';
import { getPoints } from '@/lib/points';
import { CO_POOLS, POOL_LABEL, poolFor } from '@/lib/coHunt';
import { SPECIAL_LABEL, SPECIAL_REPORTS, specialCounts, specialOdds, specialBrochure, type SpecialHunt } from '@/lib/coSpecial';
import { withCoOpportunity } from '@/lib/coScores';
import { antlerLabel, int, pct, pctOdds } from '@/lib/format';
import { seasonDates, seasonTitle } from '@/lib/tagSeasons';
import { unitKey } from '@/lib/states';

export async function CoSpecialHuntPage({ s, hunt }: { s: HuntSummary; hunt: SpecialHunt }) {
  const [settings, fav] = await Promise.all([getPoints('CO'), getFavorites()]);
  const nr = settings.res === 'NONRESIDENT';
  const pool = poolFor(nr, settings.youth);
  const latest = hunt.draws[0];
  const odds = specialOdds(hunt, nr, settings.youth);
  const all = SPECIAL_REPORTS.filter(r => r.species === hunt.species);
  return <main className="wrap co-hunt" style={{ margin: '20px auto 48px' }}>
    <p className="small"><FindHuntsLink fallback={`/hunts?states=CO&draw=msg&species=${s.species}`}>← Back To Filtering</FindHuntsLink> · <Link href={`/hunts?states=CO,ID&draw=msg&species=${s.species}`}>Search this species in Idaho and Colorado</Link></p>
    <h1 className="star-head">{s.name} <Star kind="hunt" id={s.huntId} saved={fav.hunts.has(s.huntId)} signedIn={fav.signedIn} label /></h1>
    <p>Hunt code <b>{s.tagCode}</b> · {SPECIAL_LABEL[hunt.species]} · {antlerLabel(s.species, s.antlerClass)} · {s.takeMethod}</p>
    <CompareToggle id={s.id} label={s.name} />
    <ScoreRow r={withCoOpportunity(s, odds, nr)} nr={nr} open />
    <h2>Season And Units</h2>
    <p><b>Units: </b>{hunt.units.map((u, i) => <span key={u}>{i > 0 && ', '}<HuntLink href={`/units/${unitKey('CO',u)}`}>{u}</HuntLink></span>)}</p>
    {hunt.seasons.length ? <ul>{hunt.seasons.map((season, i) => <li key={i}>{seasonTitle(season)} · {seasonDates(season)} ({season.dates[0].open.slice(0,4)} season)</li>)}</ul> : <p>See the CPW brochure for season dates and eligibility.</p>}
    <p className="small muted">{hunt.notes} <a href={specialBrochure(hunt.species)}>CPW hunting brochure</a></p>
    <h2>Historical Primary Draw</h2>
    <p><b>{pctOdds(odds)}</b> · {latest.year} first-choice draw rate · {POOL_LABEL[pool]}.
      {hunt.species === 'DESERT' ? ' CPW runs a random draw for desert bighorn sheep. Preference points do not apply.'
        : ' CPW uses weighted preference points. The rate pools applicants across point levels and does not predict your personal odds.'}
    </p>
    {latest.shared && <p>CPW reports one applicant pool for {latest.shared.join(', ')}. The application counts and rates describe that pool; licenses issued are for this code.</p>}
    <div className="htable-wrap"><table>
      <thead><tr><th>Draw</th><th>{latest.shared ? 'Pool quota' : 'Quota'}</th><th>Licenses issued</th>{CO_POOLS.map(p => <th key={p}>{POOL_LABEL[p]}<br />Drawn / applied</th>)}<th>Source</th></tr></thead>
      <tbody>{hunt.draws.map(draw => {
        const source = all.find(r => r.year === draw.year && r.kind === 'draw');
        const cutoff = all.find(r => r.year === draw.year && r.kind === 'drawn-out');
        return <tr key={draw.year}><td>{draw.year}{draw.shared ? ' (shared pool)' : ''}</td><td>{int(draw.quota)}</td><td>{int(draw.issued)}</td>
          {CO_POOLS.map((p,i) => { const {apps,drew} = specialCounts(draw, i%2===1, i>=2); return <td key={p}>{apps ? `${int(drew)} / ${int(apps)} (${pctOdds(drew/apps)})` : '—'}</td>; })}
          <td>{source && <a href={source.url}>Draw Recap</a>}{source && cutoff && ' · '}{cutoff && <a href={cutoff.url}>Drawn Out At</a>}</td>
        </tr>;
      })}</tbody>
    </table></div>
    <h2>Hunter Success</h2>
    {hunt.harvest.length ? <div className="htable-wrap"><table><thead><tr><th>Year</th><th>Hunters</th><th>Harvest</th><th>Success</th><th>Source</th></tr></thead><tbody>{hunt.harvest.map(h => {
      const source = all.find(r => r.year === h.year && r.kind === 'harvest');
      return <tr key={h.year}><td>{h.year}</td><td>{int(h.hunters)}</td><td>{int(h.harvest)}</td><td>{h.hunters ? pct(h.harvest / h.hunters, 1) : '—'}</td><td>{source && <a href={source.url}>CPW harvest</a>}</td></tr>;
    })}</tbody></table></div> : <p>No hunt-code harvest estimate is published for this hunt in the loaded reports.</p>}
    <p className="small muted">Older harvest reports group hunts by unit and may combine seasons or methods. They are linked below.</p>
    <h2>Population Estimates</h2>
    {hunt.population.length ? <ul>{hunt.population.map(p => <li key={p.unit}>{p.year} · {p.name ?? p.unit} · {int(p.estimate)} estimated{p.ratio !== undefined ? ` · ${p.ratio} bulls per 100 cows` : ''}</li>)}</ul>
      : <p>No matching population estimate is loaded. See CPW’s reports below.</p>}
    <CoLand units={hunt.units} />
    <h2>CPW Source Reports</h2>
    <CoSpecialReports species={hunt.species} />
  </main>;
}
