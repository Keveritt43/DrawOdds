import {trophyV2Shadow,type TrophyV2Input,type TrophyV2Tier} from './trophyV2Shadow';
type CountyTier=1|2|3|4;
const tier=(n:number):TrophyV2Tier=>n>=85?'Elite':n>=70?'Excellent':n>=55?'Good':'Standard';

/** Compare both reported county bases without choosing whichever gives a preferred rating. */
export function countyScenarios(input:Omit<TrophyV2Input,'countyTier'>,countyTiers:CountyTier[],floor:number) {
  if(!countyTiers.length||!Number.isFinite(floor)||floor<0||floor>100)return null;
  const values=[...new Set(countyTiers)].map(countyTier=>{
    const result=trophyV2Shadow({...input,countyTier});
    if(!result)return null;
    const score=Math.max(result.score,floor);
    return {countyTier,score,tier:tier(score)};
  });
  if(values.some(v=>v===null))return null;
  const scenarios=values as {countyTier:CountyTier;score:number;tier:TrophyV2Tier}[];
  return {scenarios,scoreStable:new Set(scenarios.map(v=>v.score)).size===1,tierStable:new Set(scenarios.map(v=>v.tier)).size===1};
}
