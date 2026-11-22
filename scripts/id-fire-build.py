"""Build Idaho mapped wildfire summaries and 100-m terrain/overlap masks. No database writes."""
import sys,json,pathlib,math,hashlib,importlib.util,concurrent.futures
sys.path.insert(0,'out/geodeps')
import numpy as np,rasterio
from rasterio.features import rasterize
from rasterio.warp import calculate_default_transform,reproject,Resampling
from shapely.geometry import shape,mapping
from shapely import STRtree,make_valid,union_all
from pyproj import Transformer
from PIL import Image
spec=importlib.util.spec_from_file_location('terrain','scripts/id-terrain-pilot.py');terrain=importlib.util.module_from_spec(spec);spec.loader.exec_module(terrain)
root=pathlib.Path('out/id-fire');output=pathlib.Path('public/idaho-fire');output.mkdir(parents=True,exist_ok=True)
features=[]
for y in range(2018,2027):
 j=json.loads((root/f'{"history" if y<2020 else "wfigs"}-{y}.json').read_text(encoding='utf8'))
 for f in j['features']:
  f['year']=y; features.append(f)
def clean_polygon(f):
 g=shape(f['geometry'])
 try: v=make_valid(g)
 except Exception: v=g.buffer(0)
 if v.geom_type == 'GeometryCollection':
  v=union_all([x for x in v.geoms if x.geom_type in ('Polygon','MultiPolygon')])
 if v.is_empty or v.geom_type not in ('Polygon','MultiPolygon'):
  # A 10-m generalized polygon can collapse. Refetch its original geometry; never infer a zero.
  kind='history' if f['year']<2020 else 'wfigs'
  url=('https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/'+('InterAgencyFirePerimeterHistory_All_Years_View' if kind=='history' else 'WFIGS_Interagency_Perimeters')+'/FeatureServer/0')
  result=terrain.get(url+'/query',{'f':'geojson','objectIds':str(f['properties']['OBJECTID']),'outFields':'OBJECTID','outSR':5070,'returnGeometry':'true'})
  if len(result.get('features',[]))!=1:raise ValueError(('cannot repair fire',f['year'],f['properties'].get('OBJECTID')))
  v=make_valid(shape(result['features'][0]['geometry']))
  if v.geom_type=='GeometryCollection':v=union_all([x for x in v.geoms if x.geom_type in ('Polygon','MultiPolygon')])
  if v.is_empty or v.geom_type not in ('Polygon','MultiPolygon'):raise ValueError(('invalid source fire geometry',f['year'],f['properties'].get('OBJECTID')))
 return v
