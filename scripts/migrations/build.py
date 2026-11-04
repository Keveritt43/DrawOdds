import re, json, math, glob, sys
ATT='/mnt/user-data/attachments/e32c532c-43ce-57ac-94cd-1ddd7bf63286/'
FILES=[('ONE','1_Gray'),('LOW','2_Yellow'),('MEDIUM','3_Orange'),('HIGH','4_Red'),('STOPOVER','5_Black_crosshatch')]
def rings(path):
    s=open(path).read()
    out=[]
    for pm in re.findall(r'<Placemark>(.*?)</Placemark>', s, re.S):
        outer=re.search(r'<outerBoundaryIs>.*?<coordinates>(.*?)</coordinates>', pm, re.S).group(1)
        inners=re.findall(r'<innerBoundaryIs>.*?<coordinates>(.*?)</coordinates>', pm, re.S)
        parse=lambda c:[tuple(map(float,p.split(',')[:2])) for p in c.split()]
        out.append([parse(outer)]+[parse(i) for i in inners])
    return out
def dp(pts, tol):
    if len(pts)<5: return pts
    def rec(a,b):
        (x1,y1),(x2,y2)=pts[a],pts[b]; dx,dy=x2-x1,y2-y1; L=math.hypot(dx,dy) or 1e-12
        best,bi=0,-1
        for i in range(a+1,b):
            x,y=pts[i]; d=abs(dy*x-dx*y+x2*y1-y2*x1)/L
            if d>best: best,bi=d,i
        if best>tol: return rec(a,bi)[:-1]+rec(bi,b)
        return [pts[a],pts[b]]
    r=rec(0,len(pts)-1)
    return r if len(r)>=4 else pts
def pip(x,y,ring):
    c=False; n=len(ring); j=n-1
    for i in range(n):
        xi,yi=ring[i]; xj,yj=ring[j]
        if (yi>y)!=(yj>y) and x < (xj-xi)*(y-yi)/(yj-yi)+xi: c=not c
        j=i
    return c
def in_poly(x,y,poly): return pip(x,y,poly[0]) and not any(pip(x,y,h) for h in poly[1:])
units=json.load(open(os.environ.get('MIG_UNITS','units.json')))['features']
def upolys(g):
    if g['type']=='Polygon': return [g['coordinates']]
    return g['coordinates']
U=[(f['properties']['name'], [[[tuple(p) for p in r] for r in poly] for poly in upolys(f['geometry'])]) for f in units]
def bbox(poly):
    xs=[p[0] for p in poly[0]]; ys=[p[1] for p in poly[0]]; return min(xs),min(ys),max(xs),max(ys)
UB=[(n,ps,[bbox(p) for p in ps]) for n,ps in U]
feats=[]; acres={}; unit_acres={}
DX,DY=0.0025,0.0018
cell_acres=(DX*111320*math.cos(math.radians(43.65)))*(DY*110950)/4046.86
for cls,stem in FILES:
    path=glob.glob(ATT+'*'+stem+'.kml')[0]
    polys=rings(path)
    tot=0
    for poly in polys:
        simp=[dp(r,0.0004) for r in poly]
        if simp[0][0]!=simp[0][-1]: simp[0].append(simp[0][0])
        feats.append({'type':'Feature','properties':{'cls':cls},'geometry':{'type':'Polygon','coordinates':[[[round(x,5),round(y,5)] for x,y in r] for r in simp]}})
        x0,y0,x1,y1=bbox(poly)
        y=y0+DY/2
        while y<y1:
            x=x0+DX/2
            while x<x1:
                if in_poly(x,y,poly):
                    tot+=1
                    for n,ps,bbs in UB:
                        if any(b[0]<=x<=b[2] and b[1]<=y<=b[3] and in_poly(x,y,p) for p,b in zip(ps,bbs)):
                            unit_acres.setdefault(n,{}).setdefault(cls,0); unit_acres[n][cls]+=1; break
                x+=DX
            y+=DY
    acres[cls]=round(tot*cell_acres)
print('acres by class', acres)
ua={u:{k:round(v*cell_acres) for k,v in d.items()} for u,d in unit_acres.items()}
print(json.dumps(dict(sorted(ua.items(), key=lambda kv:-sum(kv[1].values()))), indent=0))
json.dump({'type':'FeatureCollection','features':feats}, open('antelope-creek.geojson','w'), separators=(',',':'))
json.dump({'acres':acres,'units':ua}, open('overlap.json','w'), indent=1)
import os; print('geojson KB', os.path.getsize('antelope-creek.geojson')//1024, 'features', len(feats))
