"""Original classroom diagrams; assumed models, not aircraft operating data."""
from pathlib import Path
import math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle, Polygon

OUT = Path(__file__).resolve().parents[1] / 'docs/assets/gliding'
OUT.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({'font.family':'DejaVu Sans', 'font.size':12,
                     'axes.spines.top':False, 'axes.spines.right':False,
                     'savefig.facecolor':'white'})
BLUE, RED, GOLD, GRAY = '#176b9c', '#b52e39', '#b58208', '#536574'
def save(fig, name):
    fig.savefig(OUT / (name+'.png'), dpi=180, bbox_inches='tight')
    fig.savefig(OUT / (name+'.svg'), bbox_inches='tight')
    plt.close(fig)
def arrow(ax, a, b, color=BLUE):
    ax.annotate('', xy=b, xytext=a, arrowprops=dict(arrowstyle='->', lw=3, color=color))

# 1: geometrically consistent force directions, exaggerated descent angle.
fig, ax=plt.subplots(figsize=(10,6)); ax.set_aspect('equal'); ax.axis('off')
g=math.radians(20); o=np.array([0.,0.]); v=np.array([math.cos(g),-math.sin(g)])
ax.plot([-2,3],[0,0],color='#ccd5dd',ls='--')
ax.plot([-2*v[0],3*v[0]],[-2*v[1],3*v[1]],color=GRAY,ls='--')
arrow(ax,o,2.2*v); ax.text(2.1,-1.0,'Velocity V along descent',color=BLUE)
arrow(ax,o,2*math.cos(g)*np.array([math.sin(g),math.cos(g)])); ax.text(.8,1.6,'Lift L\nnormal to flight path',color=BLUE)
arrow(ax,o,-2*math.sin(g)*v,GOLD); ax.text(-2.0,.75,'Drag D\nopposes motion',color=GOLD)
arrow(ax,o,[0,-2],RED); ax.text(.12,-1.75,'Weight W = mg',color=RED)
ax.add_patch(Circle(o,.09,color=GRAY)); ax.text(1.0,-.16,'gamma',color=GRAY)
ax.set(xlim=(-2.6,3.5),ylim=(-2.5,2.5)); ax.set_title('Steady glide: no thrust, but lift remains',fontsize=20,pad=16)
fig.text(.5,.02,'L = W cos(gamma)     D = W sin(gamma)     tan(gamma) = D / L',ha='center',fontsize=14)
save(fig,'forces')

# 2: energy ledger with constant speed.
fig, ax=plt.subplots(figsize=(10,5)); h=np.linspace(1000,0,101); m=600; grav=9.81; V=30
ax.plot(1000-h,m*grav*h/1e6,label='Remaining potential energy',lw=3,color=BLUE)
ax.plot(1000-h,m*grav*(1000-h)/1e6,label='Energy transferred against drag',lw=3,color=RED)
ax.plot(1000-h,np.full_like(h,.5*m*V**2/1e6),label='Kinetic energy: constant speed',lw=3,color=GOLD)
ax.set(xlabel='Height lost (m)',ylabel='Energy (MJ)',title='Gravity supplies drag losses; speed need not increase')
ax.legend(); ax.grid(alpha=.2); fig.tight_layout(); save(fig,'energy')

# 3: small-angle parabolic-polar classroom approximation.
rho,S,W,cd0,k=1.225,16.,6000.,.02,.04
best_cl=math.sqrt(cd0/k); sink_cl=math.sqrt(3*cd0/k)
best_v=math.sqrt(2*W/(rho*S*best_cl)); sink_v=math.sqrt(2*W/(rho*S*sink_cl))
vs=math.sqrt(2*W/(rho*S*1.4)); speed=np.linspace(vs*1.02,65,500)
cl=2*W/(rho*S*speed**2); cd=cd0+k*cl**2; sink=speed*cd/cl
fig,(a,b)=plt.subplots(1,2,figsize=(12,5))
a.plot(speed,sink,lw=3,color=BLUE); b.plot(speed,cl/cd,lw=3,color=BLUE)
for axis in (a,b):
    axis.axvline(sink_v,color=GOLD,ls='--',label=f'Minimum sink: {sink_v:.1f} m/s')
    axis.axvline(best_v,color=RED,ls='--',label=f'Best glide: {best_v:.1f} m/s')
    axis.set_xlabel('Airspeed (m/s)'); axis.grid(alpha=.2)
a.set(ylabel='Downward speed (m/s)',title='Least height lost per second'); b.set(ylabel='Lift / drag',title='Most distance per height lost')
b.legend(loc='upper right',fontsize=10); fig.suptitle('Two different objectives, two different speeds',fontsize=18)
fig.tight_layout(); save(fig,'polar')

# 4: same-airmass trajectory translated by uniform wind.
gamma=math.atan(1/18); t=1000/(35*math.sin(gamma)); R=18.
fig,ax=plt.subplots(figsize=(8,7)); ax.set_aspect('equal')
ax.add_patch(Circle((0,0),R,fc='none',ec=BLUE,lw=3,label='Still air'))
shift=10*t/1000; ax.add_patch(Circle((shift,0),R,fc='none',ec=RED,lw=3,ls='--',label='Uniform 10 m/s wind east'))
ax.scatter([0],[0],color='black',s=60,zorder=3); ax.text(0,-2,'Aircraft now',ha='center')
arrow(ax,[0,0],[shift,0],RED); ax.text(shift/2,1,f'{shift:.2f} km wind drift',ha='center')
ax.set(xlim=(-21,27),ylim=(-21,21),xlabel='Eastward ground distance (km)',ylabel='Northward ground distance (km)',title='Ideal ground endpoints change with wind')
ax.legend(loc='lower right'); ax.grid(alpha=.2); fig.text(.5,.01,'h = 1,000 m; L/D = 18; V = 35 m/s; no turns, terrain or reserves',ha='center',fontsize=10)
save(fig,'wind')

