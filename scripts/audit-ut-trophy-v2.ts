/** Offline sensitivity audit. No database access, writes, source fetches or live-score changes.
 * Run: node --import tsx scripts/audit-ut-trophy-v2.ts out/ut-v2-shadow.json
 */
import {writeFileSync} from 'node:fs';
import hunts from '../data/ut/hunts.json';
import source from '../data/trophy-source-western-v4.json';
import v5 from '../data/trophy-v5-reference-context.json';
import {resolveTrophyCandidate} from '../src/lib/trophyCandidateResolver';
import {reviewTrophyPeerBenchmark} from '../src/lib/trophyPeerBenchmarkReview';
import {trophyForHunt} from '../src/lib/trophyHunt';
import {withUtSeasonCorrections} from '../src/lib/utSeasonCorrections';
import {trophyV2Shadow} from '../src/lib/trophyV2Shadow';
import {utV2ShadowFloor,utV2ShadowTiming} from '../src/lib/trophyV2UtShadow';

const out=process.argv[2];if(!out)throw new Error('Provide an output path');
const byId=new Map(source.records.map(x=>[x.id,x]));
const results:Record<string,unknown>[]=[];
for(const raw of hunts.hunts){
  const h=withUtSeasonCorrections(raw);
  for(const pool of ['Resident','Nonresident'] as const){
    const base={code:h.tagCode,name:h.name,species:h.species,pool,units:h.units};
    const skip=(reason:string)=>results.push({...base,status:'unscored',reason});
    if(!['DEER','ELK','PRONGHORN'].includes(h.species)||!['ANTLERED','EITHER'].includes(h.antlerClass)){skip('not an eligible antlered hunt');continue;}
    if(h.units.length!==1){skip('multi-unit aggregation is undefined');continue;}
    const candidate=resolveTrophyCandidate({state:'UT',species:h.species,unit:h.units[0],deerType:(h as {deerType?:string|null}).deerType});
    const refs=candidate.sourceIds.map(id=>byId.get(id)).filter((v):v is NonNullable<typeof v>=>!!v);
    if(refs.length!==1||refs[0].activeStatus!=='Active'){skip('unit reference absent, ambiguous or inactive');continue;}
    const ref=refs[0];
    if(ref.overallPast10Tier===null||ref.overallPast10Tier!==ref.statePast10Tier){skip('county tier missing or its basis is ambiguous');continue;}
    const value=pool==='Resident'?h.resAppsLast:h.nrAppsLast;
    const peer=typeof value==='number'&&typeof h.oddsLastYear==='number'&&h.tagCode?reviewTrophyPeerBenchmark({state:'UT',species:h.species,year:h.oddsLastYear,code:h.tagCode,pool,measure:'Applications',value}):null;
    if(!peer){skip('current pool applications do not match a comparable archived cohort');continue;}
    if(peer.peers<10){skip('cohort has fewer than 10 hunts and weapon offset is unspecified');continue;}
    const seasons=(h.tagSeasons as {seasons?:{uncertain?:boolean;weapon:string;dates:{open:string;close:string}[] }[]}|null)?.seasons??[];
    if(seasons.length!==1||seasons[0].uncertain||seasons[0].dates.length!==1){skip('multiple, missing or uncertain season segments');continue;}
    const season=seasons[0], span=season.dates[0];
    // Existing preset timing does not implement the guide's pronghorn rubric.
    if(h.species==='PRONGHORN'){skip('pronghorn v2 timing rubric not yet implemented');continue;}
    const timing=utV2ShadowTiming(h.species,season.weapon,span.open,span.close);
    if(timing===null){skip('timing rubric does not cover this exact segment');continue;}
    const named=ref.sourceTags.filter(t=>!['bc','bc_top_counties'].includes(t.toLowerCase())).length;
    const input={namedSources:named,independentNamedSources:0,verifiedAgencyAntlerOrAge:false,countyEvidenceKnown:true,
      countyTier:ref.overallPast10Tier as 1|2|3|4,boundaryVerified:false,rawDemandPercentile:peer.percentile/100,peerCount:peer.peers,
      allWeaponPercentile:null,weaponOffset:null,timingPoints:timing,harvestPoints:null};
    const noPenalty=trophyV2Shadow({...input,privateLandPenalty:0});
    const fullPenalty=trophyV2Shadow({...input,privateLandPenalty:1});
    if(!noPenalty||!fullPenalty){skip('score inputs failed validation');continue;}
    const record=(v5.records as Record<string,{tier:string}>)[ref.id];
    const floor=utV2ShadowFloor(h.huntCategory,h.tagCode,record?.tier);
    const applyFloor=(score:number)=>Math.max(score,floor);
    const tier=(score:number)=>score>=85?'Elite':score>=70?'Excellent':score>=55?'Good':'Standard';
    const zero=applyFloor(noPenalty.score),full=applyFloor(fullPenalty.score);
    results.push({...base,status:'scenario only',cohort:peer.cohort,peers:peer.peers,previousTier:trophyForHunt(h),
      countyTier:ref.overallPast10Tier,referenceIds:candidate.sourceIds,timing,floor,
      scoreWithNoCountyDiscount:zero,tierWithNoCountyDiscount:tier(zero),
      scoreWithFullCountyDiscount:full,tierWithFullCountyDiscount:tier(full)});
  }
}
const counts=results.reduce<Record<string,number>>((a,r)=>{const k=String(r.status==='unscored'?r.reason:r.status);a[k]=(a[k]??0)+1;return a},{});
writeFileSync(out,JSON.stringify({notice:'Offline scenarios, not validated v2 ratings. Assumes no verified agency age evidence, no independently verified sources, and neutral harvest proxy; tests extremes of the undefined county discount. Utah only; retained 2026 source snapshot, not production.',counts,results},null,2)+'\n');
console.log(JSON.stringify({rows:results.length,counts}));
