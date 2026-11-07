
/** Prepare the reviewed 2026 Colorado moose, sheep and goat snapshot without a database. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolvePdf } from '../src/sync/co/manifest';
import { pdfItems } from '../src/sync/core/pdf';
import { CO_SPECIAL_GIS, SPECIAL_REPORTS, type SpecialHunt, type SpecialPopulation, type SpecialSpecies } from '../src/lib/coSpecial';
import { decodeCode } from '../src/lib/coHunt';
import { drawRows, harvestRows, brochure, spans, readItems } from './co-special-pdf';
import type { MultiPolygon, Polygon, FeatureCollection } from 'geojson';

const cache = 'out/special';
const reportSpecies = { MOOSE: 'MOOSE', BIGHORN: 'SHEEP', DESERT: 'DESERT SHEEP', GOAT: 'GOAT' };
const current = 2026;
const read = (s: string) => readFile(cache + '/' + s, 'utf8');
const get = async (url: string, headers?: Record<string,string>) => {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Error('HTTP ' + response.status + ': ' + url);
  return response;
};
const write = async (path: string, data: unknown) => writeFile(path, JSON.stringify(data) + '\n');
async function download() {
  await mkdir(cache, { recursive: true });
  const reports = SPECIAL_REPORTS.filter(r => r.kind === 'draw' || r.kind === 'regs' || r.year === 2025 && ['harvest','population'].includes(r.kind));
  let i = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (i < reports.length) {
      const r = reports[i++];
      const file = [r.species, r.kind, r.year].join('-') + '.json';
      try { await read(file); continue; } catch { /* fetch missing report */ }
      const url = r.url.endsWith('.pdf') ? r.url : await resolvePdf(r.url, async (u,h) => (await get(u,h)).text());
      if (!url) throw Error('PDF not found: ' + r.url);
      await write(cache + '/' + file, await pdfItems(new Uint8Array(await (await get(url)).arrayBuffer())));
    }
  }));
  for (const layer of [7,8]) for (const sr of [4326,5070]) {
    const file = 'gis-' + layer + (sr === 5070 ? '-5070' : '') + '.json';
    try { await read(file); continue; } catch { /* fetch missing layer */ }
    await write(cache + '/' + file, await (await get(CO_SPECIAL_GIS + '/' + layer +
      '/query?where=1%3D1&outFields=*&outSR=' + sr + (sr === 4326 ? '&maxAllowableOffset=0.001' : '') + '&f=geojson')).json());
  }
}

function populations(species: SpecialSpecies): SpecialPopulation[] {
  const items = readItems(species + '-population-2025')[0];
  if (!items.some(i => /2025 POST HUNT POPULATION/i.test(i.s))) throw Error('Population year mismatch: ' + species);
  const line = (y:number) => items.filter(i => Math.abs(i.y-y) < 2).sort((a,b) => a.x-b.x);
  if (species === 'MOOSE') return items.filter(i => i.x<75&&/^\d{2}$/.test(i.s)&&i.s!=='99').flatMap(i => {
    const row = line(i.y);
    const units = row.find(q=>q.x>160&&q.x<450&&/^\d+(?:, \d+)*$/.test(q.s.trim()))?.s.trim().split(', ');
    const estimate = Number(row.find(q=>q.x>620&&q.x<700)?.s.replaceAll(',',''));
    const ratio = Number(row.find(q=>q.x>700&&q.x<770)?.s);
    if (!units || !Number.isInteger(estimate) || !Number.isInteger(ratio)) throw Error('Invalid moose population row '+i.s);
    return units.map(unit => ({unit,name:'Moose herd ' + i.s,year:2025,estimate,ratio}));
  });
  const estimateX = { BIGHORN: 298, DESERT: 261, GOAT: 258 }[species];
  return items.filter(i=>i.x<110&&/^[SG]\d{2}$/.test(i.s.trim())).flatMap(i=>{
    const row=line(i.y);
    const estimate=row.find(q=>Math.abs(q.x-estimateX)<10&&/^[\d,]+$/.test(q.s.trim()))?.s.trim();
    const name=row.filter(q=>q.x>i.x+30&&q.x<estimateX-70&&/[A-Za-z]/.test(q.s)).map(q=>q.s.trim()).join(' ');
    return estimate ? [{unit:i.s.trim(),name:name||null,year:2025,estimate:Number(estimate.replaceAll(',',''))}] : [];
  });
}

