"""Reproduce scientific figures from recorded calculations; no fitted reference data."""
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
data = json.loads((base / 'profiles.json').read_text())
report = json.loads((base / 'verification.json').read_text())
example = json.loads((base / 'example-result.json').read_text())
ablation = json.loads((base / 'pressure-ablation.json').read_text())
args.output.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 12.5,
                     'axes.titlesize': 15, 'axes.labelsize': 13,
                     'legend.fontsize': 11.5, 'xtick.labelsize': 11.5,
                     'ytick.labelsize': 11.5, 'lines.linewidth': 1.8,
                     'pdf.fonttype': 42, 'savefig.facecolor': 'white',
                     'axes.spines.top': False, 'axes.spines.right': False})
colors = ['#0072B2', '#D55E00', '#009E73', '#9B59B6']

def style(ax, xlabel='Chord position, x/c', ylabel=None):
    ax.set_xlabel(xlabel)
    if ylabel:
        ax.set_ylabel(ylabel)
    ax.grid(True, color='#dfe5eb', linewidth=.7)
    ax.set_axisbelow(True)

def footer(fig, text):
    fig.text(.055, .035, text, fontsize=10.5, color='#34495e', va='bottom')

figures = []

fig, axs = plt.subplots(1, 2, figsize=(12, 8), sharey=True)
fig.subplots_adjust(left=.08, right=.98, top=.79, bottom=.19, wspace=.12)
fig.suptitle('Independent analytic verification: lifting Joukowski hydrofoil',
             x=.055, y=.96, ha='left', fontsize=20, fontweight='bold')
fig.text(.055, .897, 'Fully wetted flow at 4 degrees; constant source/doublet BEM with a downstream wake.', fontsize=13)
rows = [r for r in data['joukowski'] if r['alpha'] == 4]
for side, ax in zip([1, -1], axs):
    ref = sorted((p for p in rows[-1]['points'] if p['y']*side > 0), key=lambda p:p['x'])
    ax.plot([p['x'] for p in ref], [p['referenceCp'] for p in ref], color='#111111', lw=3.5, label='Exact conformal-map solution')
    for i, row in enumerate(rows):
        pts = sorted((p for p in row['points'] if p['y']*side > 0), key=lambda p:p['x'])
        ax.plot([p['x'] for p in pts], [p['cp'] for p in pts], color=colors[i], ls=[':', '--', '-'][i], label=f"BEM: {row['n']} panels")
    ax.set_title('Upper surface' if side == 1 else 'Lower surface', loc='left')
    style(ax, ylabel='Signed pressure coefficient, Cp' if side == 1 else None)
    ax.set_xlim(0, 1)
axs[0].invert_yaxis()
axs[0].legend(loc='upper right', frameon=True, edgecolor='#ccd6df', facecolor='white')
last = [r for r in report['analytic'] if r.get('alphaDeg') == 4][-1]
footer(fig, f"At 320 panels: CL = {last['cl']:.6f}; exact CL = {last['exactCl']:.6f} (absolute error {last['liftAbsoluteError']:.6f}).\n"
       f"Cp RMS = {last['Cp_RMS_x_02_to_98']:.6f} on 0.02 < x/c < 0.98. All panel-centroid Cp values are plotted; lift uses all panels.\n"
       'This verifies noncavitating potential flow. It does not validate the cavitation model. Source: analytic Joukowski map in verify.cjs.')
figures.append(('01_wetted_joukowski_verification', fig))

fig = plt.figure(figsize=(12, 10))
grid = fig.add_gridspec(3, 1, height_ratios=[.85, 1, 1.5], hspace=.42, left=.09, right=.97, top=.84, bottom=.145)
fig.suptitle('Computed partial-sheet cavity: shape and signed pressure',
             x=.055, y=.97, ha='left', fontsize=20, fontweight='bold')
