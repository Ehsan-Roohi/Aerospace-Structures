"""Plot the developed-cavity spatial evidence, including every off-grid sample.

Needs NumPy and Matplotlib. Pass --deps PATH for an isolated dependency folder.
No fitted continuum/extrapolation or experimental data are manufactured.
"""
import argparse
import json
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--deps', type=Path)
args = parser.parse_args()
here = Path(__file__).resolve().parent
if args.deps:
    sys.path.insert(0, str(args.deps))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

if 'font.enable_last_resort' in plt.rcParams:
    plt.rcParams['font.enable_last_resort'] = False

plt.rcParams.update({
    'font.family': 'serif', 'font.serif': ['Times New Roman', 'DejaVu Serif'],
    'font.size': 12, 'axes.labelsize': 13, 'axes.titlesize': 14,
    'legend.fontsize': 11.5, 'xtick.labelsize': 11, 'ytick.labelsize': 11,
    'svg.fonttype': 'none', 'axes.spines.top': False, 'axes.spines.right': False,
})
colours = {16: '#b65b00', 32: '#7a5195', 64: '#007b83', 128: '#005bbb'}
seq = {n: json.loads((here / f'axisymmetric-cavity-L8-N{n}.json').read_text())
       for n in colours}

fig, axes = plt.subplots(2, 2, figsize=(13, 8.6), constrained_layout=True)
for n, result in seq.items():
    scale = result['inputs']['radius']
    nodes = result['nodes']
    cavity = [p for p in nodes if p['region'] == 'cavity']
    axes[0, 0].plot([p['x']/scale for p in cavity], [p['r']/scale for p in cavity],
                    color=colours[n], lw=1.8, label=f'Current solver: {n} cavity bands')
    samples = sorted(result['offCentroid'], key=lambda p: p['x'])
    x = np.array([p['x'] for p in samples])
    dynamic = np.array([p['cp']+result['sigma'] for p in samples])
    normal = np.array([p['normal'] for p in samples])
    axes[0, 1].plot(x, dynamic, color=colours[n], lw=1.0, marker='.', ms=2.5)
    axes[1, 0].plot(x, normal, color=colours[n], lw=1.0, marker='.', ms=2.5)
    disk = [p for p in result['surface'] if p['region'] == 'disk']
    axes[1, 1].plot([p['r']/scale for p in disk], [p['cp'] for p in disk],
                    color=colours[n], lw=1.6, marker='.', ms=3.5)

axes[0, 0].set(title='Computed cavity meridian', xlabel='Axial position x/R',
               ylabel='Cavity radius r/R')
axes[0, 0].legend(loc='upper right', frameon=True)
axes[0, 0].axhline(1, color='0.5', lw=.9, ls=':')
axes[0, 0].text(.03, .04, 'Physical disk at x/R = 0; image disk at x/R = 8',
                transform=axes[0, 0].transAxes, fontsize=10.5)
axes[0, 1].axhline(0, color='black', ls='--', lw=1.2, label='Free-surface target')
axes[0, 1].set(title='Dynamic condition away from fitted centroids',
               xlabel='Axial position x/R', ylabel='Signed pressure residual Cp + σ')
axes[0, 1].legend(loc='upper right')
axes[1, 0].axhline(0, color='black', ls='--', lw=1.2)
axes[1, 0].set(title='No-penetration away from fitted centroids',
               xlabel='Axial position x/R', ylabel='Signed normal velocity un/U')
axes[1, 1].set(title='Physical front-disk pressure', xlabel='Disk radius r/R',
               ylabel='Pressure coefficient Cp')
for ax in axes.flat:
    ax.grid(alpha=.22)
    ax.margins(x=.025)
fig.suptitle('Developed axisymmetric cavity: L/R = 8\n'
             'Research prototype; off-grid accuracy not admitted; no experimental comparison',
             fontsize=16)
fig.savefig(here / 'axisymmetric-cavity-refinement.png', dpi=190)
fig.savefig(here / 'axisymmetric-cavity-refinement.svg')
plt.close(fig)

# This view deliberately preserves every sample next to detachment/image closure.
fig, axes = plt.subplots(1, 2, figsize=(12.8, 4.8), constrained_layout=True)
for n, result in seq.items():
    samples = sorted(result['offCentroid'], key=lambda p: p['x'])
    x = np.array([p['x'] for p in samples])
    dynamic = np.array([p['cp']+result['sigma'] for p in samples])
    for ax in axes:
        ax.plot(x, dynamic, color=colours[n], lw=1.3, marker='o', ms=3.2,
                mfc='white', label=f'Current solver: {n} bands')
        ax.axhline(0, color='black', ls='--', lw=.8)
        ax.grid(alpha=.22)
        ax.set(xlabel='Axial position x/R', ylabel='Signed Cp + σ')
axes[0].set(xlim=(0, 1), title='Physical disk detachment: all samples')
axes[1].set(xlim=(7, 8), title='Image-disk attachment: all samples')
axes[0].legend(loc='lower right')
fig.suptitle('Endpoint behaviour remains unresolved; no data are clipped or removed', fontsize=15)
fig.savefig(here / 'axisymmetric-cavity-endpoints.png', dpi=190)
fig.savefig(here / 'axisymmetric-cavity-endpoints.svg')
plt.close(fig)
for name in ['axisymmetric-cavity-refinement.svg', 'axisymmetric-cavity-endpoints.svg']:
    svg_path = here / name
    svg_path.write_text('\n'.join(line.rstrip() for line in svg_path.read_text(encoding='utf-8').splitlines())+'\n', encoding='utf-8')
print(here / 'axisymmetric-cavity-refinement.png')
print(here / 'axisymmetric-cavity-endpoints.png')
