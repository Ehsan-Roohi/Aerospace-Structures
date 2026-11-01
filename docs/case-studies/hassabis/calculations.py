"""Independent educational calculations; no AI model training or measured data.
Run with Python 3 standard library. Generates results.json and original SVG figures.
"""
from pathlib import Path
import json
import math
from figure_tools import SVG, axes
HERE=Path(__file__).resolve().parent

E,b,h,F,L0=70e9,.04,.006,10.,.30
I=b*h**3/12;EI=E*I;delta0=F*L0**3/(3*EI)
exact=lambda x:x**3
surrogate=lambda x:3*x*x-2.96*x+.96
for x in (.8,1,1.2,1.1,1.5,2):
 assert abs(exact(x)-surrogate(x)-(x-.8)*(x-1)*(x-1.2))<1e-12
assert abs(I-7.2e-10)<1e-22
assert abs(delta0-.0017857142857142857)<1e-15
qnew=2+.1*(1+.9*3-2)
assert abs(qnew-2.17)<1e-12
scores=[.55+1.5*.7*math.sqrt(44)/41,.50+1.5*.3*math.sqrt(44)/5]
assert scores[1]>scores[0]
raw=[math.exp(t-2) for t in (2,1,0)];weights=[x/sum(raw) for x in raw]
assert abs(sum(weights)-1)<1e-15
attention=sum(w*v for w,v in zip(weights,(10,0,-10)))
X=[(0,0,0),(1,0,0),(0,1,0),(0,0,1)]
Y=[(-y+3,x+2,z+1) for x,y,z in X]
restored=[(y-2,-(x-3),z-1) for x,y,z in Y]
def distance(a,b):return math.sqrt(sum((u-v)**2 for u,v in zip(a,b)))
for i in range(4):
 for j in range(4):assert abs(distance(X[i],X[j])-distance(Y[i],Y[j]))<1e-12
raw_rmsd=math.sqrt(sum(distance(a,b)**2 for a,b in zip(X,Y))/4)
restored_rmsd=math.sqrt(sum(distance(a,b)**2 for a,b in zip(X,restored))/4)
assert restored_rmsd<1e-12
uncertainties={'Force':.02**2,'Length':(3*.005)**2,'Modulus':.03**2,'Width':.01**2,'Depth':(3*.01)**2}
variance=sum(uncertainties.values());relstd=math.sqrt(variance)
reduced=math.sqrt(variance-.03**2+.015**2)
results={'synthetic':True,'no_AI_training':True,
 'beam_inputs_SI':{'E_Pa':E,'width_m':b,'depth_m':h,'force_N':F,'reference_length_m':L0},
 'I_m4':I,'EI_Nm2':EI,'reference_deflection_m':delta0,
 'surrogate_checks':[{'lambda':x,'exact':exact(x),'prediction':surrogate(x),'signed_relative_error':(surrogate(x)-exact(x))/exact(x)} for x in (.8,1,1.1,1.2,1.5,2)],
 'Q_update':qnew,'search_scores_A_B':scores,'softmax':weights,'attention_output':attention,
 'coordinate_raw_RMSD':raw_rmsd,'coordinate_known_transform_corrected_RMSD':restored_rmsd,
 'coordinate_points':X,'transformed_points':Y,
 'relative_variance_contributions':uncertainties,'relative_std':relstd,'halved_modulus_relative_std':reduced,
 'illustrative_four_stage_success':.7**4}
(HERE/'results.json').write_text(json.dumps(results,indent=2)+'\n')

s=SVG('Scientific AI is a workflow, not one output','Separate candidate generation from the independent check that gives it meaning.',height=750)
rows=[('Games and control',['Input: observations and rules','Output: an action or policy'],['Check: held-out play','A score within a fixed environment']),('Molecular prediction',['Input: sequence and context','Output: coordinates + confidence'],['Check: independent structures','Assess local errors and interfaces']),('Algorithms and design',['Input: specification + constraints','Output: a candidate construction'],['Check: exact identity or mechanics','Then test relevance to the use case'])]
for i,(title,inputs,checks) in enumerate(rows):
 y=120+i*185;s.box(35,y,415,145,title,inputs,fill='#fff');s.line(450,y+72,530,y+72,arrow=True);s.box(540,y,425,145,'Independent evaluation',checks,fill='#e8f4fa')
s.text(35,720,'Human decisions remain in the task definition, assumptions and verification protocol.',17)
s.write(HERE/'task-map.svg')

