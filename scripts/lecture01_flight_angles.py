"""Self-contained plotting cell for Lecture 01; also usable for figure QA."""
#@title 2A. Explore flight-path angle gamma and bank angle phi { display-mode: "form" }
GAMMA_DEG = 20.0 #@param {type:"slider", min:0, max:35, step:1}
PHI_DEG = 30.0 #@param {type:"slider", min:0, max:60, step:1}

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, FancyArrowPatch, Arc, Circle

def draw_flight_angles(gamma_deg, phi_deg):
    if not (0 <= gamma_deg <= 35 and 0 <= phi_deg <= 60):
        raise ValueError('Use gamma in [0, 35] and phi in [0, 60] degrees.')
    navy, blue, red, green, orange = '#17324d', '#1776b6', '#c73338', '#25804b', '#d57820'
    fig, axes = plt.subplots(1, 2, figsize=(15, 7.5))
    fig.subplots_adjust(top=.83, bottom=.23, wspace=.12)
    def arrow(ax, end, color, start=(0,0), dashed=False):
        ax.add_patch(FancyArrowPatch(start, end, arrowstyle='-|>', mutation_scale=21,
                     lw=2.7, color=color, linestyle='--' if dashed else '-', zorder=5))
    def label(ax, x, y, text, color=navy, **kwargs):
        ax.text(x,y,text,color=color,fontsize=12,ha='center',va='center',
                bbox=dict(facecolor='white',edgecolor='none',alpha=.88,pad=2),zorder=8,**kwargs)
    for ax in axes:
        ax.set(xlim=(-3.6,3.6),ylim=(-2.8,3.3),aspect='equal')
        ax.axis('off')
    ax=axes[0]
    g=np.deg2rad(gamma_deg)
    t=np.array([np.cos(g),np.sin(g)])
    n=np.array([-np.sin(g),np.cos(g)])
    rot=np.column_stack((t,n))
    # Side profile: rounded nose to the right, vertical fin at the tail.
    fuselage=np.array([[-2.1,0],[-1.8,.14],[-1.75,.7],[-1.45,.68],[-1.1,.17],
                       [.9,.18],[1.55,.1],[1.95,0],[1.6,-.12],[-1.7,-.12]])
    ax.add_patch(Polygon(fuselage@rot.T,facecolor='#dce9f3',edgecolor=navy,lw=1.7,zorder=2))
    wing=np.array([[-.6,.03],[.45,.05],[-.05,-.42],[-.7,-.42]])
    ax.add_patch(Polygon(wing@rot.T,facecolor='#a5c9df',edgecolor=navy,lw=1.4,zorder=3))
    ax.plot([0,3.35],[0,0],':',color='#7f8b97',lw=1.5)
    ax.plot(*np.column_stack((-3.1*t,3.2*t)),ls='--',color='#7f8b97',lw=1.3)
    arrow(ax,2.9*t,green); arrow(ax,-2.8*t,orange)
    arrow(ax,2.7*n,blue); arrow(ax,(0,-2.35),red)
    label(ax,*(2.95*t+np.array([0,.3])),r'$T,\;V$ (along path)',green)
    label(ax,*(-2.85*t+np.array([0,-.32])),r'$D$ (opposes motion)',orange)
    label(ax,*(2.75*n+np.array([-.3,.15])),r'$L$ (normal to path)',blue)
    label(ax,.55,-2.4,r'$W=mg$',red)
    label(ax,2.85,-.28,'Horizontal')
    ax.add_patch(Arc((0,0),3.2,3.2,theta1=0,theta2=gamma_deg,color='#8045a0',lw=2.8,zorder=7))
    label(ax,2*np.cos(g/2),2*np.sin(g/2),rf'$\gamma={gamma_deg:.0f}^\circ$','#8045a0')
    # Weight projections on the flight-path axes reconstruct vertical weight.
    wt=-2.35*np.sin(g)*t; wn=-2.35*np.cos(g)*n
    arrow(ax,wt,red,dashed=True); arrow(ax,wn,red,dashed=True)
    ax.plot([wt[0],0,wn[0]],[wt[1],-2.35,wn[1]],':',color=red,lw=1.2)
    label(ax,-1.7,-1.85,r'$-W\sin\gamma$ along $t$',red)
    label(ax,1.5,-1.85,r'$-W\cos\gamma$ along $n$',red)
    ax.plot(0,0,'o',color=navy,zorder=10); label(ax,-.35,.35,'CG')
    ax.set_title('A  |  Straight climb — side view',loc='left',color=navy,weight='bold',pad=20)
    ax=axes[1]; p=np.deg2rad(phi_deg)
    lift=2.65; vertical=lift*np.cos(p)
    end=np.array([lift*np.sin(p),vertical])
    wing_axis=np.array([np.cos(p),-np.sin(p)])
    ax.plot([-3.2,3.2],[0,0],':',color='#7f8b97',lw=1.5)
    ax.plot([0,0],[0,3.05],':',color='#7f8b97',lw=1.5)
    ax.plot(*np.column_stack((-2.5*wing_axis,2.5*wing_axis)),color=navy,lw=8,solid_capstyle='round',zorder=3)
    ax.add_patch(Circle((0,0),.19,facecolor='#dce9f3',edgecolor=navy,lw=2,zorder=6))
    arrow(ax,end,blue); arrow(ax,(0,vertical),green,dashed=True)
    arrow(ax,(end[0],0),orange,dashed=True); arrow(ax,(0,-vertical),red)
    ax.plot([0,end[0],end[0]],[vertical,vertical,0],':',color=blue,lw=1.5)
    ax.add_patch(Arc((0,0),2,2,theta1=90-phi_deg,theta2=90,color='#8045a0',lw=2.8,zorder=7))
    label(ax,1.4*np.sin(p/2),1.4*np.cos(p/2),rf'$\phi={phi_deg:.0f}^\circ$','#8045a0')
    ax.add_patch(Arc((0,0),2.5,2.5,theta1=-phi_deg,theta2=0,color='#8045a0',lw=2,zorder=7))
    label(ax,1.7*np.cos(p/2),-1.7*np.sin(p/2),r'$\phi$','#8045a0')
    label(ax,end[0]+.3,end[1]+.32,r'$L$',blue)
    label(ax,-1.05,vertical,r'$L\cos\phi=W$',green)
    label(ax,max(.9,end[0]/2),.35,r'$L\sin\phi$',orange)
    label(ax,.55,-vertical-.1,r'$W=mg$',red)
    label(ax,2.5,-2.4,'Toward turn center →',orange)
    label(ax,-.65,3,'Vertical')
    ax.set_title('B  |  Coordinated level turn — front view',loc='left',color=navy,weight='bold',pad=20)
    fig.suptitle('Flight-path angle and bank angle describe different rotations',fontsize=19,weight='bold',color=navy,y=.96)
    fig.text(.27,.16,r'$T-D-W\sin\gamma=m\dot V\qquad L-W\cos\gamma=mV\dot\gamma$',ha='center',fontsize=14,color=navy)
    fig.text(.27,.115,r'Steady straight climb: $L=W\cos\gamma$',ha='center',fontsize=12,color=navy)
    fig.text(.76,.16,r'$L\cos\phi=W\qquad L\sin\phi=mV^2/R_{turn}$',ha='center',fontsize=14,color=navy)
    fig.text(.76,.115,r'Level turn: $L=W/\cos\phi$',ha='center',fontsize=12,color=navy)
    fig.text(.5,.04,'A: wings level, thrust aligned with path.  B: constant altitude, coordinated turn; thrust/drag out of view.\nAircraft are schematic; force arrows are instructional. Change the two sliders and rerun.',ha='center',fontsize=10,color='#526273')
    return fig

fig = draw_flight_angles(GAMMA_DEG, PHI_DEG)
plt.show()
