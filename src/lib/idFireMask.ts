import type { IdahoFirePeriod } from './idFire';
export type OverlapOptions={remote:boolean;high:boolean;steep:boolean;fire:IdahoFirePeriod|'none';matchAll?:boolean};
/** A mask pixel encodes public/remote/high/steep in red and wildfire years in green/blue. */
export function matchesIdOverlap(r:number,g:number,b:number,o:OverlapOptions):boolean {
 if(!(r&1) || (o.remote && !(r&2)) || (o.high && !(r&4)) || (o.steep && !(r&8)))return false;
 switch(o.fire){case 'recent':return !!(g&0xe0);case 'mature':return !!(g&0x3f);case 'five':return !!(g&0xf8);case 'all':return !!g || !!(b&1);default:return true;}
}

/** Display a separate category for each combination of selected terrain conditions.
 * Fire, when selected, remains a restriction; cells outside mapped public management stay hidden. */
export function idTerrainCategory(r:number,g:number,b:number,o:OverlapOptions):number {
 if(!matchesIdOverlap(r,g,b,{remote:false,high:false,steep:false,fire:o.fire}))return 0;
 const selected=(o.remote?1:0)|(o.high?2:0)|(o.steep?4:0);
 if(!selected)return o.fire==='none'?0:8;
 const present=(o.remote && (r&2)?1:0)|(o.high && (r&4)?2:0)|(o.steep && (r&8)?4:0);
 return o.matchAll && present!==selected ? 0 : present;
}