// Corrections for text split across multiple rows or stacked shared date cells in the 2026 brochures.
const unitOverrides: Record<string,string> = {
  ME005W1R:'5', ME006W1R:'6,16,161,171', MF006W1R:'6,16,161,171',
  MF018O1R:'18,181', MF028O1R:'28', MF037O1R:'37,371', MF041O1R:'41,42,421',
  MF047O1A:'47', MF047O1M:'47', MF047O1R:'47', MF047S1A:'47', MF047S1M:'47', MF047S1R:'47',
  MF052O1R:'52,411,521', MF066S1M:'66', MM025G1X:'25,26,231', MM039O1X:'39,46',
  MM041O1X:'41,42,52,411,421,521', MM047O1X:'47', MM047S1X:'47', MF051L1R:'51,59,511,581',
};
const fixedDates: Record<string,string> = {
  ME005W1R:'Dec. 1–20; Jan. 2–11', MF066S1M:'Sept. 12–20',
  MF015L1R:'Oct. 14–18; Oct. 24–Nov. 1; Nov. 7–15; Nov. 18–22',
  MF038L1R:'Oct. 14–18; Oct. 24–Nov. 1; Nov. 7–15; Nov. 18–22',
  SFS04O2R:'Sept. 1–Oct. 1', SFS32O1R:'Sept. 12–Oct. 4', SFS42O1R:'Nov. 30–Dec. 4',
  SMS61O1R:'Sept. 1–20; Dec. 1–31', SMS61S1R:'Sept. 1–20; Dec. 1–31',
  GFG12O2R:'Sept. 22–Oct. 8',
};
const weeklyRifle = ['Sept. 1–11', 'Sept. 14–25', 'Sept. 28–Oct. 9', 'Oct. 12–23'];
const dateString = (date:Date) => date.toISOString().slice(0,10);
function weekdays(dates: ReturnType<typeof spans>) {
  return dates.flatMap(({open,close})=>{
    const result: {open:string;close:string}[] = [];
    let prev: {open:string;close:string} | undefined;
    for (const d = new Date(open); dateString(d) <= close; d.setUTCDate(d.getUTCDate()+1)) {
      if ([0,6].includes(d.getUTCDay())) { prev=undefined; continue; }
      if (prev) prev.close = dateString(d);
      else { prev = {open:dateString(d),close:dateString(d)}; result.push(prev); }
    }
    return result;
  });
}

