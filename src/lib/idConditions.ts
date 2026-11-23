import snapshot from '../../data/id-conditions.json';

type Observation={date:string;swe:number;median:number|null;percent:number|null};
type Trailhead={agency:'fs'|'blm';name:string;status:string|null;id:number};
type Snow={station:string;triplet:string;elevation:number;distance:number;history:Record<string,Observation>;current:Observation|null};
export type IdahoConditions={trailheads:Trailhead[];snow:Snow|null;drought:Record<string,number>};
const units=snapshot.units as unknown as Record<string,IdahoConditions>;
export const idConditionsUnit=(unit:string):IdahoConditions|null=>units[unit]??null;
/** Each condition is unit context. Other states are not filtered. */
export function matchesIdConditions(hunt:{state:string;units:string[]},minSites:string,minDrought:string):boolean {
 if(hunt.state!=='ID'||(!minSites&&!minDrought))return true;
 const n=Number(minSites),d=Number(minDrought);
 return hunt.units.some(unit=>{const x=idConditionsUnit(unit);if(!x)return false;
  return (!minSites||(Number.isFinite(n)&&n>=0&&x.trailheads.length>=n)) && (!minDrought||(Number.isFinite(d)&&d>=0&&typeof x.drought.current==='number'&&x.drought.current>=d));});
}

/** Preserve unit identity when exporting a hunt that touches several units. */
export function idConditionsExport(unitNames:string[]):[string,string,string] {
 const rows=unitNames.flatMap(unit=>{const x=idConditionsUnit(unit);return x?[{unit,x}]:[]});
 return [rows.map(({unit,x})=>`${unit}: ${x.trailheads.length}`).join('; '), rows.map(({unit,x})=>`${unit}: ${x.drought.current}%`).join('; '), rows.map(({unit,x})=>x.snow ? `${unit}: ${x.snow.station}, ${x.snow.current?.date ?? 'no current reading'}, ${x.snow.current?.swe ?? 'unknown'} in SWE` : `${unit}: no nearby station`).join('; ')];
}
