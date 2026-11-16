/** Offline shadow audit. No database access, writes, source fetches or live-score changes.
 * Run: node --import tsx scripts/audit-ut-trophy-v2.ts out/ut-v2-shadow.json
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import hunts from '../data/ut/hunts.json';
import source from '../data/trophy-source-western-v4.json';
import v5 from '../data/trophy-v5-reference-context.json';
import peerData from '../data/trophy-peer-benchmarks-review.json';
import crosswalk from '../data/ut/trophy-crosswalk-review.json';
import {resolveTrophyCandidate} from '../src/lib/trophyCandidateResolver';
import {reviewTrophyPeerBenchmark} from '../src/lib/trophyPeerBenchmarkReview';
import {trophyForHunt} from '../src/lib/trophyHunt';
import {withUtSeasonCorrections} from '../src/lib/utSeasonCorrections';
import {countyScenarios} from '../src/lib/trophyV2CountyScenarios';
import {utV2ShadowFloor,utV2ShadowTiming} from '../src/lib/trophyV2UtShadow';
import {allWeaponBaseline} from '../src/lib/trophyV2PeerBaseline';

const out=process.argv[2];if(!out)throw new Error('Provide an output path');
const digest=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const jsonDigest=(path:string)=>createHash('sha256').update(readFileSync(path,'utf8').replace(/\r\n/g,'\n')).digest('hex');
if(jsonDigest('data/ut/hunts.json')!==crosswalk.huntsSha256||jsonDigest('data/trophy-ut-wmu-crosswalk.json')!==crosswalk.geometrySha256||digest('data/ut/trophy-hunt-unit-crosswalk.csv')!==crosswalk.sha256)
  throw new Error('Crosswalk review is stale; regenerate it before auditing');
const byId=new Map(source.records.map(x=>[x.id,x]));
const byCode=new Map(crosswalk.hunts.map(x=>[x.code,x]));
const results:Record<string,unknown>[]=[];
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
    const value=pool==='Resident'?h.resAppsLast:h.nrAppsLast;
    const peer=typeof value==='number'&&typeof h.oddsLastYear==='number'&&h.tagCode?reviewTrophyPeerBenchmark({state:'UT',species:h.species,year:h.oddsLastYear,code:h.tagCode,pool,measure:'Applications',value}):null;
    if(!peer){skip('current pool applications do not match a comparable archived cohort');continue;}
    const baseline=peer.peers<10 ? allWeaponBaseline(peerData.observations, {state:'UT',species:h.species,year:h.oddsLastYear!,pool,measure:'Applications',cohort:peer.cohort,code:h.tagCode!,value:value!}) : null;
    if(peer.peers<10&&!baseline){skip('cohort has fewer than 10 hunts and comparable all-weapon baseline is not established');continue;}
    const seasons=(h.tagSeasons as {seasons?:{uncertain?:boolean;weapon:string;dates:{open:string;close:string}[] }[]}|null)?.seasons??[];
    if(seasons.length!==1||seasons[0].uncertain||seasons[0].dates.length!==1){skip('multiple, missing or uncertain season segments');continue;}
    const season=seasons[0], span=season.dates[0];
    // Existing preset timing does not implement the guide's pronghorn rubric.
    if(h.species==='PRONGHORN'){skip('pronghorn v2 timing rubric not yet implemented');continue;}
    const timing=utV2ShadowTiming(h.species,season.weapon,span.open,span.close);
    if(timing===null){skip('timing rubric does not cover this exact segment');continue;}
    const named=ref.sourceTags.filter(t=>!['bc','bc_top_counties'].includes(t.toLowerCase())).length;
    const input={namedSources:named,independentNamedSources:0,verifiedAgencyAntlerOrAge:false,countyEvidenceKnown:true,
      boundaryVerified:false,rawDemandPercentile:peer.percentile/100,peerCount:peer.peers,
      allWeaponPercentile:baseline?.percentile??null,timingPoints:timing,harvestPoints:null};
    const record=(v5.records as Record<string,{tier:string}>)[ref.id];
    const floor=utV2ShadowFloor(h.huntCategory,h.tagCode,record?.tier);
    const compared=countyScenarios(input,[ref.overallPast10Tier as 1|2|3|4,ref.statePast10Tier as 1|2|3|4],floor);
    if(!compared){skip('score inputs failed validation');continue;}
    results.push({...base,status:compared.scoreStable?'shadow score':'county basis scenarios',cohort:peer.cohort,peers:peer.peers,allWeaponPeers:baseline?.peers??null,previousTier:trophyForHunt(h),
      overallCountyTier:ref.overallPast10Tier,stateCountyTier:ref.statePast10Tier,referenceIds:candidate.sourceIds,timing,floor,
      score:compared.scoreStable?compared.scenarios[0].score:null,tier:compared.tierStable?compared.scenarios[0].tier:null,scenarios:compared.scenarios});
  }
}
const counts=results.reduce<Record<string,number>>((a,r)=>{const k=String(r.status==='unscored'?r.reason:r.status);a[k]=(a[k]??0)+1;return a},{});
writeFileSync(out,JSON.stringify({notice:'Offline shadow scores and county-basis scenarios, not validated v2 ratings. Assumes no verified agency age evidence, no independently verified sources, and neutral harvest proxy. No private-land penalty or weapon offset. Utah only; retained 2026 source snapshot, not production.',counts,results},null,2)+'\n');
console.log(JSON.stringify({rows:results.length,counts}));
