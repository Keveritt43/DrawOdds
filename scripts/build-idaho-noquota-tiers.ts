/** Build provisional Idaho trophy tiers from the retained snapshot (data/id/trophy-shadow-<date>.json, made
 * by scripts/id-trophy-snapshot.ts); no database access.
 * Run: node --import tsx scripts/build-idaho-noquota-tiers.ts out/id-noquota-review.json data/id/trophy-v2-tiers.json
 */
import {writeFileSync} from 'node:fs';
import snapshot from '../data/id/trophy-shadow-2026-11-26.json';
import liveTiers from '../data/id/trophy-v2-tiers.json';
import source from '../data/trophy-source-western-v4.json';
import bcCounts from '../data/id/bc-county-counts-2026-11-17.json';
import {resolveTrophyCandidate} from '../src/lib/trophyCandidateResolver';
import {bcCountyRates,idScoreApplicants,LIVE_TIMING_WINDOWS,midRank,orderByRut,publicationCredit,rankTiers,rutCredit,rutDays,tierFor,type CountyRate,type IdSpecies} from '../src/lib/trophyV2Idaho';

const preferredWindows=LIVE_TIMING_WINDOWS;

const out=process.argv[2];if(!out)throw new Error('Provide an output path');
// The optional second output is the versioned production table.
const tableOut=process.argv[3];

type Rec=typeof source.records[number];
const records=source.records.filter(r=>r.state==='ID');
const byId=new Map(records.map(r=>[r.id,r]));
const harvest=snapshot.unitHarvest5.bySpecies as Record<string,Record<string,number>>;

// B&C: each county's 20-year entries (kill year 2006+) from the owner's full workbook, against the
// harvest of every unit the source list places in that county. The workbook's deer tab is mule deer,
// so whitetail units get no B&C credit.
const popKey=(r:Rec)=>`${r.species}:${r.subspecies}`;
const unitCounties=new Map<string,Set<string>>();
for(const r of records)if(r.county&&!(r.species==='DEER'&&r.subspecies!=='Mule Deer')){
  const k=`${r.species}|${r.unit}`;unitCounties.set(k,(unitCounties.get(k)??new Set()).add(r.county));
}
const counties=new Map<string,CountyRate>();
for(const sp of ['DEER','ELK','PRONGHORN']){
  const entries=(bcCounts.bySpecies as Record<string,Record<string,number[]>>)[sp];
  const byCounty=new Map<string,string[]>();
  for(const [k,cs] of unitCounties)if(k.startsWith(sp+'|'))for(const c of cs)byCounty.set(c,[...(byCounty.get(c)??[]),k.split('|')[1]]);
  const inputs=[...byCounty].map(([county,units])=>({county,units,entries:entries[county]?.[1]??0}));
  for(const r of bcCountyRates(inputs,harvest[sp]??{}))counties.set(`${sp}|${r.county}`,r);
}
const countyConflicts:string[]=[];

type H=typeof snapshot.hunts[number];
// Compare the exact reviewed production-table population; do not alter ranks by adding a new hunt.
// Every antlered or either-sex controlled hunt with applications on record. (Until Nov 26 this was
// "already in the table", so a hunt missing from one build, like 1074, could never enter the next.)
const eligible=(h:H)=>['ANTLERED','EITHER'].includes(h.antlerClass)&&typeof h.applications==='number';
// Mature-animal share, shrunk toward the species' harvest-weighted mean with a 20-animal prior.
// A multi-unit hunt cannot attribute its harvest to each unit. For each unit use the single-unit
// hunt with the highest sample-adjusted observed antler share. This can favor units with more hunts
// and reflect season or hunter selection; it is not a measurement of unit genetics. Unknown
// observations receive a neutral input and the resulting ranks are provisional.
const K=20;
const mule=(x:H)=>!(x.species==='DEER'&&x.deerType==='WHITETAIL');
const withShare=(sp:string)=>snapshot.hunts.filter(x=>x.species===sp&&x.units.length===1&&typeof x.bigPct5==='number'&&typeof x.harvest5==='number'&&x.harvest5>0&&mule(x));
const shrunkShare=(x:H)=>{
  const pool=withShare(x.species),mean=pool.reduce((s,y)=>s+y.bigPct5!*y.harvest5!,0)/pool.reduce((s,y)=>s+y.harvest5!,0);
  return (x.bigPct5!*x.harvest5!+mean*K)/(x.harvest5!+K);
};
const unitHerd=new Map<string,{share:number;from:string;sample:number}>();
for(const sp of ['DEER','ELK'])for(const x of withShare(sp))for(const u of x.units){
  const k=`${sp}|${u}`,v=shrunkShare(x),old=unitHerd.get(k);
  if(!old||v>old.share)unitHerd.set(k,{share:v,from:x.code,sample:x.harvest5!});
}
// Each hunt is scored on its own harvest when it has any (owner, Nov 24: 300-tag October 1042 had
// been scored on 20-tag November 1043's bucks because they share Unit 54). Small samples are pulled
// toward the species mean by K. Only a hunt with no harvest of its own borrows its weakest unit's
// best single-unit figure. Percentiles are among the eligible hunts' own figures.
const ownShare=(h:H)=>typeof h.bigPct5==='number'&&typeof h.harvest5==='number'&&h.harvest5>0?shrunkShare(h):null;
const huntValues=(sp:string)=>snapshot.hunts.filter(x=>x.species===sp&&eligible(x)&&mule(x)).map(ownShare).filter((v):v is number=>v!==null);
const animalShare=(h:H)=>{
  if(h.species==='PRONGHORN'||!mule(h))return null; // IDFG's deer share is mule deer 4+; no pronghorn measure
  const own=ownShare(h);
  if(own!==null)return {value:own,from:h.code,percentile:midRank(own,huntValues(h.species))};
  const units=h.units.map(u=>unitHerd.get(`${h.species}|${u}`));
  if(units.some(u=>!u))return null;
  const weakest=units.reduce((a,b)=>b!.share<a!.share?b:a)!;
  return {value:weakest.share,from:weakest.from,percentile:midRank(weakest.share,huntValues(h.species))};
};