async function main() {
  await download();
  if (process.argv.includes('--download-only')) return;
  const regs = [...brochure(readItems('MOOSE-regs-2026'),true), ...brochure(readItems('BIGHORN-regs-2026'),false)];
  const result: SpecialHunt[] = [];
  for (const species of Object.keys(reportSpecies) as SpecialSpecies[]) {
    const maps = SPECIAL_REPORTS.filter(r=>r.species===species&&r.kind==='draw').sort((a,b)=>b.year-a.year)
      .map(r=>drawRows(readItems(species+'-draw-'+r.year),r.year,reportSpecies[species]));
    const harvest=harvestRows(readItems(species+'-harvest-2025'),2025);
    const population=populations(species);
    const expected={MOOSE:197,BIGHORN:124,DESERT:4,GOAT:48};
    let count=0;
    for (const [code] of maps[0]) {
      const d=decodeCode(code);
      if(!d||d.sex==='P')continue;
      const matches=regs.filter(r=>r.code===code);
      const largestUnits=matches.filter(r=>r.units.includes(d.unit)).sort((a,b)=>b.units.length-a.units.length)[0]?.units;
      const units=unitOverrides[code]?.split(',') ?? largestUnits ?? [d.unit];
      if (species==='GOAT'&&code==='GEG01O1A'&&!units.includes('G14')) units.push('G14');
      let dateRows=matches.filter(r=>r.dates.length).sort((a,b)=>b.dates.length-a.dates.length);
      const restricted = d.type==='G';
      const weekdayOnly = species==='GOAT'&&d.method==='R'&&['G04','G07','G10','G16'].includes(d.unit)||['SMS42O1R','SMS42O2R','SFS42O1R','SFS42O2R'].includes(code);
      const fixed = fixedDates[code] || (species==='GOAT'&&d.method==='R'&&['G07','G10','G16'].includes(d.unit) ? weeklyRifle[d.no-1] : null);
      const dates=restricted ? [] : fixed ? spans(fixed) : dateRows[0]?.dates??[];
      if(!restricted&&!dates.length)throw Error('Missing dates for '+code);
      if(d.method==='X'&&!restricted&&dates.length!==3)throw Error('Expected three season choices: '+code);
      const notes=restricted ? 'Reserved license; see CPW for eligibility.' :
        weekdayOnly ? 'Weekdays only. See the CPW brochure for area restrictions.' :
        d.type==='W' ? 'Ranching for Wildlife. Check CPW eligibility and ranch boundaries.' :
        'The brochure may restrict parts of these GMUs or individual dates.';
      const sex=d.sex==='M'?'antlered':d.sex==='F'?'antlerless':'either sex';
      const seasons = d.method==='X' ? dates.map((date,i)=>({sex,weapon:['ARCHERY','MUZZLELOADER','ANY'][i],dates:[date],notes:''})) :
        dates.length ? [{sex,weapon:d.method==='A'?'ARCHERY':d.method==='M'?'MUZZLELOADER':'ANY',dates:weekdayOnly?weekdays(dates):dates,notes:''}] : [];
      const herds = [...new Map(population.filter(p=>units.includes(p.unit)).map(p=>[p.name??p.unit,p])).values()];
      result.push({code,species,units,seasons,draws:maps.flatMap(m=>m.get(code)??[]),
        harvest:harvest.get(code)?[harvest.get(code)!]:[],population:herds,brochurePage:matches[0]?.page??null,notes});
      count++;
    }
    if(count!==expected[species])throw Error('Unexpected count for '+species+': '+count);
    console.log(species,count,'hunt codes;',harvest.size,'harvest rows;',population.length,'population rows');
  }
  const geometry = new Map<string, MultiPolygon>();
  for(const [layer,key] of [[7,'BSGMU'],[8,'MGGMU']] as const){
    const collection=JSON.parse(await read('gis-'+layer+'.json')) as FeatureCollection<Polygon | MultiPolygon>;
    for(const f of collection.features){
      const name=f.properties?.[key];
      if(!/^[SG]\d{2}$/.test(name)||!f.geometry)throw Error('Invalid GMU '+name);
      const parts=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
      const row=geometry.get(name)??{type:'MultiPolygon',coordinates:[]};
      row.coordinates.push(...parts.map(poly=>poly.map(ring=>ring.map(pt=>pt.map(v=>Math.round(v*1e5)/1e5)))));
      geometry.set(name,row);
    }
  }
  const missing=result.flatMap(h=>h.units.filter(u=>/^[SG]/.test(u)&&!geometry.has(u)));
  if(missing.length)throw Error('Missing boundary: '+missing.join(', '));
  await write('data/co-special-import.json',result.sort((a,b)=>a.code.localeCompare(b.code)));
  await write('data/co-special-gmu.json',Object.fromEntries([...geometry].sort(([a],[b])=>a.localeCompare(b))));
}
main().catch(e=>{console.error(e);process.exitCode=1});
