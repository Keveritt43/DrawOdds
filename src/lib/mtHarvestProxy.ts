type Row={state:string;species:string;pointOdds:unknown};
export function mtHarvestProxy(pointOdds:unknown):'permit'|'species'|null {
  const po=pointOdds as {mulePermit?:boolean;harvestBasis?:string}|null;
  return po?.mulePermit?'permit':po?.harvestBasis?.includes('harvest per deer hunter')?'species':null;
}
/** A permit is not necessarily used; all deer hunters are not species-specific hunters. */
export function withoutMtProxySuccess<T extends Row>(r:T):T {
  if(r.state!=='MT'||r.species!=='DEER'||!mtHarvestProxy(r.pointOdds))return r;
  return {...r,success5:null,successLast:null,hunters5:null,harvest5:null,daysPerHunter5:null,daysPerHarvest5:null,
    resTagAndFill:null,nrTagAndFill:null,scoreQuality:null,scoreSuccess:null,scoreAccess:null,scoreCrowd:null,scoreOppRes:null,scoreOppNr:null} as T;
}
export function mtProxyRate(pointOdds:unknown):number|null {
  const rows=(pointOdds as {harvest?:{hunters:number;harvest:number}[]}|null)?.harvest??[];
  const n=rows.reduce((s,h)=>s+h.hunters,0),k=rows.reduce((s,h)=>s+h.harvest,0);
  return n>0&&k>=0&&k<=n?k/n:null;
}
