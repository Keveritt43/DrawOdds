import sys,json,glob,pathlib,math,time
sys.path.insert(0,'out/geodeps')
import requests, numpy as np, rasterio
from rasterio.features import rasterize
from shapely.geometry import shape, mapping, box
from shapely import STRtree, make_valid, union_all
from rasterio.transform import from_bounds
root=pathlib.Path('out/id-terrain'); sess=requests.Session()
def get(url,params,timeout=180):
 for k in range(4):
  try:
   r=sess.get(url,params=params,timeout=timeout);r.raise_for_status(); j=r.json()
   if 'error' in j:raise ValueError(j['error'])
   return j
  except Exception as e:
   print('retry',url,str(e),flush=True);time.sleep((k+1)*2)
 raise RuntimeError(url)
def rows(prefix):
 files=glob.glob(str(root/(prefix+'-ordered-*.json')))
 if not files:files=[p for p in glob.glob(str(root/(prefix+'-*.json'))) if 'count' not in p and 'ordered' not in p]
 features=[x for p in files for x in json.load(open(p,encoding='utf8'))['features'] if x.get('geometry')]
 count=json.load(open(root/(prefix+'-count.json'),encoding='utf8'))['count']
 if len(features)!=count:raise ValueError((prefix,'incomplete geometry',len(features),count))
 if 'ordered' in str(files[0]):
  key='OBJECTID_1' if prefix=='units' else 'OBJECTID'; ids=[x['properties'].get(key) for x in features]
  if None in ids or len(set(ids))!=count:raise ValueError((prefix,'duplicate or missing IDs'))
 return features
units=rows('units');land=rows('land'); polys=[make_valid(shape(x['geometry'])) for x in land];tree=STRtree(polys)
# Surface management is not legal hunting access. Exclude restricted military, DOE, parks, refuges and unknown classes.
public={'BLM','USFS','STATE','STATEFG','STATEPR','BOR','COE','LU_USDA','LU_DOI'}
sources=[('usgs3','https://carto-wfs.nationalmap.gov/arcgis/rest/services/transportation/MapServer/3','1=1'),('usgs4','https://carto-wfs.nationalmap.gov/arcgis/rest/services/transportation/MapServer/4','1=1'),('usgs5','https://carto-wfs.nationalmap.gov/arcgis/rest/services/transportation/MapServer/5','1=1'),('usgs7','https://carto-wfs.nationalmap.gov/arcgis/rest/services/transportation/MapServer/7','1=1'),('blm','https://gis.blm.gov/idarcgis/rest/services/transportation/BLM_ID_Ground_Transportation_Linear_Features_GTLF/FeatureServer/0',"PLAN_ASSET_CLASS IN ('TRANSPORTATION SYSTEM - ROAD','TRANSPORTATION SYSTEM - PRIMITIVE ROAD') OR PLAN_ALLOW_MODE_TRNSPRT IN ('ALL_MOTO_VEH','MTC_ATV_ONLY','MTC_ATV_SHARED','MTC_ATV_UTV_SHARED','MTC_ONLY','MTC_SHARED','STRT_LGL_VEH','TECH_VEH_SHARED')"),('fsroad','https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_02/MapServer/4','1=1'),('fstrail','https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_02/MapServer/2',"symbol IN ('5','6','7','8','9','10','11','12','16','1')")]
def routes(name,url,where,bounds,unit):
 file=root/f'{unit}-{name}-v3.json'
 if file.exists():return json.load(open(file,encoding='utf8'))['features']
 spatial={'f':'json','where':where,'geometry':','.join(map(str,bounds)),'geometryType':'esriGeometryEnvelope','inSR':5070,'spatialRel':'esriSpatialRelIntersects','returnIdsOnly':'true'}
 ids=get(url+'/query',spatial).get('objectIds') or []
 if len(ids)!=len(set(ids)):raise ValueError((unit,name,'duplicate source IDs'))
 features=[]
 for offset in range(0,len(ids),200):
  chunk=ids[offset:offset+200]
  j=get(url+'/query',{'f':'geojson','objectIds':','.join(map(str,chunk)),'outFields':'objectid','outSR':5070,'returnGeometry':'true','maxAllowableOffset':10})
  features.extend(j.get('features',[]))
 def ident(x):return (x.get('properties') or {}).get('objectid',(x.get('properties') or {}).get('OBJECTID',x.get('id')))
 observed=[ident(x) for x in features]
 if len(observed)!=len(set(observed)) or set(observed)!=set(ids):raise ValueError((unit,name,'feature IDs do not match source query'))
 file.write_text(json.dumps({'features':features}));return features
