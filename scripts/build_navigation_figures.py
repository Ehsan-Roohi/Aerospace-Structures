"""Original conceptual diagrams and structural teaching plots; no flight software."""
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyArrowPatch, Circle
import numpy as np
P=Path(__file__).resolve().parents[1]/'docs/case-studies/navigation-without-gps'
P.mkdir(parents=True,exist_ok=True)
plt.rcParams.update({'font.size':12,'axes.spines.top':False,'axes.spines.right':False,'axes.labelcolor':'#18364b','text.color':'#18364b','svg.fonttype':'none'})
blue='#2366ac';orange='#d77928';green='#178779'
def start(title):
 f,a=plt.subplots(figsize=(11,5.7));f.set_facecolor('#f5f8fc');a.set_facecolor('#f5f8fc');f.suptitle(title,fontsize=19,fontweight='bold',x=.06,ha='left');return f,a
def save(f,n):
 f.text(.06,.015,'MIE 446 • Original teaching illustration • Conceptual unless axes specify units',fontsize=9,color='#546b7d');f.tight_layout(rect=(.02,.05,.98,.9));f.savefig(P/(n+'.svg'));plt.close(f)
def box(a,x,y,w,h,t,c=blue):
 a.add_patch(Rectangle((x,y),w,h,facecolor='white',edgecolor=c,lw=2));a.text(x+w/2,y+h/2,t,ha='center',va='center',fontsize=12)
def arrow(a,p,q):a.add_patch(FancyArrowPatch(p,q,arrowstyle='->',mutation_scale=18,color=blue,lw=2))
f,a=start('01 / Navigation is one part of the aircraft system');a.set(xlim=(0,10),ylim=(0,5));a.axis('off')
for x,t in [(0.2,'Navigation\nWhere am I?'),(3.5,'Guidance\nWhere should I go?'),(6.8,'Control\nHow do I move?')]:box(a,x,2.4,2.8,1.25,t)
arrow(a,(3,3),(3.5,3));arrow(a,(6.3,3),(6.8,3));box(a,2.1,.3,5.8,1,'Structure + sensors + actuators\nDeformation and vibration affect measurements',green);arrow(a,(5,1.3),(1.6,2.4));arrow(a,(8.1,2.4),(6.4,1.3));save(f,'01-system')
f,a=start('02 / Measurement families have different limitations');a.axis('off');a.set(xlim=(0,10),ylim=(0,5))
for x,y,t in [(0.2,3.1,'Inertial\nMotion, but drift'),(3.6,3.1,'Vision\nTexture and light'),(6.9,3.1,'Radio references\nInfrastructure'),(1.9,.8,'Magnetic / pressure\nEnvironment matters'),(5.3,.8,'Maps\nQuality and freshness')]:box(a,x,y,2.8,1.25,t)
save(f,'02-families')
f,a=start('03 / A position report and its uncertainty are different');a.set(xlim=(-3,3),ylim=(-2,2),xlabel='Illustrative horizontal coordinate',ylabel='Illustrative horizontal coordinate');a.set_aspect('equal')
from matplotlib.patches import Ellipse
a.add_patch(Ellipse((.35,.2),2.8,1.3,angle=25,facecolor='#dceafa',edgecolor=blue,lw=2));a.scatter([0],[0],marker='+',s=150,c=green,label='Reference');a.scatter([.35],[.2],c=orange,label='Estimate');a.legend(loc='upper left');a.text(1.1,-1.4,'An uncertainty region is model-dependent.\nIt is not a guaranteed safety boundary.');save(f,'03-uncertainty')
f,a=start('04 / Integration turns a small constant bias into drift');t=np.linspace(0,60,200);a.plot(t,.5*.01*t*t,lw=3,c=blue);a.set(xlabel='Elapsed time (s)',ylabel='1-D position error (m)');a.grid(alpha=.2);a.text(3,14,'Teaching assumption: constant bias = 0.01 m/s²\nNo corrections, zero initial error\nNot a real sensor performance prediction');save(f,'04-drift')
f,a=start('05 / Camera motion and scene content both matter');a.axis('off');a.set(xlim=(0,10),ylim=(0,5))
for x,title in [(.4,'Textured scene'),(5.3,'Low-texture scene')]:
 box(a,x,.6,4.1,3.3,'',blue);a.text(x+2.05,4.2,title,ha='center',weight='bold')
