"""Ten original explanatory SVG figures. Requires numpy and matplotlib.
All non-historical data are synthetic models with explicit assumptions.
"""
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle

OUT=Path(__file__).resolve().parent
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':12,'svg.fonttype':'none','axes.spines.top':False,'axes.spines.right':False,'axes.titlesize':17,'figure.facecolor':'#f7fafc','axes.facecolor':'#f7fafc'})
blue, teal, orange, ink = '#2669c9','#007e87','#c86519','#173346'

def save(fig,name):
    fig.savefig(OUT/(name+'.svg'),bbox_inches='tight');plt.close(fig)
def canvas(title):
    fig,ax=plt.subplots(figsize=(11,5.5));ax.set(xlim=(0,11),ylim=(0,6));ax.axis('off');ax.set_title(title,pad=18,color=ink);return fig,ax
def txt(ax,x,y,s,**kw):ax.text(x,y,s,color=ink,ha='center',va='center',**kw)
def box(ax,x,y,w,h,label,color=blue):
    ax.add_patch(Rectangle((x,y),w,h,facecolor=color,alpha=.16,edgecolor=color,lw=2));txt(ax,x+w/2,y+h/2,label)
def arrow(ax,a,b,color=blue):ax.annotate('',xy=b,xytext=a,arrowprops=dict(arrowstyle='->',lw=2.5,color=color))

fig,ax=canvas('A sequence of enabling advances')
items=[('1962','Visible red\nemission'),('1986','AlN buffer\npublication'),('1989','p-type GaN\ndemonstrated'),('1991–92','Reactor +\nannealing'),('1993–94','Bright InGaN\nblue LEDs'),('1996','White LED\nproduct'),('2014','Physics\nNobel Prize')]
ax.plot([.5,10.5],[3,3],lw=3,color=blue)
for i,(year,label) in enumerate(items):
    x=.6+i*1.63;ax.plot(x,3,'o',color=teal,ms=10);txt(ax,x,3.6,year,fontweight='bold');txt(ax,x,2.1 if i%2==0 else 1.3,label,fontsize=11)
txt(ax,5.5,.35,'Earlier blue emitters existed; efficiency and manufacturability were the challenge.',fontsize=11)
save(fig,'timeline')
fig,ax=plt.subplots(figsize=(10,5));lam=np.linspace(360,750,300);ax.plot(lam,1239.841984/lam,color=blue,lw=3)
for l,label,col in [(450,'Blue · 450 nm',blue),(650,'Red · 650 nm','#bc3341')]:
    e=1239.841984/l;ax.scatter(l,e,s=80,color=col);ax.annotate(f'{label}\n{e:.3f} eV',(l,e),xytext=(l+20,e+.2),arrowprops=dict(arrowstyle='->'),color=col)
ax.set(xlabel='Vacuum wavelength (nm)',ylabel='Photon energy (eV)',title='Higher photon energy requires a different transition');ax.grid(alpha=.2);save(fig,'photon-energy')
fig,axes=plt.subplots(1,2,figsize=(11,5));k=np.linspace(-2,2,200)
for ax,shift,title in zip(axes,[0,1],['Direct gap','Indirect gap']):
    ax.plot(k,2+.4*(k-shift)**2,color=blue,lw=3);ax.plot(k,-.3*k*k,color=teal,lw=3);arrow(ax,(0,0),(0,2));
    if shift:arrow(ax,(0,2),(1,2),orange);ax.text(.45,2.35,'Lattice momentum',ha='center',fontsize=10)
    ax.set(xlim=(-2,2),ylim=(-1.4,5),xlabel='Crystal wave vector (schematic)',ylabel='Energy (arbitrary)',title=title,xticks=[],yticks=[])
save(fig,'band-gaps')
fig,ax=canvas('A growth layer changes nucleation and coalescence')
for x,title,buffer in [(.3,'Direct growth',False),(5.8,'Growth with buffer',True)]:
    box(ax,x,.8,4.9,.8,'Sapphire',teal);box(ax,x,2,4.9,2,'GaN film',blue)
    if buffer:box(ax,x,1.6,4.9,.4,'Nucleation layer',orange)
    else:
        for d in [1,2.4,3.6]:ax.plot([x+d,x+d+.1,x+d-.15],[1.7,2.8,3.8],color=orange,lw=3)
    txt(ax,x+2.45,5,title,fontweight='bold')
