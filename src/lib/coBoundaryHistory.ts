/** CPW split GMU 43 and moved land between 79/791 in 2024; it realigned
 * the shared 97/99 boundary in 2026. Both members together retain their union.
 * Sources: CPW commission W-0 January 2024, and W-2 October 2025.
 */
const pairs:[string,string,number][]=[['43','431',2024],['79','791',2024],['97','99',2026]];
export function coBoundaryStart(units:string[],partial=false):number {
  const set=new Set(units);
  return Math.max(0,...pairs.filter(([a,b])=>partial ? set.has(a)||set.has(b) : set.has(a)!==set.has(b)).map(([, ,year])=>year));
}
/** Unit-specific pressure rows must use the current boundary even when a hunt covers both units. */
export function coUnitBoundaryComparable(unit:string,year:number):boolean {
  return year>=coBoundaryStart([unit]);
}
