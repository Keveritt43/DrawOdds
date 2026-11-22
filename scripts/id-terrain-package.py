"""Package a fully calculated and ID-verified Idaho terrain snapshot; never writes to the database."""
import json, pathlib, glob, hashlib, time
root=pathlib.Path('out/id-terrain')
unit_features=[]
files=list(root.glob('units-ordered-*.json')) or [p for p in root.glob('units-*.json') if 'count' not in p.name]
for p in files:unit_features += json.loads(p.read_text(encoding='utf8'))['features']
names=[f['properties']['NAME'] for f in unit_features]
if len(names)!=100 or len(set(names))!=100:raise ValueError('Expected 100 distinct Idaho units')
source_names=['usgs3','usgs4','usgs5','usgs7','blm','fsroad','fstrail']
out={}; provenance={}
for unit in names:
 result=json.loads((root/f'{unit}-result.json').read_text(encoding='utf8'))
 if result['landCoverage']<.98:raise ValueError((unit,'land coverage'))
 if not 0<=result['remoteHighAcres']<=min(result['remoteAcres'],result['highAcres']) or max(result['remoteAcres'],result['highAcres'])>result['publicAcres']:raise ValueError((unit,'invalid areas'))
 hashes={}
 for name in source_names:
  p=root/f'{unit}-{name}-v3.json'; raw=p.read_bytes(); features=json.loads(raw)['features']
  ids=[(x.get('properties') or {}).get('objectid',(x.get('properties') or {}).get('OBJECTID',x.get('id'))) for x in features]
  if len(ids)!=result['routes'][name] or len(set(ids))!=len(ids) or None in ids or any(not f.get('geometry') for f in features):raise ValueError((unit,name,'route validation'))
  hashes[name]=hashlib.sha256(raw).hexdigest()
 elevation=root/f'{unit}-elev.tif';hashes['elevation']=hashlib.sha256(elevation.read_bytes()).hexdigest()
 provenance[unit]={'landCoverage':result['landCoverage'],'routeCounts':result['routes'],'sha256':hashes}
 out[unit]={k:result[k] for k in ['publicAcres','remoteAcres','highAcres','remoteHighAcres']}
artifact={'built':time.strftime('%Y-%m-%d',time.gmtime()),'units':dict(sorted(out.items()))}
pathlib.Path('data/id-terrain.json').write_text(json.dumps(artifact,indent=2)+'\n',encoding='utf8')
def source_digest(prefix):
 paths=sorted(root.glob(prefix+'-ordered-*.json')) or sorted(p for p in root.glob(prefix+'-*.json') if 'count' not in p.name)
 h=hashlib.sha256()
 for p in paths:h.update(p.name.encode());h.update(p.read_bytes())
 return h.hexdigest()
shared={'units':source_digest('units'),'surfaceManagement':source_digest('land'),'bearLake':hashlib.sha256((root/'bear-lake.json').read_bytes()).hexdigest()}
pathlib.Path('data/id-terrain-provenance.json').write_text(json.dumps({'built':artifact['built'],'sharedSha256':shared,'units':provenance},indent=2)+'\n',encoding='utf8')
print('Packaged',len(out),'units; per-source digests and counts recorded')
