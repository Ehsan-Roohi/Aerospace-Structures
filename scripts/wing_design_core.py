"""Teaching model embedded into the self-contained wing design notebook. SI units."""
import numpy as np

def integral(f, x):
    return np.sum((np.asarray(f)[1:]+np.asarray(f)[:-1])*np.diff(x)/2)

def cumulative(f, x):
    return np.r_[0., np.cumsum((np.asarray(f)[1:]+np.asarray(f)[:-1])*np.diff(x)/2)]

def section(B, H, tf, tw):
    if min(B,H,tf,tw)<=0 or B<=2*tw or H<=2*tf:
        raise ValueError('Box dimensions must be positive with a positive inner void.')
    bm, hm = B-tw, H-tf
    return dict(A=B*H-(B-2*tw)*(H-2*tf),
                I=(B*H**3-(B-2*tw)*(H-2*tf)**3)/12,
                Am=bm*hm, J=4*(bm*hm)**2/(2*bm/tf+2*hm/tw),
                hweb=H-2*tf, bpanel=B-2*tw,
                thin_ratio=max(tf/bm,tw/hm))

def line_load(y, L, F, shape='Elliptical'):
    r=np.asarray(y)/L
    if shape=='Uniform': return np.ones_like(r)*F/L
    if shape=='Elliptical': return 4*F/(np.pi*L)*np.sqrt(np.maximum(0,1-r*r))
    if shape=='Root-heavy': return 2*F/L*(1-r)
    raise ValueError('Unknown load shape')

def beam_integral(y, w, E, I, G, J, e):
    # M = integral(eta*w) - y*integral(w); O(N) rather than N separate integrals.
    shear=integral(w,y)-cumulative(w,y)
    moment=integral(y*w,y)-cumulative(y*w,y)-y*shear
    torque=e*shear
    slope=cumulative(moment/(E*I),y)
    return dict(y=y,w=w,V=shear,M=moment,T=torque,
                slope=slope,v=cumulative(slope,y),phi=cumulative(torque/(G*J),y))

def airfoil(naca, points=501):
    if len(naca)!=4 or not naca.isdigit() or int(naca[2:])==0:
        raise ValueError('Use a four-digit NACA code with nonzero thickness.')
    m,p,t=int(naca[0])/100,int(naca[1])/10,int(naca[2:])/100
    if m>0 and p==0: raise ValueError('Cambered NACA section requires p > 0.')
    x=(1-np.cos(np.linspace(0,np.pi,points)))/2
    yt=5*t*(.2969*np.sqrt(x)-.126*x-.3516*x*x+.2843*x**3-.1015*x**4)
    yc=np.zeros_like(x); dy=np.zeros_like(x)
    if m:
        k=x<p
        yc[k]=m/p**2*(2*p*x[k]-x[k]**2); dy[k]=2*m/p**2*(p-x[k])
        yc[~k]=m/(1-p)**2*(1-2*p+2*p*x[~k]-x[~k]**2)
        dy[~k]=2*m/(1-p)**2*(p-x[~k])
    th=np.arctan(dy)
    return x-yt*np.sin(th),yc+yt*np.cos(th),x+yt*np.sin(th),yc-yt*np.cos(th)

def packaging(c, B=None, H=None, stations=21):
    B=c['B'] if B is None else B; H=c['H'] if H is None else H
    span=np.linspace(0,c['L'],stations)
    chords=c['c_root']*(1-(1-c['taper'])*span/c['L'])
    xu,zu,xl,zl=airfoil(c['naca']); su=np.argsort(xu); sl=np.argsort(xl)
    # A straight, constant-section spar: choose its vertical center once at the root.
    xr=np.linspace(c['spar_xc']*c['c_root']-B/2,c['spar_xc']*c['c_root']+B/2,121)
    ur=np.interp(xr/c['c_root'],xu[su],zu[su])*c['c_root']
    lr=np.interp(xr/c['c_root'],xl[sl],zl[sl])*c['c_root']
    center=(ur.min()+lr.max())/2
    gaps=[]
    for chord in chords:
        xx=np.linspace(c['spar_xc']*chord-B/2,c['spar_xc']*chord+B/2,121)
        if xx.min()<0 or xx.max()>chord:
            gaps.append(-np.inf); continue
        up=np.interp(xx/chord,xu[su],zu[su])*chord
        lo=np.interp(xx/chord,xl[sl],zl[sl])*chord
        gaps.append(min(np.min(up-center-H/2),np.min(center-H/2-lo)))
    return dict(y=span,chord=chords,gap=np.array(gaps),center=center)

def validate(c):
    for k in ['L','E','G','rho','mass','g','stress_allow','shear_allow','defl_limit','twist_limit','clearance','c_root','buckling_fs']:
        if not np.isfinite(c[k]) or c[k]<=0: raise ValueError(k+' must be positive and finite')
    if not 0<c['taper']<=1 or not 0<c['spar_xc']<1 or not -1<c['nu']<.5:
        raise ValueError('Check taper, spar position, or Poisson ratio')
    section(c['B'],c['H'],c['tf'],c['tw']); airfoil(c['naca'])

def assess(c, shape='Elliptical', stations=401):
    validate(c)
    s=section(c['B'],c['H'],c['tf'],c['tw'])
    yy=np.linspace(0,c['L'],stations)
    w=line_load(yy,c['L'],c['n']*c['mass']*c['g']/2,shape)
    beam=beam_integral(yy,w,c['E'],s['I'],c['G'],s['J'],c['e'])
    sig=np.max(np.abs(beam['M']))*c['H']/2/s['I']
    # Symmetric box: both webs contribute to material width at the neutral axis.
    Q=(c['B']*c['H']**2-(c['B']-2*c['tw'])*s['hweb']**2)/8
    tauV=np.max(np.abs(beam['V']))*Q/(s['I']*2*c['tw'])
    qT=np.max(np.abs(beam['T']))/(2*s['Am'])
    tau=tauV+max(qT/c['tw'],qT/c['tf'])
    elastic_cr=c['k_buckle']*np.pi**2*c['E']/(12*(1-c['nu']**2))*(c['tf']/s['bpanel'])**2
    buck_allow=elastic_cr/c['buckling_fs']
    pack=packaging(c)
    u=dict(bending=sig/c['stress_allow'],web_shear=tau/c['shear_allow'],
           deflection=np.max(np.abs(beam['v']))/c['defl_limit'],
           twist=np.max(np.abs(beam['phi']))/c['twist_limit'],buckling=sig/buck_allow)
    model_ok=s['thin_ratio']<=.1 and c['L']/c['H']>=10
    fits=bool(np.min(pack['gap'])>=c['clearance'])
    return dict(beam=beam,section=s,pack=pack,U=u,mass=c['rho']*s['A']*c['L'],
                stress=sig,tau=tau,tauV=tauV,qT=qT,buckling_allow=buck_allow,
                fits=fits,model_ok=model_ok,feasible=bool(max(u.values())<=1 and fits and model_ok),
                governing=max(u,key=u.get))

def envelope(c, cases):
    all_results={label:assess(dict(c,n=n)) for label,n in cases.items()}
    u={key:max(r['U'][key] for r in all_results.values()) for key in next(iter(all_results.values()))['U']}
    worst={key:max(all_results,key=lambda label:all_results[label]['U'][key]) for key in u}
    base=next(iter(all_results.values()))
    return dict(results=all_results,U=u,worst=worst,mass=base['mass'],
                gap=float(base['pack']['gap'].min()),feasible=all(r['feasible'] for r in all_results.values()),
                model_ok=base['model_ok'],governing=max(u,key=u.get))