fig.text(.055, .913, 'NACA 0012; angle 4 degrees; detachment x/c = 0.01; prescribed cavity length l/c = 0.40.', fontsize=12.5)
fig.text(.055, .883, 'Pressure recovery: lambda = 0.15, A = 0.30, nu = 1.00. Fixed-length inverse solution; sigma is computed.', fontsize=12)
ax = fig.add_subplot(grid[0]);original = np.array(example['original']);height = example['height']
ax.plot(original[:,0], original[:,1], color='#253747', label='Original foil')
ax.plot([p['x'] for p in height], [p['y'] for p in height], color='#D55E00', lw=2.5, label='Computed cavity surface')
ax.fill_between([p['x'] for p in height], [p['y']-p['h'] for p in height], [p['y'] for p in height], color='#F8CBAD', alpha=.7)
style(ax, ylabel='y/c');ax.set_aspect('equal', adjustable='datalim');ax.set_xlim(0,1);ax.legend(loc='upper right', ncol=2)
ax.set_title('(a) Contour at true geometric aspect ratio', loc='left')
ax = fig.add_subplot(grid[1])
for i, row in enumerate(data['cavities']):
    ax.plot([p['x'] for p in row['height']], [p['h'] for p in row['height']], color=colors[i], label=f"N = {report['cavityMeshStudy'][i]['actualBoundaryPanels']}, sigma = {row['sigma']:.4f}")
style(ax, ylabel='Cavity height, h/c');ax.set_xlim(.0,.43);ax.set_ylim(0,.025);ax.legend(ncol=2, loc='upper right')
ax.set_title('(b) Cavity-height mesh study (N = total boundary panels)', loc='left')
ax = fig.add_subplot(grid[2])
for side, col, label in [(1, '#0072B2', 'Upper: reconstructed'), (-1, '#D55E00', 'Lower: reconstructed')]:
    pts = sorted((p for p in example['panels'] if p['n'][1]*side > 0), key=lambda p:p['x'])
    ax.plot([p['x'] for p in pts], [p['cp'] for p in pts], color=col, label=label)
target = sorted((p for p in example['panels'] if p['cavity']), key=lambda p:p['x'])
ax.plot([p['x'] for p in target], [p['targetCp'] for p in target], color='#111111', ls='--', lw=2, label='Cavity boundary-condition target')
foil_arc = np.r_[0, np.cumsum(np.hypot(np.diff([p['x'] for p in height]), np.diff([p['y']-p['h'] for p in height])))]
recovery_start = np.interp((1-example['options']['recovery'])*foil_arc[-1], foil_arc, [p['x'] for p in height])
ax.axvspan(recovery_start, .41, color='#fbefd9', zorder=0);ax.text((recovery_start+.41)/2, .96, 'Recovery', transform=ax.get_xaxis_transform(), ha='center', va='top', fontsize=10)
ax.invert_yaxis();style(ax, ylabel='Signed Cp (negative upward)');ax.set_xlim(0,1);ax.legend(loc='lower right')
ax.set_title('(c) Raw reconstructed pressure: N = 160; no Cp values clipped or replaced', loc='left')
footer(fig, 'Numerically converged research prototype; no independent cavitating-flow or experimental validation.\n'
       'The dashed Cp target is an imposed boundary condition, not a reference measurement. Recovery/junction peaks remain mesh-sensitive.\n'
       f"Source: saved solver output example-result.json and four-mesh profiles.json; solver v{report['version']}, 30 October 2026.")
figures.append(('02_partial_cavity_profiles', fig))

fig, axs = plt.subplots(2,2,figsize=(12,9))
fig.subplots_adjust(left=.08,right=.98,top=.82,bottom=.16,hspace=.45,wspace=.27)
fig.suptitle('What converges - and what remains unresolved', x=.055,y=.965,ha='left',fontsize=20,fontweight='bold')
fig.text(.055,.908,'Same partial-cavity case and closure settings at 80, 107, 160 and 213 total boundary panels.',fontsize=13)
meshes=report['cavityMeshStudy'];n=[r['actualBoundaryPanels'] for r in meshes]
ax=axs[0,0];ax.plot(n,[r['sigma'] for r in meshes], 'o-', color=colors[0]);style(ax,'Total boundary panels, N','Computed cavitation number, sigma');ax.set_title('(a) Fixed-length inverse prediction',loc='left')
ax=axs[0,1];ax.plot(n,[r['cl'] for r in meshes], 'o-', color=colors[1]);style(ax,'Total boundary panels, N','Equivalent-contour CL');ax.set_title('(b) Force is still mesh dependent',loc='left')
ax=axs[1,0]
for i,row in enumerate(data['cavities']):
    ax.semilogy([p['iteration'] for p in row['history']], [p['maxNormalVelocity'] for p in row['history']], color=colors[i], label=f'N = {n[i]}')
