"""Validate a staged Idaho refresh against published history and map geometries; no writes."""
import sys,json,pathlib,glob
sys.path.insert(0,'out/geodeps')
from shapely.geometry import shape
from shapely import union_all,make_valid
from shapely.ops import transform
from pyproj import Transformer
candidate=pathlib.Path(sys.argv[1]); snapshot=json.loads((candidate/'data/id-conditions.json').read_text(encoding='utf8')); previous=json.loads(pathlib.Path('data/id-conditions.json').read_text(encoding='utf8')); fire=json.loads((candidate/'data/id-fire.json').read_text(encoding='utf8')); oldfire=json.loads(pathlib.Path('data/id-fire.json').read_text(encoding='utf8')); meta=json.loads((candidate/'data/id-visual-meta.json').read_text(encoding='utf8'))
units={f['properties']['NAME']:make_valid(shape(f['geometry'])) for p in glob.glob('out/id-terrain/units-ordered-*.json') for f in json.load(open(p,encoding='utf8'))['features']}
if not units:units={f['properties']['NAME']:make_valid(shape(f['geometry'])) for p in glob.glob('out/id-terrain/units-[0-9]*.json') for f in json.load(open(p,encoding='utf8'))['features']}
if len(units)!=100 or set(units)!=set(snapshot['units']) or set(units)!=set(fire['units']) or set(units)!=set(meta['units']):raise ValueError('Unit identity mismatch')
if snapshot['droughtCurrent']!=meta['droughtDate'] or snapshot['snapshot']!=meta['snapshot'] or fire['built']!=meta['snapshot']:raise ValueError('Snapshot date mismatch')
project=Transformer.from_crs(4326,5070,always_xy=True).transform
max_difference=0;historical_changes=[];snow_changes=0;fire_changes=[]
for u,g in units.items():
 a=previous['units'][u];b=snapshot['units'][u]
 if a['trailheads']!=b['trailheads']:raise ValueError(('Unexpected trailhead change',u))
 for y,v in a['drought'].items():
  if y!='current' and b['drought'].get(y)!=v:historical_changes.append((u,'drought',y,v,b['drought'].get(y)))
 if bool(a['snow'])!=bool(b['snow']):raise ValueError(('Unexpected station coverage change',u))
 if a['snow'] and b['snow']:
  if a['snow']['triplet']!=b['snow']['triplet']:raise ValueError(('Unexpected station change',u))
  for y,v in a['snow']['history'].items():
   if b['snow']['history'].get(y)!=v:historical_changes.append((u,'snow',y))
  current=b['snow']['current']
  if current and (current['date']>snapshot['snapshot'] or current['swe']<0):raise ValueError(('Invalid station observation',u,current))
  if a['snow']['current']!=current:snow_changes+=1
 for y,v in oldfire['units'][u]['annualAcres'].items():
  if int(y)<int(snapshot['snapshot'][:4]) and fire['units'][u]['annualAcres'].get(y)!=v:historical_changes.append((u,'fire',y,v,fire['units'][u]['annualAcres'].get(y)))
 if oldfire['units'][u]['annualAcres']!=fire['units'][u]['annualAcres']:fire_changes.append(u)
 layer=json.loads((candidate/'public/idaho-visual'/f'{u}.json').read_text(encoding='utf8'))['drought']['features']
 geoms=[make_valid(transform(project,shape(f['geometry']))) for f in layer if f['properties']['level']>=1]
 pct=100*g.intersection(union_all(geoms)).area/g.area if geoms else 0
 max_difference=max(max_difference,abs(pct-b['drought']['current']))
state=json.loads((candidate/'public'/('idaho-drought-'+meta['droughtDate'].replace('-','')+'.json')).read_text(encoding='utf8'))['features']
parts=[f for u in units for f in json.loads((candidate/'public/idaho-visual'/f'{u}.json').read_text(encoding='utf8'))['drought']['features']]
if len(state)!=len(parts) or sorted(json.dumps(f,sort_keys=True) for f in state)!=sorted(json.dumps(f,sort_keys=True) for f in parts):raise ValueError('Statewide drought does not match unit layers')
if any(state[i]['properties']['level']>state[i+1]['properties']['level'] for i in range(len(state)-1)):raise ValueError('Statewide drought severity order')
if historical_changes:raise ValueError(('Historical data changed',historical_changes[:12],len(historical_changes)))
if max_difference>0.5:raise ValueError(('Displayed drought differs from unit percentage',max_difference))
print(json.dumps({'units':len(units),'maxDroughtDifferencePct':round(max_difference,3),'snowObservationsChanged':snow_changes,'fireUnitsChanged':len(fire_changes),'fireUnits':fire_changes,'historicalChanges':len(historical_changes)},indent=2))
