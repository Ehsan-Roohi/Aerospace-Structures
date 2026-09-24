"""Redraw the seven Zoomit scientific diagrams with English labels.
Source: supplied Zoomit article, credited in NAVIER_STOKES_AI.md.
These are explanatory schematics, not numerical Navier-Stokes solutions.
"""
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/case-studies/navier-stokes/english'
OUT.mkdir(parents=True,exist_ok=True)
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':12,'svg.fonttype':'none','mathtext.fontset':'dejavusans'})
NAVY='#0b1728'; INK='#183249'; MUTED='#52677b'; BLUE='#278be0'; PURPLE='#8060d8'; RED='#dc557b'; CYAN='#42c5cb'; GOLD='#e2ad40'

def save(fig,name):
    fig.savefig(OUT/(name+'.png'),dpi=170,facecolor=fig.get_facecolor())
    fig.savefig(OUT/(name+'.svg'),facecolor=fig.get_facecolor())
    plt.close(fig)

def label(fig,x,y,text,size=12,color=INK,weight='normal',ha='left',**kw):
    return fig.text(x,y,text,fontsize=size,color=color,fontweight=weight,ha=ha,va='top',**kw)

def box(fig,x,y,w,h,face='white',edge='#dbe4ed'):
    fig.add_artist(FancyBboxPatch((x,y),w,h,boxstyle='round,pad=0.006,rounding_size=0.014',transform=fig.transFigure,facecolor=face,edgecolor=edge,zorder=0))

def clean(ax):
    ax.spines[['top','right','left']].set_visible(False)
    ax.spines['bottom'].set_color('#acbccb');ax.tick_params(left=False,labelleft=False,bottom=False,labelbottom=False)
    ax.set_facecolor('white')

# 1. Concentration: exact toy Gaussian, common vertical scales.
f=plt.figure(figsize=(14,8.7),facecolor='#f4f7fb')
label(f,.035,.968,'Higher peaks, narrower support, bounded energy',23,weight='bold')
label(f,.035,.919,'A one-dimensional illustration of concentration',13,color=MUTED)
x=np.linspace(-5,5,1200)
for j,(w,c,title) in enumerate(zip([1.6,.8,.4],[BLUE,PURPLE,RED],['Stage 1: Spread out','Stage 2: More concentrated','Stage 3: Highly concentrated'])):
    left=.038+j*.324; box(f,left,.19,.303,.68)
    label(f,left+.015,.845,title,15,weight='bold')
    label(f,left+.015,.802,f'Width parameter: {w:.1f}',12,color=MUTED)
    label(f,left+.015,.765,f'Maximum speed: {w**(-.5):.2f}',12,color=c)
    u=w**(-.5)*np.exp(-x*x/(2*w*w)); e=u*u/np.sqrt(np.pi)
    for yy,data,heading,lim in [(.485,u,'Velocity',1.7),(.265,e,'Normalized energy density',1.5)]:
        ax=f.add_axes([left+.025,yy,.251,.157]);clean(ax);ax.set_ylim(0,lim);ax.set_xlim(-5,5)
        ax.plot(x,data,color=c,lw=2.8);ax.axhline(0,color='#aab9c7',lw=.7)
        if yy<.4:ax.fill_between(x,0,data,color=c,alpha=.17)
        ax.set_title(heading,loc='left',fontsize=11,pad=9,color=INK)
    label(f,left+.15,.23,'Normalized total energy = 1.00',10,ha='center',weight='bold')
label(f,.045,.145,r'$u_w(x)=w^{-1/2}\exp[-x^2/(2w^2)]$',16)
label(f,.045,.094,r'$\int_{-\infty}^{\infty}u_w^2\,dx=\sqrt{\pi}$',16)
label(f,.50,.138,'Halving the width raises the velocity peak.',13,weight='bold')
label(f,.50,.098,'The area under the energy-density curve stays constant.',11)
label(f,.50,.052,'Illustrative functions; not a Navier–Stokes simulation.',10,color=MUTED)
save(f,'04-energy-concentration')

# 2. Vortex schematic with entirely English callouts.
f=plt.figure(figsize=(14,8.8),facecolor=NAVY)
label(f,.04,.956,'Spaghetti vortex',26,color='white',weight='bold')
label(f,.04,.90,'The core narrows, rotation intensifies, and the flow stretches along the axis.',13,color='#b7c9d8')
ax=f.add_axes([.25,.18,.5,.63],facecolor=NAVY);ax.set_xlim(-1.7,1.7);ax.set_ylim(-2.6,2.6);ax.axis('off')
t=np.linspace(-2.25,2.25,3500);r=.13+1.12*np.exp(-(t/1.1)**2)
for phase in [0,1.1,2.2,3.3]:
    theta=30*t+phase;xx=r*np.cos(theta);zz=t+.07*r*np.sin(theta)
    ax.plot(xx,zz,color=CYAN,lw=1.2,alpha=.72)