txt(ax,5.5,.2,'Schematic only: neither panel represents an atomically resolved interface.',fontsize=11);save(fig,'buffer-layer')
fig,(ax,bx)=plt.subplots(1,2,figsize=(11,5));ax.set(xlim=(0,5),ylim=(0,5));ax.axis('off')
box(ax,.6,.9,3.8,.65,'Heated substrate',orange);arrow(ax,(.2,2.1),(4.4,2.1));txt(ax,2.5,2.55,'Lateral precursor delivery')
for x in [1.2,2.5,3.8]:arrow(ax,(x,4.4),(x,2.9),teal)
txt(ax,2.5,4.85,'Assisting flow (conceptual)');ax.set_title('Transport to the growing surface')
da=np.logspace(-2,2,300);bx.semilogx(da,da/(1+da),lw=3,color=blue);bx.set(xlabel='Da = surface rate / mass-transfer rate',ylabel='Normalized flux',title='Two resistances in series',ylim=(0,1.05));bx.grid(alpha=.2);save(fig,'reactor')
fig,ax=canvas('Dopant concentration is not free-hole concentration')
box(ax,.2,1.7,4.2,2.4,'Mg acceptor + hydrogen\n\nNeutral / passivated complex',orange);box(ax,6.5,1.7,4.2,2.4,'Activated acceptor\n\nMobile holes can contribute',teal);arrow(ax,(4.5,2.9),(6.3,2.9));txt(ax,5.4,4.35,'Controlled\ntreatment');txt(ax,5.5,.6,'Activation depends on thermal history, hydrogen transport and compensation.',fontsize=11);save(fig,'activation')
fig,(ax,bx)=plt.subplots(1,2,figsize=(11,5));ax.axis('off');ax.set(xlim=(0,5),ylim=(0,5))
for y,h,label,col in [(0,.8,'Substrate',teal),(.8,1.2,'n-GaN',blue),(2,.5,'InGaN wells / barriers',orange),(2.5,1.2,'p-type region',blue),(3.7,.5,'Contact',ink)]:box(ax,.6,y,3.8,h,label,col)
ax.set_title('Illustrative modern stack')
bx.plot([0,1,1,3,3,4],[3.4,3.4,2.6,2.6,3.4,3.4],color=blue,lw=3);bx.plot([0,1,1,3,3,4],[.4,.4,1,1,.4,.4],color=teal,lw=3);arrow(bx,(2,2.6),(2,1),orange)
bx.text(2,3.7,'Lower-gap active region',ha='center');bx.set(xlim=(0,4),ylim=(0,4.1),xticks=[],yticks=[],xlabel='Position through device',ylabel='Band-edge energy (schematic)',title='Carrier confinement');save(fig,'heterostructure')
fig,ax=plt.subplots(figsize=(10,5));n=np.logspace(21,26,400);B,C=1e-17,1e-42
for A,col in [(1e7,blue),(1e8,orange)]:
    eff=B*n*n/(A*n+B*n*n+C*n**3);ax.semilogx(n,eff,label=f'A = {A:.0e} s⁻¹',lw=3,color=col);pk=np.sqrt(A/C);ax.plot(pk,B*pk**2/(A*pk+B*pk**2+C*pk**3),'o',color=col)
ax.set(xlabel='Assumed carrier density (m⁻³)',ylabel='Internal quantum efficiency',ylim=(0,1),title='Synthetic ABC model: confinement alone is not enough');ax.text(.03,.94,'B = 10⁻¹⁷ m³/s; C = 10⁻⁴² m⁶/s',transform=ax.transAxes);ax.legend(loc='lower center');ax.grid(alpha=.2);save(fig,'abc-efficiency')
fig,ax=plt.subplots(figsize=(10,5));l=np.linspace(380,760,600);b=np.exp(-.5*((l-450)/10)**2);p=.6*np.exp(-.5*((l-570)/55)**2)
ax.plot(l,b,color=blue,label='Remaining blue',lw=2);ax.plot(l,p,color=orange,label='Converted broad band',lw=2);ax.plot(l,b+p,color=ink,label='Combined spectrum',lw=2,ls='--');ax.set(xlabel='Wavelength (nm)',ylabel='Spectral power (arbitrary units)',title='Illustrative phosphor-converted spectrum');ax.legend();ax.grid(alpha=.2);save(fig,'white-spectrum')
fig,ax=canvas('Light leaves the package; heat and strain remain')
for y,label,col in [(4.2,'LED die',blue),(3.3,'Die attachment',orange),(2.4,'Circuit substrate',teal),(1.5,'Housing / heat spreader',ink)]:box(ax,.3,y,5,.65,label,col)
arrow(ax,(2.8,4.15),(2.8,3.97),orange);arrow(ax,(2.8,3.25),(2.8,3.07),orange);arrow(ax,(2.8,2.35),(2.8,2.17),orange);arrow(ax,(2.8,1.45),(2.8,.55),orange);txt(ax,2.8,.2,'Heat to environment')
box(ax,6.4,3.6,3.5,.65,'Material 1',blue);box(ax,6.4,2.8,3.5,.65,'Material 2',teal);arrow(ax,(6.4,2.3),(10.5,2.3));txt(ax,8.4,1.7,'Different free expansions');txt(ax,8.4,.85,'Bonding imposes\ncompatibility → stress');save(fig,'package-mechanics')
print('Generated 10 original SVG figures.')
