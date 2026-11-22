import data from '../../data/id-fire.json';

export type IdahoFirePeriod = 'recent' | 'mature' | 'five' | 'all';
export type FireRecord = { year:number; name:string; acres:number; ids:number[]; source:'history'|'wfigs' };
export type IdahoFireUnit = { annualAcres:Record<string,number>; periodAcres:Record<IdahoFirePeriod,number>; overlapAcres:Record<IdahoFirePeriod,{remote:number;remoteHigh:number}>; fires:FireRecord[]; perimeterRecords:number };
export const FIRE_PERIODS: Record<IdahoFirePeriod,string> = { recent:'2023–2025 (1–3 years before 2026)', mature:'2018–2023 (3–8 years before 2026)', five:'2021–2025 (1–5 years before 2026)', all:'2018–2026 (2026 incomplete)' };
const units = data.units as unknown as Record<string,IdahoFireUnit>;
export const idFireUnit = (unit:string):IdahoFireUnit | null => units[unit] ?? null;
export const idFirePeriod = (value:string):IdahoFirePeriod | null => Object.hasOwn(FIRE_PERIODS,value) ? value as IdahoFirePeriod : null;
export function idFireBest(units:string[],period:IdahoFirePeriod):number|null {
 const values=units.map(idFireUnit).filter((v):v is IdahoFireUnit=>v!==null).map(v=>v.periodAcres[period]);
 return values.length ? Math.max(...values) : null;
}
/** Unit-screening context, not fire area inside a particular hunt. Other states are unaffected. */
export function matchesIdFire(hunt:{state:string;units:string[]}, period:string, minimum:string, remote='', high=''):boolean {
 if(hunt.state!=='ID')return true;
 const range=idFirePeriod(period);if(!range)return true;
 const n=Number(minimum), threshold=Number.isFinite(n)&&n>0?n:1;
 if(remote || high==='1') {
  // When both filters are selected, require the same mapped ground in the same unit to meet both thresholds.
  const requested=Number(remote), jointMinimum=Math.max(threshold,Number.isFinite(requested)&&requested>0?requested:1);
  return hunt.units.some(unit=>{const value=idFireUnit(unit)?.overlapAcres?.[range]?.[high==='1'?'remoteHigh':'remote'];return typeof value==='number' && value>=jointMinimum;});
 }
 const acres=idFireBest(hunt.units,range);return acres!==null && acres>=threshold;
}

