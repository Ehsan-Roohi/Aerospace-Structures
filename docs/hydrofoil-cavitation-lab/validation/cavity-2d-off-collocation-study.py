"""Off-collocation and wetted-pressure checks of exploratory free boundaries.

Reconstruct the independent constant-source/uniform-vortex velocity solution.
Evaluate the analytic velocity at quarter/half/three-quarter panel locations,
with an exterior offset of 1e-8 chord. No target speed is substituted. Record
every sampled station, including both cavity endpoints and all wetted panels.
These are discretisation diagnostics, not experimental validation.
"""
from pathlib import Path
import importlib.util,json,math
import numpy as np
base=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('auto',base/'cavity-2d-auto-detachment-study.py')
auto=importlib.util.module_from_spec(spec);spec.loader.exec_module(auto)

def velocity_solution(points,alpha):
 p=np.asarray(points,float);d=np.diff(p,axis=0);L=np.linalg.norm(d,axis=1);t=d/L[:,None]
 left=np.c_[-t[:,1],t[:,0]];normal=-left;c=(p[:-1]+p[1:])/2;N=len(L)
 U=np.array([math.cos(math.radians(alpha)),math.sin(math.radians(alpha))])
 def influence(loc):
  r=loc[:,None,:]-p[None,:-1,:];X=np.einsum('ijk,jk->ij',r,t);Y=np.einsum('ijk,jk->ij',r,left)
  su=np.log((X*X+Y*Y)/((X-L)**2+Y*Y))/(4*np.pi)
  sv=np.arctan2(Y*L,X*X-X*L+Y*Y)/(2*np.pi)
  return su[:,:,None]*t[None,:,:]+sv[:,:,None]*left[None,:,:],sv[:,:,None]*t[None,:,:]-su[:,:,None]*left[None,:,:]
 S,V=influence(c);sn=np.einsum('ijk,ik->ij',S,normal);st=np.einsum('ijk,ik->ij',S,t)
 # Exterior self influence has a known analytic limit, independent of roundoff
 # in the collocation point's signed distance from its own flat panel.
 np.fill_diagonal(sn,.5);np.fill_diagonal(st,0)
 vn=np.einsum('ijk,ik->ij',V,normal);vt=np.einsum('ijk,ik->ij',V,t)
 np.fill_diagonal(vn,0);np.fill_diagonal(vt,-.5)
 vn=vn.sum(axis=1);vt=vt.sum(axis=1)
 A=np.zeros((N+1,N+1));A[:N,:N]=sn;A[:N,N]=vn;A[N,:N]=st[0]+st[-1];A[N,N]=vt[0]+vt[-1]
 z=np.linalg.solve(A,np.r_[-normal@U,-(t[0]+t[-1])@U])
 def field(loc):
  S,V=influence(loc);return U+np.einsum('ijk,j->ik',S,z[:N])+z[N]*V.sum(axis=1)
 return field,L,t,normal,c

def check(row):
 n=row['n'];original,ids,nodes,sf=auto.mesh(row['detachment'],row['length'],n,row['thickness'])
 p=original.copy();p[nodes,1]+=[v['h'] for v in row['height']]
 field,L,t,normal,c=velocity_solution(p,row['alpha']);cavity=set(ids);sigma=row['sigma'];qc=math.sqrt(1+sigma)
 samples=[]
 for fraction in [.25,.5,.75]:
  loc=p[:-1]+fraction*np.diff(p,axis=0)+1e-8*normal;v=field(loc)
  tangent=np.sum(v*t,axis=1);vn=np.sum(v*normal,axis=1);cp=1-np.sum(v*v,axis=1)
  for i in range(len(L)):
   k=int(np.where(ids==i)[0][0]) if i in cavity else None
   s=sf[k]+fraction*L[i] if k is not None else None
   # Contour traverses the upper cavity upstream; use physical downstream s.
   if k is not None:s=sf[k]+(1-fraction)*(sf[k+1]-sf[k])
   g=1-row['A']*max(0,(s-.85*sf[-1])/(.15*sf[-1])) if k is not None else None
   samples.append(dict(panel=i,fraction=fraction,x=float(loc[i,0]),y=float(loc[i,1]),cavity=k is not None,normalVelocity=float(vn[i]),cp=float(cp[i]),cavitySpeedResidual=float(tangent[i]+qc*g) if k is not None else None,belowVapour=float(cp[i]+sigma)<0 if k is None else None))
 wet=[v for v in samples if not v['cavity']];cav=[v for v in samples if v['cavity']]
 return dict(n=n,N=len(L),detachment=row['detachment'],sigma=sigma,exteriorOffset=1e-8,wettedMinimumCp=min(v['cp'] for v in wet),wettedPressureMargin=min(v['cp']+sigma for v in wet),wettedBelowVapourSamples=sum(v['belowVapour'] for v in wet),maximumNormalVelocity=max(abs(v['normalVelocity']) for v in samples),maximumCavitySpeedResidual=max(abs(v['cavitySpeedResidual']) for v in cav),samples=samples)

if __name__=='__main__':
 source=json.loads((base/'cavity-2d-entry-regularity-study.json').read_text());rows=source['rows']
 out={'status':'INDEPENDENT_DIAGNOSTIC_NOT_VALIDATION','rows':[]}
 for r in rows:
  if r['regularity']!='fractional':continue
  q=check(r);out['rows'].append(q);print(json.dumps({k:v for k,v in q.items() if k!='samples'}),flush=True)
  (base/'cavity-2d-off-collocation-study.json').write_text(json.dumps(out,indent=2)+'\n')