// Demand (owner, Nov 24): half raw applications, half applications per tag, each a mid-rank
// percentile within species among the eligible hunts. Not draw odds: in Idaho's random draw odds are
// about tags / applications, so using both would count scarcity twice.
const perTag=(x:H)=>typeof x.applications==='number'&&typeof x.tags==='number'&&x.tags>0?x.applications/x.tags:null;
const pool=(sp:string)=>snapshot.hunts.filter(x=>eligible(x)&&x.species===sp);
const appsBySpecies=(sp:string)=>pool(sp).map(x=>x.applications).filter((v):v is number=>typeof v==='number');
const ratioBySpecies=(sp:string)=>pool(sp).map(perTag).filter((v):v is number=>v!==null);
const demandPct=(h:H)=>{
  const r=perTag(h);
  return typeof h.applications==='number'&&r!==null?.5*midRank(h.applications,appsBySpecies(h.species))+.5*midRank(r,ratioBySpecies(h.species)):null;
};
const results=snapshot.hunts.filter(eligible).map(h=>{
  const live=(liveTiers.tiers as Record<string,{tier:number}>)[`${h.species}:${h.code}`];
  const base={code:h.code,species:h.species,units:h.units,weapon:h.weapon,open:h.open,close:h.close,tags:h.tags,applications:h.applications,liveTrophy:live?.tier??h.liveTrophy};
  const days=rutDays(h.species as IdSpecies,h.deerType,h.open,h.close,preferredWindows);
  // The reviewed early Unit 55 hunt receives the early-season timing exception; velvet is not asserted.
  const velvetDays=h.species==='DEER'&&h.code==='1044'?rutDays('DEER',h.deerType,h.open,h.close,{'DEER:MULE':['08-15','09-05'],'DEER:WHITETAIL':['08-15','09-05']}):0;
  const rut=rutCredit(days===null||velvetDays===null?null:Math.max(days,velvetDays));
  if(rut===null)return {...base,status:'unscored',reason:'season dates unusable'};
  const animal=animalShare(h);
  // Evidence per unit; a multi-unit hunt takes its weakest unit (as the live model does).
  const unitEvidence=h.units.map(unit=>{
    const c=resolveTrophyCandidate({state:'ID',species:h.species,unit,deerType:h.deerType});
    const recs=c.sourceIds.map(id=>byId.get(id)).filter((r):r is Rec=>!!r);
    const named=recs.length?recs[0].sourceTags.filter(t=>!['bc','bc_top_counties'].includes(t.toLowerCase())).length:0;
    const whitetail=h.species==='DEER'&&h.deerType==='WHITETAIL';
    const cs=whitetail?[]:[...(unitCounties.get(`${h.species}|${unit}`)??[])].map(cn=>counties.get(`${h.species}|${cn}`)).filter((x):x is CountyRate=>!!x);
    const best=cs.reduce<CountyRate|null>((a,b)=>!a||b.credit>a.credit?b:a,null);
    return {unit,publications:publicationCredit(named),named,bc:best?.credit??0,county:best?.county??null,bcEntries20:best?.entries??null,bcExpected20:best?Math.round(best.expected*100)/100:null};
  });
  const pts=(u:typeof unitEvidence[number])=>8*u.publications+5*u.bc;
  const weakest=unitEvidence.reduce((a,b)=>pts(b)<pts(a)?b:a);
  const demand=demandPct(h);
  const parts={demand:demand??0.5,animal:animal?.percentile??null,publications:weakest.publications,bc:weakest.bc};
  const score=idScoreApplicants({...parts,rut});
  // Timing has a maximum five-point contribution before the relative tier ranking.
  const baseScore=idScoreApplicants({...parts,rut:0});
  return {...base,status:'shadow score',score,baseScore,tier:0 as number,fixedCutoffTier:tierFor(score),
    demandPercentile:demand===null?null:Math.round(demand*1000)/1000,demandNeutral:demand===null,orderedAbove:null as string|null,
    rutDays:days,animalShare:animal?Math.round(animal.value*10)/10:null,animalFromHunt:animal?.from??null,animalPercentile:animal?Math.round(animal.percentile*1000)/1000:null,animalNeutral:!animal,
    publications:weakest.publications,bc:Math.round(weakest.bc*1000)/1000,unitEvidence};
});
const scored=results.filter(r=>r.status==='shadow score') as Extract<typeof results[number],{score:number}>[];
// Same units and weapon: the hunt with more rut days ranks above (owner, Nov 24).
const deerTypeOf=new Map(snapshot.hunts.map(h=>[`${h.species}:${h.code}`,h.deerType]));
const ordered=orderByRut(scored.map(r=>({key:`${r.species}:${r.code}`,species:r.species,weapon:r.weapon,units:r.units,deerType:deerTypeOf.get(`${r.species}:${r.code}`),rutDays:r.rutDays??0,score:r.score})));
for(const r of scored){const k=`${r.species}:${r.code}`;r.score=ordered.scores.get(k)!;r.orderedAbove=ordered.lifted.get(k)?.split(':')[1]??null;r.fixedCutoffTier=tierFor(r.score);}
for(const sp of ['DEER','ELK','PRONGHORN']){
  const group=scored.filter(r=>r.species===sp),tiers=rankTiers(group.map(r=>r.score));
  group.forEach((r,i)=>{r.tier=tiers[i];});
}
const tally=(f:(r:typeof scored[number])=>unknown)=>scored.reduce<Record<string,number>>((a,r)=>{const k=String(f(r));a[k]=(a[k]??0)+1;return a},{});
const summary={rows:results.length,scored:scored.length,tiers:tally(r=>r.tier),liveTiers:tally(r=>r.liveTrophy),moves:tally(r=>`${r.liveTrophy}->${r.tier}`),lifted:scored.filter(r=>r.orderedAbove).map(r=>`${r.species} ${r.code} above ${r.orderedAbove}`),bySpecies:Object.fromEntries(['DEER','ELK','PRONGHORN'].map(sp=>[sp,scored.filter(r=>r.species===sp).reduce<Record<string,number>>((a,r)=>{a[r.tier]=(a[r.tier]??0)+1;return a},{})])),
  bcCountiesWithCredit:[...counties].filter(([,c])=>c.credit>0).map(([k,c])=>`${k} ${c.entries} vs ${c.expected.toFixed(1)} expected, credit ${c.credit.toFixed(2)}`),countyConflicts};
