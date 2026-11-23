"""Download dated, public Idaho conditions and agency trailhead snapshots. No DB access."""
import sys, pathlib, json, concurrent.futures, re, datetime, hashlib
sys.path.insert(0,'out/geodeps')
import requests, time
root=pathlib.Path('out/id-conditions'); root.mkdir(parents=True,exist_ok=True)
def fetch(name,url,params=None,as_json=True):
 p=root/name
 if p.exists():return json.loads(p.read_text(encoding='utf8')) if as_json else p.read_bytes()
 for attempt in range(5):
  try:
   r=requests.get(url,params=params,timeout=180);r.raise_for_status();break
  except requests.RequestException:
   if attempt==4:raise
   time.sleep(2*(attempt+1))
 if as_json:
  j=r.json()
  if isinstance(j,dict) and 'error' in j:raise ValueError(j['error'])
  p.write_text(json.dumps(j),encoding='utf8');return j
 p.write_bytes(r.content);return r.content
base='https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/'
stations=fetch('stations.json',base+'stations',{'stationTriplets':'*:ID:SNTL','returnStationElements':'false','activeOnly':'true'})
print('active stations',len(stations),flush=True)
def snow(year):
 date=f'{year}-04-01';j=fetch(f'snow-{year}.json',base+'data',{'stationTriplets':'*:ID:SNTL','elements':'WTEQ','duration':'DAILY','beginDate':date,'endDate':date,'centralTendencyType':'MEDIAN','returnFlags':'true','returnSuspectData':'false'})
 print('snow',year,len(j),flush=True)
 return j
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(snow,range(2017,2027)))
# Most recent available seven days, later read with the observation date explicitly retained.
j=fetch('snow-current.json',base+'data',{'stationTriplets':'*:ID:SNTL','elements':'WTEQ','duration':'DAILY','beginDate':'2026-11-14','endDate':'2026-11-21','centralTendencyType':'MEDIAN','returnFlags':'true','returnSuspectData':'false'})
print('current snow',len(j),flush=True)
services=[('fs','https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InfraRecreationSites_01/MapServer/0',"site_subtype = 'TRAILHEAD'",'objectid,site_name,development_status,recarea_status,usda_portal_url'),('blm','https://gis.blm.gov/arcgis/rest/services/recreation/BLM_Natl_Recs_pts/MapServer/14','1=1','OBJECTID,FET_NAME,UNIT_NAME,WEB_LINK')]
for name,url,where,fields in services:
 bbox={'geometry':'-117.3,41.9,-110.9,49.1','geometryType':'esriGeometryEnvelope','inSR':4326,'spatialRel':'esriSpatialRelIntersects'}
 ids=fetch(name+'-ids.json',url+'/query',{'f':'json','where':where,**bbox,'returnIdsOnly':'true'}).get('objectIds',[])
 if not ids or len(ids)!=len(set(ids)):raise ValueError(name+' empty or duplicate IDs')
 features=[]
 for i in range(0,len(ids),20):
  part=fetch(f'{name}-{i}.json',url+'/query',{'f':'geojson','objectIds':','.join(map(str,ids[i:i+20])),'outFields':fields,'outSR':5070,'returnGeometry':'true'})
  features.extend(part['features'])
 seen=[f['properties'].get('objectid',f['properties'].get('OBJECTID')) for f in features]
 if set(seen)!=set(ids) or len(seen)!=len(ids) or any(not f.get('geometry') for f in features):raise ValueError((name,'incomplete'))
 print(name,len(features),flush=True)
# Archived weekly drought perimeters: last Tuesday of September in each year, plus latest map.
for year in range(2017,2027):
 d=datetime.date(year,9,30)
 while d.weekday()!=1:d-=datetime.timedelta(days=1)
 fname='USDM_'+d.strftime('%Y%m%d')+'.zip'; rel=('' if year>=2025 else 'Archive/')
 try:b=fetch('drought-'+str(year)+'.zip','https://droughtmonitor.unl.edu/Data/shapefiles_r/'+rel+fname,as_json=False)
 except requests.HTTPError:
  b=fetch('drought-'+str(year)+'.zip','https://droughtmonitor.unl.edu/Data/shapefiles_r/'+rel+fname.lower(),as_json=False)
 print('drought',year,str(d),len(b),flush=True)
b=fetch('drought-current.zip','https://droughtmonitor.unl.edu/Data/shapefiles_r/usdm_20261117.zip',as_json=False)
print('current drought',len(b),flush=True)




