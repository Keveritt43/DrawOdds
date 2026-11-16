/** The owner's proposed timing rubric, for offline review of one certain season segment.
 * No claimed biological probability is inferred from the rubric. Unlisted windows are unknown. */
export function utV2ShadowTiming(species:string,weapon:string,open:string,close:string):number|null {
  if(!['DEER','ELK','PRONGHORN'].includes(species)||!['ANY','ARCHERY','MUZZLELOADER'].includes(weapon))return null;
  const a=Date.parse(open),b=Date.parse(close);
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return null;
  const d=new Date((a+b)/2),md=(d.getUTCMonth()+1)*100+d.getUTCDate();
  const between=(lo:number,hi:number)=>md>=lo&&md<=hi;
  const bow=weapon==='ARCHERY';
  if(species==='DEER'){
    if(bow){
      if(md>=1115||md<=115)return 14.5;
      if(between(1101,1114))return 12.5;
      if(between(815,910))return 10;
      if(between(911,930))return 8;
      if(between(1001,1020))return 7;
    }else{
      if(between(1105,1125)||md>=1201||md<=115)return 15;
      if(between(1028,1104))return 13;
      if(between(1021,1027)||between(815,905))return 11.5;
      if(between(1001,1020))return 7;
    }
  }else if(species==='ELK'){
    if(bow){
      if(between(912,925))return 13.5;
      if(between(901,911))return 12;
      if(between(926,1010))return 10.5;
      if(between(815,831))return 10;
    }else{
      if(between(901,925))return 15;
      if(between(926,1012))return 14;
      if(between(1013,1031))return 9;
    }
    if(between(1101,1231))return 8;
  }else{
    if(between(801,910))return 15;
    if(bow&&between(911,930))return 13.5;
    if(!bow&&between(911,1010))return 14.5;
    if(between(1011,1031))return 10;
    if(md>=1101||md<=131)return 7;
  }
  return null;
}

/** Scenario only: apply the guide's floor to actual Utah limited-entry categories. */
export function utV2ShadowFloor(category:string|null|undefined,code:string|null|undefined,tier:string|null|undefined):number {
  if(!['Limited-Entry','Premium'].includes(category??'')||!/^(DB10|EB3|PB5)/.test(code??''))return 0;
  return tier==='Elite'?76:tier==='Excellent'?68:0;
}
