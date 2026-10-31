"""Independent direct-velocity free-boundary investigation with unknown detachment.

Prescribed cavity length and recovery law; solve xD using entry gap tangency.
This is a new mathematical problem, not a reinterpretation of a fixed-xD case.
All failed iterates and negative gaps are retained.
"""
from pathlib import Path
import importlib.util,json,time,argparse
import numpy as np
base=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('hs',base/'independent-cavity-hess-smith.py');hs=importlib.util.module_from_spec(spec);spec.loader.exec_module(hs)

def cosine(a,b,n):return a+(b-a)*(1-np.cos(np.linspace(0,np.pi,n+1)))/2
def yt(x,t):return 5*t*(.2969*np.sqrt(x)-.126*x-.3516*x*x+.2843*x**3-.1036*x**4)
def mesh(xd,length,n,thickness):
    nu=max(8,round(n/3));xe=xd+length
    xs=np.r_[cosine(0,xd,nu)[:-1],cosine(xd,xe,n)[:-1],cosine(xe,1,n)]
    up=np.c_[xs,yt(xs,thickness)][::-1];loX=cosine(0,1,n);lo=np.c_[loX,-yt(loX,thickness)]
    up[0,1]=lo[-1,1]=0
    p=np.r_[up,lo[1:]];ids=np.arange(2*n-1,n-1,-1);nodes=np.r_[2*n,ids]
    sf=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p[nodes],axis=0),axis=1))]
    return p,ids,nodes,sf
def derivative_start(x,h):return hs.derivative(-x[::-1],h[::-1])*-1

def solve(n=24,A=.3,alpha=4,thickness=.12,length=.4,initialD=.01,seed=None,maxIter=40,regularity='tangent'):
    def residual(z,detail=False):
        xd=z[-1];original,ids,nodes,sf=mesh(xd,length,n,thickness)
        h=np.r_[0,z[:-2],0];p=original.copy();p[nodes,1]+=h
        u=np.maximum(0,(.5*(sf[:-1]+sf[1:])-.85*sf[-1])/(.15*sf[-1]));g=1-A*u
        if regularity=='tangent':condition=derivative_start(original[nodes,0],h)
        elif regularity=='fractional':
            s=sf[1:4];t=s/s[-1];V=np.column_stack([t**k for k in [1.5,2.5,3.5]])
            condition=np.linalg.solve(V,h[1:4])[0]/s[-1]**1.5
        elif regularity=='curvature':
            s=sf[:4];t=s/s[-1];V=np.column_stack([t[1:]**k for k in [1,2,3]])
            condition=np.linalg.solve(V,h[1:4])[1]/s[-1]**2
        else:raise ValueError('Unknown regularity study')
        r=hs.flow(p,alpha);f=np.r_[r['vt'][ids]+z[-2]*g,condition]
        return (f,r,p,h,original,ids,nodes) if detail else f
    x=cosine(0,1,n);z=np.r_[.018*np.sin(np.pi*x[1:-1])**1.5,1.44,initialD] if seed is None else seed.copy()
    trace=[];started=time.perf_counter()
    for it in range(maxIter):
        f=residual(z);norm=float(max(abs(f)));trace.append(dict(iteration=it,residual=norm,detachment=float(z[-1]),minInteriorGap=float(min(z[:-2]))))
        if norm<1e-8:break
        J=np.empty((n+1,n+1))
        for k in range(n+1):
            step=2e-6*max(abs(z[k]),.01);zz=z.copy();zz[k]+=step;J[:,k]=(residual(zz)-f)/step
        try:dz=np.linalg.solve(J,-f)
        except np.linalg.LinAlgError:break
        accepted=False
        for fraction in [1,.5,.25,.125,.0625,.03125,.015625,.0078125,.00390625]:
            zz=z+fraction*dz
            if not(1e-5<zz[-1]<.15 and .5<zz[-2]<4 and min(zz[:-2])>-.1 and max(zz[:-2])<.25):continue
            try:ff=residual(zz)
            except (ValueError,np.linalg.LinAlgError):continue
            if np.linalg.norm(ff)<np.linalg.norm(f):z=zz;accepted=True;break
        if not accepted:break
    f,r,p,h,original,ids,nodes=residual(z,True)
    result=dict(N=len(p)-1,n=n,A=A,alpha=alpha,thickness=thickness,length=length,regularity=regularity,detachment=float(z[-1]),residual=float(max(abs(f))),minimumGap=float(min(h)),maximumGap=float(max(h)),sigma=float(z[-2]**2-1),cl=float(r['cl']),normalResidual=float(max(abs(r['vn']))),entryCondition=float(f[-1]),entrySlope=derivative_start(original[nodes,0],h),endSlope=hs.derivative(original[nodes,0],h),height=[dict(x=float(x),h=float(g)) for x,g in zip(original[nodes,0],h)],trace=trace,seconds=time.perf_counter()-started)
    result['discreteAdmitted']=result['residual']<1e-8 and result['minimumGap']>=-1e-8 and result['sigma']>0
    result['physicalValidation']=False
    result['status']='EXPLORATORY_DISCRETE_BRANCH' if result['discreteAdmitted'] else 'REJECTED_DISCRETE_BRANCH'
    return result,z
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=base/'cavity-2d-auto-detachment-study.json');args=parser.parse_args()
    rows=[]
    for n,A in [(24,.3),(24,.4),(24,.5),(32,.3),(32,.4),(48,.3),(48,.4)]:
        r,z=solve(n=n,A=A);rows.append(r);print(json.dumps({k:v for k,v in r.items() if k not in ['trace','height']}),flush=True)
        args.output.write_text(json.dumps(dict(method='Independent direct velocity auto-detachment free boundary, fixed A; exploratory',rows=rows),indent=2)+'\n')
