import json, glob, os, sys, math
ns={}; code=open('build.py').read().split("units=json.load")[0].replace("ATT='/mnt/user-data/attachments/e32c532c-43ce-57ac-94cd-1ddd7bf63286/'","")
exec(code,ns); rings=ns["rings"]
from dpfix import dp
STEMS={'ONE':'1_Gray','LOW':'2_Yellow','MEDIUM':'3_Orange','HIGH':'4_Red','STOPOVER':'5_Stopover'}
def area_ac(r):
    lat=sum(p[1] for p in r)/len(r); kx=111320*math.cos(math.radians(lat)); ky=110950
    a=0
    for i in range(len(r)-1): a+=r[i][0]*kx*r[i+1][1]*ky-r[i+1][0]*kx*r[i][1]*ky
    return abs(a)/2/4046.86
def feats(folder,tol,minac):
    out=[]
    for cls,stem in STEMS.items():
        fs=glob.glob(f'{folder}/onX_export/{stem}*.kml')
        if not fs: continue
        for poly in rings(fs[0]):
            if area_ac(poly[0])<minac: continue
            simp=[dp(r,tol) for r in poly if area_ac(r)>=minac or r is poly[0]]
            simp=[r+[r[0]] if r[0]!=r[-1] else r for r in simp]
            if len(simp[0])<4: continue
            out.append({'type':'Feature','properties':{'cls':cls},'geometry':{'type':'Polygon','coordinates':[[[round(x,4),round(y,4)] for x,y in r] for r in simp]}})
    return out
if __name__=='__main__':
    tol=float(sys.argv[1]); minac=float(sys.argv[2])
    tot=0
    for d in sorted(glob.glob(ROOT+'/*/*')):
        if not glob.glob(d+'/onX_export/*.kml'): continue
        s=len(json.dumps({'type':'FeatureCollection','features':feats(d,tol,minac)},separators=(',',':')))
        tot+=s
        if 'Antelope' in d or 'McKinney' in d: print(d.split('/')[-1], s//1024)
    print('total MB', tot/1e6)
