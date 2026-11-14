/** Review-only overlap candidates. Input: downloaded DWR WMU GeoJSONs in the named directory.
 * No tier is assigned; management areas and hunt boundaries differ in geography and season.
 */
const fs=require('node:fs');
const turf=require('@turf/turf');
const path=require('node:path');
const source=process.argv[2];
if(!source)throw Error('Pass the directory containing ut-management-{deer,elk,pronghorn}.json');
const boundary=JSON.parse(fs.readFileSync('data/ut/units.json','utf8')).units;
const hunts=JSON.parse(fs.readFileSync('data/ut/hunts.json','utf8')).hunts;
const species={DEER:'deer',ELK:'elk',PRONGHORN:'pronghorn'};
const result=[];
let geometryErrors=0;
for(const [sp,name] of Object.entries(species)){
 const m=JSON.parse(fs.readFileSync(path.join(source,`ut-management-${name}.json`),'utf8')).features;
 const unitNames=new Set(hunts.filter(h=>h.species===sp).flatMap(h=>h.units));
 for(const b of boundary.filter(x=>unitNames.has(x.name))){
  const feature=turf.feature(b.geometry), size=turf.area(feature);
  if(!size)continue;
  const bb=b.bbox;
  for(const f of m){
   const fb=turf.bbox(f);
   if(bb[2]<fb[0]||fb[2]<bb[0]||bb[3]<fb[1]||fb[3]<bb[1])continue;
   try{
    const intersection=turf.intersect(turf.featureCollection([feature,f]));
    const fraction=intersection?turf.area(intersection)/size:0;
    if(fraction>=.01)result.push({species:sp,huntBoundary:b.name,label:b.label,managementKey:f.properties.Unit_ID ?? f.properties.mgmt_unit_key,managementName:f.properties.Boundary_Name ?? f.properties.mgmt_unit_name,portion:Math.min(1,Math.round(fraction*10000)/10000)});
   }catch(e){geometryErrors++;console.error('Geometry failed:',sp,b.name,f.properties.Unit_ID ?? f.properties.mgmt_unit_key,String(e));}
  }
 }
}
if(geometryErrors)throw Error(`${geometryErrors} polygon intersections failed; no crosswalk was written`);
fs.writeFileSync(path.join(source,'ut-crosswalk-candidates.json'),JSON.stringify(result,null,2));
console.log('Candidate overlaps',result.length);
