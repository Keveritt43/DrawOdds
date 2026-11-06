import type { CoScored } from '@/lib/coScores';
import { int, density } from '@/lib/format';
/** Makes both the extra pressure and the policy penalty visible beside the score. */
export function CoPressureNote({r}:{r:CoScored}) {
  const p=r.coPressure;
  if(!p || p.status==='none') return null;
  if(p.status==='unknown') return <p className="small muted">General elk overlap cannot be assessed without verified season dates. Density currently describes deer hunters only.</p>;
  if(p.status==='missing') return <p className="small muted">General/OTC elk overlaps this deer hunt, but unit-season elk pressure is missing or ambiguous. Combined density and Quality are unavailable rather than treating elk hunters as zero.</p>;
  return <p className="small muted">Elbow room includes {int(p.deerHuntersPerYear)} deer + {int(p.elkHuntersPerYear)} elk hunter-seasons/year ({density(p.density)}/mi²). Confirmed general/OTC elk overlap applies an additional <b>25% Quality reduction</b> after crowding. Elk counts are unit-season estimates for all elk licenses, a pressure proxy; OTC-only hunters and unique people are not reported separately. Harvest success still describes deer only.</p>;
}
export function CoPressureEvidence({r}:{r:CoScored}) {
 const p=r.coPressure;
 if(!p || !p.evidence.length) return null;
 return <section><h2>Overlapping Elk Pressure In The Score</h2><div className="htable-wrap"><table><thead><tr><th>Shared unit</th><th>Elk season</th><th>Average elk hunter-seasons/yr</th><th>Survey years</th><th>Evidence</th></tr></thead><tbody>{p.evidence.map(e=><tr key={e.unit+e.season}><td>{e.unit}</td><td>{{rifle1:'1st Rifle',rifle2:'2nd Rifle',rifle3:'3rd Rifle',rifle4:'4th Rifle',archery:'Archery',muzzle:'Muzzleloader'}[e.season]}</td><td>{int(e.huntersPerYear)}</td><td>{e.years.join(', ') || 'Unavailable'}</td><td>{e.sources.map((url,i)=><a key={url} href={url}>CPW report {i+1}{' '}</a>)}</td></tr>)}</tbody></table></div><p className="small muted">Each unit/season/year is counted once across overlapping general elk hunt codes. Up to five latest report years are averaged per unit and season. These are elk hunting participations, not a count of unique individuals; the same person can hunt more than one species or season.</p></section>;
}
