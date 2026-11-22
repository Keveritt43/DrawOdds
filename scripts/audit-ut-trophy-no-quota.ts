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
import {utV2ShadowTiming} from '../src/lib/trophyNoQuotaTiming';

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
    if(!seasons.length||seasons.some(s=>s.uncertain||!s.dates.length)){skip('missing or uncertain season segments');continue;}
    const timings=seasons.flatMap(s=>s.dates.map(span=>utV2ShadowTiming(h.species,s.weapon,span.open,span.close)));
    if(timings.some(t=>t===null)){skip('timing rubric does not cover an exact segment');continue;}
    const timing=Math.max(...timings as number[]);
    const named=ref.sourceTags.filter(t=>!['bc','bc_top_counties'].includes(t.toLowerCase())).length;
    const input={namedSources:named,independentNamedSources:0,verifiedAgencyAntlerOrAge:false,countyEvidenceKnown:true,
      boundaryVerified:false,rawDemandPercentile:null,peerCount:0,
      allWeaponPercentile:0.5,timingPoints:timing,harvestPoints:null};
    const compared=countyScenarios(input,[ref.overallPast10Tier as 1|2|3|4,ref.statePast10Tier as 1|2|3|4]);
    if(!compared){skip('score inputs failed validation');continue;}
    results.push({...base,status:compared.scoreStable?'shadow score':'county basis scenarios',demandNeutral:true,previousTier:trophyForHunt(h),
      overallCountyTier:ref.overallPast10Tier,stateCountyTier:ref.statePast10Tier,referenceIds:candidate.sourceIds,timing,
      score:compared.scoreStable?compared.scenarios[0].score:null,tier:compared.tierStable?compared.scenarios[0].tier:null,scenarios:compared.scenarios});
  }
}
const counts=results.reduce<Record<string,number>>((a,r)=>{const k=String(r.status==='unscored'?r.reason:r.status);a[k]=(a[k]??0)+1;return a},{});
writeFileSync(out,JSON.stringify({notice:'Offline scenarios only, not validated ratings. Demand is fixed at a neutral 0.5, so permits and applications cannot affect scores. Timing varies by at most two points and uses actual segments, selecting their best overlap; the early any-weapon deer exception is provisional. No score floor or private-land penalty. Assumes no verified agency age evidence or independently verified sources; missing harvest uses neutral five points. Utah retained 2026 snapshot, not production.',counts,results},null,2)+'\n');
console.log(JSON.stringify({rows:results.length,counts}));
