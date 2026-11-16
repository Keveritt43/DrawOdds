import {timingScore} from './presetTiming';

/** Limited offline rubric subset; null means the v2 timing rule needs implementation or review. */
export function utV2ShadowTiming(species:string,weapon:string,open:string,close:string):number|null {
  if(species==='PRONGHORN')return null;
  const base=timingScore(species,weapon,open,close);
  const a=Date.parse(open),b=Date.parse(close);
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return null;
  const d=new Date((a+b)/2),md=(d.getUTCMonth()+1)*100+d.getUTCDate();
  return species==='DEER'&&['ANY','MUZZLELOADER'].includes(weapon)&&md>=1021&&md<=1027?11.5:base;
}

/** Scenario only: apply the guide's floor to actual Utah limited-entry categories. */
export function utV2ShadowFloor(category:string|null|undefined,code:string|null|undefined,tier:string|null|undefined):number {
  if(!['Limited-Entry','Premium'].includes(category??'')||!/^(DB10|EB3|PB5)/.test(code??''))return 0;
  return tier==='Elite'?76:tier==='Excellent'?68:0;
}