for phase in [0,2.1,4.2]:
    ax.plot(.125*np.cos(42*t+phase),t,color='#ffad51',lw=2,alpha=.92)
ax.plot([0,0],[-2.35,2.35],color='#f9b357',lw=9,alpha=.62)
for start,end in [((0,1.75),(0,2.55)),((0,-1.75),(0,-2.55)),((-1.6,0),(-1.06,0)),((1.6,0),(1.06,0))]:
    ax.annotate('',xy=end,xytext=start,arrowprops={'arrowstyle':'-|>','color':'#a7e5dd','lw':2,'mutation_scale':16})
for x0,y0,w,h,txt in [(.04,.62,.245,.073,'Fluid enters from the surroundings'),(.735,.69,.225,.073,'Axial stretching'),(.735,.32,.225,.073,'Faster rotation near the core')]:
    box(f,x0,y0,w,h,face='#172b40',edge='#314b62');label(f,x0+w/2,y0+h*.70,txt,11,color='white',ha='center')
f.add_artist(FancyArrowPatch((.28,.65),(.385,.51),transform=f.transFigure,arrowstyle='->',mutation_scale=13,color=CYAN))
f.add_artist(FancyArrowPatch((.735,.73),(.51,.80),transform=f.transFigure,arrowstyle='->',mutation_scale=13,color='#ffad51'))
f.add_artist(FancyArrowPatch((.735,.35),(.51,.29),transform=f.transFigure,arrowstyle='->',mutation_scale=13,color='#ffad51'))
label(f,.06,.12,'—  Slower motion away from the core',13,color=CYAN)
label(f,.57,.12,'—  Faster rotation near the core',13,color='#ffad51')
label(f,.04,.055,'Conceptual radial inflow and axial stretching; not a numerical reconstruction of the proof.',10,color='#b7c9d8')
save(f,'05-spaghetti-vortex')

# 3. Quadratic effect of a zero-mean oscillation.
f=plt.figure(figsize=(14,7.6),facecolor='#f5f7fb')
box(f,.025,.32,.95,.645)
label(f,.06,.93,'Raw wave',22,weight='bold');label(f,.58,.93,'After squaring',22,weight='bold')
label(f,.06,.875,'Positive and negative parts cancel.',12,color=MUTED)
label(f,.58,.875,'Both signs give a positive square.',12,color=MUTED)
x=np.linspace(0,4*np.pi,800);q=np.sin(x)
for left,data,name in [(.06,q,r'$q(x)$'),(.59,q*q,r'$q^2(x)$')]:
    ax=f.add_axes([left,.49,.35,.29]);clean(ax);ax.set_xlim(0,4*np.pi)
    ax.set_title(name,loc='left',fontsize=14,fontweight='bold')
    if left<.5:
        ax.set_ylim(-1.15,1.15);ax.plot(x,data,color='#218ead',lw=3)
        ax.fill_between(x,0,data,where=data>=0,color='#218ead',alpha=.19)
        ax.fill_between(x,0,data,where=data<=0,color=RED,alpha=.2)
        ax.axhline(0,color=MUTED,ls='--',lw=1)
    else:
        ax.set_ylim(-.07,1.1);ax.plot(x,data,color=GOLD,lw=3);ax.fill_between(x,0,data,color=GOLD,alpha=.16)
        ax.axhline(.5,color=GOLD,ls='--',lw=1.6);ax.text(4*np.pi,.53,'Mean',ha='right',fontsize=11,color='#a37b1c')
label(f,.485,.68,r'$q\times q$',22,color=PURPLE,ha='center',weight='bold')
label(f,.485,.605,'Multiply the wave\nby itself',11,color=PURPLE,ha='center',linespacing=1.6)
label(f,.235,.419,'Mean = 0',15,ha='center',weight='bold')
label(f,.765,.419,'New mean = 1/2',15,ha='center',weight='bold')
box(f,.025,.035,.95,.235,face=NAVY,edge=NAVY)
label(f,.055,.24,'Role in the proposed argument',17,color='white',weight='bold')
label(f,.055,.19,'Amplitude and shape are adjusted so the mean oscillation effect opposes the residual.',11,color='#c2d1df')
label(f,.18,.112,'Residual',14,color=RED,ha='center');label(f,.50,.123,r'$\approx 0$',22,color='white',ha='center')
label(f,.79,.112,'Mean effect of oscillations',14,color=CYAN,ha='center')
for a,b,col in [((.29,.10),(.455,.10),RED),((.67,.10),(.55,.10),CYAN)]:
    f.add_artist(FancyArrowPatch(a,b,transform=f.transFigure,arrowstyle='-|>',mutation_scale=20,lw=2,color=col))
