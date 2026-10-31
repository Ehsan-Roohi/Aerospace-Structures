"""Plot spatial distributions; retain polar bands and all test points."""
import json
import sys
from pathlib import Path
workspace = Path(__file__).resolve().parents[7]
deps = workspace / 'output/cavitation-feasibility-2026-10-30/plot-deps'
sys.path.insert(0, str(deps))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

data = json.loads(Path(__file__).with_name('axisymmetric-verification.json').read_text())
out = workspace / 'output/cavitation-axisymmetric-2026-10-30/figures'
out.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({'font.family': 'serif', 'font.serif': ['Times New Roman', 'DejaVu Serif'],
                     'font.size': 12, 'axes.labelsize': 13, 'axes.titlesize': 15,
                     'legend.fontsize': 11.5, 'xtick.labelsize': 11, 'ytick.labelsize': 11,
                     'svg.fonttype': 'none', 'axes.spines.top': False, 'axes.spines.right': False})
colors = {32: '#d17a00', 128: '#0077b6', 512: '#8f2d56'}

fig, axes = plt.subplots(2, 2, figsize=(12.5, 8.2), sharex='col')
for col, key in enumerate(['sphere', 'prolate']):
    seq = data['meshStudies'][key]
    last = seq[-1]['result']
    alpha = last['inputs']['radius'] / (last['inputs']['length'] / 2)
    theta = np.linspace(0, np.pi, 801)
    x = (1 - np.cos(theta)) / 2
    amp = last['reference']['equatorialSpeedRatio']
    exact = 1 - (amp * np.sin(theta) / np.hypot(np.sin(theta), alpha * np.cos(theta)))**2
    axes[0, col].plot(x, exact, color='black', lw=2.2, label='Exact potential flow')
    for n in colors:
        row = next(v for v in seq if v['panels'] == n)
        surf = row['result']['surface']
        a = row['result']['inputs']['length'] / 2
        xp = np.array([p['x'] for p in surf]) / (2*a) + .5
        cp = np.array([p['cp'] for p in surf])
        ref = np.array([p['referenceCp'] for p in surf])
        axes[0, col].plot(xp, cp, color=colors[n], lw=1.25, ls={32: '--',128: '-.',512:'-'}[n], label=f'Ring BEM, N = {n}')
        axes[1, col].plot(xp, cp-ref, color=colors[n], lw=1.5, label=f'N = {n}')
    title = 'Sphere' if key == 'sphere' else 'Prolate spheroid, length / diameter = 3'
    axes[0, col].set_title(title)
    axes[0, col].set_ylabel(r'Pressure coefficient $C_p$')
    axes[1, col].set_ylabel(r'Signed error $C_p-C_{p,exact}$')
    axes[1, col].set_xlabel(r'Axial position from nose, $x/L$')
    for ax in axes[:, col]:
        ax.grid(True, alpha=.23); ax.set_xlim(0,1)
    axes[1, col].axhline(0,color='black',lw=.7)
    axes[0,col].legend(loc='upper center',framealpha=.97)
fig.suptitle('True 3-D axisymmetric BEM: independent analytic pressure verification',fontsize=17,y=.98)
fig.text(.5,.017,'Constant source density on conical bands; analytic ring integration. All centroid samples retained. Fully wetted only.',ha='center',fontsize=11)
fig.tight_layout(rect=[0,.04,1,.95])
for ext in ['png','svg']: fig.savefig(out/f'axisymmetric-cp-verification.{ext}',dpi=220)
plt.close(fig)

fig, axes=plt.subplots(1,2,figsize=(12.5,4.9),sharey=True)
for col,key in enumerate(['sphere','prolate']):
    seq=data['meshStudies'][key]
    for n in colors:
        row=next(v for v in seq if v['panels']==n)
        result=row['result']; a=result['inputs']['length']/2
        nodes=result['nodes']
        xp=np.array([nodes[i]['x']*.75+nodes[i+1]['x']*.25 for i in range(n)])/(2*a)+.5
        residual=row['offCentroidSamples']['quarter']
        axes[col].plot(xp,residual,color=colors[n],lw=1.4,label=f'N = {n}')
    axes[col].set_title('Sphere' if key=='sphere' else 'Prolate spheroid, 3:1')
    axes[col].set_xlabel(r'Axial position from nose, $x/L$')
    axes[col].axhline(0,color='black',lw=.7);axes[col].grid(True,alpha=.23)
    axes[col].legend(loc='upper right',framealpha=.97); axes[col].set_xlim(0,1)
axes[0].set_ylabel(r'Off-collocation normal residual $v_n/U$')
fig.suptitle('Independent boundary check at one-quarter of every meridional band',fontsize=17,y=.98)
fig.text(.5,.025,'Reintegrated at quadrature order 48. Algebraic collocation residual is near machine precision; these physical discretization errors are larger.',ha='center',fontsize=10.5)
fig.tight_layout(rect=[0,.055,1,.94])
for ext in ['png','svg']:fig.savefig(out/f'axisymmetric-boundary-residual.{ext}',dpi=220)
plt.close(fig)
print(out)
