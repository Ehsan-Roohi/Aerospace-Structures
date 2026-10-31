"""Independent velocity-source/global-vortex free-boundary comparison.

Original implementation from the Hess-Smith velocity equations in Mason's
Applied Computational Aerodynamics, chapter 4, equations 4-30 onward.
No production potential-BIE kernel, density, potential derivative or solution
is used. Geometry and prescribed pressure-recovery inputs are shared.
"""
from pathlib import Path
import argparse,json,math,time
import numpy as np

PI2=2*np.pi
def flow(points,alpha=0,lifting=True):
    p=np.asarray(points,float);d=np.diff(p,axis=0);L=np.linalg.norm(d,axis=1)
    if np.min(L)<1e-12:raise ValueError('Zero length panel')
    t=d/L[:,None];left=np.column_stack((-t[:,1],t[:,0]));normal=-left;c=.5*(p[:-1]+p[1:])
    r=c[:,None,:]-p[None,:-1,:]
    X=np.einsum('ijk,jk->ij',r,t);Y=np.einsum('ijk,jk->ij',r,left)
    r1=X*X+Y*Y;r2=(X-L)**2+Y*Y
    su=np.log(r1/r2)/(2*PI2);sv=np.arctan2(Y*L,X*X-X*L+Y*Y)/PI2
    np.fill_diagonal(su,0);np.fill_diagonal(sv,-.5)
    S=su[:,:,None]*t[None,:,:]+sv[:,:,None]*left[None,:,:]
    V=sv[:,:,None]*t[None,:,:]-su[:,:,None]*left[None,:,:]
    sn=np.einsum('ijk,ik->ij',S,normal);st=np.einsum('ijk,ik->ij',S,t)
    vn=np.einsum('ijk,ik->ij',V,normal).sum(axis=1);vt=np.einsum('ijk,ik->ij',V,t).sum(axis=1)
    U=np.array([math.cos(math.radians(alpha)),math.sin(math.radians(alpha))]);N=len(L)
    if lifting:
        A=np.zeros((N+1,N+1));A[:N,:N]=sn;A[:N,N]=vn;A[N,:N]=st[0]+st[-1];A[N,N]=vt[0]+vt[-1]
        b=np.r_[-normal@U,-(t[0]+t[-1])@U];z=np.linalg.solve(A,b);q=z[:N];gamma=z[N]
    else:q=np.linalg.solve(sn,-normal@U);gamma=0
    tangential=t@U+st@q+gamma*vt;normal_speed=normal@U+sn@q+gamma*vn
    cp=1-tangential**2-normal_speed**2;forces=(-cp*L)[:,None]*normal;F=forces.sum(axis=0)
    cl=F[1]*U[0]-F[0]*U[1];cm=np.sum((c[:,0]-.25)*forces[:,1]-c[:,1]*forces[:,0])
    return dict(cp=cp,vt=tangential,vn=normal_speed,cl=cl,cm=cm,circulation=gamma*sum(L),centers=c,L=L,t=t,n=normal,flux=float(q@L))

def exact_controls():
    rows=[]
    for N in [40,80,160]:
        th=np.linspace(0,PI2,N+1);p=np.c_[np.cos(th),np.sin(th)];r=flow(p,lifting=False)
        cp=1-4*np.sin((th[:-1]+th[1:])/2)**2
        rows.append(dict(case='cylinder',N=N,cpRms=float(np.sqrt(np.mean((r['cp']-cp)**2))),normalMax=float(max(abs(r['vn'])))))
    # Keep the coarse, slow cusp convergence visible. Do not relax the .005
    # force-control threshold; refine this difficult exact cusp control instead.
    for N in [80,160,320,640,1280,2560]:
        e=.08;R=1+e;zle=-e-R+1/(-e-R);chord=2-zle;th=np.linspace(0,PI2,N+1);z=-e+R*np.exp(1j*th);w=z+1/z
        p=np.c_[(w.real-zle)/chord,w.imag/chord];r=flow(p,4);cl=8*np.pi*R*np.sin(np.deg2rad(4))/chord
        rows.append(dict(case='joukowski',N=N,cl=float(r['cl']),exactCl=float(cl),clError=float(abs(r['cl']-cl)),normalMax=float(max(abs(r['vn'])))))
    assert rows[2]['cpRms']<1e-8
    assert rows[-1]['clError']<.005
    return rows

