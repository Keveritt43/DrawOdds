import math
def dp_open(pts,tol):
    keep=[False]*len(pts); keep[0]=keep[-1]=True; st=[(0,len(pts)-1)]
    while st:
        a,b=st.pop(); (x1,y1),(x2,y2)=pts[a],pts[b]; dx,dy=x2-x1,y2-y1; L=math.hypot(dx,dy)
        best,bi=0,-1
        for i in range(a+1,b):
            x,y=pts[i]; d=abs(dy*(x-x1)-dx*(y-y1))/L if L else math.hypot(x-x1,y-y1)
            if d>best: best,bi=d,i
        if best>tol: keep[bi]=True; st+=[(a,bi),(bi,b)]
    return [p for p,k in zip(pts,keep) if k]
def dp(r,tol):
    if len(r)<5: return r
    closed=r[0]==r[-1]; pts=r[:-1] if closed else r
    far=max(range(len(pts)),key=lambda i:(pts[i][0]-pts[0][0])**2+(pts[i][1]-pts[0][1])**2)
    out=dp_open(pts[:far+1],tol)[:-1]+dp_open(pts[far:]+[pts[0]],tol)
    return out if len(out)>=4 else r
