"""Original conceptual diagrams and analytical plots for MIE 446.
Run with Python + numpy + matplotlib. These figures contain no measured data.
Coordinate signs follow the report. Diagrams are schematic, not apparatus CAD.
"""
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle, Arc, Polygon
P=Path(__file__).parent
plt.rcParams.update({'font.size':12,'svg.fonttype':'none','font.family':'DejaVu Sans'})
BLUE='#176d91'; RED='#a33350'; GOLD='#bb8525'; GRAY='#607582'; GREEN='#317e63'

def setup(title, n=1, size=None):
 f,aa=plt.subplots(1,n,figsize=size or (11,4.6),layout='constrained',squeeze=False)
 f.suptitle(title.split(' · ',1)[-1],fontsize=17,fontweight='bold',color='#183b50')
 return f,aa[0]
def arrow(a,p,q,c=BLUE,lw=2.5):
 a.annotate('',q,p,arrowprops=dict(arrowstyle='-|>',lw=lw,color=c,mutation_scale=15))
def done(f,name):
 f.savefig(P/(name+'.svg'),bbox_inches='tight');plt.close(f)
def clean(a,x=(-1.6,1.6),y=(-1.4,1.4)):
 a.set(xlim=x,ylim=y,aspect='equal');a.axis('off')
def hub(a):
 a.add_patch(Circle((0,0),.34,facecolor='#e5edf1',edgecolor=GRAY,lw=2))
 a.plot(0,0,'o',color='#19394c',ms=4)
 # Arms are a qualitative S planform.
 a.plot([-.34,-1.05,-1.05],[0,0,.65],color=GRAY,lw=13,solid_capstyle='round')
 a.plot([.34,1.05,1.05],[0,0,-.65],color=GRAY,lw=13,solid_capstyle='round')

# 1. Ordinary ejection and suction have different reservoir boundary patterns.
f,aa=setup('1 · Forward and reverse operation: distinguish the flow fields',2,(12,5.5))
for a in aa:clean(a,y=(-1.45,1.45));hub(a)
a=aa[0];a.set_title('Forward: outward jets',color=BLUE,pad=15)
arrow(a,(-1.05,.48),(-1.05,1.10));arrow(a,(1.05,-.48),(1.05,-1.10))
arrow(a,(-.75,0),(-1.03,0));arrow(a,(.75,0),(1.03,0))
a.text(0,.03,'Supply\nthrough axis',ha='center',va='center',fontsize=10)
a.text(0,1.16,'Example jet couple: clockwise',ha='center',fontsize=11,color=BLUE)
a.text(0,-1.32,'Solid reaction: counterclockwise',ha='center',fontsize=11,color=RED)
a=aa[1];a.set_title('Reverse: reservoir inflow converges',color=RED,pad=15)
for x,y,sgn in [(-1.05,.65,1),(1.05,-.65,-1)]:
 for dx in [-.40,0,.40]:arrow(a,(x+dx,y+sgn*.55),(x,y+sgn*.04),RED,1.6)
arrow(a,(-.95,0),(-.43,0),RED);arrow(a,(.95,0),(.43,0),RED)
a.text(0,.03,'Withdrawal\nthrough hub',ha='center',va='center',fontsize=10)
a.text(0,1.27,'Internal profiles must be determined',ha='center',fontsize=11)
a.text(0,-1.32,'Rotation depends on the complete torque balance',ha='center',fontsize=10)
done(f,'forward-reverse')

# 2. A fluid-only volume and wall/open-cut decomposition.
f,aa=setup('2 · A fluid control volume: retain every torque contribution',1,(11,5.5));a=aa[0]
clean(a,(-2.3,2.3),(-1.3,1.3))
a.add_patch(Rectangle((-1,-.65),2,1.3,facecolor='#eaf4f8',edgecolor=BLUE,lw=2,ls='--'))
a.text(0,.16,'FLUID CONTROL VOLUME',ha='center',fontweight='bold',color=BLUE)
a.text(0,-.16,'Storage: dH / dt',ha='center')
for x,s in [(-1,-1),(1,1)]:
 a.plot([x,x],[-.35,.35],color=GOLD,lw=5)
 arrow(a,(x,0),(x+s*.45,0),GOLD)
 a.text(x+s*.25,.18,'n',color=GOLD)
arrow(a,(-2.0,-.1),(-1.05,-.1),BLUE);a.text(-1.65,-.47,'Inlet flux',ha='center',color=BLUE)
arrow(a,(1.05,-.1),(2.0,-.1),RED);a.text(1.65,-.47,'Outlet flux',ha='center',color=RED)
a.annotate('Wall torque on fluid',xy=(.3,.65),xytext=(.2,1.03),ha='center',arrowprops={'arrowstyle':'->','color':GRAY})
a.text(0,-1.03,'Wall torque + pressure-cut torque + body torque = storage + net outward flux',ha='center',fontsize=11)
done(f,'control-volume')