save(f,'07-nonlinear-oscillations')

# 4–6. Scaling cards.
for name,title,formula,body,limit,col in [
 ('08-velocity','Flow velocity',r'$U\propto\tau^{-1/2-h}$','The exponent is negative. As the remaining time decreases,\nthe principal rotational and axial speeds increase.',r'$U\longrightarrow\infty$','#ff9f43'),
 ('09-core-size','Core size',r'$\ell_r\propto\tau^{1/2}$'+'\n'+r'$\ell_z\propto\tau^{1/2-h}$','Both the radius and axial extent decrease.\nThe radius shrinks faster, so the core becomes more slender.','The core becomes thinner.',CYAN),
 ('10-core-energy','Core energy',r'$E_{\mathrm{core}}\propto\tau^{1/2-3h}$','For sufficiently small positive h, the exponent is positive.\nThe energy in the collapsing core decreases.',r'$E_{\mathrm{core}}\longrightarrow 0$','#b196ff')]:
    f=plt.figure(figsize=(10,7.4),facecolor=NAVY)
    f.add_artist(plt.Line2D([0,1],[.992,.992],transform=f.transFigure,color=col,lw=9))
    label(f,.08,.89,title,30,color='white',weight='bold')
    label(f,.50,.69,formula,32,color=col,ha='center',linespacing=1.6)
    f.add_artist(plt.Line2D([.08,.92],[.39,.39],transform=f.transFigure,color='#304256',lw=1.1))
    label(f,.50,.33,body,15,color='#d8e3ed',ha='center',linespacing=1.7)
    label(f,.50,.16,limit,25,color=col,ha='center')
    label(f,.08,.045,r'Remaining time: $\tau=T-t\to 0^+$; scaling illustration from the article.',10,color='#91aabd')
    save(f,name)

# 7. Cascade: common amplitude and increasing wavenumber.
f=plt.figure(figsize=(14,8),facecolor='#f6f8fc')
label(f,.035,.96,'A self-similar cascade',24,weight='bold')
colors=[BLUE,PURPLE,RED,GOLD]
for j,(c,title,sub,foot) in enumerate(zip(colors,['Generation 1','Generation 2','Generation 3','Later generations'],['Large scale','Smaller scale','Very small scale','Continuing to finer scales'],['Small gradient','Larger gradient','Steep gradient','Unbounded gradient growth'])):
    left=.025+j*.246;box(f,left,.40,.23,.465)
    label(f,left+.015,.837,title,17,weight='bold');label(f,left+.015,.79,sub,11,color=MUTED)
    ax=f.add_axes([left+.015,.485,.2,.26]);ax.set_xlim(0,1);ax.set_ylim(-1.2,3.6);ax.axis('off')
    for yy,dx in zip([1.5,2.05,2.6,3.15],[.6,.48,.36,.24]):
        ax.annotate('',xy=(dx,yy),xytext=(0,yy),arrowprops={'arrowstyle':'->','color':'#a7b4bf','lw':1.8})
    x=np.linspace(0,1,600);ax.plot(x,np.sin(2*np.pi*(2**j)*x),color=c,lw=2.6)
    ax.plot([.1,.1+(.8/2**j)],[-1.13,-1.13],color=c,lw=3)
    label(f,left+.115,.45,foot,10,ha='center',color=c,weight='bold')
box(f,.025,.04,.965,.30,face=NAVY,edge=NAVY)
label(f,.05,.311,'The intervals between generations shrink',18,color='white',weight='bold')
label(f,.05,.263,'Successive stages occur faster and accumulate before a finite time T.',12,color='#c4d4e4')
ax=f.add_axes([.06,.128,.88,.077]);ax.set_xlim(-.02,1.03);ax.set_ylim(-.4,1.1);ax.axis('off')
ax.plot([0,1],[0,0],color='#8197aa',lw=2)
for j in range(11):
    t=1-2**(-j);ax.plot([t,t],[-.1,.63],color=colors[min(j,3)],lw=2)
    if j<4:ax.text(t,-.22,rf'$t_{j}$',ha='center',va='top',color='white',fontsize=12)
ax.plot([1,1],[-.13,.94],color='white',lw=2.5);ax.text(1,.98,'T',ha='center',va='bottom',color='white',fontsize=13)
label(f,.50,.079,'Smaller scale + shorter time → larger velocity gradient',13,color='white',ha='center')
save(f,'11-euler-cascade')
print('Created seven English diagrams as PNG and SVG:',OUT)
