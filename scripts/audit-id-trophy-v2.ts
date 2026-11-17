/** Offline Idaho v2 trophy shadow. No database access, writes or live-score changes.
 * Run: node --import tsx scripts/audit-id-trophy-v2.ts out/id-v2-shadow.json
 */
import {writeFileSync} from 'node:fs';
import snapshot from '../data/id/trophy-shadow-2026-11-16.json';
import source from '../data/trophy-source-western-v4.json';
import {resolveTrophyCandidate} from '../src/lib/trophyCandidateResolver';
import {bcCountySignificance,bcCredit,evidenceCredit,idScore,midRank,publicationCredit,rankTiers,rutCredit,rutDays,tierFor,type CountyResult,type IdSpecies} from '../src/lib/trophyV2Idaho';

const out=process.argv[2];if(!out)throw new Error('Provide an output path');
type Rec=typeof source.records[number];
const records=source.records.filter(r=>r.state==='ID');
const byId=new Map(records.map(r=>[r.id,r]));
const harvest=snapshot.unitHarvest5.bySpecies as Record<string,Record<string,number>>;

// B&C significance per species and subspecies: a county's ten-year entries against the harvest of
// every unit the source list places in that county.
const popKey=(r:Rec)=>`${r.species}:${r.subspecies}`;
const counties=new Map<string,CountyResult>();
const countyConflicts:string[]=[];
for(const pop of new Set(records.map(popKey))){
  const rows=records.filter(r=>popKey(r)===pop&&r.county&&typeof r.bcPast10Years==='number');
  const byCounty=new Map<string,{entries:Set<number>;units:Set<string>}>();
  for(const r of rows){const c=byCounty.get(r.county!)??{entries:new Set(),units:new Set()};c.entries.add(r.bcPast10Years!);c.units.add(r.unit);byCounty.set(r.county!,c);}
  const inputs=[...byCounty].flatMap(([county,c])=>{
    if(c.entries.size!==1){countyConflicts.push(`${pop} ${county}`);return [];}
    return [{county,entries10:[...c.entries][0],units:[...c.units]}];
  });
  for(const r of bcCountySignificance(inputs,harvest[pop.split(':')[0]]??{}))counties.set(`${pop}|${r.county}`,r);
}

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
    if(!recs.length)return {unit,bc:0,publications:0,named:0,county:null as string|null,significant:false};
    const r=recs[0],named=r.sourceTags.filter(t=>!['bc','bc_top_counties'].includes(t.toLowerCase())).length;
    const county=r.county?counties.get(`${popKey(r)}|${r.county}`):undefined;
    return {unit,bc:bcCredit(county),publications:publicationCredit(named),named,county:r.county??null,significant:!!county?.significant};
  });
  const weakest=unitEvidence.reduce((a,b)=>evidenceCredit(b.bc,b.publications)<evidenceCredit(a.bc,a.publications)?b:a);
  const evidence=evidenceCredit(weakest.bc,weakest.publications);
  const score=idScore({demand:demand.percentile,animal:animal?.percentile??null,evidence,rut});
  return {...base,status:'shadow score',score,tier:0 as number,fixedCutoffTier:tierFor(score),
    applicantsPerTag:Math.round(ratio(h)!*10)/10,demandPercentile:Math.round(demand.percentile*1000)/1000,demandPeers:demand.peers,demandAllWeapon:demand.allWeapon,
    rutDays:days,animalShare:animal?Math.round(animal.value*10)/10:null,animalFromHunt:animal?.from??null,animalPercentile:animal?Math.round(animal.percentile*1000)/1000:null,animalNeutral:!animal,
    evidence:Math.round(evidence*1000)/1000,unitEvidence};
});
const scored=results.filter(r=>r.status==='shadow score') as Extract<typeof results[number],{score:number}>[];
for(const sp of ['DEER','ELK','PRONGHORN']){
  const group=scored.filter(r=>r.species===sp),tiers=rankTiers(group.map(r=>r.score));
  group.forEach((r,i)=>{r.tier=tiers[i];});
}
const tally=(f:(r:typeof scored[number])=>unknown)=>scored.reduce<Record<string,number>>((a,r)=>{const k=String(f(r));a[k]=(a[k]??0)+1;return a},{});
const summary={rows:results.length,scored:scored.length,tiers:tally(r=>r.tier),liveTiers:tally(r=>r.liveTrophy),moves:tally(r=>`${r.liveTrophy}->${r.tier}`),bySpecies:Object.fromEntries(['DEER','ELK','PRONGHORN'].map(sp=>[sp,scored.filter(r=>r.species===sp).reduce<Record<string,number>>((a,r)=>{a[r.tier]=(a[r.tier]??0)+1;return a},{})])),
  significantCounties:[...counties].filter(([,c])=>c.significant).map(([k,c])=>`${k} ${c.entries10} entries vs ${c.expected.toFixed(1)} expected (q ${c.q.toFixed(3)})`),countyConflicts};
writeFileSync(out,JSON.stringify({notice:'Offline Idaho v2 shadow on the 2026-11-16 live export snapshot. Not production scores.',summary,counties:Object.fromEntries(counties),results},null,2)+'\n');
console.log(JSON.stringify(summary,null,1));
