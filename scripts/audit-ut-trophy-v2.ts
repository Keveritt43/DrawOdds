/** Offline shadow audit. No database access, writes, source fetches or live-score changes.
 * Run: node --import tsx scripts/audit-ut-trophy-v2.ts out/ut-v2-shadow.json
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import hunts from '../data/ut/hunts.json';
import source from '../data/trophy-source-western-v4.json';
import crosswalk from '../data/ut/trophy-crosswalk-review.json';
import {resolveTrophyCandidate} from '../src/lib/trophyCandidateResolver';
import {trophyForHunt} from '../src/lib/trophyHunt';
import {withUtSeasonCorrections} from '../src/lib/utSeasonCorrections';
import {countyScenarios} from '../src/lib/trophyV2CountyScenarios';
import {utV2ShadowTiming} from '../src/lib/trophyV2UtShadow';
import {demandRatioPercentile,type DemandRow} from '../src/lib/trophyV2DemandRatio';

const out=process.argv[2];if(!out)throw new Error('Provide an output path');
const digest=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const jsonDigest=(path:string)=>createHash('sha256').update(readFileSync(path,'utf8').replace(/\r\n/g,'\n')).digest('hex');
if(jsonDigest('data/ut/hunts.json')!==crosswalk.huntsSha256||jsonDigest('data/trophy-ut-wmu-crosswalk.json')!==crosswalk.geometrySha256||digest('data/ut/trophy-hunt-unit-crosswalk.csv')!==crosswalk.sha256)
  throw new Error('Crosswalk review is stale; regenerate it before auditing');
const byId=new Map(source.records.map(x=>[x.id,x]));
const byCode=new Map(crosswalk.hunts.map(x=>[x.code,x]));
const results:Record<string,unknown>[]=[];
type Season={uncertain?:boolean;weapon:string;dates:{open:string;close:string}[]};
const seasonsOf=(h:{tagSeasons?:unknown})=>(h.tagSeasons as {seasons?:Season[]}|null)?.seasons??[];
// Applicants per permit by pool, from the same retained snapshot (one row per hunt and pool).
const demandRows:DemandRow[]=hunts.hunts.flatMap(raw=>{
  const h=withUtSeasonCorrections(raw),s=seasonsOf(h);
  const pools=(h.pointOdds as {pools?:Record<string,{quota?:number}>}|null)?.pools??{};
  if(typeof h.oddsLastYear!=='number'||!h.tagCode||s.length!==1)return [];
  return (['Resident','Nonresident'] as const).map(pool=>({code:h.tagCode!,species:h.species,year:h.oddsLastYear!,category:h.huntCategory??'',weapon:s[0].weapon,pool,
    applications:(pool==='Resident'?h.resAppsLast:h.nrAppsLast)??null,permits:pools[pool==='Resident'?'res':'nr']?.quota??null}));
});
for(const raw of hunts.hunts){
  const h=withUtSeasonCorrections(raw);
  for(const pool of ['Resident','Nonresident'] as const){
    const base={code:h.tagCode,name:h.name,species:h.species,pool,units:h.units};
    const skip=(reason:string)=>results.push({...base,status:'unscored',reason});
    if(!['DEER','ELK','PRONGHORN'].includes(h.species)||!['ANTLERED','EITHER'].includes(h.antlerClass)){skip('not an eligible antlered hunt');continue;}
    if(h.units.length!==1){skip('multi-unit aggregation is undefined');continue;}
    const link=byCode.get(h.tagCode);
    if(link?.status!=='agrees with geographic association'){skip(`supplied crosswalk: ${link?.status??'unreviewed'}`);continue;}
    const candidate=resolveTrophyCandidate({state:'UT',species:h.species,unit:h.units[0],deerType:(h as {deerType?:string|null}).deerType});
    const refs=candidate.sourceIds.map(id=>byId.get(id)).filter((v):v is NonNullable<typeof v>=>!!v);
    if(refs.length!==1||refs[0].activeStatus!=='Active'){skip('unit reference absent, ambiguous or inactive');continue;}
    const ref=refs[0];
    if(ref.overallPast10Tier===null||ref.statePast10Tier===null){skip('county tier missing');continue;}
    const seasons=seasonsOf(h);
    if(seasons.length!==1||seasons[0].uncertain||seasons[0].dates.length!==1){skip('multiple, missing or uncertain season segments');continue;}
    const season=seasons[0], span=season.dates[0];
    const target=demandRows.find(r=>r.code===h.tagCode&&r.pool===pool);
    if(!target||!target.permits){skip('no permits in this pool');continue;}
    const demand=demandRatioPercentile(demandRows,target);
    if(!demand){skip('fewer than 10 comparable hunts for applicants per permit');continue;}
    const timing=utV2ShadowTiming(h.species,season.weapon,span.open,span.close);
    if(timing===null){skip('timing rubric does not cover this exact segment');continue;}
    const named=ref.sourceTags.filter(t=>!['bc','bc_top_counties'].includes(t.toLowerCase())).length;
    const input={namedSources:named,independentNamedSources:0,verifiedAgencyAntlerOrAge:false,countyEvidenceKnown:true,
      boundaryVerified:false,rawDemandPercentile:demand.allWeapon?null:demand.percentile,peerCount:demand.allWeapon?0:demand.peers,
      allWeaponPercentile:demand.allWeapon?demand.percentile:null,timingPoints:timing,harvestPoints:null};
    const compared=countyScenarios(input,[ref.overallPast10Tier as 1|2|3|4,ref.statePast10Tier as 1|2|3|4]);
    if(!compared){skip('score inputs failed validation');continue;}
    results.push({...base,status:compared.scoreStable?'shadow score':'county basis scenarios',cohort:`${h.huntCategory} / ${demand.allWeapon?'all weapons':season.weapon} / ${pool}`,applicantsPerPermit:Math.round(demand.ratio*100)/100,peers:demand.peers,allWeapon:demand.allWeapon,previousTier:trophyForHunt(h),
      overallCountyTier:ref.overallPast10Tier,stateCountyTier:ref.statePast10Tier,referenceIds:candidate.sourceIds,timing,
      score:compared.scoreStable?compared.scenarios[0].score:null,tier:compared.tierStable?compared.scenarios[0].tier:null,scenarios:compared.scenarios});
  }
}
const counts=results.reduce<Record<string,number>>((a,r)=>{const k=String(r.status==='unscored'?r.reason:r.status);a[k]=(a[k]??0)+1;return a},{});
writeFileSync(out,JSON.stringify({notice:'Offline shadow scores and county-basis scenarios, not validated v2 ratings. Demand is applicants per permit in the same pool. Timing is the best rubric window the season actually overlaps. No score floor. Assumes no verified agency age evidence and no independently verified sources; harvest is unknown and uses the guide neutral value of five points. No private-land penalty or weapon offset. Utah only; retained 2026 source snapshot, not production.',counts,results},null,2)+'\n');
console.log(JSON.stringify({rows:results.length,counts}));
