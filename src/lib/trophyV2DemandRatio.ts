/** Offline v2 demand input: applicants per permit, not raw application counts.
 *
 * Raw counts rank a 2,000-permit hunt above a 5-permit hunt that draws 2,000
 * applications, which measures how big and easy a hunt is, not how sought after.
 * Applicants per permit in the same pool removes the permit-count effect. It still
 * reflects price, points and access as well as animal quality, so it is a demand
 * signal, not a measure of trophy size. */
export interface DemandRow {
  code:string; species:string; year:number; category:string; weapon:string;
  pool:'Resident'|'Nonresident';
  applications:number|null; permits:number|null;
}
export interface DemandPercentile { ratio:number; percentile:number; peers:number; allWeapon:boolean }

const ratioOf=(r:DemandRow)=>typeof r.applications==='number'&&Number.isFinite(r.applications)&&r.applications>=0&&
  typeof r.permits==='number'&&Number.isInteger(r.permits)&&r.permits>0 ? r.applications/r.permits : null;

/** Mid-rank percentile among unique hunts in the same species, year, category, pool and weapon.
 * Fewer than ten weapon peers falls back to all weapons in the category, still ten or more;
 * otherwise null. A pool with no permits has no ratio and stays unknown. */
export function demandRatioPercentile(rows:DemandRow[],target:DemandRow):DemandPercentile|null {
  const ratio=ratioOf(target);
  if(ratio===null)return null;
  const cohort=(weapon:boolean)=>{
    const byCode=new Map<string,number>();
    for(const r of rows){
      if(r.species!==target.species||r.year!==target.year||r.category!==target.category||r.pool!==target.pool||(weapon&&r.weapon!==target.weapon))continue;
      const v=ratioOf(r);
      if(v===null)continue;
      // The same hunt cannot vote twice; conflicting duplicates make the cohort unknown.
      const old=byCode.get(r.code);
      if(old!==undefined&&old!==v)return null;
      byCode.set(r.code,v);
    }
    return byCode.get(target.code)===ratio?[...byCode.values()]:null;
  };
  for(const allWeapon of [false,true]){
    const values=cohort(!allWeapon);
    if(!values)return null;
    if(values.length<10)continue;
    const percentile=(values.filter(v=>v<ratio).length+values.filter(v=>v===ratio).length/2)/values.length;
    return {ratio,percentile,peers:values.length,allWeapon};
  }
  return null;
}
