import {trophyV2Shadow,type TrophyV2Input,type TrophyV2Tier} from './trophyV2Shadow';
type CountyTier=1|2|3|4;
const tier=(n:number):TrophyV2Tier=>n>=85?'Elite':n>=70?'Excellent':n>=55?'Good':'Standard';

/** Compare both reported county bases without choosing whichever gives a preferred rating. */
/** No score floor: an earlier version floored Utah limited-entry hunts at the supplied CSV's
 * own tier, which fed the answer back in as an input (139 of 446 scored rows sat on it). */
export function countyScenarios(input:Omit<TrophyV2Input,'countyTier'>,countyTiers:CountyTier[]) {
  if(!countyTiers.length)return null;
  const values=[...new Set(countyTiers)].map(countyTier=>{
    const result=trophyV2Shadow({...input,countyTier});
    if(!result)return null;
    const score=result.score;
    return {countyTier,score,tier:tier(score)};
  });
  if(values.some(v=>v===null))return null;
  const scenarios=values as {countyTier:CountyTier;score:number;tier:TrophyV2Tier}[];
  return {scenarios,scoreStable:new Set(scenarios.map(v=>v.score)).size===1,tierStable:new Set(scenarios.map(v=>v.tier)).size===1};
}
