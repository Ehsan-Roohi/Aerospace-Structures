"""Reproduce the separate, unvalidated C1-closure research figures."""
from pathlib import Path
import argparse
import json
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--deps', type=Path)
args = parser.parse_args()
if args.deps:
    sys.path.insert(0, str(args.deps))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

base = Path(__file__).resolve().parent
field = json.loads((base/'off-collocation-field-probe.json').read_text())
comparison = json.loads((base/'closure-model-comparison.json').read_text())
consistency = json.loads((base/'closure-consistency-study.json').read_text())
args.output.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11.5,'axes.titlesize':13,
    'axes.labelsize':12,'legend.fontsize':10.5,'lines.linewidth':2,
    'pdf.fonttype':42,'savefig.facecolor':'white','axes.spines.top':False,
    'axes.spines.right':False})
blue,orange,green = '#0072B2','#D55E00','#009E73'
figs=[]

def style(ax,x,y):
    ax.set_xlabel(x);ax.set_ylabel(y);ax.grid(True,color='#dfe5eb',lw=.7);ax.set_axisbelow(True)

def frame(title,subtitle):
    fig,axes=plt.subplots(2,2,figsize=(12,9))
    fig.subplots_adjust(left=.085,right=.97,top=.80,bottom=.15,wspace=.29,hspace=.37)
    fig.suptitle(title,x=.055,y=.965,ha='left',fontsize=20,fontweight='bold')
    fig.text(.055,.91,subtitle,fontsize=12.5,va='top')
    return fig,axes

a,b=[r for r in field['cases'] if r['N']==213]
fig,axs=frame('A smooth-contact closure candidate',
    'NACA 0012, 4 degrees, detachment x/c = 0.01, fixed cavity length l/c = 0.40; N = 213.\n'
    'Blue: original A = 0.30. Orange: A = 0.36239 determined by a gap-slope equation.')
for row,color,label in [(a,blue,'Fixed A = 0.30'),(b,orange,'C1 research candidate')]:
    h=row['height']
    for ax in axs[0]:ax.plot([p['x'] for p in h],[p['h'] for p in h],color=color,label=label)
    p=sorted([p for p in row['boundaryPressure'] if p['y']>=0],key=lambda p:p['x'])
    for ax in axs[1]:ax.plot([v['x'] for v in p],[v['Cp'] for v in p],color=color,label=label)
axs[0,0].set_title('Physical cavity gap: entire cavity');axs[0,1].set_title('Closure detail: no nodes removed')
axs[0,1].set_xlim(.375,.414);axs[0,1].set_ylim(-.0002,.004)
axs[1,0].set_title('Signed pressure: upper compound boundary');axs[1,1].set_title('Signed pressure around closure')
axs[1,1].set_xlim(.34,.46)
for ax in axs[0]:style(ax,'Chord position, x/c','Gap h/c');ax.legend(loc='upper right')
for ax in axs[1]:style(ax,'Chord position, x/c','Pressure coefficient, Cp');ax.axvline(.41,color='#555555',ls=':',lw=1)
fig.text(.055,.045,'The closure rule changes the physical model. All sampled Cp values are retained; no clipping or endpoint mask.\n'
    'Smoother contact is not independent or experimental validation. The educational/default solver is unchanged.',fontsize=10.5)
figs.append(('01_closure_shape_pressure',fig))

rows=comparison['rows'];n=np.array([r['N'] for r in rows]);check=consistency['rows']
fig,axs=frame('Refinement, force and closure consistency',
    'Five independently solved meshes, actual compound-boundary panel counts shown below.\n'
    'These are internal checks of a modified closure candidate, not cavitation accuracy estimates.')
