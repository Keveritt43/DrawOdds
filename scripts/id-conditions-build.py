"""Build dated ID unit conditions and agency trailhead context from cached public sources."""
import sys,json,pathlib,glob,math,io,zipfile,datetime,hashlib,os
sys.path.insert(0,'out/geodeps')
import shapefile
from shapely.geometry import shape,Point,box
from shapely import make_valid,union_all
from shapely.ops import transform
from pyproj import Transformer
root=pathlib.Path('out/id-conditions'); terrain=pathlib.Path('out/id-terrain')
def read(p):return json.loads(p.read_text(encoding='utf8'))
files=glob.glob(str(terrain/'units-[0-9]*.json')); units=[f for p in files for f in json.load(open(p,encoding='utf8'))['features']]
if len(units)!=100 or len({f['properties']['NAME'] for f in units})!=100:raise ValueError(('unit count or identities',len(units)))
geo={f['properties']['NAME']:make_valid(shape(f['geometry'])) for f in units}
project=Transformer.from_crs(4326,5070,always_xy=True).transform
stations=[]
for s in read(root/'stations.json'):
 if s.get('latitude') and s.get('longitude'):
  s['point']=transform(project,Point(s['longitude'],s['latitude']));stations.append(s)
observations={}
history_years=sorted(int(p.stem.split('-')[1]) for p in root.glob('snow-[0-9][0-9][0-9][0-9].json'))
for y in history_years:
 for station in read(root/f'snow-{y}.json'):
  vals=station.get('data',[]);v=vals[0].get('values',[]) if vals else []
  if v and isinstance(v[0].get('value'),(float,int)):
   d=v[0]; med=d.get('median');observations.setdefault(station['stationTriplet'],{})[str(y)]={'swe':d['value'],'median':med,'percent':round(d['value']/med*100) if isinstance(med,(int,float)) and med>0 else None,'date':d['date']}
current={}
for station in read(root/'snow-current.json'):
 vals=station.get('data',[]);v=vals[0].get('values',[]) if vals else []
 v=[x for x in v if isinstance(x.get('value'),(int,float))]
 if v:
  d=max(v,key=lambda x:x['date']);med=d.get('median');current[station['stationTriplet']]={'swe':d['value'],'median':med,'percent':round(d['value']/med*100) if isinstance(med,(int,float)) and med>=1 else None,'date':d['date']}
trail=[]
for agency in ('fs','blm'):
 ids=read(root/(agency+'-ids.json'))['objectIds']
 for i in range(0,len(ids),20):
  p=root/f'{agency}-{i}.json'
  for f in read(p)['features']:
   if not f.get('geometry'):continue
   props=f['properties'];trail.append({'point':shape(f['geometry']),'agency':agency,'name':props.get('site_name') or props.get('FET_NAME') or 'Unnamed site','status':props.get('development_status') or props.get('recarea_status'),'id':props.get('objectid',props.get('OBJECTID'))})
print('trailheads',len(trail),flush=True)
def drought(file):
 z=zipfile.ZipFile(file); names=z.namelist(); geoms=[]
 # Multiple severity layers can overlap. Union D1–D4 to obtain area in at least moderate drought.
 for x in names:
  if not x.lower().endswith('.shp') or not any(x.lower().endswith('_d'+str(n)+'.shp') for n in (1,2,3,4)):continue
  stem=x[:-4]; lookup={n.lower():n for n in names};kwargs={k:io.BytesIO(z.read(lookup[(stem+'.'+k).lower()])) for k in ('shp','shx','dbf')}
  r=shapefile.Reader(**kwargs)
  for sh in r.shapes():
   if sh.bbox[0]>-110.8 or sh.bbox[2]<-117.4 or sh.bbox[1]>49.2 or sh.bbox[3]<41.8:continue
   try:g=make_valid(transform(project,shape(sh.__geo_interface__)))
   except Exception as e:raise ValueError((file,x,str(e)))
   if not g.is_empty:geoms.append(g)
 if not any(x.lower().endswith('_d1.shp') for x in names):raise ValueError(('unexpected drought archive',file,names))
 return union_all(geoms)
records={u:{'trailheads':[],'snow':None,'drought':{}} for u in geo}
for u,g in geo.items():
 sites=[t for t in trail if g.covers(t['point'])]
 records[u]['trailheads']=[{k:t[k] for k in ('agency','name','status','id')} for t in sorted(sites,key=lambda x:(x['agency'],x['name']))]
 # A named station, never a computed unit-average. Require a nearby station and disclose centroid distance.
 if stations:
  nearest=min(stations,key=lambda s:g.centroid.distance(s['point']));miles=g.centroid.distance(nearest['point'])/1609.344
  if miles<=35:
   key=nearest['stationTriplet'];records[u]['snow']={'station':nearest['name'],'triplet':key,'elevation':nearest['elevation'],'distance':round(miles,1),'history':observations.get(key,{}),'current':current.get(key)}
drought_years=sorted(int(p.stem.split('-')[1]) for p in root.glob('drought-[0-9][0-9][0-9][0-9].zip'))
for key in [str(y) for y in drought_years]+['current']:
 g=drought(root/('drought-'+key+'.zip'))
 for u,unit in geo.items():records[u]['drought'][key]=round(100*unit.intersection(g).area/unit.area,1)
 print('drought built',key,flush=True)
inputs={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.glob('*')) if p.is_file()}
if any(not 0<=pct<=100 for x in records.values() for pct in x['drought'].values()):raise ValueError('invalid drought percentage')
out={'snapshot':os.environ.get('ID_REFRESH_SNAPSHOT','2026-11-22'),'droughtCurrent':os.environ.get('ID_REFRESH_DROUGHT','2026-11-17'),'units':records,'inputs':inputs}
pathlib.Path('data/id-conditions.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf8')
print('units',len(records),'snow coverage',sum(x['snow'] is not None for x in records.values()),flush=True)


