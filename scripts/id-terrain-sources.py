import json, pathlib, sys, time
sys.path.insert(0, str(pathlib.Path('out/geodeps').resolve()))
import requests
BASE=pathlib.Path('out/id-terrain'); BASE.mkdir(parents=True,exist_ok=True)
s=requests.Session()
def fetch(name,url,params):
 p=BASE/name
 if p.exists(): return json.loads(p.read_text())
 for i in range(4):
  try:
   r=s.get(url,params=params,timeout=180);r.raise_for_status();j=r.json()
   if 'error' in j: raise ValueError(j['error'])
   p.write_text(json.dumps(j));return j
  except Exception as e:
   print('retry',name,str(e),flush=True);time.sleep((i+1)*3)
 raise RuntimeError(name)
def layer(name,url,fields,idfield):
 count=fetch(name+'-count.json',url+'/query',{'f':'json','where':'1=1','returnCountOnly':'true'})['count']; print(name,count,flush=True)
 rows=[]
 size=5 if name=='units' else 500
 for offset in range(0,count,size):
  j=fetch(f'{name}-ordered-{offset}.json',url+'/query',{'f':'geojson','where':'1=1','outFields':fields+','+idfield,'orderByFields':idfield,'outSR':5070,'returnGeometry':'true','resultOffset':offset,'resultRecordCount':size,'maxAllowableOffset':10})
  rows.extend(j['features']);print(name,len(rows),flush=True)
 ids=[x['properties'].get(idfield) for x in rows]
 if len(rows)!=count or len(set(ids))!=count or None in ids:raise ValueError((name,'incomplete/duplicate IDs',len(rows),count))
 return rows
layer('units','https://gisportal-idfg.idaho.gov/hosting/rest/services/Hunting/MapServer/3','NAME','OBJECTID_1')
layer('land','https://gis.blm.gov/idarcgis/rest/services/lands/BLM_ID_Surface_Management_Agency/FeatureServer/0','MGMT_AGNCY','OBJECTID')