axs[0,0].plot(n,[r['cornerFixed'] for r in rows],'o-',color=blue,label='Fixed A')
axs[0,0].plot(n,[r['cornerC1'] for r in rows],'s-',color=orange,label='C1 candidate')
axs[0,0].set_title('Angle between last cavity and next wet panel');style(axs[0,0],'Boundary panels, N','Discrete corner angle (degrees)');axs[0,0].legend()
axs[0,1].plot(n,[r['ClFixed'] for r in rows],'o-',color=blue,label='Fixed A: pressure integral')
axs[0,1].plot(n,[r['ClC1'] for r in rows],'s-',color=orange,label='C1: pressure integral')
axs[0,1].plot(n,[r['kuttaJoukowskiCl'] for r in check],'x--',color=green,label='C1: circulation, 2 Gamma')
axs[0,1].set_title('Lift changes with model and mesh');style(axs[0,1],'Boundary panels, N','Lift coefficient, CL');axs[0,1].legend()
axs[1,0].plot(n,[r['sigmaFixed'] for r in rows],'o-',color=blue,label='Fixed A')
axs[1,0].plot(n,[r['sigmaC1'] for r in rows],'s-',color=orange,label='C1 candidate')
axs[1,0].set_title('Inverse solution: sigma is an output');style(axs[1,0],'Boundary panels, N','Cavitation number, sigma');axs[1,0].legend()
axs[1,1].semilogy(n,[abs(r['endpointGapSlopeThreePoint']) for r in check],'s-',color=orange,label='3-point derivative: imposed')
axs[1,1].semilogy(n,[abs(r['endpointGapSlopeFivePoint']) for r in check],'o-',color=blue,label='5-point derivative: cross-check')
axs[1,1].set_title('Sensitivity of the endpoint gap derivative');style(axs[1,1],'Boundary panels, N','Absolute endpoint dh/dx');axs[1,1].legend()
fig.text(.055,.045,'Pressure/circulation lift discrepancy decreases from 0.603% to 0.0212%; this is a conservation identity.\n'
    'A separate five-point endpoint derivative still has finite discretisation error. Acosta and experiment gates remain open.',fontsize=10.5)
figs.append(('02_closure_refinement_consistency',fig))

fig,axs=frame('Independent field-gradient diagnostics',
    'Velocities here come from analytic derivatives of source/doublet kernels at liquid points.\n'
    'They do not reuse the finite-difference surface Cp reconstruction.')
control=field['kernelVerification']['circleNear']
for key,val,label,col in [('relative',.05,'Distance = 0.05 local panel length',orange),('absolute',.02,'Fixed distance = 0.02 radius',blue)]:
    v=[v for v in control if v.get(key)==val]
    axs[0,0].semilogy([p['N'] for p in v],[p['allPointVelocityErrorRms'] for p in v],'o-',color=col,label=label)
axs[0,0].set_title('Exact cylinder: all near-panel samples');style(axs[0,0],'Cylinder panels, N','RMS velocity error / U');axs[0,0].legend()
for distance,col in [(.005,blue),(.01,green),(.02,orange)]:
    v=[v for v in field['cases'] if v['label']=='modified C1 selection']
    y=[next(t for t in p['nearBoundary'] if t.get('absolute')==distance)['allNormalVelocityRms'] for p in v]
    axs[0,1].plot([p['N'] for p in v],y,'o-',color=col,label=f'Distance / chord = {distance}')
axs[0,1].set_title('Cavity: finite-offset normal velocity');style(axs[0,1],'Boundary panels, N','RMS normal velocity / U');axs[0,1].legend()
angle=np.array([v['angle'] for v in a['outerField']])*180/np.pi
cpA=np.array([v['Cp'] for v in a['outerField']]);cpB=np.array([v['Cp'] for v in b['outerField']])
axs[1,0].plot(angle,cpA,color=blue,label='Fixed A');axs[1,0].plot(angle,cpB,'--',color=orange,label='C1 candidate')
axs[1,0].set_title('Exterior Cp on the same physical circle');style(axs[1,0],'Circle angle (degrees)','Cp at radius 1.5 chords');axs[1,0].legend()
axs[1,1].plot(angle,cpB-cpA,color=orange);axs[1,1].axhline(0,color='#555555',lw=1)
axs[1,1].ticklabel_format(axis='y',style='sci',scilimits=(0,0))
axs[1,1].set_title('Exterior Cp change caused by closure rule');style(axs[1,1],'Circle angle (degrees)','Cp(C1) - Cp(fixed A)')
fig.text(.055,.045,'A distance that shrinks with panel size shows nonuniform derivative convergence even for an exact cylinder.\n'
    'Finite-offset values are not surface boundary residuals: real flow varies away from the boundary. No sample is omitted.',fontsize=10.5)
figs.append(('03_closure_field_diagnostics',fig))

with PdfPages(args.output/'C1_Closure_Research_Diagnostics.pdf') as pdf:
    pdf.infodict()['Title']='C1 closure research diagnostics - not independently validated'
    pdf.infodict()['Author']='Hydrofoil Cavitation Lab research checks'
    for name,fig in figs:
        fig.savefig(args.output/(name+'.png'),dpi=220)
        fig.savefig(args.output/(name+'.svg'))
        pdf.savefig(fig)
        plt.close(fig)
print(json.dumps({'pages':len(figs),'output':str(args.output)},indent=2))
