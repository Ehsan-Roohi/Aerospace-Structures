"""Independent Python/NumPy source-ring developed-cavity reproduction.
Shares mathematical formulation, not JavaScript implementation. Not experimental validation.
Outputs every panel/node and off-collocation sample; no excluded endpoints.
Run: python axisymmetric-cavity-independent.py [cavity_panels=32] [shape_parameters=N/2-1]
"""
import sys,time,json
import numpy as np
from numpy.polynomial.legendre import leggauss
from numpy.polynomial.chebyshev import chebvander

def elliptic(q):
    a=np.ones_like(q); b=np.sqrt(q); sm=(1-q)/2; wt=1.
    for k in range(30):
        c=(a-b)/2; sm+=wt*c*c
        a,b=(a+b)/2,np.sqrt(a*b); wt*=2
        if np.max(np.abs(c))<2e-16:break
    K=np.pi/(2*a)
    return K,K*(1-sm)

def mesh(L,c,n=32,nd=12,power=2/3):
    th=np.linspace(0,np.pi,n+1); t=(1-np.cos(th))/2; f=4*t*(1-t)
    # sqrt-type edge parameter; x~(r-1)^(3/2), tangent continues the disk face.
    h=f**power*np.exp(chebvander(2*f-1,len(c)-1)@c)
    r=1+h
    rd=(1-np.cos(np.linspace(0,np.pi,nd+1)))/2
    x=np.r_[np.zeros(nd),L*t,np.full(nd,L)]
    r=np.r_[rd[:-1],r,rd[-2::-1]]
    return x,r

def solve(x,r,order=20):
    xa,xb=x[:-1],x[1:]; ra,rb=r[:-1],r[1:]
    dx=xb-xa; dr=rb-ra; le=np.hypot(dx,dr); tx=dx/le;tr=dr/le;nx=-tr;nr=tx
    xm=(xa+xb)/2;rm=(ra+rb)/2; N=len(le)
    q,w=leggauss(order)
    xs=xm[None,:,None]+dx[None,:,None]*q[None,None,:]/2
    rs=rm[None,:,None]+dr[None,:,None]*q[None,None,:]/2
    ddx=xm[:,None,None]-xs;ddr=rm[:,None,None]-rs
    B=ddx*ddx+ddr*ddr;D=ddx*ddx+(rm[:,None,None]+rs)**2
    K,E=elliptic(B/D);factor=rs/(np.pi*np.sqrt(D))
    vx=factor*E*ddx/B
    vr=factor*((K-E)/(2*rm[:,None,None])+E*ddr/B)
    vn=np.sum((vx*nx[:,None,None]+vr*nr[:,None,None])*w[None,None,:]*le[None,:,None]/2,axis=2)
    vt=np.sum((vx*tx[:,None,None]+vr*tr[:,None,None])*w[None,None,:]*le[None,:,None]/2,axis=2)
    # Paired principal-value self integration, with squared distance mapping.
    for i in range(N):
        v=(q+1)/2;u=le[i]*v*v/2;ww=w*le[i]*v/2
        valn=np.zeros_like(u);valt=np.zeros_like(u)
        for sign in [-1,1]:
            xs=xm[i]+sign*u*tx[i];rs=rm[i]+sign*u*tr[i]
            ddx=-sign*u*tx[i];ddr=-sign*u*tr[i];B=u*u;D=ddx*ddx+(rm[i]+rs)**2
            K,E=elliptic(B/D);ff=rs/(np.pi*np.sqrt(D))
            valn+=ff*nr[i]*(K-E)/(2*rm[i])
            valt+=ff*(tr[i]*(K-E)/(2*rm[i])+E*(tx[i]*ddx+tr[i]*ddr)/B)
        vn[i,i]=np.dot(ww,valn)+.5;vt[i,i]=np.dot(ww,valt)
    strength=np.linalg.solve(vn,-nx)
    speed=tx+vt@strength;cp=1-speed*speed
    area=2*np.pi*rm*le
    return dict(x=x,r=r,xm=xm,rm=rm,speed=speed,cp=cp,strength=strength,nx=nx,nr=nr,le=le,tx=tx,tr=tr,area=area,flux=np.dot(area,strength),normal=float(np.max(np.abs(vn@strength+nx))))

