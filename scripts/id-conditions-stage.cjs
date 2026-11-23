/** Stage source candidates only; this does not publish or update the database. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const [asOf,droughtDate]=process.argv.slice(2);
const dateOK=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)===s;
if(!dateOK(asOf)||!dateOK(droughtDate)||droughtDate>asOf||new Date(`${droughtDate}T00:00:00Z`).getUTCDay()!==2){console.error('Usage: node scripts/id-conditions-stage.cjs YYYY-MM-DD YYYY-MM-DD (as-of date, USDM Tuesday)');process.exit(1);}
const root=path.join('out','id-conditions-candidates',`${asOf}-${droughtDate}`);
fs.mkdirSync(path.dirname(root),{recursive:true});
fs.mkdirSync(root,{recursive:false});
const manifest={asOf,droughtDate,downloadedAt:new Date().toISOString(),sources:[]};
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error(`${r.status} ${url}`);return Buffer.from(await r.arrayBuffer());}
function store(name,bytes,url,count){fs.writeFileSync(path.join(root,name),bytes,{flag:'wx'});manifest.sources.push({name,url,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),...(count===undefined?{}:{count})});}
async function run(){
 const stamp=droughtDate.replaceAll('-','');const droughtUrl=`https://droughtmonitor.unl.edu/Data/shapefiles_r/usdm_${stamp}.zip`;
 const zip=await get(droughtUrl);if(zip.length<100||zip.subarray(0,2).toString()!=='PK')throw Error('Invalid drought archive');store('drought.zip',zip,droughtUrl);
 const end=new Date(`${asOf}T00:00:00Z`), start=new Date(end.getTime()-7*86400000).toISOString().slice(0,10);
 const snow=new URL('https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data');Object.entries({stationTriplets:'*:ID:SNTL',elements:'WTEQ',duration:'DAILY',beginDate:start,endDate:asOf,centralTendencyType:'MEDIAN',returnFlags:'true',returnSuspectData:'false'}).forEach(([k,v])=>snow.searchParams.set(k,v));
 const snowBytes=await get(snow);const observations=JSON.parse(snowBytes);if(!Array.isArray(observations)||!observations.length)throw Error('No snow station records');store('snow.json',snowBytes,snow.toString(),observations.length);
 const year=Number(asOf.slice(0,4)), service='https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query';
 if(year>2026 && asOf>=`${year}-04-01`){const u=new URL(snow);u.searchParams.set('beginDate',`${year}-04-01`);u.searchParams.set('endDate',`${year}-04-01`);const b=await get(u);const rows=JSON.parse(b);if(!Array.isArray(rows)||!rows.length)throw Error('April snow history missing');store(`snow-${year}.json`,b,u.toString(),rows.length);}
 if(year>2026){let d=new Date(Date.UTC(year,8,30));while(d.getUTCDay()!==2)d=new Date(d.getTime()-86400000);const day=d.toISOString().slice(0,10);if(day<=asOf){const u=`https://droughtmonitor.unl.edu/Data/shapefiles_r/usdm_${day.replaceAll('-','')}.zip`;const b=await get(u);if(b.length<100||b.subarray(0,2).toString()!=='PK')throw Error('September drought history missing');store(`drought-${year}.zip`,b,u);}}
 const params={f:'json',where:`attr_IncidentTypeCategory='WF' AND poly_FeatureCategory IN ('Wildfire Final Fire Perimeter','Wildfire Daily Fire Perimeter') AND attr_FireDiscoveryDateTime >= DATE '${year}-01-01 00:00:00' AND attr_FireDiscoveryDateTime < DATE '${year+1}-01-01 00:00:00'`,geometry:'-117.3,41.9,-110.9,49.1',geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects',returnIdsOnly:'true'};
 const idsUrl=new URL(service);Object.entries(params).forEach(([k,v])=>idsUrl.searchParams.set(k,v));const idsBody=await get(idsUrl);const obj=JSON.parse(idsBody);if(obj.error||!Array.isArray(obj.objectIds)||new Set(obj.objectIds).size!==obj.objectIds.length)throw Error('Invalid fire ID inventory');store('fire-ids.json',idsBody,idsUrl.toString(),obj.objectIds.length);
 const features=[];
 for(let i=0;i<obj.objectIds.length;i+=100){
  const u=new URL(service);Object.entries({f:'geojson',objectIds:obj.objectIds.slice(i,i+100).join(','),outFields:'OBJECTID,poly_IncidentName,poly_FeatureCategory,poly_IRWINID,poly_DateCurrent,poly_PolygonDateTime,attr_IncidentName,attr_UniqueFireIdentifier,attr_FireDiscoveryDateTime,attr_IncidentTypeCategory,poly_GISAcres',outSR:'5070',returnGeometry:'true',maxAllowableOffset:'10'}).forEach(([k,v])=>u.searchParams.set(k,v));
  const part=JSON.parse(await get(u));if(!Array.isArray(part.features)||part.features.some(f=>!f.geometry))throw Error('Invalid fire geometry batch');features.push(...part.features);
 }
 const found=features.map(f=>f.properties?.OBJECTID);if(found.length!==obj.objectIds.length||new Set(found).size!==found.length||found.some(id=>!obj.objectIds.includes(id)))throw Error('Incomplete fire geometry');
 store('fire-geometry.json',Buffer.from(JSON.stringify({type:'FeatureCollection',features})),service,features.length);
 fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});console.log(`Staged candidate sources in ${root}. Complete the reviewed build before publishing.`);
}
run().catch(e=>{console.error(`Staging incomplete: ${e.message}. Inspect or remove the candidate directory before retrying.`);process.exitCode=1;});
