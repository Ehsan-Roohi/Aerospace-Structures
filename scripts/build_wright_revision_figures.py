"""Readable teaching schematics; historical locations are regional, not measured CAD."""
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle, Polygon

OUT = Path(__file__).resolve().parents[1] / 'docs/assets/wright-controls'
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':17,
                     'svg.fonttype':'none','svg.hashsalt':'wright-revision'})
B,R,K,G = '#176b9c','#bd3745','#20394e','#b08300'

def save(fig,name):
    fig.savefig(OUT/(name+'.png'),dpi=190,bbox_inches='tight')
    fig.savefig(OUT/(name+'.svg'),bbox_inches='tight',metadata={'Date':None})
    plt.close(fig)

def arrow(ax,start,end,color=B,lw=3):
    ax.annotate('',xy=end,xytext=start,arrowprops={'arrowstyle':'->','lw':lw,'color':color})

# A physical response, rather than an unexplained pair of moment curves.
fig,axs=plt.subplots(1,2,figsize=(15,7),layout='constrained')
for ax,stable in zip(axs,(True,False)):
    ax.axis('off');ax.set(xlim=(0,10),ylim=(-2.5,4))
    ax.plot([1,9],[.2,.2],color='#acb9c3',ls='--',lw=3)
    ax.plot([1,9],[1.2,.2],color=K,lw=5)
    ax.add_patch(Circle((5,.7),.12,color=R));ax.text(5,.25,'CG',ha='center',color=R)
    ax.text(1,1.65,'NOSE',color=K);ax.text(8.3,.65,'TAIL',color=K)
    ax.text(5,3.3,'Same small nose-up disturbance',ha='center',fontsize=18)
    if stable:
        ax.plot([7.3,9],[.4,.2],color=G,lw=10)
        arrow(ax,(8.1,.4),(8.1,2.3));ax.text(7.8,2.55,'Δ tail lift ↑',ha='center',color=B)
        arrow(ax,(1,1.2),(1,.2),B)
        ax.text(5,-.7,'Tail force increment behind CG\n→ nose-down restoring moment',ha='center',color=B,fontsize=20)
        ax.text(5,-2,'Disturbance tends to decrease.\nThis is static stability—not a damping prediction.',ha='center',fontsize=15)
    else:
        ax.plot([1,2.5],[1.2,1.0],color=G,lw=10)
        arrow(ax,(1.8,1.15),(1.8,2.65),R)
        ax.text(3.6,2.8,'Δ front-surface lift ↑',ha='center',color=R)
        arrow(ax,(1,1.2),(1,2.2),R)
        ax.text(5,-.7,'Front force increment ahead of CG\n→ nose-up contribution',ha='center',color=R,fontsize=20)
        ax.text(5,-2,'This contribution can reinforce the disturbance.\nOther aircraft contributions still matter.',ha='center',fontsize=15)
    ax.set_title('Restoring contribution' if stable else 'Destabilizing contribution',fontsize=24,color=B if stable else R)
fig.suptitle('Trim is the starting balance; stability is the response after disturbance',fontsize=24)
save(fig,'trim_stability')