firegeo=[clean_polygon(f) for f in features]; ftree=STRtree(firegeo)
periods={'recent':range(2023,2026),'mature':range(2018,2024),'five':range(2021,2026),'all':range(2018,2027)}
def run(unit):
 saved=root/f'{unit}-summary.json';im=output/f'{unit}.png'
 if saved.exists() and im.exists() and 'overlapAcres' in json.loads(saved.read_text(encoding='utf8')):return unit,'cached'
 f=next(x for x in terrain.units if x['properties']['NAME']==unit);g=make_valid(shape(f['geometry']));minx,miny,maxx,maxy=g.bounds
 hits=terrain.tree.query(g,predicate='intersects');pub=union_all([terrain.polys[i].intersection(g) for i in hits if terrain.land[i]['properties'].get('MGMT_AGNCY') in terrain.public])
 if unit=='76':pub=pub.difference(shape(json.loads((terrain.root/'bear-lake.json').read_text())['features'][0]['geometry']))
 bound=(minx-1609.344,miny-1609.344,maxx+1609.344,maxy+1609.344);lines=[]
 for name,url,where in terrain.sources:lines.extend(shape(x['geometry']) for x in terrain.routes(name,url,where,bound,unit) if x.get('geometry'))
 ids=ftree.query(g,predicate='intersects'); byyear={y:[] for y in range(2018,2027)};named={}
 for i in ids:
  part=firegeo[i].intersection(g)
  if part.is_empty or part.area<=0:continue
  f=features[i];p=f['properties'];year=f['year'];byyear[year].append(part)
  name=(p.get('poly_IncidentName') or p.get('attr_IncidentName') or p.get('INCIDENT') or 'Unnamed fire').strip(); named.setdefault((year,name),[]).append((part,p['OBJECTID']))
 details=[]
 for (year,name),parts in named.items():
  acres=round(union_all([part for part,_ in parts]).area/4046.8564224)
  if acres>=10:details.append({'year':year,'name':name,'acres':acres,'ids':[oid for _,oid in parts],'source':'history' if year<2020 else 'wfigs'})
 unions={y:union_all(geos) for y,geos in byyear.items() if geos}
 annual={str(y):round(geo.area/4046.8564224) for y,geo in unions.items()}
 areas={k:round(union_all([unions[y] for y in years if y in unions]).area/4046.8564224) for k,years in periods.items()}
 with rasterio.open(terrain.root/f'{unit}-elev.tif') as ds:
  elev=ds.read(1,masked=True);z=elev.filled(np.nan).astype('float32');trans=ds.transform;h,w=z.shape
  landmask=rasterize([(mapping(pub),1)],out_shape=(h,w),transform=trans,dtype='uint8').astype(bool)
  valid=landmask & np.isfinite(z) & (z>-1000)
  near=rasterize(((mapping(x.buffer(1609.344)),1) for x in lines),out_shape=(h,w),transform=trans,dtype='uint8').astype(bool)
  dy,dx=np.gradient(z,abs(trans.e),abs(trans.a));slope=np.degrees(np.arctan(np.hypot(dx,dy)));steep=np.isfinite(slope)&(slope>=20)
  flags=(valid.astype('uint8') | ((valid & ~near).astype('uint8')<<1) | ((valid & (z>=2743.2)).astype('uint8')<<2) | ((valid & steep).astype('uint8')<<3))
  low=np.zeros((h,w),dtype='uint8');high=np.zeros((h,w),dtype='uint8')
  for y,geo in unions.items():
   b=rasterize([(mapping(geo),1)],out_shape=(h,w),transform=trans,dtype='uint8')
   if y<2026:low |= (b << (y-2018))
   else:high |= b
  # Joint screening counts are computed on the original equal-area grid, never by multiplying separate unit totals.
  cell=abs(trans.a*trans.e)/4046.8564224
  period_masks={'recent':(low & 0xe0)!=0,'mature':(low & 0x3f)!=0,'five':(low & 0xf8)!=0,'all':(low!=0)|(high!=0)}
  overlap={k:{'remote':round(np.count_nonzero(valid & ~near & mask)*cell),'remoteHigh':round(np.count_nonzero(valid & ~near & (z>=2743.2) & mask)*cell)} for k,mask in period_masks.items()}
  # Rectify the projected 5070 grid to Web Mercator before using it as a map image.
  dst,ww,hh=calculate_default_transform(ds.crs,'EPSG:3857',w,h,*ds.bounds)
  if max(ww,hh)>5000:raise ValueError((unit,'output too large'))
  bands=[]
  for src in (flags,low,high):
   dest=np.zeros((hh,ww),dtype='uint8');reproject(src,dest,src_transform=trans,src_crs=ds.crs,dst_transform=dst,dst_crs='EPSG:3857',resampling=Resampling.nearest);bands.append(dest)
  rgb=np.stack(bands,axis=2);Image.fromarray(rgb,mode='RGB').save(im,optimize=True)
  left=dst.c;top=dst.f;right=left+dst.a*ww;bottom=top+dst.e*hh;proj=Transformer.from_crs(3857,4326,always_xy=True);bounds=[list(proj.transform(x,y)) for x,y in [(left,top),(right,top),(right,bottom),(left,bottom)]]
 record={'unit':unit,'annualAcres':annual,'periodAcres':areas,'overlapAcres':overlap,'fires':sorted(details,key=lambda x:x['acres'],reverse=True)[:30],'perimeterRecords':len(ids),'corners':bounds,'width':ww,'height':hh,'pngSha256':hashlib.sha256(im.read_bytes()).hexdigest()}
 saved.write_text(json.dumps(record),encoding='utf8');return unit,'ok'
if __name__=='__main__':
 names=sys.argv[1:] or [f['properties']['NAME'] for f in terrain.units]
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for unit,status in pool.map(run,names):print(unit,status,flush=True)