ax.axhline(1e-5,color='#444444',ls='--',lw=1.2,label='Admission tolerance');style(ax,'Nonlinear iteration','Maximum normal velocity / U');ax.set_title('(c) Internal free-boundary residual',loc='left');ax.legend(ncol=2,fontsize=10)
ax=axs[1,1];ax.semilogy(n,[r['metrics']['pressureReconstructionRMS'] for r in meshes],'o-',color=colors[0],label='Plateau Cp RMS difference')
ax.semilogy(n,[r['metrics']['maximumPressureReconstructionError'] for r in meshes],'s-',color=colors[1],label='Max difference, incl. recovery')
style(ax,'Total boundary panels, N','Reconstruction vs. cavity Cp target');ax.set_title('(d) Recovery pressure is not mesh converged',loc='left');ax.legend(fontsize=10.5)
footer(fig, 'A small equation residual does not establish physical accuracy. Plateau pressure reconstruction improves while the recovery maximum worsens.\n'
       'Do not use the cavity force or pressure peaks as experimentally validated design loads. No physical drag prediction is claimed.\n'
       'Source: verification.json and profiles.json; these curves are numerical checks, not measurements or independent cavity benchmarks.')
figures.append(('03_cavity_mesh_and_iteration_checks',fig))

fig,axs=plt.subplots(2,2,figsize=(12,9))
fig.subplots_adjust(left=.08,right=.98,top=.82,bottom=.17,hspace=.43,wspace=.27)
fig.suptitle('Pressure reconstruction: separate geometry consistency from stencil order',x=.055,y=.965,ha='left',fontsize=19,fontweight='bold')
fig.text(.055,.91,'Postprocessing-only ablation: identical solved potentials, cavity shapes, sigma and iteration histories.',fontsize=12.5)
variants=[('legacyMixedGeometry3','Perturbation + panel U.t; 3-point','#0072B2'),('totalPotential3','Total potential; 3-point','#D55E00'),('totalPotential5','Total potential; 5-point','#009E73')]
selected=next(r for r in ablation['cases'] if r['N']==213)
ax=axs[0,0];pts=sorted((p for p in selected['panels'] if p['cavity']),key=lambda p:p['x'])
for key,name,col in [('legacyCp','Legacy 3-point','#0072B2'),('total3Cp','Consistent total, 3-point','#D55E00'),('total5Cp','Consistent total, 5-point','#009E73')]:
    ax.plot([p['x'] for p in pts],[p[key] for p in pts],color=col,label=name)
ax.plot([p['x'] for p in pts],[p['targetCp'] for p in pts],color='#111111',ls='--',label='Imposed cavity Cp target')
style(ax,ylabel='Signed Cp');ax.invert_yaxis();ax.set_xlim(.335,.411);ax.set_title('(a) Recovery-zone zoom, N = 213',loc='left');ax.legend(fontsize=9.5,loc='upper right')
for ax,field,ylabel,title in [(axs[0,1],'maximumCavityCpDifference','Max |Cp - Cp(BC)|','(b) Raw maximum: ALL cavity panels'),(axs[1,0],'cl','Equivalent-contour CL','(c) Lift changes and mesh dependence'),(axs[1,1],'cm','Quarter-chord moment coefficient','(d) Moment changes and mesh dependence')]:
    for key,name,col in variants:
        ax.plot([r['N'] for r in ablation['cases']],[r['metrics'][key][field] for r in ablation['cases']],'o-',color=col,label=name)
    if field=='maximumCavityCpDifference':ax.set_yscale('log')
    style(ax,'Total boundary panels, N',ylabel);ax.set_title(title,loc='left')
fig.legend(*axs[0,1].get_legend_handles_labels(),loc='upper center',bbox_to_anchor=(.54,.875),ncol=3,fontsize=9.5,frameon=False)
footer(fig,'Cp differences compare against a prescribed boundary condition, not independent measurements. No Cp samples are clipped or replaced.\n'
       'The scalar plot retains every cavity panel, including junctions; panel (a) is explicitly a spatial zoom. Physical closure remains unresolved.\n'
       'Source: pressure-ablation.json; original v0.1.0 formula versus the v0.1.1 mixed-boundary postprocessor on the same fields.')