def fit(L=8.,n=32,nd=12,k=6,seed=None,maxiter=35,order=20):
    c=np.zeros(k) if seed is None else np.r_[seed,np.zeros(max(0,k-len(seed)))][:k].copy()
    if seed is None:c[0]=np.log(.2*L)
    start=time.time();trace=[];count=0
    def fun(c,full=False):
        nonlocal count
        count+=1
        x,r=mesh(L,c,n,nd);out=solve(x,r,order)
        sp=out['speed'][nd:nd+n//2]
        residual=sp-np.mean(sp)
        return (residual,out) if full else residual
    lam=1e-3
    for it in range(maxiter):
        f,out=fun(c,True);cost=float(np.dot(f,f));mx=float(np.max(np.abs(f)))
        trace.append(dict(iteration=it,rms=float(np.sqrt(cost/len(f))),maximum=mx,radius=float(np.max(out['r'])),qc=float(np.mean(out['speed'][nd:nd+n])),seconds=time.time()-start))
        print(trace[-1],flush=True)
        if mx<2e-7:break
        J=np.empty((len(f),k));eps=2e-5
        for j in range(k):
            cc=c.copy();cc[j]+=eps;J[:,j]=(fun(cc)-f)/eps
        accepted=False
        for _ in range(12):
            delta=np.linalg.solve(J.T@J+lam*np.eye(k),-J.T@f)
            if np.linalg.norm(delta)>1:delta/=np.linalg.norm(delta)
            cc=c+delta
            x,r=mesh(L,cc,n,nd)
            if np.any(np.diff(r[nd:nd+n//2+1])<-.01):lam*=10;continue
            ff=fun(cc)
            if np.dot(ff,ff)<cost:
                c=cc;lam=max(1e-9,lam/3);accepted=True;break
            lam*=10
        if not accepted:break
    f,out=fun(c,True);qc=float(np.mean(out['speed'][nd:nd+n]));sig=qc*qc-1
    cd=float(np.sum((out['cp'][:nd]+sig)*out['area'][:nd])/np.pi)
    return dict(L=L,n=n,nd=nd,k=k,coefficients=c.tolist(),sigma=sig,qc=qc,CdPhysicalDisk=cd,radius=float(np.max(out['r'])),residual=float(np.max(np.abs(f))),flux=float(out['flux']),normal=out['normal'],count=count,seconds=time.time()-start,trace=trace,x=out['x'].tolist(),r=out['r'].tolist(),cp=out['cp'].tolist(),speed=out['speed'].tolist())

def sample(out,fractions=(.25,.75),order=48):
    q,w=leggauss(order);x,r=out['x'],out['r'];le=out['le'];n=len(le);data=[]
    tx,tr,nx,nr=out['tx'],out['tr'],out['nx'],out['nr']
    for i in range(n):
        for part in fractions:
            xx=x[i]+part*(x[i+1]-x[i]);rr=r[i]+part*(r[i+1]-r[i])
            vt=tx[i];vn=nx[i]
            for j in range(n):
                if i==j:
                    a=part*le[j];b=(1-part)*le[j];inorm=0.;itan=np.log(a/b)/(2*np.pi)
                    for sign,extent in [(-1,a),(1,b)]:
                        v=(q+1)/2;ss=sign*extent*v*v;ww=w*extent*v
                        rs=rr+ss*tr[j];D=(ss*tx[j])**2+(rr+rs)**2
                        K,E=elliptic(ss*ss/D);ff=rs/(np.pi*np.sqrt(D))
                        nn=ff*nr[i]*(K-E)/(2*rr)
                        tt=ff*tr[i]*(K-E)/(2*rr)+(1/(2*np.pi)-ff*E)/ss
                        inorm+=np.dot(ww,nn);itan+=np.dot(ww,tt)
                    inorm+=.5
                else:
                    ss=(q+1)/2;xs=x[j]+ss*(x[j+1]-x[j]);rs=r[j]+ss*(r[j+1]-r[j]);ddx=xx-xs;ddr=rr-rs
                    B=ddx*ddx+ddr*ddr;D=ddx*ddx+(rr+rs)**2
                    K,E=elliptic(B/D);f=rs/(np.pi*np.sqrt(D))
                    vx=f*E*ddx/B;vr=f*((K-E)/(2*rr)+E*ddr/B)
                    inorm=np.dot(w,(vx*nx[i]+vr*nr[i]))*le[j]/2
                    itan=np.dot(w,(vx*tx[i]+vr*tr[i]))*le[j]/2
                vn+=out['strength'][j]*inorm;vt+=out['strength'][j]*itan
            data.append(dict(panel=i,fraction=part,x=xx,r=rr,vt=vt,vn=vn,cp=1-vt*vt-vn*vn))
    return data

if __name__=='__main__':
    from pathlib import Path
    n=int(sys.argv[1]) if len(sys.argv)>1 else 32
    k=int(sys.argv[2]) if len(sys.argv)>2 else n//2-1
    value=fit(8.,n,max(12,n//3),k,order=20)
    recomputed=solve(np.array(value['x']),np.array(value['r']),32)
    samples=sample(recomputed)
    free=[v for v in samples if value['nd']<=v['panel']<value['nd']+n]
    value['offCentroid']={'normalMax':max(abs(v['vn']) for v in free),'dynamicCpMax':max(abs(v['cp']+value['sigma']) for v in free),'samples':samples}
    value['scope']='Independent Python implementation of the same source-ring formulation. NOT external or experimental validation.'
    target=Path(__file__).with_name('axisymmetric-cavity-independent.json')
    target.write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
    print(target)