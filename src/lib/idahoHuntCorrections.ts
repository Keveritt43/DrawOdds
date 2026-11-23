import type { Prisma } from '@prisma/client';

const dateDay=(v:Date|string|null|undefined)=>v instanceof Date?v.toISOString().slice(0,10):String(v??'').slice(0,10);
/** The 2026 deer regulations define Area 41-1 as all of Units 41 and 42. */
export function isIdaho2026Deer1074(h: {state?:string;species:string;huntNumber?:number|null;areaName?:string|null;openDate?:Date|string|null;closeDate?:Date|string|null}):boolean {
  return (h.state??'ID')==='ID' && h.species==='DEER' && h.huntNumber===1074 && h.areaName==='41-1' &&
    dateDay(h.openDate)==='2026-08-15' && dateDay(h.closeDate)==='2026-09-30';
}

/** Include the legacy row when fetching Unit 42; check its exact dated identity after reading. */
export function idahoUnitCandidate(unit:string):Prisma.HuntSummaryWhereInput {
  return unit==='42' ? { OR:[{units:{has:unit}},{state:'ID',species:'DEER',huntNumber:1074,areaName:'41-1',openDate:new Date('2026-08-15T00:00:00Z'),closeDate:new Date('2026-09-30T00:00:00Z')}] } : {units:{has:unit}};
}

/** Verified against IDFG's 2026 Area 55 controlled-hunt regulations. */
export function isIdaho2026Early55(h: {state?:string;species:string;huntNumber?:number|null;oddsLastYear?:number|null;openDate?:Date|string|null;closeDate?:Date|string|null}):boolean {
  const day=(v:Date|string|null|undefined)=>v instanceof Date?v.toISOString().slice(0,10):String(v??'').slice(0,10);
  return (h.state??'ID')==='ID' && h.species==='DEER' && h.huntNumber===1044 && h.oddsLastYear===2026 &&
    day(h.openDate)==='2026-08-15' && day(h.closeDate)==='2026-09-24';
}

/** Full-unit Area 55 identities checked against the 2026 deer and moose regulations. */
export function isIdaho2026Full55(h:{state?:string;species:string;huntNumber?:number|null;oddsLastYear?:number|null;openDate?:Date|string|null;closeDate?:Date|string|null}):boolean {
  if((h.state??'ID')!=='ID'||h.oddsLastYear!==2026)return false;
  const key=`${h.species}:${h.huntNumber}:${dateDay(h.openDate)}:${dateDay(h.closeDate)}`;
  return ['DEER:1044:2026-08-15:2026-09-24','DEER:1045:2026-10-05:2026-10-31',
    'DEER:1062:2026-11-01:2026-11-14','MOOSE:3057:2026-08-30:2026-11-23'].includes(key);
}

/** The stored summary incorrectly includes Unit 57. Preserve source data, but do not
 * reuse land, area or density derived from that incorrect geography. */
export function withIdahoVerifiedArea<T extends {state?:string;species:string;huntNumber?:number|null;areaName?:string|null;oddsLastYear?:number|null;openDate?:Date|string|null;closeDate?:Date|string|null;hunters5?:number|null;harvestYears?:number|null}>(h:T):T {
  if(isIdaho2026Deer1074(h))return {...h,units:['41','42'],areaId:null,publicPct:null,privatePct:null,huntablePct:null,accessYesPct:null,
    accessYesAcres:null,accessYesCount:null,acres:null,huntersSqMi:null,scoreQuality:null,
    scoreAccess:null,scoreCrowd:null,scoreOppRes:null,scoreOppNr:null};
  if(!isIdaho2026Full55(h))return h;
  // IDFG defines Area 55 as the entire unit. These are the reviewed Nov 2026
  // Unit 55 land snapshot (not the invalid stored 55+57 area). Density uses
  // this hunt's matching hunter-years and the same acres as the unit map.
  const acres=648520;
  const huntersSqMi=typeof h.hunters5==='number' && h.hunters5>=0 && typeof h.harvestYears==='number' && h.harvestYears>0
    ? h.hunters5/h.harvestYears/(acres/640) : null;
  return {...h,units:['55'],areaId:null,publicPct:52.4,privatePct:47.6,huntablePct:52.4,accessYesPct:0,
    accessYesAcres:0,accessYesCount:0,acres,huntersSqMi};
}
