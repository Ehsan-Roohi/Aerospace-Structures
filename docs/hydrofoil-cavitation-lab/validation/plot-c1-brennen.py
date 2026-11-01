"""Replot matched disk Cp from archived runs and a digitized external numerical reference.
No reference-pressure fitting, endpoint removal or experimental validation is performed.
"""
from pathlib import Path
import csv, json, hashlib
import numpy as np
import matplotlib
matplotlib.use('Agg')
if 'font.enable_last_resort' in matplotlib.rcParams:
    matplotlib.rcParams['font.enable_last_resort'] = False
if 'mathtext.fallback' in matplotlib.rcParams: matplotlib.rcParams['mathtext.fallback'] = None
import matplotlib.pyplot as plt

here = Path(__file__).resolve().parent
if __import__('os').name == 'nt': here = Path('\\\\?\\' + str(here))
old = here / 'reference/brennen1969-disk-theory'
new = here / 'reference/c1-brennen'
ref = list(csv.DictReader((old / 'brennen-1969-theory-cp.csv').open(encoding='utf-8')))
plt.rcParams.update({'font.family': ['Times New Roman', 'DejaVu Serif', 'serif'], 'font.size': 14,
                     'axes.labelsize': 15, 'axes.titlesize': 16, 'legend.fontsize': 12})
fig, axes = plt.subplots(1, 2, figsize=(15, 6), layout='constrained')
summary = []
def direct(r):
    p = r['fieldAudit']['profiles']
    a = sorted((xy[1], 1-vn*vn-vt*vt) for xy, j, vn, vt in
               zip(p['points'], p['panel'], p['normal_U'], p['tangent_U']) if j < r['Nf'])
    return np.array(a)
for ax, sigma in zip(axes, [.3, .7]):
    points = sorted((float(p['r_R']), float(p['Cp'])) for p in ref if float(p['sigma']) == sigma)
    x, y = np.array(points).T
    for n, color in [(64, '#b6760a'), (128, '#075eb7')]:
        r = json.loads((new / f'sigma-{sigma:.1f}-Nc{n}.json').read_text())
        d = direct(r)
        ax.plot(d[:, 0], d[:, 1], color=color, lw=2,
                label=f'Current C1 solver: Nc={n} ({r["N"]} total panels)')
        rms = float(np.sqrt(np.mean((np.interp(x, d[:, 0], d[:, 1])-y)**2)))
        summary.append({'targetSigma': sigma, 'Nc': n, 'N': r['N'], 'L_R': r['L'],
                        'sigma': r['sigma'], 'CD': r['CD'], 'readingRmsCp': rms,
                        'maxNormal_U': r['fieldAudit']['maxNormal_U'],
                        'maxDynamicCpDefect': r['fieldAudit']['maxCavityDynamicCpResidual'],
                        'referenceKind': 'Brennen1969 digitized theoretical disk pressure',
                        'experimentalValidation': False})
    baseline = json.loads((old / f'sigma-{sigma:.1f}-Nc128.json').read_text())
    d = direct(baseline)
    ax.plot(d[:, 0], d[:, 1], '--', color='#846052', lw=1.5,
            label='Previous 0.2.1 polygon: Nc=128')
    ax.errorbar(x, y, xerr=.006, yerr=.012, fmt='o', color='black',
                mfc='white', mec='black', ms=6.5, capsize=3.5, elinewidth=.9,
                label='Brennen (1969): theoretical curve, digitized')
    ax.set(xlim=(-.025, 1.025), ylim=(-.84, 1.12), xlabel='Front-disk radius r / R',
           ylabel='Signed pressure coefficient Cp', title=f'Matched cavitation number sigma={sigma:.1f}')
    ax.grid(alpha=.25)
    ax.legend(loc='lower left', framealpha=.95)
fig.suptitle('External numerical comparison: sharp disk, Riabouchinsky image closure', fontsize=17)
fig.savefig(here / 'c1-brennen-cp.png', dpi=180)
fig.savefig(here / 'c1-brennen-cp.svg')
(new / 'comparison-summary.json').write_text(json.dumps({
    'scope': 'Current C1 kernel compared with published theoretical Cp, not experiments. L/R solves prescribed sigma; Cp is never fitted.',
    'readingBounds': {'r_R': .006, 'Cp': .012}, 'referenceCoverage': 'Only visible digitized samples; no extrapolated reference points.',
    'rows': summary}, indent=2), encoding='utf-8')
print('Matched C1 disk comparison replotted from full direct-field samples.')
