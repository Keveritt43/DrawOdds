import pathlib,json,hashlib,time,sys
sys.path.insert(0,'out/geodeps')
from PIL import Image
root=pathlib.Path('out/id-fire'); output={};masks={}
terrain=json.loads(pathlib.Path('data/id-terrain.json').read_text(encoding='utf8'))
for p in root.glob('*-summary.json'):
 j=json.loads(p.read_text(encoding='utf8'));u=j['unit']
 if u in output or u not in terrain['units']: raise ValueError(('unexpected unit',u))
 image=pathlib.Path('public/idaho-fire')/(u+'.png')
 if not image.exists() or hashlib.sha256(image.read_bytes()).hexdigest()!=j['pngSha256']:raise ValueError(('image checksum',u))
 with Image.open(image) as im:
  if list(im.size)!=[j['width'],j['height']] or im.mode!='RGB':raise ValueError(('image dimensions',u))
 for period in ('recent','mature','five','all'):
  both=j['overlapAcres'][period]; t=terrain['units'][u]
  if not 0<=both['remoteHigh']<=both['remote']<=t['remoteAcres'] or both['remoteHigh']>t['remoteHighAcres']:raise ValueError(('overlap',u,period,both,t))
  if j['periodAcres'][period]<0:raise ValueError(('area',u,period))
 output[u]={k:j[k] for k in ['annualAcres','periodAcres','overlapAcres','fires','perimeterRecords']};masks[u]={k:j[k] for k in ['corners','width','height','pngSha256']}
if set(output)!=set(terrain['units']):raise ValueError(('missing units',set(terrain['units'])-set(output)))
provenance={}
for y in range(2018,2027):
 p=root/f'{"history" if y<2020 else "wfigs"}-{y}.json';j=json.loads(p.read_text(encoding='utf8'));ids=[f['properties']['OBJECTID'] for f in j['features']]
 if len(ids)!=j['count'] or len(set(ids))!=len(ids):raise ValueError(('source records',y))
 provenance[str(y)]={'count':len(ids),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'where':j['where']}
artifact={'built':time.strftime('%Y-%m-%d',time.gmtime()),'coverage':'2018–2026; 2026 may be incomplete','units':output}
pathlib.Path('data/id-fire.json').write_text(json.dumps(artifact,indent=2)+'\n',encoding='utf8')
pathlib.Path('data/id-fire-grid.json').write_text(json.dumps(masks,indent=2)+'\n',encoding='utf8')
pathlib.Path('data/id-fire-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n',encoding='utf8')
print('Validated units:',len(output),'source records:',sum(x['count'] for x in provenance.values()))

