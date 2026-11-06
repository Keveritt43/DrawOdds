import type { HuntSummary } from '@prisma/client';
import type { UnitTables, SeasonKind } from '@/sync/co/harvest';
import { coSeasonKind } from './coSeasonKind';
import { overlapsElk, otcElkOverlap, type SeasonContext } from './overlappingSeasons';

export const GENERAL_ELK_QUALITY_FACTOR = .75;
export type PressureElk = SeasonContext & { type: string; tagCode: string | null };
export type PressureReport = { year: number; source: string; data: unknown };
export interface CoPressureContext { generalElk: PressureElk[]; reports: PressureReport[] }
export interface CoPressure {
  status: 'none' | 'unknown' | 'complete' | 'missing';
  deerHuntersPerYear: number | null;
  elkHuntersPerYear: number | null;
  totalHuntersPerYear: number | null;
  density: number | null;
  evidence: { unit: string; season: SeasonKind; huntersPerYear: number | null; years: number[]; sources: string[] }[];
}
/** Unit-season all-license elk participation is a proxy; CPW does not isolate OTC hunters here. */
export function coDeerPressure(r: HuntSummary, context: CoPressureContext): CoPressure {
  const deer = r.hunters5 !== null && Number.isFinite(r.hunters5) && r.hunters5 >= 0 && r.harvestYears > 0
    ? r.hunters5 / Math.min(5,r.harvestYears) : null;
  const base: CoPressure = {status:'none',deerHuntersPerYear:deer,elkHuntersPerYear:0,totalHuntersPerYear:deer,density:r.huntersSqMi,evidence:[]};
  if (r.state !== 'CO' || r.species !== 'DEER') return base;
  const general = context.generalElk.filter(e=>e.state==='CO' && e.species==='ELK' && e.type==='GENERAL');
  const overlap = otcElkOverlap(r,general);
  if (overlap !== true) return {...base,status:overlap===null?'unknown':'none'};
  const latest = Math.max(0,...context.reports.map(rep=>rep.year));
  const keys = new Map<string,{unit:string;season:SeasonKind|null}>();
  for(const elk of general) for(const unit of new Set(r.units)) {
    if(!elk.units.includes(unit) || !overlapsElk({...r,units:[unit]},elk)) continue;
    const season=coSeasonKind(elk.tagCode);
    keys.set(`${unit}|${season ?? elk.tagCode ?? elk.id}`,{unit,season});
  }
  const evidence: CoPressure['evidence'] = [];
  let missing=false;
  for(const {unit,season} of keys.values()) {
    if(!season) { missing=true; continue; }
    const years:number[]=[], counts:number[]=[], sources:string[]=[];
    // One observation per unit/season/year. Never sum split and total tables or license codes.
    for(let year=latest-4;year<=latest;year++) {
      const reports=context.reports.filter(rep=>rep.year===year);
      const observations = reports.flatMap(rep=>{
        const t=rep.data as UnitTables;
        if(t.ambiguous?.some(a=>!a.split && a.unit===unit && a.kind===season)) return [];
        return (t.totals?.[season] ?? []).filter(x=>x.unit===unit).map(x=>({x,source:rep.source}));
      });
      if(!observations.length) continue;
      const valid=observations.every(({x})=>typeof x.hunters==='number' && Number.isFinite(x.hunters) && x.hunters>=0 &&
        (x.harvest===undefined || Number.isFinite(x.harvest) && x.harvest>=0 && x.harvest<=x.hunters));
      const distinct=new Set(observations.map(({x})=>x.hunters));
      if(!valid || distinct.size!==1) continue;
      years.push(year); counts.push(observations[0].x.hunters!); sources.push(...observations.map(x=>x.source));
    }
    const mean=counts.length ? counts.reduce((a,b)=>a+b,0)/counts.length : null;
    if(mean===null) missing=true;
    evidence.push({unit,season,huntersPerYear:mean,years,sources:[...new Set(sources)]});
  }
  const elk=missing?null:evidence.reduce((a,x)=>a+x.huntersPerYear!,0);
  const total=deer===null || elk===null ? null : deer+elk;
  const density=total!==null && r.acres && Number.isFinite(r.acres) && r.acres>0 ? total/(r.acres/640) : null;
  return {status:missing?'missing':'complete',deerHuntersPerYear:deer,elkHuntersPerYear:elk,totalHuntersPerYear:total,density,evidence};
}
