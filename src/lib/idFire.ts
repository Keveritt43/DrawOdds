import data from '../../data/id-fire.json';

import { idFirePeriod, type IdahoFirePeriod } from './idSnapshot';
export { FIRE_PERIODS, firePeriodsFor, idFirePeriod } from './idSnapshot';
export type { IdahoFirePeriod } from './idSnapshot';
export type FireRecord = { year:number; name:string; acres:number; ids:number[]; source:'history'|'wfigs' };
export type IdahoFireUnit = { annualAcres:Record<string,number>; periodAcres:Record<IdahoFirePeriod,number>; overlapAcres:Record<IdahoFirePeriod,{remote:number;remoteHigh:number}>; fires:FireRecord[]; perimeterRecords:number };
const units = data.units as unknown as Record<string,IdahoFireUnit>;
export const idFireUnit = (unit:string):IdahoFireUnit | null => units[unit] ?? null;
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

