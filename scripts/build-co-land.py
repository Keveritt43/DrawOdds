"""Offline official SMA/GMU overlay; cached inputs, equal-area EPSG:5070, no database access."""
import sys,json,time,pathlib
sys.path.insert(0,str(pathlib.Path('out/geodeps').resolve()))
import requests
from shapely.geometry import shape
from shapely import make_valid,STRtree,union_all
root=pathlib.Path('out/land');root.mkdir(exist_ok=True)
sma='https://gis.blm.gov/coarcgis/rest/services/lands/BLM_Colorado_Surface_Management_Agency/FeatureServer/1'
gmu='https://services5.arcgis.com/ttNGmDvKQA7oeDQ3/ArcGIS/rest/services/CPWAdminData/FeatureServer/6'
def query(url,params):
 for attempt in range(4):
  try:
   r=requests.get(url+'/query',params=params,timeout=180);r.raise_for_status();j=r.json()
   if 'error' in j:raise ValueError(j['error'])
   return j
  except Exception:
   if attempt==3:raise
   time.sleep(3*(attempt+1))
def cached(name,url,params):
 p=root/name
 if p.exists():return json.loads(p.read_text())
 j=query(url,params);p.write_text(json.dumps(j));time.sleep(.8);return j
base={'f':'geojson','where':'1=1','outFields':'adm_code','outSR':5070,'returnGeometry':'true','orderByFields':'OBJECTID','resultRecordCount':500}
count=query(sma,{'f':'json','where':'1=1','returnCountOnly':'true'})['count']
features=[]
for offset in range(0,count,500):
 j=cached('sma-'+str(offset)+'.json',sma,{**base,'resultOffset':offset});features+=j['features'];print('SMA',len(features),'/',count,flush=True)
if len(features)!=count:raise ValueError('Incomplete SMA download')
units=cached('gmu.json',gmu,{'f':'geojson','where':'1=1','outFields':'GMUID','outSR':5070,'returnGeometry':'true'})['features']
polys=[];codes=[]
for f in features:
 if f['geometry']:
  polys.append(make_valid(shape(f['geometry'])));codes.append(f['properties']['adm_code'])
tree=STRtree(polys);out={}
public={'BLM','BOR','DOD','USFS_NG','NPS','OTHER','STA','USFS_LU','LOCAL','USFS','USFW','BLM_LU'}
for f in units:
 g=make_valid(shape(f['geometry']));pieces={}
 for i in tree.query(g,predicate='intersects'):
  p=polys[i].intersection(g)
  if not p.is_empty:pieces.setdefault(codes[i] or 'UNKNOWN',[]).append(p)
 merged={k:union_all(v) for k,v in pieces.items()}
 area=g.area
 coverage=union_all(list(merged.values())).area/area
 overlap=sum(p.area for p in merged.values())/area-coverage
 if coverage<.98 or coverage>1.001 or overlap>.01:raise ValueError(('Invalid coverage',f['properties'],coverage,overlap))
 pub=union_all([p for k,p in merged.items() if k in public]).area/area*100
 private=merged.get('PRI');priv=private.area/area*100 if private is not None else 0
 tribal=merged.get('BIA');trib=tribal.area/area*100 if tribal is not None else 0
 key=str(int(f['properties']['GMUID']))
 out[key]={'acres':round(area/4046.8564224,2),'publicPct':round(pub,3),'privatePct':round(priv,3),'tribalPct':round(trib,3),'unknownPct':round(max(0,100-pub-priv-trib),3),'coverage':round(coverage,6),'ownership':{k:round(p.area/area*100,3) for k,p in merged.items()}}
 print('GMU',key,round(pub,1),round(priv,1),flush=True)
artifact={'source':sma,'boundarySource':gmu,'retrievedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'projection':'EPSG:5070','note':'Surface management/ownership; public ownership is not legal hunting permission. Tribal and unmapped areas are separate from private. No Access Yes or private-access enrollment added.','units':out}
pathlib.Path('data/co-land.json').write_text(json.dumps(artifact,indent=2)+'\n')
print('COMPLETE',len(out),flush=True)
