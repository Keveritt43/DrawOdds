/** WDFW's April 22, 2026 corrections, applied without changing production history.
 * https://wdfw.wa.gov/sites/default/files/publications/02706/2026%20Big%20Game%20Pamphlet%20Corrections_4.22.26_web.pdf
 * Only the specific malformed 2026 OCR string is replaced. */
const verified = new Map([['2015','Mission'],['2016','Colockum'],['2018','Teanaway'],['2019','Peaches Ridge'],['2020','Observatory'],['2022','Goose Prairie'],['2023','Bethel'],['2024','Rimrock'],['2025','Cowiche']]);
export function withWaVerifiedDates<T extends {state:string;species:string;type:string;id:string;name?:string|null;openDate?:Date|null;closeDate?:Date|null;tagSeasons?:unknown;pointOdds?:unknown}>(r:T):T {
 const p=r.pointOdds as {dates?:string;category?:string;year?:number;demand?:Record<string,unknown>;harvest?:Array<{year:number;hunters?:number|null;harvest?:number|null}>}|null;
 const seasons=r.tagSeasons as {year?:number;seasons?:Array<Record<string,unknown>>}|null;
 const code=r.id.startsWith('WA:')?r.id.slice(3):'';
 const name=verified.get(code);
 if(r.state!=='WA'||r.species!=='ELK'||r.type!=='CONTROLLED'||!name||!r.name?.startsWith(name+' ')||p?.category!=='Quality Elk'||p.year!==2025||p.dates!=='Sept. 2 5 -2 9'||seasons?.year!==2026||r.openDate||r.closeDate)return r;
 const open=new Date('2026-09-25T12:00:00Z'),close=new Date('2026-09-29T12:00:00Z');
 const corrected={...r,openDate:open,closeDate:close,pointOdds:{...p,dates:'Sept. 25–29'},tagSeasons:{...seasons,seasons:(seasons.seasons??[]).map(s=>({...s,dates:[{open:'2026-09-25',close:'2026-09-29'}]}))}};
 // Before 2023, choice 2016 was the later October/November Colockum hunt.
 // Do not attribute those hunters or harvests to the current September hunt.
 if(code==='2016' && Array.isArray(p.harvest)) {
   const history=p.harvest.filter(h=>h.year>=2023), usable=history.filter(h=>typeof h.hunters==='number'&&h.hunters>0&&typeof h.harvest==='number'&&h.harvest>=0&&h.harvest<=h.hunters);
   const n=usable.reduce((a,h)=>a+(h.hunters??0),0),k=usable.reduce((a,h)=>a+(h.harvest??0),0);
   const acres=(r as T & {acres?:number|null}).acres;
   const demand=Object.fromEntries(Object.entries(p.demand??{}).filter(([year])=>Number(year)>=2023));
   return {...corrected,pointOdds:{...p,dates:'Sept. 25–29',demand,harvest:history,oddsUnavailableReason:'Point-level estimates are unavailable because this hunt number previously identified a different season.'},oddsByPts:null,hunters5:n||null,harvest5:n?k:null,harvestYears:usable.length,success5:n?k/n:null,smallSample:n<30,huntersSqMi:n&&usable.length&&typeof acres==='number'&&acres>0?n/usable.length/(acres/640):null,resTagAndFill:null,nrTagAndFill:null};
 }
 return corrected;
}
