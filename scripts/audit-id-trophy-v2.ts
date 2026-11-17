/** Offline Idaho v2 trophy shadow. No database access, writes or live-score changes.
 * Run: node --import tsx scripts/audit-id-trophy-v2.ts out/id-v2-shadow.json
 */
import {writeFileSync} from 'node:fs';
import snapshot from '../data/id/trophy-shadow-2026-11-16.json';
import source from '../data/trophy-source-western-v4.json';
import bcCounts from '../data/id/bc-county-counts-2026-11-17.json';
import {resolveTrophyCandidate} from '../src/lib/trophyCandidateResolver';
import {bcCountyRates,idScore,midRank,publicationCredit,rankTiers,rutCredit,rutDays,tierFor,type CountyRate,type IdSpecies} from '../src/lib/trophyV2Idaho';

const out=process.argv[2];if(!out)throw new Error('Provide an output path');
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
const eligible=(h:H)=>['ANTLERED','EITHER'].includes(h.antlerClass);
const ratio=(h:H)=>typeof h.applications==='number'&&typeof h.tags==='number'&&h.tags>0?h.applications/h.tags:null;
// Demand cohort: same species and weapon; all weapons when fewer than ten hunts have a ratio.
const demandOf=(h:H)=>{
  for(const allWeapon of [false,true]){
    const peers=snapshot.hunts.filter(x=>x.species===h.species&&eligible(x)&&(allWeapon||x.weapon===h.weapon)).map(ratio).filter((v):v is number=>v!==null);
    if(peers.length>=10)return {percentile:midRank(ratio(h)!,peers),peers:peers.length,allWeapon};
  }
  return null;
};
// Mature-animal share, shrunk toward the species' harvest-weighted mean with a 20-animal prior.
// Herd quality is a unit property: a late hunt's share is higher partly because bucks move in the
// rut, which the rut part already scores. So each unit takes the best shrunk share of any hunt that
// covers it, and a hunt takes its weakest unit. (Scoring each hunt's own share counted the rut twice
// and dropped Unit 54's October hunts from 80 to 50.) More hunts in a unit means more chances at a
// high maximum; the shrinkage limits small samples but not that.
const K=20;
const mule=(x:H)=>!(x.species==='DEER'&&x.deerType==='WHITETAIL');
const withShare=(sp:string)=>snapshot.hunts.filter(x=>x.species===sp&&typeof x.bigPct5==='number'&&typeof x.harvest5==='number'&&x.harvest5>0&&mule(x));
const shrunkShare=(x:H)=>{
  const pool=withShare(x.species),mean=pool.reduce((s,y)=>s+y.bigPct5!*y.harvest5!,0)/pool.reduce((s,y)=>s+y.harvest5!,0);
  return (x.bigPct5!*x.harvest5!+mean*K)/(x.harvest5!+K);
};
const unitHerd=new Map<string,{share:number;from:string}>();
for(const sp of ['DEER','ELK'])for(const x of withShare(sp))for(const u of x.units){
  const k=`${sp}|${u}`,v=shrunkShare(x),old=unitHerd.get(k);
  if(!old||v>old.share)unitHerd.set(k,{share:v,from:x.code});
}
const herdValues=(sp:string)=>[...unitHerd].filter(([k])=>k.startsWith(sp+'|')).map(([,v])=>v.share);
const animalShare=(h:H)=>{
  if(h.species==='PRONGHORN'||!mule(h))return null; // IDFG's deer share is mule deer 4+; no pronghorn measure
  const units=h.units.map(u=>unitHerd.get(`${h.species}|${u}`));
  if(units.some(u=>!u))return null;
  const weakest=units.reduce((a,b)=>b!.share<a!.share?b:a)!;
  return {value:weakest.share,from:weakest.from,percentile:midRank(weakest.share,herdValues(h.species))};
};

const results=snapshot.hunts.filter(eligible).map(h=>{
  const base={code:h.code,species:h.species,units:h.units,weapon:h.weapon,open:h.open,close:h.close,tags:h.tags,applications:h.applications,liveTrophy:h.liveTrophy};
  const demand=ratio(h)===null?null:demandOf(h);
  if(!demand)return {...base,status:'unscored',reason:'applicants per tag unknown'};
  const days=rutDays(h.species as IdSpecies,h.deerType,h.open,h.close),rut=rutCredit(days);
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
  const score=idScore({demand:demand.percentile,animal:animal?.percentile??null,publications:weakest.publications,bc:weakest.bc,rut});
  return {...base,status:'shadow score',score,tier:0 as number,fixedCutoffTier:tierFor(score),
    applicantsPerTag:Math.round(ratio(h)!*10)/10,demandPercentile:Math.round(demand.percentile*1000)/1000,demandPeers:demand.peers,demandAllWeapon:demand.allWeapon,
    rutDays:days,animalShare:animal?Math.round(animal.value*10)/10:null,animalFromHunt:animal?.from??null,animalPercentile:animal?Math.round(animal.percentile*1000)/1000:null,animalNeutral:!animal,
    publications:weakest.publications,bc:Math.round(weakest.bc*1000)/1000,unitEvidence};
});
const scored=results.filter(r=>r.status==='shadow score') as Extract<typeof results[number],{score:number}>[];
for(const sp of ['DEER','ELK','PRONGHORN']){
  const group=scored.filter(r=>r.species===sp),tiers=rankTiers(group.map(r=>r.score));
  group.forEach((r,i)=>{r.tier=tiers[i];});
}
const tally=(f:(r:typeof scored[number])=>unknown)=>scored.reduce<Record<string,number>>((a,r)=>{const k=String(f(r));a[k]=(a[k]??0)+1;return a},{});
const summary={rows:results.length,scored:scored.length,tiers:tally(r=>r.tier),liveTiers:tally(r=>r.liveTrophy),moves:tally(r=>`${r.liveTrophy}->${r.tier}`),bySpecies:Object.fromEntries(['DEER','ELK','PRONGHORN'].map(sp=>[sp,scored.filter(r=>r.species===sp).reduce<Record<string,number>>((a,r)=>{a[r.tier]=(a[r.tier]??0)+1;return a},{})])),
  bcCountiesWithCredit:[...counties].filter(([,c])=>c.credit>0).map(([k,c])=>`${k} ${c.entries} vs ${c.expected.toFixed(1)} expected, credit ${c.credit.toFixed(2)}`),countyConflicts};
writeFileSync(out,JSON.stringify({notice:'Offline Idaho v2 shadow on the 2026-11-16 live export snapshot. Not production scores.',summary,counties:Object.fromEntries(counties),results},null,2)+'\n');
console.log(JSON.stringify(summary,null,1));