# Top view plus end sections avoids hiding the important chord rotation in a 3-D view.
fig=plt.figure(figsize=(15,9),layout='constrained');gs=fig.add_gridspec(2,2,height_ratios=[1,1])
ax=fig.add_subplot(gs[0,:]);ax.axis('off');ax.set(xlim=(-5,5),ylim=(-1.5,2))
ax.add_patch(Rectangle((-4.5,-.2),9,.9,facecolor='#dcecf3',edgecolor=K,lw=3))
ax.plot([-4.5,4.5],[.7,.7],color=K,lw=5)
ax.plot([0,0],[-.7,1],color=K,lw=4)
arrow(ax,(-3,.7),(-3,1.8));arrow(ax,(3,.7),(3,1.25))
ax.text(-3,-.8,'LEFT wing: more lift',ha='center',color=B,fontsize=20)
ax.text(3,-.8,'RIGHT wing: less lift',ha='center',color=B,fontsize=20)
ax.text(0,1.8,'Rear view · look forward; blue arrows show upward lift',ha='center',fontsize=17)
ax.text(0,-1.3,'Left rises, right falls → right bank',ha='center',color=R,fontsize=20)
for i,(angle,title) in enumerate(((14,'Left section: incidence increased'),(2,'Right section: incidence decreased'))):
    ax=fig.add_subplot(gs[1,i]);ax.axis('off');ax.set(xlim=(-1,5),ylim=(-1.4,2))
    a=np.deg2rad(angle); xx=np.array([0,3.5]);zz=-np.tan(a)*(xx-1.75)
    ax.plot(xx,-np.tan(np.deg2rad(8))*(xx-1.75),ls='--',color='#a7b5c1',lw=3)
    ax.plot(xx,zz,lw=8,color=B)
    arrow(ax,(-.7,1.3),(1,1.3),R);ax.text(1.4,1.25,'Relative airflow',color=R,fontsize=16)
    ax.text(0,zz[0]+.25,'LE',ha='center');ax.text(3.5,zz[1]+.25,'TE',ha='center')
    ax.text(1.7,-.9,'Dashed: same starting incidence on both sides.\nBlue: more / less positive incidence after warping.',ha='center',fontsize=15)
    ax.set_title(title,fontsize=20)
fig.suptitle('Wing warping changes local incidence and therefore lift',fontsize=25)
save(fig,'warped_wing')

fig,ax=plt.subplots(figsize=(14,9));ax.axis('off');ax.set(xlim=(0,14),ylim=(0,9))
for y,title,body in [(7,'1  Pilot shifts the hip cradle','Cables command opposite wing twisting'),
                      (4.6,'2  Lift AND drag become unequal','Left wing gains lift: left rises; extra left drag yaws the nose left'),
                      (2.2,'3  Linked rudder supplies yaw correction','A right-bank command needs yaw control; roll and yaw are coupled')]:
    ax.add_patch(Rectangle((.5,y),13,1.6,facecolor='#eef5fa',edgecolor=B,lw=2))
    ax.text(7,y+1.1,title,ha='center',fontsize=23,color=K)
    ax.text(7,y+.45,body,ha='center',fontsize=17)
    if y>3:arrow(ax,(7,y),(7,y-.7),G)
ax.text(7,.9,'Wing structure moves; aerodynamic loads change; rudder coordination matters.',ha='center',fontsize=19)
ax.set_title('1903 Wright Flyer: follow the physical control sequence',fontsize=25,pad=18)
fig.tight_layout();save(fig,'control_chain')

fig,axs=plt.subplots(1,2,figsize=(15,7),layout='constrained')
for ax in axs:ax.axis('off');ax.set(xlim=(-3.4,3.4),ylim=(-2.5,3))
ax=axs[0];ax.plot([0,0],[0,1.8],lw=6,color=K);ax.add_patch(Circle((0,0),.1,color=R))
arrow(ax,(0,1.8),(-2,1.8));ax.text(-1,2.2,'Model lift L',ha='center',color=B,fontsize=21)
ax.text(.3,.9,'arm d',fontsize=20);ax.text(0,-.5,'Pivot',ha='center',color=R,fontsize=20)
ax.text(0,-1.7,r'Torque magnitude: $Ld$',ha='center',fontsize=25)
ax.set_title('Model force turns the balance',fontsize=23)
ax=axs[1];end=np.array([1.1,1.5]);ax.plot([0,end[0]],[0,end[1]],color=K,lw=6)
ax.add_patch(Circle((0,0),.1,color=R));arrow(ax,end,(end[0],-.25),G)
ax.plot([0,0],[0,2],ls=':',color=K);ax.text(.3,.65,'θ',fontsize=25)
ax.text(2.1,1,'Reference\nplate drag Dp',ha='center',color=G,fontsize=20)
ax.plot([0,end[0]],[-.6,-.6],color=G,ls='--',lw=2)
ax.text(.65,-1.05,'Perpendicular arm = d sin θ',ha='center',fontsize=17)
ax.text(0,-1.8,r'Torque: $D_p d\sin\theta$',ha='center',fontsize=25)
ax.set_title('Reference force opposes it',fontsize=23)
fig.suptitle('At equilibrium: opposing torques are equal',fontsize=27)
fig.text(.5,-.03,'Equivalent instrument-plane torques, not a side-view aircraft load diagram. θ is the dial reading—not angle of attack.',ha='center',fontsize=15)
save(fig,'balance_torques')

