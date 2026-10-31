"""Direct-velocity independent fixed recovery free-boundary investigation.

Uses the separately verified Hess-Smith panel velocity kernel, not production
potential integrals, densities or differentiation. All failed trials retained.
"""
from pathlib import Path
import importlib.util,json,time
import numpy as np
base=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('hs',base/'independent-cavity-hess-smith.py')
hs=importlib.util.module_from_spec(spec);spec.loader.exec_module(hs)

def solve(case,A,seed=None,iterations=45):
    original=np.asarray(case['original'],float);nodes=np.asarray(case['nodes']);ids=np.asarray(case['ids']);x=original[nodes,0];sf=np.asarray(case['foilS']);m=len(ids);o=case['inputs']
    u=np.maximum(0,(.5*(sf[:-1]+sf[1:])-(1-o['recovery'])*sf[-1])/(o['recovery']*sf[-1]));g=1-A*u**o['exponent']
    def residual(z,detail=False):
        h=np.r_[0,z[:-1],0];p=original.copy();p[nodes,1]+=h;r=hs.flow(p,o['alpha']);f=r['vt'][ids]+z[-1]*g
        return (f,r,p,h) if detail else f
    z=np.r_[np.asarray(case['initialGap'])[1:-1],case['initialSpeed']] if seed is None else seed.copy()
    trace=[];started=time.perf_counter()
    for it in range(iterations):
        f=residual(z);norm=float(np.max(abs(f)));trace.append(dict(iteration=it,maxResidual=norm,qc=float(z[-1]),minInteriorGap=float(min(z[:-1]))))
        if norm<1e-9:break
        J=np.empty((m,m))
        for k in range(m):
            step=2e-6*max(abs(z[k]),.01);zz=z.copy();zz[k]+=step;J[:,k]=(residual(zz)-f)/step
        try:dz=np.linalg.solve(J,-f)
        except np.linalg.LinAlgError:break
        accepted=False
        for fraction in [1,.5,.25,.125,.0625,.03125,.015625,.0078125]:
            zz=z+fraction*dz
            if not(.4<zz[-1]<4 and min(zz[:-1])>-.1 and max(zz[:-1])<.25):continue
            if np.linalg.norm(residual(zz))<np.linalg.norm(f):z=zz;accepted=True;break
        if not accepted:break
    f,r,p,h=residual(z,True);norm=float(max(abs(f)));slope=hs.derivative(x,h)
    return dict(A=A,residual=norm,minGap=float(min(h)),maxGap=float(max(h)),sigma=float(z[-1]**2-1),cl=float(r['cl']),slope=slope,normalMax=float(max(abs(r['vn']))),trace=trace,seconds=time.perf_counter()-started,height=h.tolist()),z

if __name__=='__main__':
    cases=json.loads((base/'independent-cavity-vk-input.json').read_text())
    case=next(c for c in cases if c['id']=='velocity-kutta-32');rows=[];seed=None
    for A in [case['initialA'],.3,.2,.1,.05,.01,.4,.5,.6,.7]:
        r,z=solve(case,A);rows.append(r);print(json.dumps({k:v for k,v in r.items() if k not in ['trace','height']}),flush=True)
    (base/'cavity-2d-fixedA-study.json').write_text(json.dumps(dict(method='Independent direct velocity nonlinear free boundary; fixed recovery A',inputs=case['inputs'],rows=rows),indent=2)+'\n')