# 3. Curvature and profile redistribution, explicitly conceptual.
f,aa=setup('3 · Curvature creates a cross-stream pressure gradient',2,(12,5.6))
a=aa[0];clean(a,(-.3,2.1),(-.3,2.1))
for r in [.85,1.25]:a.add_patch(Arc((0,0),2*r,2*r,theta1=0,theta2=90,lw=3,color=GRAY))
for phi in np.linspace(12,78,5):
 t=np.deg2rad(phi);p=(1.05*np.cos(t),1.05*np.sin(t));q=(p[0]-.16*np.sin(t),p[1]+.16*np.cos(t));arrow(a,p,q)
arrow(a,(0,0),(.69,.69),GOLD,1.6)
a.text(.30,.18,'R_c',color=GOLD);a.text(1.20,1.12,'Higher p',color=RED)
a.text(.12,.88,'Lower p',color=BLUE,fontsize=10)
a.text(.9,-.2,'Curved passage, plan view',ha='center',fontsize=11)
a=aa[1]
y=np.linspace(0,1,100)
a.plot(y,1+y,color=RED,lw=3)
a.set(xlabel='Distance toward outside of bend (normalized)',ylabel='Pressure (schematic units)',title='Pressure rises away from curvature center')
a.text(.06,1.8,r'$\partial p/\partial n_c\sim\rho U^2/R_c$',fontsize=16)
a.spines[['top','right']].set_visible(False);a.grid(alpha=.18)
f.supxlabel('Conceptual local picture; neither panel predicts the net rotor torque.',fontsize=11)
done(f,'curvature-pressure')

# 4. Alter geometry without assuming a universal direction.
f,aa=setup('4 · Geometry experiments: change one feature at a time',3,(13,4.6))
paths=[([-1.3,-.6,0,.6,1.3],[.5,.5,0,-.5,-.5]),([-1.3,-1,-.8,-.5,0,.5,.8,1,1.3],[.5,.8,.25,.5,0,-.5,-.25,-.8,-.5]),([-1.3,-.6,0,.6,1.3],[.5,-.35,0,.35,-.5])]
for a,(x,y),title in zip(aa,paths,['A · Baseline curves','B · Added curvature sequence','C · Changed hub approach']):
 clean(a,y=(-1,1));a.plot(x,y,lw=10,color=GRAY,solid_capstyle='round');a.add_patch(Circle((0,0),.30,color='#dce8ee',ec=GRAY,zorder=3));a.set_title(title,fontsize=12)
 a.text(0,-.86,'Measure Q, torque and internal velocity',ha='center',fontsize=9)
f.supxlabel('Illustrative design comparisons only; these are not copied experimental geometries or predicted results.',fontsize=10)
done(f,'geometry-comparison')

# 5. Tangible structural load path.
f,aa=setup('5 · Trace fluid loads into the supporting structure',1,(12,5.8));a=aa[0]
clean(a,(-2.4,2.4),(-1.5,1.2))
a.add_patch(Rectangle((-2.1,-1.25),4.2,.16,facecolor='#b9c6cd',hatch='///',edgecolor=GRAY))
a.add_patch(Rectangle((-.16,-1.09),.32,1.0,facecolor='#dde7ec',edgecolor=GRAY,lw=2))
a.add_patch(Rectangle((-.50,-.72),1,.18,facecolor='#d3b377',edgecolor=GOLD))
a.add_patch(Rectangle((-.65,-.09),1.3,.30,facecolor='#dde7ec',edgecolor=GRAY,lw=2))
a.plot([-.65,-1.55,-1.55],[.06,.06,.65],lw=11,color=GRAY)
a.plot([.65,1.55,1.55],[.06,.06,.65],lw=11,color=GRAY)
arrow(a,(-1.9,.45),(-1.58,.45),BLUE);arrow(a,(1.9,.45),(1.58,.45),BLUE)
a.text(0,.8,'Distributed pressure + viscous traction',ha='center',color=BLUE)
a.annotate('Tube walls and joints',(-1.1,.06),(-2.3,-.45),arrowprops={'arrowstyle':'->'},fontsize=11)
a.annotate('Hub',(.5,.1),(.9,.38),arrowprops={'arrowstyle':'->'},fontsize=11)
a.annotate('Bearing / torsional support',(.5,-.62),(.7,-.45),arrowprops={'arrowstyle':'->'},fontsize=11)
a.annotate('Shaft: T, shear and twist',(.16,-.9),(.7,-.94),arrowprops={'arrowstyle':'->'},fontsize=11)
a.text(0,-1.46,'Foundation reaction closes the structural free-body diagram',ha='center',color=RED)
done(f,'structural-load-path')