writeFileSync(out,JSON.stringify({notice:'Idaho provisional no-quota ranks on the 2026-11-16 retained snapshot; source claims and animal proxies remain uncertain.',summary,counties:Object.fromEntries(counties),results},null,2)+'\n');
console.log(JSON.stringify(summary,null,1));

if(tableOut){
  const tiers:Record<string,{tier:number;score:number;rank:number;of:number;units:string[];animalSourceHunt:string|null;animalSharePct:number|null;applications:number|null;demandPct:number|null;orderedAbove:string|null}>={};
  for(const sp of ['DEER','ELK','PRONGHORN']){
    const g=scored.filter(r=>r.species===sp);
    for(const r of g)tiers[`${sp}:${r.code}`]={tier:r.tier,score:r.score,rank:g.filter(x=>x.score>r.score).length+1,of:g.length,units:[...r.units].sort(),animalSourceHunt:r.animalFromHunt,animalSharePct:r.animalShare,applications:r.applications??null,demandPct:r.demandPercentile===null?null:Math.round(r.demandPercentile*100),orderedAbove:r.orderedAbove};
  }
  writeFileSync(tableOut,JSON.stringify({notice:'Idaho provisional trophy tiers: demand is half applications, half applications per tag (no draw odds); 5 points maximum for timing; within the same units and weapon a deer or elk hunt with more rut days ranks above. Generated from the retained snapshot by scripts/build-idaho-noquota-tiers.ts.',drawYear:2026,snapshot:'data/id/trophy-shadow-2026-11-16.json',snapshotSha256:snapshot.compactSha256,tiers},null,1)+'\n');
}