s=SVG('Policy suggests; value estimates; search allocates trials','Illustrative policy-guided search · invented values · not AlphaGo log data',height=640)
s.box(330,115,340,100,'Current state',['Network: policy prior P(a|s)','Network: estimated outcome v(s)'])
for x,title,lines in [(65,'Move A',['P = 0.7 · Q = 0.55','Visits = 40 · score ≈ 0.720']),(555,'Move B',['P = 0.3 · Q = 0.50','Visits = 4 · score ≈ 1.097'])]:
 s.line(500,215,x+190,290,arrow=True);s.box(x,290,380,115,title,lines,fill='#e8f4fa' if title=='Move B' else '#fff')
s.box(165,485,670,100,'Investigate B, then back up the new result',['A lower current mean can be worth exploring when evidence is sparse.','Selection for search is different from a final claim of optimality.'])
s.line(745,405,600,485,arrow=True);s.line(255,405,400,485,arrow=True)
s.write(HERE/'search.svg')

s=SVG('Same internal shape, different coordinate frame','Synthetic tetrahedron · proper 90° rotation + translation · distances preserved',height=575)
# Two consistent oblique projections; right panel recenters only for display.
project=lambda p:(105*p[0]+53*p[2],-100*p[1]+37*p[2])
for points,ox,oy,label,recenter in [(X,160,330,'Original coordinates',(0,0,0)),(Y,650,330,'Rotated + translated',(3,2,1))]:
 mapped=[(ox+project(tuple(a-b for a,b in zip(p,recenter)))[0],oy+project(tuple(a-b for a,b in zip(p,recenter)))[1]) for p in points]
 for i in range(4):
  for j in range(i):s.line(*mapped[i],*mapped[j],color='#759aac',width=3)
 for i,(x,y) in enumerate(mapped):s.circle(x,y,10,'#147c9f');s.text(x+16,y-10,str(i),18,weight='700')
 s.text(ox-75,165,label,21,weight='700')
s.text(40,450,'Right panel recenters the translated points for display; its orientation is changed.',17)
s.text(40,485,f'Raw RMSD = {raw_rmsd:.4f}; undoing the known rigid transform gives RMSD = 0.',17)
s.text(40,520,'A distance-only comparison also permits reflections: chirality needs extra information.',17)
s.write(HERE/'geometry.svg')

s=SVG('A surrogate can fit training data and still extrapolate poorly','Analytical cantilever teaching model · dimensionless deflection d = λ³',height=850)
xy=axes(s,105,145,805,350,.6,2.1,0,10,[.6,.8,1,1.2,1.5,1.8,2.1],[0,2,4,6,8,10],'Dimensionless length λ','Dimensionless deflection')
x1,y1=xy(.8,10);x2,y2=xy(1.2,0);s.rect(x1,y1,x2-x1,y2-y1,'#e5f0f3','none',0)
xs=[.6+1.5*i/300 for i in range(301)]
s.path([xy(x,exact(x)) for x in xs],'#167595',4);s.path([xy(x,surrogate(x)) for x in xs],'#be7d24',3,True)
for x in (.8,1,1.2):s.circle(*xy(x,exact(x)),7,'#132f45')
s.rect(145,165,360,105,'#fff');s.text(165,192,'Blue: exact cubic beam response',17,'#167595');s.text(165,220,'Gold: quadratic surrogate',17,'#ad6e1b');s.text(165,248,'Dots / shading: training cases / range',16)
xye=axes(s,105,630,805,115,.6,2.1,-16,25,[.6,.8,1,1.2,1.5,1.8,2.1],[-15,-5,5,15,25],'Dimensionless length λ','Signed relative error (%)')
s.path([xye(x,100*(surrogate(x)-exact(x))/exact(x)) for x in xs],'#9c465c',3)
s.line(*xye(.6,0),*xye(2.1,0),color='#7e96a6',width=1)
s.text(525,580,'At λ = 2: 7.04 predicted vs 8 exact → −12%',17,'#9c465c')
s.write(HERE/'surrogate.svg')

s=SVG('Which input dominates the uncertainty budget?','First-order independent small uncertainties · analytical cantilever example',height=590)
for i,(label,value) in enumerate(uncertainties.items()):
 y=135+i*65;fraction=value/variance
 s.text(35,y+23,label,19);s.rect(180,y,600*fraction,34,'#237c9f','none',3);s.text(195+600*fraction,y+23,f'{100*fraction:.1f}% of total variance',17)
s.text(35,515,f'Combined relative standard deviation = {100*relstd:.3f}%',20,weight='700')
s.text(35,550,'Includes the stated input uncertainties; excludes model discrepancy and correlation.',16)
s.write(HERE/'uncertainty.svg')
print(json.dumps({'Q_update':qnew,'search_scores':scores,'deflection_mm':1000*delta0,'relative_std':relstd,'halved_modulus_std':reduced,'raw_RMSD':raw_rmsd},indent=2))