# 6. Cross-section torsion vs pressure loading: two independent load mechanisms.
f,aa=setup('6 · Small residual torque does not imply small pressure stress',2,(12,5.4))
a=aa[0];clean(a,(-1.4,1.4),(-1.3,1.3))
a.add_patch(Circle((0,0),.7,fill=False,lw=12,color=GRAY))
for t in np.linspace(0,2*np.pi,8,endpoint=False):arrow(a,(.34*np.cos(t),.34*np.sin(t)),(.63*np.cos(t),.63*np.sin(t)),BLUE,1.5)
a.text(0,0,'Internal\npressure',ha='center',va='center',fontsize=11)
a.text(0,1.1,'Tube membrane loading',ha='center',fontweight='bold')
a.text(0,-1.08,r'$\sigma_\theta=p_g r_t/t$',ha='center',fontsize=17)
a=aa[1]
r=np.linspace(0,1,100);a.plot(r,r,color=RED,lw=3)
a.set(xlabel='Radius / outer radius',ylabel='Shear stress / maximum shear',title='Elastic circular shaft under torque')
a.text(.05,.8,r'$\tau(r)=Tr/J_p$',fontsize=17,color=RED)
a.grid(alpha=.2);a.spines[['top','right']].set_visible(False)
f.supxlabel('Separate load mechanisms. Stress concentration, buckling and fatigue require further checks.',fontsize=11)
done(f,'pressure-and-torsion')

# 7. Parameter scaling, normalized and stated rather than claimed measured.
f,aa=setup('7 · Sensitivity of the explicitly assumed torque models',2,(12,4.8))
x=np.linspace(.2,2,200);aa[0].plot(x,x*x,lw=3,color=BLUE)
aa[0].set(xlabel='Q / baseline Q',ylabel='Torque / baseline torque',title='Fixed geometry and fixed coefficients')
aa[0].scatter([1,2],[1,4],color=BLUE);aa[0].annotate('Double Q → fourfold T',(2,4),(.52,3.4),arrowprops={'arrowstyle':'->'},fontsize=11)
x=np.linspace(-.05,.05,200);aa[1].plot(x,x,lw=3,color=RED)
aa[1].axhline(0,color=GRAY,lw=1);aa[1].axvline(0,color=GRAY,lw=1)
aa[1].set(xlabel='Signed effective offset / outer radius',ylabel='Hub torque / forward torque magnitude',title='Matched speed, negligible other hub terms')
for a in aa:a.grid(alpha=.2);a.spines[['top','right']].set_visible(False)
f.supxlabel('Analytical model curves, not measurements. Actual internal profiles and resistance may vary with Q.',fontsize=11)
done(f,'torque-sensitivity')

# 8. Mechanical boundary conditions.
f,aa=setup('8 · Three support conditions produce three different observables',3,(13,4.8))
for a,title in zip(aa,['A · Locked rotor','B · Free rotor','C · Compliant support']):
 clean(a,(-1.1,1.1),(-1.25,1.1));a.add_patch(Circle((0,.28),.42,facecolor='#e5eef2',edgecolor=GRAY,lw=2));a.plot([0,0],[-.4,-.12],color=GRAY,lw=6);a.set_title(title,fontsize=13)
 a.add_patch(Rectangle((-.7,-.85),1.4,.14,facecolor='#c1cdd2',hatch='///',edgecolor=GRAY))
 a.annotate('',(.38,.68),(-.36,.68),arrowprops=dict(arrowstyle='->',connectionstyle='arc3,rad=-.5',color=BLUE,lw=2))
 a.text(0,1.0,'Fluid torque',ha='center',color=BLUE,fontsize=11)
a=aa[0];a.plot([0,0],[-.73,-.4],color=GRAY,lw=10);a.text(0,-1.12,'Measure reaction torque; Ω = 0',ha='center',fontsize=10)
a=aa[1];a.add_patch(Circle((0,-.53),.13,fill=False,color=GOLD,lw=3));a.plot([0,0],[-.72,-.65],color=GRAY,lw=5);a.text(0,-1.12,'Measure Ω(t); inertia + resistance',ha='center',fontsize=10)
a=aa[2];xx=np.array([0,-.12,.12,-.12,.12,0]);yy=np.linspace(-.4,-.73,len(xx));a.plot(xx,yy,color=GOLD,lw=2);a.text(0,-1.12,'Measure twist θ(t); stiffness matters',ha='center',fontsize=10)
done(f,'support-conditions')
print('Generated 8 original SVG figures.')
