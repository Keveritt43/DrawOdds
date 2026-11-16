import incomplete from '../../data/co-incomplete-harvest-observations.json';

type Row={id:string;state:string;units:string[];pointOdds:unknown;acres?:number|null;tagCode?:string|null};
type Observation={year:number;basis:string;hunters:number;harvest:number;days?:number|null;few?:boolean};
const bad=new Map<string,Set<string>>();
for(const [id,year,basis,hunters,harvest,units] of incomplete as [string,number,string,number,number,string][]) {
  const keys=bad.get(id)??new Set<string>();keys.add(JSON.stringify([year,basis,hunters,harvest,units]));bad.set(id,keys);
}
/** Suppress source observations proven partial in a read-only production audit.
 * Exact source counts and unit identity prevent a stale correction overriding a later import.
 */
export function withCoHarvestCoverage<T extends Row>(r:T):T {
  const keys=bad.get(r.id), po=r.pointOdds as {harvest?:unknown;harvestPriorCoverageAudit?:unknown}|null;
  if(r.state!=='CO'||!po||!Array.isArray(po.harvest))return r;
  const code=r.tagCode??r.id.split(':').at(-1)??'';
  const sexSpecific=['M','F'].includes(code[1]);
  const raw=po.harvest as Observation[];
  const rows=raw.filter(h=>!(sexSpecific&&h.basis==='units-all')&&!keys?.has(JSON.stringify([h.year,h.basis,h.hunters,h.harvest,r.units.join(',')])));
  if(rows.length===raw.length)return r;
  const latest=rows.slice().sort((a,b)=>a.year-b.year).slice(-5),last=latest.at(-1);
  const hunters=latest.reduce((n,h)=>n+h.hunters,0),harvest=latest.reduce((n,h)=>n+h.harvest,0);
  const density=hunters&&latest.length&&r.acres&&r.acres>0?hunters/latest.length/(r.acres/640):null;
  return {...r,pointOdds:{...po,harvest:rows,harvestPriorCoverageAudit:po.harvestPriorCoverageAudit??raw,
    harvestCoverageNote:'Some historical unit estimates were excluded because they did not cover every hunt unit or their hunter counts did not match the license sex.'},
    hunters5:hunters||null,harvest5:hunters?harvest:null,harvestYears:latest.length,harvestLastYear:last?.year??null,
    success5:hunters?harvest/hunters:null,successLast:last&&last.hunters?last.harvest/last.hunters:null,huntersSqMi:density,
    smallSample:!!last?.few||!!latest.length&&hunters/latest.length<20,daysPerHunter5:null,daysPerHarvest5:null,resTagAndFill:null,nrTagAndFill:null} as T;
}
