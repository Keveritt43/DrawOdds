"""Build dated Idaho unit map layers from reviewed cached NIFC, USDM and NRCS sources. No database access."""
import sys,pathlib,json,io,zipfile,importlib.util,hashlib,concurrent.futures
sys.path.insert(0,'out/geodeps')
import shapefile,numpy as np,rasterio
from rasterio.features import rasterize
from rasterio.warp import calculate_default_transform,reproject,Resampling
from shapely.geometry import shape,mapping,box
from shapely import STRtree,make_valid,union_all
from shapely.ops import transform
from pyproj import Transformer
from PIL import Image
spec=importlib.util.spec_from_file_location('fire','scripts/id-fire-build.py');fire=importlib.util.module_from_spec(spec);spec.loader.exec_module(fire)
root=pathlib.Path('out/id-fire');climate=pathlib.Path('out/id-conditions');out=pathlib.Path('public/idaho-visual');out.mkdir(parents=True,exist_ok=True)
features=fire.features.copy();geos=fire.firegeo.copy();provenance={}
for y in range(2010,2018):
 p=root/f'history-{y}.json';j=json.loads(p.read_text(encoding='utf8'));ids=[f['properties']['OBJECTID'] for f in j['features']]
 if len(ids)!=j['count'] or len(set(ids))!=len(ids):raise ValueError(('source count',y))
 provenance[str(y)]={'count':len(ids),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 for f in j['features']:
  f['year']=y;features.append(f);geos.append(fire.clean_polygon(f))
tree=STRtree(geos)
# Official severity polygons; a more severe layer is painted over less severe coverage.
z=zipfile.ZipFile(climate/'drought-current.zip');names={n.lower():n for n in z.namelist()};project=Transformer.from_crs(4326,5070,always_xy=True).transform;unproject=Transformer.from_crs(5070,4326,always_xy=True).transform
drought={}
for level in range(5):
 shp=next(n for n in names if n.endswith(f'_d{level}.shp'));stem=shp[:-4];kwargs={k:io.BytesIO(z.read(names[stem+'.'+k])) for k in ('shp','shx','dbf')};reader=shapefile.Reader(**kwargs);polys=[]
 for s in reader.shapes():
  if s.bbox[0]>-110.8 or s.bbox[2]<-117.4 or s.bbox[1]>49.2 or s.bbox[3]<41.8:continue
  g=make_valid(transform(project,shape(s.__geo_interface__)))
  if not g.is_empty:polys.append(g)
 drought[level]=union_all(polys)
stations={s['stationTriplet']:s for s in json.loads((climate/'stations.json').read_text(encoding='utf8'))}
conditions=json.loads(pathlib.Path('data/id-conditions.json').read_text(encoding='utf8'))['units'];grids=json.loads(pathlib.Path('data/id-fire-grid.json').read_text(encoding='utf8'))
# Most recent mapped fire year wins where polygons overlap. Color bands are ages, not habitat ratings.
def bucket(year):return 4 if year==2026 else 3 if year>=2022 else 2 if year>=2016 else 1
palette=np.array([[0,0,0,0],[237,204,56,205],[44,167,89,205],[241,139,28,205],[219,48,47,205]],dtype='uint8')
def run(f):
 unit=f['properties']['NAME'];g=make_valid(shape(f['geometry']));ids=tree.query(g,predicate='intersects');groups={y:[] for y in range(2010,2027)}
 for i in ids:
  part=geos[i].intersection(g)
  if not part.is_empty and part.area>0:groups[features[i]['year']].append(part)
 with rasterio.open(fire.terrain.root/f'{unit}-elev.tif') as ds:
  h,w=ds.height,ds.width;mask=rasterize([(mapping(g),1)],out_shape=(h,w),transform=ds.transform,dtype='uint8');classes=np.zeros((h,w),dtype='uint8')
  for year,parts in groups.items():
   if parts:
    burned=rasterize(((mapping(x),1) for x in parts),out_shape=(h,w),transform=ds.transform,dtype='uint8');classes[(burned!=0)&(mask!=0)]=bucket(year)
  n=int(np.count_nonzero(mask));cell=abs(ds.transform.a*ds.transform.e)/4046.8564224
  counts={str(c):int(np.count_nonzero(classes==c)) for c in range(1,5)}
  dst,ww,hh=calculate_default_transform(ds.crs,'EPSG:3857',w,h,*ds.bounds)
  if (ww,hh)!=(grids[unit]['width'],grids[unit]['height']):raise ValueError((unit,'grid changed'))
  reprojected=np.zeros((hh,ww),dtype='uint8');reproject(classes,reprojected,src_transform=ds.transform,src_crs=ds.crs,dst_transform=dst,dst_crs='EPSG:3857',resampling=Resampling.nearest)
  png=out/f'{unit}.png';Image.fromarray(palette[reprojected],mode='RGBA').save(png,optimize=True)
  stats={str(k):{'percent':round(v/n*100,2) if n else None,'acres':round(v*cell)} for k,v in counts.items()}
 fc=[]
 for level,polygon in drought.items():
  if polygon.is_empty or not polygon.intersects(g):continue
  clip=make_valid(polygon.intersection(g)).simplify(75,preserve_topology=True)
  if clip.is_empty:continue
  fc.append({'type':'Feature','properties':{'level':level},'geometry':mapping(transform(unproject,clip))})
 snow=conditions[unit]['snow']; station=stations.get(snow['triplet']) if snow else None
 if snow and not station:raise ValueError(('station missing',unit,snow['triplet']))
 obj={'drought':{'type':'FeatureCollection','features':fc},'station':{'longitude':station['longitude'],'latitude':station['latitude']} if station else None}
 (out/f'{unit}.json').write_text(json.dumps(obj,separators=(',',':')),encoding='utf8')
 return unit,{'ageBands':stats,'pngSha256':hashlib.sha256(png.read_bytes()).hexdigest()}
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=dict(pool.map(run,fire.terrain.units))
 if set(results)!=set(conditions):raise ValueError('unit identities differ')
 pathlib.Path('data/id-visual-meta.json').write_text(json.dumps({'snapshot':'2026-11-22','fireCoverage':'2010–2026','droughtDate':'2026-11-17','olderFireSources':provenance,'units':results},indent=2)+'\n',encoding='utf8')
 print('built',len(results),'units',flush=True)