def aerodrome(ax):
    ax.axis('off');ax.set(xlim=(0,12),ylim=(-2.4,4))
    ax.plot([1,10.5],[.9,.9],color=K,lw=4)
    for centre in (3.1,7.1):
        ax.add_patch(Polygon([[centre-1.1,1.15],[centre+1.1,.85],[centre+1.0,.7],[centre-1.1,1]],
                             closed=True,facecolor='#dcecf3',edgecolor=B,lw=2))
        ax.plot([centre,centre],[2.5,-.8],color=G,lw=4)
        for endpoint in (centre-1.1,centre+1.1):
            ax.plot([centre,endpoint],[2.5,1],color='#899ba7',lw=1.5)
            ax.plot([centre,endpoint],[-.8,1],color='#899ba7',lw=1.5)
    ax.add_patch(Rectangle((4.6,.7),1.1,.65,facecolor='#e5d1ac',edgecolor=K))
    ax.text(5.15,1.95,'Engine / pilot region',ha='center',fontsize=16)
    ax.plot([9.3,10.8],[.9,1.2],color=B,lw=7)
    ax.plot([1.6,9],[-1,-1],color=K,lw=4)
    ax.text(1.05,.3,'NOSE',fontsize=17);ax.text(10.1,-.1,'TAIL',fontsize=17)
    ax.text(3.1,2.8,'Front wing set',ha='center',fontsize=18)
    ax.text(7.1,2.8,'Rear wing set',ha='center',fontsize=18)
    ax.text(9,-1.35,'Launch track',ha='right',fontsize=16)

for october in (True,False):
    fig,ax=plt.subplots(figsize=(15,8));aerodrome(ax)
    xx=3.1 if october else 7.1
    if october:
        ax.add_patch(Circle((xx,-.85),.32,facecolor='none',edgecolor=R,lw=4))
    else:
        ax.add_patch(Rectangle((5.7,.1),5.2,1.65,facecolor='none',edgecolor=R,lw=2,ls='--'))
    ax.add_patch(Circle((xx,1),1.4,facecolor=R,alpha=.06,edgecolor='none'))
    arrow(ax,(6,-1.8),(xx,-.85) if october else (8.3,.1),R)
    ax.text(6,-2.1,'Front lower guy-post attachment snagged' if october else 'Rear structure / tail collapsed during launch',
            ha='center',fontsize=21,color=R)
    if october:
        ax.plot([2,4.2],[.5,1.35],color=R,lw=6)
        ax.text(.4,3.5,'Snag → unintended restraint\n→ front-wing incidence distorted',color=R,fontsize=20)
    else:
        ax.plot([6,8.2],[1.45,.25],color=R,lw=6)
        ax.plot([9,10.5],[.9,.25],color=R,lw=5)
        ax.text(.4,3.5,'Rear-region collapse is documented;\nexact initiating contact remains uncertain.',color=R,fontsize=20)
    ax.set_title('LANGLEY AERODROME A · 7 OCTOBER 1903' if october else 'LANGLEY AERODROME A · 8 DECEMBER 1903',
                 fontsize=27,pad=20)
    fig.text(.5,.015,'Regional side-view reconstruction, not measured geometry. Pale blue = intended shape; red = affected region / qualitative distortion.',
             ha='center',fontsize=13)
    fig.tight_layout(rect=(0,.04,1,1));save(fig,'langley_october_damage' if october else 'langley_december_damage')

print('Redesigned four diagrams and generated two regional Aerodrome damage views.')
