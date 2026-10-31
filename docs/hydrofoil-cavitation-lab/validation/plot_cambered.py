"""Plot full signed profiles from recorded independent numerical checks."""
import json
import sys
from pathlib import Path
import argparse
p = argparse.ArgumentParser()
p.add_argument('--deps', required=True)
args = p.parse_args()
sys.path.insert(0, args.deps)
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import fontManager
for name in ['arial.ttf', 'arialbd.ttf']:
    f = Path('C:/Windows/Fonts') / name
    if f.exists(): fontManager.addfont(str(f))
plt.rcParams.update({'font.family':'Arial','font.size':13,'axes.titlesize':15,
                     'axes.labelsize':14,'legend.fontsize':12,'svg.fonttype':'none'})
root=Path(__file__).resolve().parent
data=json.loads((root/'cambered-independent.json').read_text())
fig,axs=plt.subplots(2,2,figsize=(13.2,9.0),sharex=True)
for col,code in enumerate(['2412','4412']):
    row=next(r for r in data['rows'] if r['code']==code and r['alpha']==4 and r['N']==640)
    s=row['samples']
    for side,style in [('upper','-'),('lower','--')]:
        a=s[:len(s)//2] if side=='upper' else s[len(s)//2:]
        a.sort(key=lambda v:v['x'])
        x=[v['x'] for v in a]
        axs[0,col].plot(x,[v['currentCp'] for v in a],style,color='#075eb7',lw=1.8,
                        label=f'Current solver · {side}')
        axs[0,col].plot(x,[v['independentCp'] for v in a],style,color='#b45b12',lw=1.3,
                        label=f'Independent Hess–Smith · {side}')
        axs[1,col].plot(x,[v['currentCp']-v['independentCp'] for v in a],style,
                        color='#075eb7',lw=1.6,label=side.capitalize())
    axs[0,col].set_title(f'NACA {code} · α = 4° · 640 boundary panels')
    axs[0,col].invert_yaxis()
    axs[0,col].set_ylabel('Signed pressure coefficient Cp')
    axs[1,col].set_ylabel('Cp current − independent')
    axs[1,col].set_xlabel('Physical x/c')
    axs[1,col].axhline(0,color='black',lw=.8)
    for ax in axs[:,col]:
        ax.grid(alpha=.22);ax.margins(x=.025);ax.legend(loc='best',framealpha=.96)
fig.suptitle('Cambered-section verification: two independent fully wetted discretizations',y=.995,fontsize=18)
fig.text(.5,.014,'All panel-centre values retained, including both trailing-edge samples. Not cavitating-flow or experimental validation.',ha='center',fontsize=12)
fig.tight_layout(rect=[0,.04,1,.97])
for ext in ['png','svg']: fig.savefig(root/f'cambered-independent-cp.{ext}',dpi=220)
plt.close(fig)