# 5: high drag versus clean approach, theoretical paths only.
fig,ax=plt.subplots(figsize=(11,5)); ax.plot([0,18],[1000,0],lw=3,color=BLUE,label='Clean: assumed L/D = 18')
ax.plot([0,8],[1000,0],lw=3,color=RED,label='Drag device extended: assumed L/D = 8')
ax.axhline(0,color=GRAY); ax.set(xlim=(-.5,20),ylim=(-50,1200),xlabel='Horizontal distance (km)',ylabel='Height above destination (m)',title='More drag steepens the path and uses height sooner')
ax.legend(); ax.grid(alpha=.2); fig.text(.5,.01,'Illustrative ratios, not a specific glider. Retracting airbrakes cannot restore spent energy.',ha='center',fontsize=11)
fig.tight_layout(rect=(0,.04,1,1)); save(fig,'approach')

# 6: explicitly separate external reactions and internal load-transfer arrows.
fig,ax=plt.subplots(figsize=(12,6)); ax.axis('off'); ax.set(xlim=(0,12),ylim=(0,6))
ax.add_patch(Rectangle((1.5,3),9,1.2,fc='#e7eef3',ec=GRAY,lw=2))
ax.add_patch(Rectangle((4,3.1),3,.7,fc='#d7e8f0',ec=BLUE,lw=3))
ax.text(5.5,3.45,'Wing box / reinforced structure',ha='center',fontsize=11)
for x in (4.5,6.5):
    ax.plot([x,x],[1.25,3.1],color=GRAY,lw=10); ax.add_patch(Circle((x,.9),.4,fc=GRAY))
    arrow(ax,[x,.05],[x,1.8],BLUE)
    ax.text(x,.05,'N',color=BLUE,ha='center',va='top')
arrow(ax,[8,4],[8,2],RED); ax.text(8.2,2.25,'W at CG',color=RED)
arrow(ax,[2.3,3.5],[2.3,5.1],GOLD); ax.text(1.1,5.25,'Remaining lift',color=GOLD)
ax.text(.1,2,'Tire contact\n→ strut\n→ attachment',fontsize=12)
ax.text(9,4.8,'Masses load their supports:\nseats, fuel, engines, wing',ha='center')
ax.text(5.5,5.65,'Landing changes the load path',ha='center',fontsize=21)
fig.text(.5,.02,'Local attachment forces are not equal to the whole-aircraft average reaction.',ha='center',fontsize=11)
save(fig,'landing_path')

# 7: transparent work-energy example; total reaction != dynamic increment.
fig,(a,b)=plt.subplots(1,2,figsize=(12,5)); vz=np.linspace(0,6,200)
for s,c in zip((.15,.30,.60),(RED,BLUE,GOLD)):
    a.plot(vz,1+vz*vz/(2*grav*s),lw=3,color=c,label=f'CG stopping distance {s:.2f} m')
a.set(xlabel='Vertical contact speed (m/s)',ylabel='Average ground reaction / weight',title='Shorter stopping distance → larger average load'); a.legend(fontsize=10); a.grid(alpha=.2)
b.bar(['Horizontal\n30 m/s','Vertical\n3 m/s'],[270,2.7],color=[BLUE,RED]); b.set(ylabel='Kinetic energy (kJ)',title='600 kg example: directions matter')
b.text(.5,180,'Forward energy dissipates\nover the rollout; vertical energy\nover a short stopping distance.',ha='center',fontsize=11,bbox=dict(facecolor='white',edgecolor='none',alpha=.95))
fig.text(.5,.01,'Rigid-body work model; zero mean lift; no prediction of peak loads, local stress or injury.',ha='center',fontsize=10)
fig.tight_layout(rect=(0,.05,1,1)); save(fig,'landing_energy')

# 8: qualitative water-impact load path; no synthetic stress contours.
fig,ax=plt.subplots(figsize=(11,6)); ax.axis('off'); ax.set(xlim=(0,11),ylim=(0,6))
ax.add_patch(Polygon([[1,2.5],[1.8,4],[9.2,4],[10,2.5],[9.2,1.7],[1.8,1.7]],fc='#e4edf3',ec=GRAY,lw=2))
for x in (2,3.5,5,6.5,8,9): ax.plot([x,x],[1.8,3.8],color=GOLD,lw=3)
ax.plot([1.8,9.2],[2.8,2.8],color=BLUE,lw=4); ax.text(5.5,2.95,'Floor beams and supports',ha='center')
ax.plot([0,11],[1.4,1.4],color=BLUE,lw=2)
for x in (2.2,4,6,8.2): arrow(ax,[x,.4],[x,1.8],BLUE)
ax.text(5.5,.05,'Transient water pressure → lower skin → frames/stringers → floor and masses',ha='center',fontsize=11)
ax.text(5.5,4.6,'Ditching is not a landing-gear load case',ha='center',fontsize=20)
ax.text(5.5,5.3,'Qualitative longitudinal cutaway: pressure and deformation are time-dependent',ha='center',fontsize=12)
save(fig,'ditching')

assert abs(best_v-29.4255)<.01
assert abs(sink_v-22.3586)<.01
assert abs(.5*600*3**2-2700)<1e-9
assert abs((600*grav+600*3**2/(2*.3))-14886)<1e-9
print(f'Built eight diagram pairs; verified best glide {best_v:.3f} m/s, minimum sink {sink_v:.3f} m/s, landing reaction 14,886 N.')
