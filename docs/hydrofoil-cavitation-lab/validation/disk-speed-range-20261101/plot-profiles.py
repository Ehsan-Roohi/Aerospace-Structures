from pathlib import Path
import os, sys, json, gzip
sys.dont_write_bytecode=True
out=Path(__file__).resolve().parent
os.environ.setdefault('MPLCONFIGDIR',str(out/'.mpl-cache'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

out=Path(__file__).resolve().parent
plt.rcParams.update({'font.size':12,'axes.labelsize':12,'axes.titlesize':13,'legend.fontsize':10.5,'xtick.labelsize':11,'ytick.labelsize':11,'font.family':'DejaVu Sans','savefig.facecolor':'white'})
def read_raw(name):
    with gzip.open(out/(name+'-full.json.gz'),'rt',encoding='utf8') as f:
        return json.load(f)

colors=['#1f5a99','#158467','#be6a15','#982c54']
cases=[read_raw(f'U{u}-Nc32-auto') for u in [37,40,50,60]]
fig,ax=plt.subplots(figsize=(11,5.8))
for u,r,c in zip([37,40,50,60],cases,colors):
    ax.plot([p['x']*1000 for p in r['profile']['full']],[p['r']*1000 for p in r['profile']['full']],color=c,lw=2,label=f'{u} m/s · σ={r["targetSigma"]:.5f} · L/Rn={r["final"]["L"]:.3f}')
ax.set(xlabel='Axial position x (mm)',ylabel='Cavity radius r (mm)',title='Fresh automatic disk BEM · Nc32 · disk radius 10 mm')
ax.grid(alpha=.23);fig.legend(*ax.get_legend_handles_labels(),loc='lower center',bbox_to_anchor=(.52,.06),ncols=2);ax.set_ylim(bottom=0)
fig.text(.11,.015,'Computed Riabouchinsky envelopes: the rear half ends on an artificial image disk. Axes use different scales.',fontsize=10)
fig.tight_layout(rect=(0,.19,1,1));fig.savefig(out/'speed-envelope-profiles.png',dpi=180);fig.savefig(out/'speed-envelope-profiles.svg');plt.close(fig)

r32=cases[-1];r128=read_raw('U60-Nc128-auto');hi=read_raw('U60-Nc128-higher-quadrature-field')
fig,axs=plt.subplots(2,1,figsize=(11,8.5),sharex=True)
for r,a,c,label in [(r32,r32['final']['fieldAudit'],'#be6a15','Nc32 · standard field audit'),(r128,r128['final']['fieldAudit'],'#1f5a99','Nc128 · standard field audit'),(r128,hi['fieldAudit'],'#158467','Nc128 · higher quadrature 64/24')]:
    p=a['profiles'];L=r['final']['L'];xs=np.array([q[0]/L for q in p['points']]);pan=np.array(p['panel']);mask=(pan>=r['final']['Nf'])&(pan<r['final']['Nf']+r['final']['Nc'])
    axs[0].plot(xs,np.array(p['normal_U']),'-o',color=c,lw=.85,ms=2,alpha=.75,label=label)
    axs[1].plot(xs[mask],p['cavityCpPlusSigmaDefect'],'-o',color=c,lw=.85,ms=2,alpha=.75,label=label)
for ax,lim in zip(axs,[.01,.02]):
    ax.axhline(0,color='#666666',lw=.7)
    for sign in [-1,1]:ax.axhline(sign*lim,color='#555555',ls='--',lw=1)
    ax.grid(alpha=.2)
axs[0].set(ylabel='Signed normal velocity / U',title='60 m/s · same pressure target · signed direct exterior field')
axs[0].legend(loc='lower center',ncols=1)
axs[1].set(xlabel='Axial position x / solved image separation L',ylabel='Signed cavity dynamic Cp residual')
fig.text(.11,.012,'All 15 off-node fractions retained on every panel. Dashed lines show unchanged admission limits; these are computed fields, not experiments.',fontsize=9.5)
fig.tight_layout(rect=(0,.035,1,1));fig.savefig(out/'U60-signed-field-comparison.png',dpi=180);fig.savefig(out/'U60-signed-field-comparison.svg');plt.close(fig)
print('Saved actual shape and signed field comparisons; no bars, smoothing or clipped samples.')