rng=np.random.default_rng(14)
for x,y in rng.uniform([.7,.9],[4.1,3.6],(28,2)):a.add_patch(Circle((x,y),.05,color=green))
a.text(7.35,2.25,'Few distinguishable\nfeatures',ha='center');a.text(2.45,.1,'Features may support relative motion estimates',ha='center',fontsize=10);save(f,'05-texture')
f,a=start('06 / Sensor motion is not always rigid-body motion');a.axis('off');a.set(xlim=(0,10),ylim=(0,5));a.plot([.5,9.5],[1.4,1.4],lw=5,c=blue);xx=np.linspace(.5,9.5,200);a.plot(xx,1.4+.45*np.sin((xx-.5)*np.pi/9),ls='--',lw=3,c=orange);box(a,4.25,2.2,1.5,.8,'Camera');arrow(a,(5,2.2),(5,1.85));a.text(.6,4,'Solid: reference beam\nDashed: illustrative bending shape\nLocal slope changes the camera line of sight',fontsize=14);save(f,'06-flexure')
f,a=start('07 / An equipment mount behaves like a dynamic system');a.axis('off');a.set(xlim=(0,10),ylim=(0,5));box(a,3.3,2.7,3.4,1,'Equipment mass m');a.plot([1,9],[.8,.8],lw=6,c=blue)
a.plot([4,4,3.8,4.2,3.8,4.2,4,4],[.8,1.1,1.3,1.5,1.7,1.9,2.1,2.7],c=orange,lw=2);a.text(3,1.7,'k');a.plot([6,6],[.8,1.5],c=green,lw=2);box(a,5.7,1.5,.6,.45,'',green);a.plot([6,6],[1.95,2.7],c=green,lw=2);a.text(6.5,1.7,'c');a.text(1,.1,'Base motion y(t)');a.text(7.2,3.1,'Absolute motion x(t)');save(f,'07-mount')
f,a=start('08 / Soft mounting can amplify motion near resonance');r=np.linspace(.02,4,500)
for z,c in [(.05,blue),(.2,orange),(.5,green)]:a.plot(r,np.sqrt((1+(2*z*r)**2)/((1-r*r)**2+(2*z*r)**2)),label=f'ζ = {z}',lw=2.5,c=c)
a.set(xlabel='Frequency ratio r = excitation / natural frequency',ylabel='Absolute displacement transmissibility',ylim=(0,10.5));a.grid(alpha=.2);a.legend();save(f,'08-transmissibility')
f,a=start('09 / A camera bracket carries inertial loads');a.axis('off');a.set(xlim=(0,10),ylim=(0,5));a.add_patch(Rectangle((1,.7),.35,3,facecolor=blue));a.plot([1.35,7],[2,2],lw=9,c='#839db4');box(a,6.2,2.05,1.6,1,'Camera');arrow(a,(7,2),(7,.8));a.text(7.3,1.2,'F = ma');arrow(a,(1.35,3.6),(6.9,3.6));a.text(4.1,3.85,'Offset L',ha='center');a.text(2.1,.45,'Root moment: M = FL     •     Tip slope changes alignment');save(f,'09-bracket')
f,a=start('10 / A precise output can still be biased');rng=np.random.default_rng(7);a.scatter(*rng.normal([0,0],[.65,.65],(45,2)).T,c=blue,alpha=.65,label='Broad, near reference');a.scatter(*rng.normal([2.2,1.5],[.13,.13],(45,2)).T,c=orange,alpha=.7,label='Tight, biased');a.scatter([0],[0],marker='+',s=200,c=green,label='Reference');a.set(xlim=(-2,3.2),ylim=(-2,2.7),xlabel='Illustrative error coordinate',ylabel='Illustrative error coordinate');a.set_aspect('equal');a.legend(loc='lower right');save(f,'10-bias')
print('Generated 10 original SVG figures')