def run(unit):
 f=next(x for x in units if x['properties']['NAME']==unit);g=make_valid(shape(f['geometry'])); minx,miny,maxx,maxy=g.bounds
 hits=tree.query(g,predicate='intersects');known=union_all([polys[i].intersection(g) for i in hits]);coverage=known.area/g.area
 # The Idaho SMA excludes Bear Lake water. Confirm coverage against the USGS waterbody, but never count the lake as public hunting land.
 water = None
 if unit == '76':
  lakefile = root/'bear-lake.json'
  if not lakefile.exists():
   lake=get('https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/12/query',{'f':'geojson','where':"GNIS_NAME='Bear Lake'",'geometry':'-111.6,41.9,-111.1,42.3','geometryType':'esriGeometryEnvelope','inSR':4326,'spatialRel':'esriSpatialRelIntersects','outFields':'GNIS_NAME,AREASQKM,PERMANENT_IDENTIFIER','outSR':5070,'returnGeometry':'true','maxAllowableOffset':10})
   if len(lake.get('features',[])) != 1 or lake['features'][0]['properties']['PERMANENT_IDENTIFIER'] != '120026431':raise ValueError('Bear Lake identity')
   lakefile.write_text(json.dumps(lake))
  water=shape(json.load(open(lakefile,encoding='utf8'))['features'][0]['geometry']).intersection(g)
  coverage=known.union(water).area/g.area
 if coverage < .98 or coverage > 1.01: raise ValueError(('land coverage',unit,coverage))
 pub=union_all([polys[i].intersection(g) for i in hits if land[i]['properties'].get('MGMT_AGNCY') in public]); pub=pub.difference(water) if water is not None else pub; print(unit,'land coverage',coverage,'public acres',pub.area/4046.856,flush=True)
 bounds=(minx-1609.344,miny-1609.344,maxx+1609.344,maxy+1609.344);lines=[]
 for name,url,where in sources:
  rr=routes(name,url,where,bounds,unit);print(unit,name,len(rr),flush=True)
  lines.extend(shape(x['geometry']) for x in rr if x.get('geometry'))
 if not lines:raise ValueError('no route observations')
 # Raster processing at roughly 100m; arcgis may slightly adjust the requested extent.
 width=math.ceil((maxx-minx)/100);height=math.ceil((maxy-miny)/100)
 if max(width,height)>4000:raise ValueError('unit too large')
 tif=root/f'{unit}-elev.tif'
 if not tif.exists():
  j=get('https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage',{'f':'json','bbox':','.join(map(str,(minx,miny,maxx,maxy))),'bboxSR':5070,'imageSR':5070,'size':f'{width},{height}','format':'tiff','pixelType':'F32','interpolation':'RSP_BilinearInterpolation','noData':'-9999'})
  r=sess.get(j['href'],timeout=180);r.raise_for_status();tif.write_bytes(r.content)
 with rasterio.open(tif) as ds:
  elev=ds.read(1,masked=True);trans=ds.transform; height,width=elev.shape;cell=abs(trans.a*trans.e)/4046.8564224
  p=rasterize([(mapping(pub),1)],out_shape=elev.shape,transform=trans,fill=0,dtype='uint8').astype(bool)
  # Buffer individually; rasterize avoids a very expensive statewide vector union.
  near=rasterize(((mapping(line.buffer(1609.344)),1) for line in lines),out_shape=elev.shape,transform=trans,fill=0,dtype='uint8').astype(bool)
  valid=p & ~np.ma.getmaskarray(elev) & np.isfinite(elev.data) & (elev.data > -1000)
  if p.sum() and valid.sum()/p.sum()<.99:raise ValueError(('elevation coverage',unit,valid.sum()/p.sum()))
  remote=valid & ~near; high=valid & (elev.data>=2743.2)
  data={'publicAcres':round(valid.sum()*cell),'remoteAcres':round(remote.sum()*cell),'highAcres':round(high.sum()*cell),'remoteHighAcres':round((remote & high).sum()*cell),'landCoverage':round(coverage,5),'cellAcres':cell,'routes':{name:len(routes(name,url,where,bounds,unit)) for name,url,where in sources}}
  (root/f'{unit}-result.json').write_text(json.dumps(data,indent=2)); print(unit,data,flush=True)
if __name__=='__main__':
 for unit in (sys.argv[1:] or [x['properties']['NAME'] for x in units]):run(unit)

