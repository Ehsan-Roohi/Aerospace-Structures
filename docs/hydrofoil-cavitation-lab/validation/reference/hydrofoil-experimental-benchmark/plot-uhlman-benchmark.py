"""Retain separate experimental pressure bases; no present-solver prediction.

The private source scan is not copied into the derived figure. Manual readings
can be audited against the pixel/image hashes in the compact provenance JSON.
"""
import csv, hashlib, json, math
import os
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
font_manager.fontManager.addfont('C:/Windows/Fonts/times.ttf')
font_manager.fontManager.addfont('C:/Windows/Fonts/timesbd.ttf')

P = Path('\\\\?\\' + str(Path(__file__).resolve().parent))
base = json.loads((P / 'uhlman-alpha4-open-points.json').read_text())
origin = np.array(base['calibration']['origin'])
matrix = np.array(base['calibration']['affinePixelMatrix'])

# Filled markers are read separately from the already-recorded OPEN markers.
# The marker at (684,589) overlaps another stroke and is retained as ambiguous.
filled = [[587,768], [607,750], [630,710], [658,668],
          [699,597], [715,549], [753,451], [774,265]]
ambiguous = [[684,589]]
points = []
for series, pixels, pressure, resolved in [
    ('open-cavity-pressure', [p['pixel'] for p in base['points']], 'measured cavity pressure Pc', True),
    ('filled-vapor-pressure', filled, 'vapor pressure Pv', True),
    ('overlapped-unassigned', ambiguous, 'unassigned: filled or open not reliably resolved', False),
]:
    for i, xy in enumerate(pixels, 1):
        ratio, length = np.linalg.solve(matrix, np.array(xy) - origin)
        sigma = math.radians(4) / ratio
        points.append(dict(
            id=f'{series}-{i}', series=series, pixel=xy,
            alpha_over_sigma=float(ratio), cavity_length_over_chord=float(length),
            sigma_using_alpha_radians=float(sigma),
            sigma_reading_bounds=[math.radians(4)/(ratio+.001), math.radians(4)/(ratio-.001)],
            measured_pressure_basis=pressure, resolved_marker=resolved,
            length_below_reported_instability_threshold=bool(length < .75),
            is_measurement_not_current_prediction=True))

data = {k: base[k] for k in ['source', 'geometry', 'flow', 'calibration', 'manualDigitizationBounds',
                           'sigma_conversion_assumption', 'limitations']}
data.update(
    points=points,
    extraction=dict(openPcResolved=5, filledPvResolved=8, overlappedUnassigned=1,
        note='All resolved data markers retained. The filled/open marker near the overlapping short-cavity strokes is preserved without assigning a pressure basis. The extra triangle pair within the legend is not data.',
        theoretical_curves='Not digitized: curves overlap at short cavity lengths; no sampled curve has been invented.'),
    current_solver_comparison=dict(status='NOT COMPLETED', prediction=None,
        reason='A matched custom parabolic profile and an accepted cavity solution are not available. No NACA profile substituted.'))
(P/'uhlman-alpha4-all-markers.json').write_text(json.dumps(data, indent=2))
fields=['id','series','pixel','alpha_over_sigma','cavity_length_over_chord','sigma_using_alpha_radians',
        'measured_pressure_basis','resolved_marker','length_below_reported_instability_threshold']
with (P/'uhlman-alpha4-all-markers.csv').open('w', newline='') as f:
    writer=csv.DictWriter(f, fieldnames=fields); writer.writeheader()
    writer.writerows({k:p[k] for k in fields} for p in points)

plt.rcParams.update({'font.family':'Times New Roman','font.size':13,'text.color':'black',
                    'axes.labelcolor':'black','xtick.color':'black','ytick.color':'black',
                    'axes.titlesize':15,'legend.fontsize':12,'svg.fonttype':'none',
                    'font.enable_last_resort':False})
fig, axes=plt.subplots(1,2,figsize=(13,5.3),layout='constrained')
for ax, xkey in zip(axes, ['alpha_over_sigma','sigma_using_alpha_radians']):
    for series, marker, label, filled_marker in [
        ('open-cavity-pressure','^','Experiment: measured cavity pressure',False),
        ('filled-vapor-pressure','^','Experiment: vapor pressure',True),
        ('overlapped-unassigned','x','Overlapped marker: basis unresolved',True),
    ]:
        subset=[p for p in points if p['series']==series]
        x=np.array([p[xkey] for p in subset]); y=np.array([p['cavity_length_over_chord'] for p in subset])
        if xkey=='alpha_over_sigma': xerr=.001
        else:
            lo=np.array([p['sigma_reading_bounds'][0] for p in subset])
            hi=np.array([p['sigma_reading_bounds'][1] for p in subset])
            xerr=np.array([x-lo,hi-x])
        opts=dict(fmt=marker,linestyle='none',markersize=8,capsize=3,color='black',
                  ecolor='0.60',elinewidth=.8,label=label,zorder=4,
                  markeredgewidth=1.2)
        if marker=='^': opts.update(markerfacecolor='black' if filled_marker else 'white')
        ax.errorbar(x,y,yerr=.01,xerr=xerr,**opts)
    ax.axhline(.75,color='0.3',ls=':',lw=1.2)
    ax.text(.025,.83,'Reported instability above Lc/c = 0.75',transform=ax.get_yaxis_transform(),fontsize=11)
    ax.set_ylim(.035,.89); ax.margins(x=.09); ax.grid(alpha=.2); ax.set_ylabel('Cavity length Lc/c')
    ax.set_xlabel('Original plotted ratio α/σ' if xkey=='alpha_over_sigma' else 'Cavitation number σ (assuming α in radians)')
axes[0].set_title('Original measurement coordinates')
axes[1].set_title('Converted pressure-based coordinates')
axes[0].legend(loc='lower right',framealpha=.95)
fig.suptitle('Plano-convex hydrofoil · t/c = 0.06 · α = 4°\nUhlman–Jiang (1977), Fig. 3 · experimental data only',fontsize=16)
fig.savefig(P/'uhlman-alpha4-experimental-benchmark.png',dpi=200)
fig.savefig(P/'uhlman-alpha4-experimental-benchmark.svg')
plt.close(fig)
print(json.dumps(data['extraction'],indent=2))
