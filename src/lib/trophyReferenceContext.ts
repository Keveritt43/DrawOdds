import reference from '../../data/trophy-v5-reference-context.json';
import {resolveTrophyCandidate} from './trophyCandidateResolver';

type Hunt={state:string;species:string;units?:string[];deerType?:string|null};
type RecordValue={tier:string;subspecies:string;status:string};
const records=reference.records as Record<string,RecordValue>;
const tiers=new Set(['Standard','Good','Excellent','Elite']);

/** Supplied unit-list tier as context only; it is not a genetic measurement or a hunt score. */
export function trophyReferenceContext(h:Hunt):{tier:string;description:string}|null {
  if(!h.units?.length || !['DEER','ELK','PRONGHORN'].includes(h.species))return null;
  const values:string[]=[];
  for(const unit of h.units){
    const ids=resolveTrophyCandidate({state:h.state,species:h.species,unit,deerType:h.deerType}).sourceIds;
    const matches=ids.map(id=>records[id]).filter((r):r is RecordValue=>!!r && r.status==='Active');
    if(!matches.length || matches.length!==ids.length || new Set(matches.map(r=>r.subspecies)).size!==1)return null;
    const unique=[...new Set(matches.map(r=>r.tier))];
    if(unique.length!==1 || !tiers.has(unique[0]))return null;
    values.push(unique[0]);
  }
  const distinct=[...new Set(values)];
  if(distinct.length!==1)return null;
  return {tier:distinct[0],description:'Supplied v5 reference tier for the associated unit or management area. This is unverified context, not a genetic measurement, hunt-specific rating or guarantee of animal size.'};
}
