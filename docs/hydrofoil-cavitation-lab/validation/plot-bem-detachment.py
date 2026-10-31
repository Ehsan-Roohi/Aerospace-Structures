"""Plot complete computed profiles; no pressure clipping or omitted endpoints."""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

if 'font.enable_last_resort' in plt.rcParams:
    plt.rcParams['font.enable_last_resort'] = False
plt.rcParams.update({'font.family': 'Times New Roman', 'font.size': 13,
                     'axes.titlesize': 14, 'axes.labelsize': 13, 'legend.fontsize': 11,
                     'svg.fonttype': 'none', 'axes.formatter.use_mathtext': False})
root = Path(__file__).resolve().parent
data = json.loads((root/'bem-detachment-comparison.json').read_text(encoding='utf-8'))
base = next(p for p in data['potential'] if p['id']=='baseline-N64')
auto = next(p for p in data['potential'] if p['id']=='opus-N64')
ref = data['independent'][-1]
curves = [(base, '#333333', '--', 'Current solver: prescribed detachment'),
          (auto, '#005daa', '-', 'Current solver: automatic detachment'),
          (ref, '#a33b17', '-.', 'Independent nodal-vortex reference: 368 panels')]
fig, ax = plt.subplots(2,2,figsize=(14,9.5), layout='constrained')
for result, color, style, label in curves[:2]:
    gap=result['gap']
    ax[0,0].plot([p['x'] for p in gap], [p['h'] for p in gap], color=color,ls=style,lw=1.8,label=label)
ax[0,0].set(title='Computed cavity gap: complete extent',xlabel='Chord position x/c',ylabel='Vertical gap h/c')
ax[0,0].text(.025,.95,'Line colours and styles: shared legend below',transform=ax[0,0].transAxes,va='top',fontsize=11)

for row, side, title in [(ax[0,1],1,'Upper wetted surface: complete extent'),
                         (ax[1,0],-1,'Lower wetted surface: complete extent')]:
    for result,color,style,label in curves:
        pressure=sorted((p for p in result['pressure'] if side*p['y']>0),key=lambda p:p['x'])
        x=[p['x'] for p in pressure]
        margin=[np.nan if p['cavity'] else p['margin'] for p in pressure]
        row.plot(x,margin,color=color,ls=style,lw=1.6,label=label)
        # Every actual endpoint is retained as a visible marker.
        wet=[p for p in pressure if not p['cavity']]
        row.plot([wet[0]['x'],wet[-1]['x']],[wet[0]['margin'],wet[-1]['margin']],'.',color=color,ms=6)
    row.axhline(0,color='#777777',lw=1)
    row.set(title=title,xlabel='Chord position x/c',ylabel='Wetted Cp + sigma')

for result,color,style,label in curves:
    pressure=sorted((p for p in result['pressure'] if p['y']>0 and not p['cavity'] and p['x']<=.012),key=lambda p:p['x'])
    ax[1,1].plot([p['x'] for p in pressure],[p['margin'] for p in pressure],color=color,ls=style,lw=1.8,marker='.',ms=4,label=label)
ax[1,1].axhline(0,color='#777777',lw=1)
ax[1,1].set(title='Detachment detail: actual upstream samples',xlabel='Chord position x/c',ylabel='Wetted Cp + sigma',ylim=(-.085,.10))
ax[1,1].text(.03,.04,'Negative = below vapour pressure\nAll three branches still fail the pressure screen',transform=ax[1,1].transAxes,fontsize=11,color='#8d201a')
ax[1,0].legend(frameon=False,loc='lower center',bbox_to_anchor=(.5,.06),fontsize=10.5)
for a in ax.flat:
    a.grid(alpha=.2)
    a.ticklabel_format(style='plain',axis='both',useOffset=False,useMathText=False)
fig.suptitle('Smooth-detachment repair: numerical cross-check, not experimental validation\nNACA 0012; angle 4 degrees; cavity length 0.4c; recovery fraction 0.15',fontsize=17)
fig.savefig(root/'bem-detachment-comparison.png',dpi=170)
fig.savefig(root/'bem-detachment-comparison.svg')
plt.close(fig)
print('Saved complete pressure profiles, full gap, and separately labelled onset detail.')
