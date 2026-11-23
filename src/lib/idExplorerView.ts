import { FIRE_PERIODS, type IdahoFirePeriod } from './idFire';
import type { OverlapOptions } from './idFireMask';
export type ExplorerView = { fire:boolean; drought:boolean; snowpack:boolean; station:boolean; terrain:OverlapOptions };
export const DEFAULT_EXPLORER_VIEW:ExplorerView = { fire:true, drought:false, snowpack:false, station:false, terrain:{remote:false,high:false,steep:false,fire:'none',matchAll:false} };
const validFire = (value:string | null):IdahoFirePeriod|'none' => value && Object.hasOwn(FIRE_PERIODS,value) ? value as IdahoFirePeriod : 'none';
export function readExplorerView(raw:string):ExplorerView|null {
 const p=new URLSearchParams(raw); if(p.get('explore')!=='1')return null;
 return {fire:p.get('fire')==='1',drought:p.get('drought')==='1',snowpack:p.get('snowpack')==='1',station:p.get('station')==='1',terrain:{remote:p.get('remote')==='1',high:p.get('high')==='1',steep:p.get('steep')==='1',fire:validFire(p.get('burn')),matchAll:p.get('match')===null||p.get('match')==='all'}};
}
export function writeExplorerView(view:ExplorerView):string {
 const p=new URLSearchParams({explore:'1',fire:view.fire?'1':'0',drought:view.drought?'1':'0',snowpack:view.snowpack?'1':'0',station:view.station?'1':'0',remote:view.terrain.remote?'1':'0',high:view.terrain.high?'1':'0',steep:view.terrain.steep?'1':'0',burn:view.terrain.fire,match:view.terrain.matchAll?'all':'any'});return p.toString();
}