figures.append(('04_pressure_reconstruction_ablation',fig))

fig,axs=plt.subplots(2,2,figsize=(12,9))
fig.subplots_adjust(left=.08,right=.98,top=.82,bottom=.17,hspace=.43,wspace=.27)
fig.suptitle('The endpoint issue remains separate from numerical differentiation',x=.055,y=.965,ha='left',fontsize=19,fontweight='bold')
fig.text(.055,.91,'An improved pressure derivative does not repair the free-boundary endpoint or establish a cavitation benchmark.',fontsize=12.5)
ax=axs[0,0]
for i,row in enumerate(ablation['cases']):
    ax.plot([p['x'] for p in row['height']],[p['h'] for p in row['height']],label=f"N = {row['N']}")
ax.set_xlim(.39,.411);ax.set_ylim(-.00015,.0065);ax.set_xticks([.39,.395,.4,.405,.41]);style(ax,ylabel='Cavity height, h/c');ax.set_title('(a) Closure zoom (unequal axis scales)',loc='left');ax.legend(ncol=2,fontsize=9.5)
ax=axs[0,1];ax.plot([r['N'] for r in ablation['cases']],[r['closureTurningAngleDeg'] for r in ablation['cases']],'o-',color='#D55E00')
style(ax,'Total boundary panels, N','Discrete endpoint turn (degrees)');ax.set_title('(b) Endpoint corner grows on refinement',loc='left')
ax=axs[1,0]
for order,col in [(3,'#0072B2'),(5,'#009E73')]:
    rows=[r for r in report['manufacturedGradientStudy'] if r['stencil']==order]
    ax.loglog([r['panels'] for r in rows],[r['maxAllPoints'] for r in rows],'o-',color=col,label=f'{order}-point gradient')
style(ax,'Curved-contour panels','Maximum derivative error, all points');ax.set_xticks([20,40,80,160]);ax.get_xaxis().set_major_formatter(matplotlib.ticker.ScalarFormatter());ax.get_xaxis().set_minor_formatter(matplotlib.ticker.NullFormatter());ax.set_title('(c) Nonlinear manufactured-potential test',loc='left');ax.legend(fontsize=10)
ax.text(.04,.08,r'$\Phi(s)=\sin(1.3s)+0.2s^3$',transform=ax.transAxes,fontsize=12)
ax=axs[1,1];length=np.linspace(.05,.5,200)
ax.plot(length,(2-length+2*np.sqrt(1-length))/np.sqrt(length*(1-length)),color='#0072B2',label=r'Acosta: $\sigma/(2\alpha)$')
ax.plot(length,1+1/np.sqrt(1-length),color='#D55E00',label=r'Acosta: $C_L/(\pi\alpha)$')
style(ax,'Prescribed flat-plate cavity length, l/c','Dimensionless reference coefficient');ax.set_title('(d) Independent analytic reference ONLY',loc='left');ax.legend(fontsize=10)
footer(fig,'Manufactured-potential check includes one-sided endpoint derivatives and a nonzero freestream decomposition; it tests the gradient code.\n'
       'Acosta (1955), printed pp.5-6 Eqs.(9),(12): sharp-edge flat plate, linearized flow. This finite-thickness solver has NOT passed that limit.\n'
       'Source: pressure-ablation.json, verification.json and the primary Caltech report. No experimental-validation claim is made.')
figures.append(('05_endpoint_and_independent_benchmark_gate',fig))

pdfpath=args.output/'Hydrofoil_Cavitation_Prototype_Verification.pdf'
with PdfPages(pdfpath,metadata={'Title':'Hydrofoil Cavitation Lab - numerical prototype verification','Author':'MIE 446 research prototype','Subject':'Analytic fully wetted verification; exploratory partial-sheet cavity; no experimental validation'}) as pdf:
    for name,fig in figures:
        fig.savefig(args.output/(name+'.png'),dpi=240)
        fig.savefig(args.output/(name+'.svg'))
        pdf.savefig(fig)
        plt.close(fig)
print(json.dumps({'pdf':str(pdfpath),'png':[str(args.output/(name+'.png')) for name,_ in figures]},indent=2))
