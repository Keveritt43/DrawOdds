import json, re, os, sys, glob, shutil
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from simp import feats
import os
ROOT=os.environ.get('MIG_SRC','/mnt/user-data/uploads/Screenshots')
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','data','migrations')
P=json.load(open('parsed.json')); G=json.load(open('geo_all.json'))
SP={'Mule Deer':('DEER','mule deer','mule-deer'),'Elk':('ELK','elk','elk'),'Pronghorn':('PRONGHORN','pronghorn','pronghorn')}
CLS=[('ONE','1 individual','#9a9a9a'),('LOW','2 individuals to 10%','#f2e600'),('MEDIUM','10 to 20%','#f5a623'),('HIGH','More than 20%','#e3241b'),('STOPOVER','Stopover','#111111')]
MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December']
SKIP_GEO={}
DROP_CLS={'Pronghorn/Mtn Home':['LOW']}
TEXT_UNITS={}
old=json.load(open(f'{OUT}/antelope-creek-mule-deer/meta.json'))
for d in glob.glob(OUT+'/*'): shutil.rmtree(d)
def ukey(u): m=re.match(r'(\d+)(.*)',u); return (int(m.group(1)),m.group(2)) if m else (999,u)
report=[]
for key,p in sorted(P.items()):
    spf,folder=key.split('/')
    sp,spl,sps=SP[spf]
    herd=re.sub(r'\s*(Mule Deer|Elk|Pronghorn Antelope|Pronghorn)?\s*(Seasonal )?Migration Statistics.*$','',p['title']).strip()
    slug=re.sub(r'[^a-z0-9]+','-',herd.lower()).strip('-')+'-'+sps
    g=G.get(f'{ROOT}/{key}')
    geo_ok = g is not None and key not in SKIP_GEO
    fs=feats(f'{ROOT}/{key}',0.0008,10) if geo_ok else []
    fs=[f for f in fs if f['properties']['cls'] not in DROP_CLS.get(key,[])]
    have={f['properties']['cls'] for f in fs}
    classes=[]
    for k,l,c in CLS:
        if k in have or p['acres'][k] is not None:
            e={'key':k,'label':l,'color':c}
            if k=='STOPOVER': e['pattern']='hatch'
            if p['acres'][k] is not None: e['acres']=p['acres'][k]
            if k not in have and geo_ok: e['notMapped']=True
            classes.append(e)
    ua={}
    if geo_ok:
        ua={u:{k:v for k,v in d.items() if k not in DROP_CLS.get(key,[])} for u,d in g['unitAcres'].items()}
        ua={u:d for u,d in ua.items() if sum(d.values())>=1000}
    units=sorted(ua, key=ukey) if ua else TEXT_UNITS.get(key,[])
    y,mo=(p['preparedDate'] or '-').split('-') if p['preparedDate'] else (None,None)
    when=f"{MONTHS[int(mo)-1]} {y}" if y else ''
    meta={'slug':slug,'name':f'{herd} {spl.title() if sp!="DEER" else "Mule Deer"} Migration','species':sp,'herd':f'{herd} {spl}',
      'source':f"{p['title'].rstrip(':')} and seasonal migration routes map{', analyzed / prepared by '+p['preparedBy'] if p['preparedBy'] else ''}{', '+when if when else ''}",
      'preparedBy':p['preparedBy'],'preparedDate':p['preparedDate'],'studyStart':p['studyStart'],'studyEnd':p['studyEnd'],
      'summary':p['summary'],'caveat':p['caveat'],'methods':p['methods'],
      'winterCount': old.get('winterCount') if slug=='antelope-creek-mule-deer' else None,
      'stats':p['stats'],'timing':p['timing'],'classes':classes,'unitAcres':ua,'units':units,
      'mapNote': None if geo_ok else (SKIP_GEO.get(key) or 'no route layers provided')}
    os.makedirs(f'{OUT}/{slug}')
    json.dump(meta,open(f'{OUT}/{slug}/meta.json','w'),indent=1)
    json.dump({'type':'FeatureCollection','features':fs},open(f'{OUT}/{slug}/routes.geojson','w'),separators=(',',':'))
    report.append((slug,len(fs),units,meta['mapNote']))
for r in report: print(*r)
print(len(report))
