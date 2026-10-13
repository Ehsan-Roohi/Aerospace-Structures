"""Original instructional schematics, not measured Wright geometry."""
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle

OUT=Path(__file__).resolve().parents[1]/'docs/assets/wright-controls'
OUT.mkdir(parents=True,exist_ok=True)
plt.rcParams.update({'font.size':12,'font.family':'DejaVu Sans','svg.fonttype':'none','svg.hashsalt':'wright-controls'})
B,R,G,K='#176b9c','#bd3745','#b08300','#20394e'
def save(fig,name):
    fig.savefig(OUT/(name+'.png'),dpi=180,bbox_inches='tight')
    fig.savefig(OUT/(name+'.svg'),bbox_inches='tight',metadata={'Date':None})
    plt.close(fig)
def arrow(ax,a,b,c=B):
    ax.annotate('',xy=b,xytext=a,arrowprops={'arrowstyle':'->','lw':3,'color':c})

fig,axs=plt.subplots(1,2,figsize=(13,5))
for ax in axs:
    ax.axis('off');ax.set(xlim=(0,10),ylim=(-2,3))
    ax.plot([1,9],[0,0],lw=4,color=K);ax.add_patch(Circle((5,0),.12,color=R))
    ax.text(5,-.45,'CG',ha='center',color=R)
    ax.text(.5,2.5,'NOSE LEFT  ·  positive increment in upward force',fontsize=10)
axs[0].plot([1,2.7],[0,0],lw=12,color=G);arrow(axs[0],[2,0],[2,1.6])
axs[0].text(2,1.8,'Forward-surface ΔL ↑',ha='center',color=B)
axs[0].plot([2,5],[-.8,-.8],ls='--',color=K);axs[0].text(3.5,-1.2,'forward moment arm',ha='center')
axs[0].text(5,.6,'Nose-up moment',color=B,ha='center')
axs[0].set_title('Canard: force ahead of CG',fontsize=18)
axs[1].plot([7.3,9],[0,0],lw=12,color=G);arrow(axs[1],[8,0],[8,1.6])
axs[1].text(8,1.8,'Rear-surface ΔL ↑',ha='center',color=B)
axs[1].plot([5,8],[-.8,-.8],ls='--',color=K);axs[1].text(6.5,-1.2,'aft moment arm',ha='center')
axs[1].text(5,.6,'Nose-down moment',color=B,ha='center')
axs[1].set_title('Rear tail: opposite lever-arm sign',fontsize=18)
fig.text(.5,.01,'Force increments, not a complete trim diagram. Location alone does not determine whole-aircraft stability.',ha='center',fontsize=11)
save(fig,'canard_moment')

fig=plt.figure(figsize=(12,6))
corners=np.array([[-1,-.5],[1,-.5],[1,.5],[-1,.5],[-1,-.5]])
for panel,twisted in enumerate((False,True),1):
    ax=fig.add_subplot(1,2,panel,projection='3d')
    rings=[]
    for y in np.linspace(0,4,9):
        angle=(y-2)*.2 if twisted else 0
        c,s=np.cos(angle),np.sin(angle)
        x=c*corners[:,0]-s*corners[:,1]; z=s*corners[:,0]+c*corners[:,1]
        rings.append((x,np.full(5,y),z))
    for j in (0,-1):
        ax.plot(*rings[j],color=B if j==0 else R,lw=3)
    for k in range(4):
        ax.plot([v[0][k] for v in rings],[v[1][k] for v in rings],[v[2][k] for v in rings],color=K,lw=2)
    ax.set_axis_off();ax.view_init(elev=22,azim=-55);ax.set_box_aspect((2,4,1.5))
    ax.set_title('Opposite-end twisting' if twisted else 'Open-ended cardboard box',fontsize=18)
fig.text(.5,.08,'A shape analogy: compliant walls transmit twisting. Not the actual box or a drawing of the Wright cable routing.',ha='center',fontsize=11)
fig.text(.5,.02,'The bicycle inner tube was the packaged product; the cardboard package was the inspiration.',ha='center',fontsize=12,color=B)
save(fig,'box_analogy')

