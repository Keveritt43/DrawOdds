type Row={state:string;species:string;year:number;pool:string;measure:string;cohort:string;code:string;value:number};
/** All-weapon fallback within the same draw category and pool; duplicate hunt identities cannot vote twice. */
export function allWeaponBaseline(rows:Row[], target:Row):{percentile:number;peers:number}|null {
  const i=target.cohort.lastIndexOf(' / ');
  if(i<0||!Number.isFinite(target.value)||target.value<0)return null;
  const category=target.cohort.slice(0,i), byCode=new Map<string,number>();
  for(const row of rows){
    const j=row.cohort.lastIndexOf(' / ');
    if(j<0||row.cohort.slice(0,j)!==category||row.state!==target.state||row.species!==target.species||row.year!==target.year||row.pool!==target.pool||row.measure!==target.measure||!Number.isFinite(row.value)||row.value<0)continue;
    const old=byCode.get(row.code);
    if(old!==undefined&&old!==row.value)return null;
    byCode.set(row.code,row.value);
  }
  if(byCode.get(target.code)!==target.value||byCode.size<10)return null;
  const values=[...byCode.values()];
  return {peers:values.length,percentile:(values.filter(v=>v<target.value).length+values.filter(v=>v===target.value).length/2)/values.length};
}