def derivative(x,h,n=3):
    x=x[-n:];h=h[-n:];z=(x-x[-1])/max(abs(x-x[-1]));co=np.polyfit(z,h,n-1)
    return float(np.polyval(np.polyder(co),0)/max(abs(x-x[-1])))

def solve_case(case):
    original=np.asarray(case['original'],float);nodes=np.array(case['nodes']);ids=np.array(case['ids']);base=original[nodes];x=base[:,0];sf=np.asarray(case['foilS']);m=len(ids)
    options=case['inputs'];alpha=options['alpha'];s0=.85*sf[-1];u=(.5*(sf[:-1]+sf[1:])-s0)/(sf[-1]-s0);u=np.maximum(0,u)
    evaluations=0
    def residual(z,detail=False):
        nonlocal evaluations
        evaluations+=1;h=np.r_[0,z[:m-1],0];qc=z[-2];A=z[-1];p=original.copy();p[nodes,1]+=h
        r=flow(p,alpha);g=1-A*u;res=np.r_[r['vt'][ids]+qc*g,derivative(x,h)]
        return (res,r,p,h) if detail else res
    # A generic positive gap seed, not a solution from the production BIE.
    h0=np.array(case.get('initialGap',.018*np.sin(np.pi*(x-x[0])/(x[-1]-x[0]))**1.5))
    z=np.r_[h0[1:-1],case.get('initialSpeed',np.sqrt(2)),case.get('initialA',.36)];trace=[];started=time.perf_counter()
    for it in range(35):
        f=residual(z);norm=float(np.max(abs(f)));trace.append(dict(iteration=it,maxResidual=norm,qc=float(z[-2]),A=float(z[-1])))
        if norm<1e-8:break
        J=np.empty((len(f),len(z)))
        for k in range(len(z)):
            step=1e-6*max(abs(z[k]),.01);zz=z.copy();zz[k]+=step;J[:,k]=(residual(zz)-f)/step
        try:dz=np.linalg.solve(J,-f)
        except np.linalg.LinAlgError:break
        accepted=False
        for fraction in [.7,.35,.175,.0875,.04375,.021875,.0109375]:
            zz=z+fraction*dz
            # Newton trial branches may lie inside the foil, as in the bracket
            # trials of the production model. Final physical admission below
            # retains minGap >= -1e-8; no negative gap is clipped or accepted.
            if not(.001<zz[-1]<.749 and zz[-2]>1 and min(zz[:m-1])>-.02 and max(zz[:m-1])<.20):continue
            ff=residual(zz)
            if np.linalg.norm(ff)<np.linalg.norm(f):z=zz;accepted=True;break
        if not accepted:break
    f,r,p,h=residual(z,True);maximum=float(max(abs(f)));admitted=maximum<1e-8 and min(h)>=-1e-8 and .001<z[-1]<.749 and z[-2]>1
    return dict(id=case['id'],initialGuess=case.get('initialGuess','Generic positive sine gap; not production result'),status='CONVERGED_INDEPENDENT_DISCRETISATION' if admitted else 'REJECTED_INDEPENDENT_DISCRETISATION',formulation='Hess-Smith constant sources plus uniform vortex sheet; direct analytic velocity; no penetration everywhere and velocity Kutta at TE; nonlinear cavity speed plus three-point endpoint gap derivative',N=len(p)-1,cavityPanels=m,inputs=options,A=float(z[-1]),sigma=float(z[-2]**2-1),maxNonlinearResidual=maximum,normalMax=float(max(abs(r['vn']))),minimumGap=float(min(h)),cl=float(r['cl']),cm=float(r['cm']),circulationCl=float(2*r['circulation']),flux=r['flux'],height=[dict(x=float(a),h=float(b)) for a,b in zip(x,h)],panels=[dict(x=float(c[0]),y=float(c[1]),cp=float(cp),cavity=bool(i in ids)) for i,(c,cp) in enumerate(zip(r['centers'],r['cp']))],trace=trace,evaluations=evaluations,seconds=time.perf_counter()-started)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    controls=exact_controls();print(json.dumps(controls),flush=True)
    cases=json.loads(args.input.read_text());result={'method':'Independent Hess-Smith velocity free-boundary discretisation','reference':'https://archive.aoe.vt.edu/mason/Mason_f/CAtxtChap4.pdf','controls':controls,'experimentalValidation':False,'cases':[]}
    for c in cases:
        r=solve_case(c);result['cases'].append(r);print(json.dumps({k:v for k,v in r.items() if k not in ['height','panels','trace']}),flush=True);args.output.write_text(json.dumps(result,indent=2)+'\n')
