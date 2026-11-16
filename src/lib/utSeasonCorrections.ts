import audit from '../../data/ut/season-audit-2026.json';
type Season={weapon:string;sex:string;dates:{open:string|null;close:string|null}[];notes?:string;uncertain?:boolean;weaponLabel?:string};
type Row={state:string;tagCode:string|null;weapon:string;tagSeasons:unknown};
type Source={start:string;end:string;weapon:string;uncertain:boolean};
const archery=new Set(['Restricted Archery','September Archery','Late Archery']);
/** Applies only to the matching published 2026 hunt and exact source date windows. */
export function withUtSeasonCorrections<T extends Row>(r:T):T {
  if(r.state!=='UT'||!r.tagCode)return r;
  const source=(audit as Record<string,Source[]>)[r.tagCode];
  const ts=r.tagSeasons as {year?:number;seasons?:Season[]}|null;
  if(!source||ts?.year!==2026||!Array.isArray(ts.seasons)||ts.seasons.length!==source.length)return r;
  if(!source.every((x,i)=>ts.seasons![i].dates.length===1&&ts.seasons![i].dates[0].open===x.start&&ts.seasons![i].dates[0].close===x.end))return r;
  const seasons=ts.seasons.flatMap((s,i)=>{
    const v=source[i];const corrected=archery.has(v.weapon)?'ARCHERY':v.weapon==='Restricted Rifle'?'OTHER':s.weapon;
    // Mixed geographic windows do not say which of this hunt's units each
    // date covers, so none is a verified date for a selected unit.
    const uncertain=v.uncertain || (source.length>1 && source.some(x=>x.uncertain));
    const note=uncertain ? (v.weapon==='CWMU'||/operator/i.test(s.notes??'')?'Dates within this window are set by the operator.':'Dates vary by area; confirm with DWR.') : '';
    if(v.weapon==='H.A.M.S.S') return ['ARCHERY','MUZZLELOADER','OTHER'].map(weapon=>({...s,weapon,weaponLabel:'HAMSS restricted weapons',notes:'Restricted handgun, archery, muzzleloader, shotgun or straight-walled rifle; confirm DWR equipment rules.'}));
    return [{...s,weapon:corrected,...(uncertain?{uncertain:true}:{}),
      ...(v.weapon==='Restricted Archery'?{weaponLabel:'Restricted archery'}:{}),
      ...(v.weapon==='Restricted Muzzleloader'?{weaponLabel:'Restricted muzzleloader'}:{}),
      ...(v.weapon==='Restricted Rifle'?{weaponLabel:'Restricted rifle'}:{}),
      ...(note&&!s.notes?.includes(note)?{notes:[s.notes,note].filter(Boolean).join(' · ')}:{})}];
  });
  const weapons=[...new Set(seasons.map(s=>s.weapon))];
  const weapon=source.every(x=>x.weapon==='H.A.M.S.S')?'OTHER':weapons.length===1?weapons[0]:r.weapon;
  return {...r,weapon,tagSeasons:{...ts,seasons}} as T;
}
