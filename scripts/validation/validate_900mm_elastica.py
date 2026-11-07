"""Independent dimensional 900 mm extensible planar elastica benchmark.
Reference: scalar angle/moment/position ODE, RK4 and scalar bisection in Python.
Candidate: production spatial quaternion beam in Node. No reference values imported.
This is numerical verification, not experimental validation or an allowable-deflection rule.
"""
import json, math, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output'/'900mm-independent-current'
OUT.mkdir(parents=True,exist_ok=True)
L=900.; E=2000.; b=60.; d=30.; t=1.2
A=b*d-(b-2*t)*(d-2*t)
I=(b*d**3-(b-2*t)*(d-2*t)**3)/12
EA=E*A; EI=E*I
LIMITS={'tip_relative':5e-4,'profile_absolute_over_span':1e-4,'reference_refinement_over_span':1e-7}
# Independent dimensionless equations. v=M*L/EI, eta=P/EA.
def integrate(k,lam,N,profile=False):
    eta=lam*EI/L**2/EA; h=1/N; s=[0.,k,0.,0.]; rows=[]
    def rhs(z):
        th,v,_,_=z; stretch=1+eta*math.sin(th)
        return [v,-lam*stretch*math.cos(th),stretch*math.cos(th),stretch*math.sin(th)]
    for i in range(N+1):
        if profile and i%(N//60)==0: rows.append([i/N,*s])
        if i==N: break
        a=rhs(s); bb=rhs([z+h*q/2 for z,q in zip(s,a)]); c=rhs([z+h*q/2 for z,q in zip(s,bb)]); dd=rhs([z+h*q for z,q in zip(s,c)])
        s=[z+h*(aa+2*bbb+2*cc+ddd)/6 for z,aa,bbb,cc,ddd in zip(s,a,bb,c,dd)]
    return s,rows

def reference(lam,N):
    lo=0.; hi=lam*1.01+1e-6
    assert integrate(lo,lam,N)[0][1]<0<integrate(hi,lam,N)[0][1]
    for _ in range(43):
        mid=(lo+hi)/2
        if integrate(mid,lam,N)[0][1]>0: hi=mid
        else: lo=mid
    return integrate((lo+hi)/2,lam,N,True)

js=r'''
const B=require('./computational/printed-wing-solver/nonlinear/wing_nonlinear_beam.js');
const c=JSON.parse(process.argv[1]);let all=[];
for(const lambda of c.lambdas){const P=lambda*c.EI/c.L**2,n=60,r=B.solve({nodes:Array.from({length:n+1},(_,i)=>[c.L*i/n,0,0]),elements:Array.from({length:n},(_,i)=>({a:i,b:i+1,spanStart:c.L*i/n,spanEnd:c.L*(i+1)/n,EA:c.EA,EI22:c.EI,EI33:c.EI,GJ:c.EI,orientation:[0,1,0]})),pointLoads:[{y:c.L,force:[0,P,0]}]});all.push({lambda,P,tip:r.tipPosition,residual:r.verification.relativeResidual,rows:Array.from({length:61},(_,i)=>{let a=r.at(c.L*i/60);return [i/60,...a.position,a.rotation[2]];})});}console.log(JSON.stringify(all));
'''
config=dict(L=L,EA=EA,EI=EI,lambdas=[.001,.05,.2,.6,1.])
candidates=json.loads(subprocess.check_output(['node','-e',js,json.dumps(config)],cwd=ROOT,text=True))
results=[]; csv=['lambda,force_N,s_over_L,reference_x_mm,reference_y_mm,solver_x_mm,solver_y_mm,reference_angle_rad,solver_angle_rad']
for cand in candidates:
    lam=cand['lambda']; coarse,_=reference(lam,600); fine,rows=reference(lam,1200)
    refinement=max(abs(a-b) for a,b in zip(coarse,fine))
    tip_error=abs(cand['tip'][1]/L-fine[3])/abs(fine[3]); profile_error=0.
    for ref,sol in zip(rows,cand['rows']):
        z,theta,v,x,y=ref; profile_error=max(profile_error,abs(x-sol[1]/L),abs(y-sol[2]/L))
        csv.append(','.join(map(str,[lam,cand['P'],z,x*L,y*L,sol[1],sol[2],theta,sol[4]])))
    passed=tip_error<LIMITS['tip_relative'] and profile_error<LIMITS['profile_absolute_over_span'] and refinement<LIMITS['reference_refinement_over_span']
    results.append(dict(lambda_=lam,force_N=cand['P'],reference_tip_mm=fine[3]*L,solver_tip_mm=cand['tip'][1],linear_tip_mm=cand['P']*L**3/(3*EI),tip_relative_error=tip_error,profile_error_over_span=profile_error,reference_refinement=refinement,equilibrium_residual=cand['residual'],passed=passed,reference_profile=rows,solver_profile=cand['rows']))
report=dict(geometry=dict(length_mm=L,width_mm=b,height_mm=d,wall_mm=t,area_mm2=A,I_mm4=I),material=dict(E_MPa=E,law='homogeneous linear elastic; no strength/yield assertion'),boundary='fully clamped root; transverse dead point force at free tip',reference='Independent Python scalar extensible planar elastica, RK4 + bisection; 600 versus 1200 steps',candidate='Production 3D quaternion Kirchhoff solver; 60 elements, default eight substeps each',predeclared_limits=LIMITS,cases=results,passed=all(r['passed'] for r in results),scope='Numerical verification of structural core only. Does not validate pressure coupling, airfoil section properties, shear/warping, joints, material failure, or the 45 mm design limit.')
(OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');(OUT/'profiles.csv').write_text(chr(10).join(csv),encoding='utf-8')
# Physical profiles, not bars. Independent reference solid; production dashed.
parts=['<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="640" viewBox="0 0 1080 640"><rect width="1080" height="640" fill="white"/>']
colors=['#333333','#2375b9','#00845a','#ba5900','#9d299a']
for xx,yy,label in [(70,570,'0'),(1000,570,'900')]:parts.append(f'<text x="{xx}" y="{yy+22}" font-size="16">{label}</text>')
parts.extend(['<path d="M70 40 V570 H1000" fill="none" stroke="black"/>','<text x="480" y="625" font-size="18">Reference span position (mm)</text>','<text transform="translate(24 380) rotate(-90)" font-size="18">Transverse deflection (mm)</text>'])
for val in [0,100,200,300]:
    y=570-val/320*510;parts.append(f'<path d="M70 {y} H1000" stroke="#dddddd"/><text x="34" y="{y+5}" font-size="15">{val}</text>')
for idx,r in enumerate(results):
    color=colors[idx]
    for rows,isref in [(r['reference_profile'],True),(r['solver_profile'],False)]:
        pts=' '.join(f'{70+q[0]*930:.3f},{570-(q[4]*L if isref else q[2])/320*510:.3f}' for q in rows)
        dash='' if isref else ' stroke-dasharray="7 5"'
        parts.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="2"{dash}/>')
    parts.append(f'<text x="100" y="{65+idx*23}" fill="{color}" font-size="16">P = {r["force_N"]:.4g} N</text>')
parts.append('<text x="100" y="198" font-size="15">Solid: independent scalar reference; dashed: spatial beam</text></svg>')
(OUT/'deflection-profiles.svg').write_text(''.join(parts),encoding='utf-8')
print(json.dumps({**{k:v for k,v in report.items() if k!='cases'},'cases':[{k:v for k,v in r.items() if 'profile' not in k} for r in results]},indent=2))
assert report['passed']
