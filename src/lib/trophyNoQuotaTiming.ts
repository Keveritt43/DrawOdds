/** Offline scenario only. A two-point difference is a product judgment, not a biological probability.
 * Uses only actual open days in one confirmed segment. The early any-weapon deer exception is a
 * candidate velvet hunt, not verification that an animal is actually in velvet. */
export function utV2ShadowTiming(species:string,weapon:string,open:string,close:string):number|null {
  if(!['DEER','ELK','PRONGHORN'].includes(species)||!['ANY','ARCHERY','MUZZLELOADER'].includes(weapon))return null;
  const a=Date.parse(open),b=Date.parse(close),day=86_400_000;
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<a||(b-a)/day>366)return null;
  for(let t=a;t<=b;t+=day){
    const d=new Date(t),md=(d.getUTCMonth()+1)*100+d.getUTCDate();
    if(species==='ELK'&&md>=915&&md<=1007)return 15;
    if(species==='DEER'&&md>=1101&&md<=1115)return 15;
    if(species==='DEER'&&weapon==='ANY'&&md>=815&&md<=905)return 15;
  }
  return 13;
}
