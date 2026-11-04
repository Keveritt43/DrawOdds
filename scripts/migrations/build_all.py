import re, json, math, glob, os, sys
from multiprocessing import Pool
sys.path.insert(0,'.')
import os
ROOT=os.environ.get('MIG_SRC','/mnt/user-data/uploads/Screenshots')
TOL=float(os.environ.get('TOL','0.0006'))
STEMS={'ONE':'1_Gray','LOW':'2_Yellow','MEDIUM':'3_Orange','HIGH':'4_Red','STOPOVER':'5_Stopover'}
exec(open('build.py').read().split("units=json.load")[0].split("ATT=")[0])  # imports only
src=open('build.py').read()
for fn in ['rings','dp','pip','in_poly','bbox']:
    pass
ns={}
code=src.split("units=json.load")[0]
code=code.replace("ATT='/mnt/user-data/attachments/e32c532c-43ce-57ac-94cd-1ddd7bf63286/'","")
exec(code,ns)
exec("def bbox(poly):\n    xs=[p[0] for p in poly[0]]; ys=[p[1] for p in poly[0]]; return min(xs),min(ys),max(xs),max(ys)",ns)
rings,dp,in_poly,bbox=ns['rings'],ns['dp'],ns['in_poly'],ns['bbox']
units=json.load(open(os.environ.get('MIG_UNITS','units.json')))['features']
def upolys(g): return [g['coordinates']] if g['type']=='Polygon' else g['coordinates']
U=[(f['properties']['name'], [[[tuple(p) for p in r] for r in poly] for poly in upolys(f['geometry'])]) for f in units]
UB=[(n,ps,[bbox(p) for p in ps]) for n,ps in U]
DX,DY=0.0025,0.0018
def one(folder):
    feats=[]; kacres={}; ua={}
    lat0=None
    for cls,stem in STEMS.items():
        fs=glob.glob(f'{folder}/onX_export/{stem}*.kml')
        if not fs: continue
        polys=rings(fs[0])
        tot=0
        for poly in polys:
            simp=[dp(r,TOL) for r in poly]
            simp=[r+[r[0]] if r[0]!=r[-1] else r for r in simp]
            feats.append({'type':'Feature','properties':{'cls':cls},'geometry':{'type':'Polygon','coordinates':[[[round(x,4),round(y,4)] for x,y in r] for r in simp]}})
            x0,y0,x1,y1=bbox(poly)
            cell=(DX*111320*math.cos(math.radians((y0+y1)/2)))*(DY*110950)/4046.86
            y=y0+DY/2
            while y<y1:
                x=x0+DX/2
                while x<x1:
                    if in_poly(x,y,poly):
                        tot+=cell
                        for n,ps,bbs in UB:
                            if any(b[0]<=x<=b[2] and b[1]<=y<=b[3] and in_poly(x,y,p) for p,b in zip(ps,bbs)):
                                ua.setdefault(n,{}).setdefault(cls,0); ua[n][cls]+=cell; break
                    x+=DX
                y+=DY
        kacres[cls]=round(tot)
    ua={u:{k:round(v) for k,v in d.items()} for u,d in ua.items()}
    return folder,{'features':feats,'kacres':kacres,'unitAcres':ua}
if __name__=='__main__':
    folders=sorted(d for d in glob.glob(ROOT+'/*/*') if glob.glob(d+'/onX_export/*.kml'))
    with Pool(os.cpu_count()) as p:
        res=dict(p.map(one,folders))
    json.dump(res,open('geo_all.json','w'),separators=(',',':'))
    for k,v in res.items():
        print(k.replace(ROOT+'/',''), len(json.dumps({'type':'FeatureCollection','features':v['features']},separators=(',',':')))//1024,'KB', v['kacres'])
