/** Read-only geometry review. Writes local artifacts only; does not access agency sync or the database. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { featureCollection, bbox, intersect, area } from '@turf/turf';

const areas={
 ID:{fips:'16',DEER:['Adams','Bonneville','Boise','Franklin','Lemhi'],ELK:['Fremont','Idaho','Shoshone','Valley','Adams']},
 CO:{fips:'08',DEER:['Eagle','Garfield','Mesa','Montrose','Gunnison'],ELK:['Las Animas','Moffat','Larimer','Mesa','Routt']},
 MT:{fips:'30',DEER:['Ravalli','Missoula','Rosebud','Flathead','Lincoln'],ELK:['Park','Powder River','Fergus','Gallatin','Lewis and Clark']},
 UT:{fips:'49',DEER:['Kane','Garfield','Summit','Utah','Morgan'],ELK:['Garfield','San Juan','Millard','Beaver','Box Elder']},
 WA:{fips:'53',DEER:['Okanogan','Chelan','Ferry'],ELK:['Kittitas']},
 WY:{fips:'56',DEER:['Lincoln','Carbon','Sublette'],ELK:['Park','Teton']},
};
const overlap=(a,b)=>a[0]<b[2] && b[0]<a[2] && a[1]<b[3] && b[1]<a[3];
const get=async(url)=>{const r=await fetch(url);if(!r.ok)throw Error(`HTTP ${r.status}: ${url}`);return r.json();};
const result={generated:new Date().toISOString(),countySource:'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/7',unitSource:'Production /api/units, read-only; existing unit geometry and current state data',note:'Geographic overlap is a proxy; it does not locate any individual record. Boundary errors and slivers need review.',states:{},errors:[]};
mkdirSync('out/trophy-demand',{recursive:true});
for (const [state,cfg] of Object.entries(areas)) {
  const params=new URLSearchParams({where:`STATE='${cfg.fips}'`,outFields:'STATE,BASENAME,GEOID',outSR:'4326',f:'geojson'});
  const counties=await get(`https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/7/query?${params}`);
  const units=await get(`https://web-production-39e54.up.railway.app/api/units?state=${state}`);
  if (!Array.isArray(counties.features)||!Array.isArray(units.features)) throw Error(`Missing geometries: ${state}`);
  const output={}; result.states[state]=output;
  for (const species of ['DEER','ELK']) {
    const selected=counties.features.filter(f=>cfg[species].includes(f.properties.BASENAME));
    const missing=cfg[species].filter(n=>!selected.some(f=>f.properties.BASENAME===n));
    if(missing.length)throw Error(`Missing counties: ${state} ${missing.join(', ')}`);
    const candidates=[];
    for (const unit of units.features) {
      if (!unit.geometry) continue;
      const name=String(unit.properties.name), box=bbox(unit), total=area(unit);
      if (!(total>0)) {result.errors.push(`${state}:${name}: invalid unit area`);continue;}
      const matches=[];
      for (const county of selected) {
        if (!overlap(box,bbox(county))) continue;
        try {
          const clipped=intersect(featureCollection([unit,county]));
          const squareMeters=clipped ? area(clipped) : 0;
          if(squareMeters>1)matches.push({area:county.properties.BASENAME,share:Number((squareMeters/total).toFixed(6))});
        } catch(e) {result.errors.push(`${state}:${name}:${county.properties.BASENAME}: ${e.message}`);}
      }
      if(matches.length)candidates.push({unit:name,matches});
    }
    output[species]=candidates;
    console.log(`${state} ${species}: ${candidates.length} intersecting units`);
  }
}
writeFileSync('out/trophy-demand/unit-crosswalk-review.json',JSON.stringify(result,null,2));
console.log(`Geometry errors: ${result.errors.length}`);
if (result.errors.length) throw Error('Crosswalk contains geometry errors; review before creating runtime data');
const compact={generated:result.generated,source:result.countySource,method:'Geographic overlap; does not locate individual records.',states:{}};
for (const [state,bySpecies] of Object.entries(result.states)) {
  compact.states[state]={};
  const known=['MT','UT','WA','WY'].includes(state)
    ? JSON.parse(readFileSync(`data/${state.toLowerCase()}/hunts.json`,'utf8')).hunts : null;
  for(const species of ['DEER','ELK']) {
    const unitSet=known ? new Set(known.filter(h=>h.species===species).flatMap(h=>h.units)) : null;
    compact.states[state][species]=bySpecies[species].filter(r=>!unitSet || unitSet.has(r.unit))
      .map(r=>({unit:r.unit,overlap:Math.max(...r.matches.map(m=>m.share))}));
  }
}
writeFileSync('data/trophy-unit-areas.json',JSON.stringify(compact,null,2)+'\n');
