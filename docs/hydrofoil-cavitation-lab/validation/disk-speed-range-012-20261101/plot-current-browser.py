from pathlib import Path
import gzip,json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
P=Path(__file__).resolve().parent
r=json.loads(gzip.decompress((P/'production-browser-U80-auto-full.json.gz').read_bytes()))
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':13,'axes.titlesize':15,'axes.labelsize':13,'legend.fontsize':12,'svg.fonttype':'none'})
fig,ax=plt.subplots(3,1,figsize=(11.7,13.4),constrained_layout=True)
colors=['#ba5d0a','#075eb7'];labels=['Current solver: 32 bands (field failed)','Current solver: 128 bands (field passed)']
for v,color,label in zip([r['coarseDiagnostic'],r['fineDiagnostic']],colors,labels):
 p=v['profile']['full'];x=[z['xOverRn'] for z in p];y=[z['rOverRn'] for z in p]
 ax[0].plot(x,y,color=color,label=label,lw=2);ax[0].plot(x,[-z for z in y],color=color,lw=2)
 f=v['final']['fieldAudit']['profiles'];s=np.array(f['arclength_R']);ax[1].plot(s,f['normal_U'],color=color,lw=1.3,label=label)
 mask=np.array(f['panel'])>=v['final']['Nf'];mask &= np.array(f['panel'])<v['final']['Nf']+v['final']['Nc'];cs=s[mask];ax[2].plot(cs,f['cavityCpPlusSigmaDefect'],color=color,lw=1.3,label=label)
for z,limit in [(ax[1],.01),(ax[2],.02)]:
 z.axhline(limit,color='black',ls='--',lw=1.2,label='Unchanged field limit');z.axhline(-limit,color='black',ls='--',lw=1.2)
ax[0].set(title='Actual disk / image cavity in the current browser calculation',xlabel='Axial coordinate x/R',ylabel='Meridional radius r/R');ax[0].text(.02,.96,'Complete envelope; axes use different scales',va='top',transform=ax[0].transAxes,fontsize=11)
ax[1].set(title='Independent normal velocity: every sampled point retained',xlabel='Boundary arclength / R (front disk → cavity → rear disk)',ylabel='Signed normal velocity / U')
ax[2].set(title='Cavity pressure boundary residual: every cavity sample retained',xlabel='Boundary arclength / R',ylabel='Signed Cp + target σ')
for z in ax:z.grid(alpha=.25);z.legend(loc='best');z.margins(x=.015,y=.14)
fig.suptitle('Current production worker: Automatic 32 → 128 bands\nU = 80 m/s, p∞ = 101.325 kPa, T = 20 °C, R = 10 mm',fontsize=17)
for ext in ['png','svg']:fig.savefig(P/('current-browser-U80-profiles.'+ext),dpi=180)
print('Saved actual browser physical profiles, full signed field traces and unchanged limits.')
