/** WGFD 2025 and 2026 Chapter 7 section 6 list the same nonresident general areas.
 * Table 5 of the 2025 elk survey counts the unique active region licenses directly.
 * Each holder may have only one general/full-price type 0/1/2/9 elk license.
 */
const areas:Record<string,number[]> = {
  E:[2,3,6,116,126,129],
  S:[9,10,12,13,15,21,105,106,107,110,130],
  W:[28,36,37,56,59,60,66,67,68,69,70,71,73,77,78,80,81,82,83,84,85,86,87,89,90,91,92,94,96,97,98,102,103,104,127,128],
};
const survey:Record<string,[number,number,number]> = {E:[962,719,5263], S:[1083,511,8370], W:[2772,1506,19362]};
type Row = {state:string;species:string;tagCode:string|null;units:string[];pointOdds:unknown};
export function withWyElkRegion<T extends Row>(r:T):T {
  const match = r.state==='WY' && r.species==='ELK' ? /^ER-([ESW])$/.exec(r.tagCode??'') : null;
  if(!match) return r;
  const region=match[1], [hunters,harvest,days]=survey[region];
  const po=(r.pointOdds??{}) as Record<string,unknown>;
  return {...r,units:areas[region].map(n=>`E${n}`),unit:null,acres:null,publicPct:null,privatePct:null,huntablePct:null,accessYesPct:null,
    hunters5:hunters,harvest5:harvest,harvestYears:1,harvestLastYear:2025,success5:harvest/hunters,successLast:harvest/hunters,
    huntersSqMi:null,daysPerHunter5:days/hunters,daysPerHarvest5:days/harvest,smallSample:false,resTagAndFill:null,nrTagAndFill:null,
    scoreQuality:null,scoreSuccess:null,scoreAccess:null,scoreCrowd:null,scoreOppRes:null,scoreOppNr:null,
    pointOdds:{...po,land:null,harvestPriorRegionAudit:po.harvestPriorRegionAudit??po.harvest,
      harvest:[{year:2025,hunters,harvest,days}],harvestBasis:'WGFD 2025 nonresident region license survey',verifiedRegionHarvest:true,
      harvestBoundaryNote:'The 2025 and 2026 regulations list the same eligible areas for this region; WGFD reports the 2025 nonresident region results directly.'}} as T;
}
