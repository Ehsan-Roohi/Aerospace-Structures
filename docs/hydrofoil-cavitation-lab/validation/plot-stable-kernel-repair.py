from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
if 'font.enable_last_resort' in matplotlib.rcParams:
    matplotlib.rcParams['font.enable_last_resort'] = False
if 'mathtext.fallback' in matplotlib.rcParams:
    matplotlib.rcParams['mathtext.fallback'] = None
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter, NullFormatter

out = Path(__file__).resolve().parent
data = json.loads((out/'stable-kernel-repair-profiles.json').read_text(encoding='utf-8'))
old, new, meshes = data['previous64'], data['stable64'], data['meshes']
plt.rcParams.update({'font.family':'Times New Roman','font.size':13,'axes.labelsize':14,'axes.titlesize':15,'legend.fontsize':12})
fig,ax=plt.subplots(3,1,figsize=(12,11),layout='constrained')
for r,label,color in [(old,'Previous kernel · 64 cavity panels','#8b4726'),(new,'Stable kernel · 64 cavity panels','#075eb7')]:
    ax[0].semilogy(range(len(r['history'])),r['history'],'o-',label=label,color=color,markersize=5)
ax[0].axhline(1e-10,color='black',ls='--',lw=1,label='Unchanged requested tolerance')
ax[0].set(xlabel='Newton iteration',ylabel='Maximum nodal speed residual / U',title='Same discrete equations; cancellation removed')
ax[0].yaxis.set_major_formatter(FuncFormatter(lambda v,pos: ('1e'+str(int(np.log10(v)))) if v>0 else '0'))
ax[0].yaxis.set_minor_formatter(NullFormatter())
ax[0].legend(loc='upper right');ax[0].grid(alpha=.25)
for n,color in [(64,'#8b4726'),(192,'#075eb7'),(256,'#117b42')]:
    r=meshes[str(n)]['result'];a=meshes[str(n)]['audit'];p=a['profiles']
    mask=np.array([(r['Nf']<=j<r['Nf']+r['Nc']) for j in p['panel']])
    xy=np.array(p['points'])[mask];vn=np.array(p['normal_U'])[mask];vt=np.array(p['tangent_U'])[mask]
    x=xy[:,0]/r['L'];cp=1-vn*vn-vt*vt+r['sigma']
    ax[1].plot(x,vn,'.-',ms=2,lw=.8,color=color,label=f'{n} cavity panels')
    ax[2].plot(x,cp,'.-',ms=2,lw=.8,color=color,label=f'{n} cavity panels')
for k,limit in [(1,.01),(2,.02)]:
    ax[k].axhline(0,color='black',lw=.7)
    ax[k].axhline(limit,color='grey',ls='--',lw=.8,label='Unchanged numerical limits')
    ax[k].axhline(-limit,color='grey',ls='--',lw=.8)
    ax[k].set_xlim(0,1);ax[k].grid(alpha=.25);ax[k].legend(loc='upper center',ncol=4,frameon=True,fontsize=10)
ax[1].set(xlabel='Cavity axial position x / L',ylabel='Direct normal velocity / U',title='Every retained near-rim sample; no endpoint bands removed')
ax[2].set(xlabel='Cavity axial position x / L',ylabel='Direct Cp + sigma',title='Pressure consistency is still unqualified on the denser sample grid')
fig.suptitle('Axisymmetric disk cavity, L/R = 8 · numerical kernel repair',fontsize=18)
fig.savefig(out/'stable-kernel-repair.png',dpi=180)
fig.savefig(out/'stable-kernel-repair.svg')
plt.close(fig)
print('Saved complete numerical comparison and full sample dataset.')
