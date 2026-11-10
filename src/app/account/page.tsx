import Link from 'next/link';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { huntHref } from '@/lib/huntSlug';
import { getFavorites } from '@/lib/favorites';
import { getResidency } from '@/lib/residency';
import { getPointsStore, readState } from '@/lib/points';
import { parseUnitKey, unitKey, enabledStates } from '@/lib/states';
import { readPresets } from '@/lib/filterPresets';
import { evaluateHunt } from '@/lib/multiStateSearch';
import { withCoScores } from '@/lib/coScores';
import { getCoScoringContext } from '@/lib/coScoringContext';
import { pct, pctOdds, pct100, density } from '@/lib/format';
import { seasonsSummary } from '@/lib/tagSeasons';
import { doSignOut } from '@/app/actions';
import { HuntingPreferences } from '@/components/HuntingPreferences';
import { AccountPresets } from '@/components/AccountPresets';
import { Star } from '@/components/Star';
import { MyApplications } from '@/components/MyApplications';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Account' };

export default async function Account() {
  const [session, {residency}, {store}, fav] = await Promise.all([auth(),getResidency(undefined,'ID'),getPointsStore(),getFavorites()]);
  const colorado=readState(store,'CO'), wyoming=readState(store,'WY'), presets=readPresets(store);
  const savedRefs=[...fav.units].map(parseUnitKey);
  const [units,hunts,apps]=await Promise.all([
    savedRefs.length?db.unit.findMany({where:{OR:savedRefs},select:{state:true,name:true,elkZone:true,publicPct:true}}):[],
    fav.hunts.size?db.hunt.findMany({where:{idfgId:{in:[...fav.hunts]}},include:{summaries:true},orderBy:{name:'asc'}}):[],
    session?.user?db.application.findMany({where:{userId:session.user.id},orderBy:[{year:'desc'},{createdAt:'desc'}]}):[],
  ]);
  const context=hunts.some(h=>h.state==='CO')?await getCoScoringContext():undefined;
  const settings={ID:residency,CO:colorado,WY:wyoming};
  return <main className="wrap account-page" style={{margin:'24px auto 48px',maxWidth:1000}}>
    <h1>Your account</h1>
    <p className="muted">{session?.user?.email ?? 'Testing without sign-in: preferences and favorite hunts/units are saved in this browser; named filters are saved on this device.'}</p>
    <nav className="account-links" aria-label="Account sections">
      <Link href="#hunting-preferences">Hunting Preferences</Link>
      {enabledStates().map(state=><Link key={state.code} href={'#saved-'+state.code.toLowerCase()}>{state.name} Saved Items</Link>)}
    </nav>
    <HuntingPreferences idaho={residency} colorado={colorado} wyoming={wyoming}/>
    <section id="saved-items">
      <h2>Saved Filters, Units &amp; Hunts</h2>
      <p className="small muted">Organized by state. A search spanning both states appears under each state.</p>
      {enabledStates().map(state=>{
        const stateUnits=units.filter(u=>u.state===state.code).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
        const stateHunts=hunts.filter(h=>h.state===state.code);
        const compareIds=stateHunts.flatMap(h=>h.summaries[0]?[h.summaries[0].id]:[]).slice(0,4);
        return <section className="card account-state" id={'saved-'+state.code.toLowerCase()} key={state.code}>
          <h2>{state.name}</h2>
          <p className="small"><Link href={'/hunts?states='+state.code}>Find {state.name} Hunts</Link> · <a href={'/api/state?code='+state.code+'&next=%2Fmap'}>{state.name} Unit Map</a></p>
          <h3>Saved Filters</h3>
          <AccountPresets state={state.code} owner={fav.userId} initial={presets}/>
          <h3>Favorite Units</h3>
          {!stateUnits.length&&<p className="small muted">No favorite units yet. Tap the ☆ on a unit page or map.</p>}
          <div className="account-unit-list">{stateUnits.map(u=>{
            const key=unitKey(u.state,u.name),draw=/^[SG]/.test(u.name)?'&draw=msg':'';
            return <div key={key} className="account-unit"><Star kind="unit" id={key} saved signedIn={fav.signedIn}/>
              <Link href={'/units/'+encodeURIComponent(key)}><b>Unit {u.name}</b></Link>
              <span className="small muted">{u.elkZone?u.elkZone+' · ':''}{pct100(u.publicPct)} public</span>
              <Link className="small" href={'/hunts?states='+u.state+'&unit='+encodeURIComponent(u.state+':'+u.name)+draw}>Hunts in this unit</Link>
            </div>;
          })}</div>
          <h3>Favorite Hunts</h3>
          {!stateHunts.length&&<p className="small muted">No favorite hunts yet. Tap the ☆ next to a hunt.</p>}
          {compareIds.length>1&&<p><Link href={'/compare?ids='+compareIds.map(encodeURIComponent).join(',')}>Compare saved {state.name} hunts</Link><span className="small muted"> (up to four)</span></p>}
          {stateHunts.length>0&&<div className="htable-wrap"><table className="results compare">
            <thead><tr><th>Hunt</th><th>Season</th><th>Your odds</th><th>Success</th><th>Hunters/mi²</th><th>Draw and fill</th></tr></thead>
            <tbody>{stateHunts.map(h=>{
              const raw=h.summaries[0];
              const result=raw?evaluateHunt(raw.state==='CO'?withCoScores(raw,context):raw,settings,'proj'):null;
              return <tr key={h.idfgId}><td><div className="star-head"><Star kind="hunt" id={h.idfgId} saved signedIn={fav.signedIn}/>{raw?<Link href={huntHref(raw)}>{raw.name}</Link>:h.name}</div>
                {result&&<p className="small muted">{result.basis}</p>}</td>
                <td>{raw?seasonsSummary(raw.tagSeasons,2):'Not offered this season'}</td>
                <td>{pctOdds(result?.odds??null)}</td><td>{pct(raw?.success5??null)}</td><td>{density(raw?.huntersSqMi??null)}</td>
                <td>{pct(result?.odds!=null&&raw?.success5!=null?result.odds*raw.success5:null)}</td></tr>;
            })}</tbody>
          </table></div>}
        </section>;
      })}
    </section>
    {session?.user?<><MyApplications apps={apps}/><p className="small"><Link href="/planner">Plan this year&apos;s applications →</Link> · <a href="/api/calendar">Deadlines to your calendar</a></p><form action={doSignOut}><button className="btn" type="submit">Sign out</button></form></>:
      <p className="small muted">Application history requires sign-in.{process.env.AUTH_RESEND_KEY&&<> <Link href="/login">Sign in</Link></>}</p>}
  </main>;
}