fig=plt.figure(figsize=(12,7)); ax=fig.add_subplot(111,projection='3d')
y=np.linspace(-4,4,41);x=np.linspace(0,1.4,8);X,Y=np.meshgrid(x,y)
twist=-.22*Y/4;Z=-twist*(X-.7)
for base in (0,1.2):
    ax.plot_surface(X,Y,Z+base,color='#aacdda',alpha=.8,edgecolor='#52788c',linewidth=.5)
    ax.plot(np.zeros_like(y),y,Z[:,0]+base,color=K,lw=3)
for station in (-3.5,-1.5,1.5,3.5):
    for chord in (0,1.4):
        lo=-(-.22*station/4)*(chord-.7)
        ax.plot([chord,chord],[station,station],[lo,lo+1.2],color=G,lw=2)
for station,height in ((-3,.8),(3,.4)):
    ax.quiver(.7,station,1.4,0,0,height,color=B,linewidth=3,arrow_length_ratio=.15)
ax.text(.7,-3,2.3,'More upward lift',color=B)
ax.text(.7,3,1.95,'Less upward lift',color=B)
ax.quiver(-.6,0,2.1,1.6,0,0,color=R,linewidth=2,arrow_length_ratio=.15)
ax.text(-.5,0,2.4,'Airflow: LE → TE',fontsize=11,color=R)
ax.set(xlim=(-.8,1.8))
ax.set(zlim=(-.3,2.7)); ax.set_axis_off()
ax.view_init(elev=18,azim=-30);ax.set_box_aspect((1.4,8,3))
ax.set_title('Warping changes local incidence, not just tip height',fontsize=19,pad=25)
fig.text(.5,.14,'Dark spanwise edges: leading edges (LE). Opposite aft edges: trailing edges (TE).',ha='center',fontsize=11,color=K)
fig.text(.5,.08,'Gold members: interplane struts. Blue arrows: upward lift, larger on one side and smaller on the other.',ha='center',fontsize=11)
fig.text(.5,.03,'Twist is exaggerated. This is an illustrative biplane, not measured Flyer CAD or an exact bracing arrangement.',ha='center',fontsize=11)
save(fig,'warped_wing')

fig,ax=plt.subplots(figsize=(9,5));a=np.linspace(-4,4,100)
ax.plot(a,-.06*a,lw=3,color=B,label='Stable slope; trimmed at α₀')
ax.plot(a,.06*a,lw=3,color=R,label='Unstable slope; also trimmed at α₀')
ax.axhline(0,color=K,lw=1);ax.axvline(0,color=K,lw=1)
ax.set(xlabel='Angle-of-attack disturbance from α₀ (degrees)',ylabel='Pitching-moment coefficient Cₘ',title='Zero moment does not imply a restoring response')
ax.legend();ax.grid(alpha=.2);fig.tight_layout();save(fig,'trim_stability')

fig,ax=plt.subplots(figsize=(13,5));ax.axis('off');ax.set(xlim=(0,13),ylim=(0,5))
items=[('Pilot input',.1),('Control cables',2.7),('Opposite twist',5.3),('Lift + drag change',7.9),('Roll + adverse yaw',10.5)]
for label,pos in items:
    ax.add_patch(Rectangle((pos,2.5),2.3,1,fc='#e7eff4',ec=B,lw=2))
    ax.text(pos+1.15,3,label,ha='center',fontsize=11)
    if pos<10:arrow(ax,[pos+2.3,3],[pos+2.6,3])
ax.add_patch(Rectangle((7.9,.7),4.9,1,fc='#fff4d9',ec=G,lw=2))
ax.text(10.35,1.2,'Linked rear rudder supplies yaw control',ha='center',fontsize=12)
arrow(ax,[3.85,2.5],[3.85,1.2],G);arrow(ax,[3.85,1.2],[7.9,1.2],G)
ax.text(5.7,1.45,'1903 linked controls',ha='center',color=G)
ax.set_title('Pilot action, structural deformation and aerodynamic response',fontsize=19)
fig.text(.5,.02,'Functional sequence only—not an exact cable, pulley or hinge installation drawing.',ha='center',fontsize=11)
save(fig,'control_chain')
assert abs(100*4*np.deg2rad(2)-13.962634)<1e-5
assert abs(2*3*100*4*np.deg2rad(2)-83.7758)<1e-3
assert 40*1.5==60
print('Generated five diagram pairs; checked force and moment examples.')
