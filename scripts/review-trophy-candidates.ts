/** Offline model comparison on saved public hunt snapshots; no production connection or writes. */
import {readFileSync, writeFileSync} from 'node:fs';
import {trophyForHunt} from '../src/lib/trophyHunt';
import {resolveSeasonCandidate} from '../src/lib/trophyCandidateSeason';

const paths:Record<string,string>={ID:process.argv[2],CO:process.argv[3],MT:'data/mt/hunts.json',UT:'data/ut/hunts.json',WA:'data/wa/hunts.json',WY:'data/wy/hunts.json'};
if (!paths.ID || !paths.CO) throw Error('Usage: tsx scripts/review-trophy-candidates.ts ID_SNAPSHOT CO_SNAPSHOT OUTPUT_JSON');
const output=process.argv[4]; if(!output) throw Error('Pass an output path');
type Raw = Parameters<typeof trophyForHunt>[0] & {huntNumber?:number|null; tagCode?:string|null; appsLast?:number|null; resAppsLast?:number|null; nrAppsLast?:number|null; oddsLastYear?:number|null; id:string; name?:string|null};
const summaries:Record<string,{total:number; eligible:number; changed:number; provisional:number}>={};
const results:{state:string;species:string;id:string;code:string;units:string[];old:number;proposed:number;provisional:boolean;reason:string}[]=[];
for(const [state,path] of Object.entries(paths)){
 const doc=JSON.parse(readFileSync(path,'utf8'));
 const hunts:Raw[]=state==='ID'?doc.rows:state==='CO'?doc.summaries:doc.hunts;
 const counts=summaries[state]={total:hunts.length,eligible:0,changed:0,provisional:0};
 for(const raw of hunts){
  if(!['DEER','ELK'].includes(raw.species)||!raw.units?.length)continue;
  const h={...raw,state}; const old=trophyForHunt(h); if(old===null)continue;
  counts.eligible++;
  const apps=state==='CO'||state==='WA'?h.appsLast:typeof h.resAppsLast==='number'&&typeof h.nrAppsLast==='number'?h.resAppsLast+h.nrAppsLast:null;
  const candidates=h.units.map(unit=>resolveSeasonCandidate({state,species:h.species,unit,huntCode:h.tagCode??(h.huntNumber===null||h.huntNumber===undefined?null:String(h.huntNumber)),drawYear:h.oddsLastYear,applications:apps,deerType:h.deerType}));
  const best=candidates.reduce((a,b)=>b.score>a.score?b:a); const proposed=best.score;
  if(proposed!==old)counts.changed++;
  if(best.provisional)counts.provisional++;
  results.push({state,species:h.species,id:h.id,code:h.tagCode??String(h.huntNumber??''),units:h.units,old,proposed,provisional:best.provisional,reason:best.reason});
 }
}
writeFileSync(output,JSON.stringify({notice:'Offline illustrative review; not a production score plan. Excludes current model-ineligible hunts, including pronghorn.',summaries,results},null,2));
console.log(JSON.stringify(summaries));
