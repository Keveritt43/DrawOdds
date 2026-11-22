import type { IdahoFirePeriod } from './idFire';
export type OverlapOptions={remote:boolean;high:boolean;steep:boolean;fire:IdahoFirePeriod|'none'};
/** A mask pixel encodes public/remote/high/steep in red and wildfire years in green/blue. */
export function matchesIdOverlap(r:number,g:number,b:number,o:OverlapOptions):boolean {
 if(!(r&1) || (o.remote && !(r&2)) || (o.high && !(r&4)) || (o.steep && !(r&8)))return false;
 switch(o.fire){case 'recent':return !!(g&0xe0);case 'mature':return !!(g&0x3f);case 'five':return !!(g&0xf8);case 'all':return !!g || !!(b&1);default:return true;}
}
