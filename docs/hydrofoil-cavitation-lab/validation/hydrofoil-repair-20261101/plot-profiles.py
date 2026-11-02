import os,sys,json
from pathlib import Path
sys.dont_write_bytecode=True
R=Path(__file__).parent
os.environ.setdefault('MPLCONFIGDIR',str(R/'.mpl-cache'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
D=json.loads((R/'benchmark.json').read_text(encoding='utf8'));C={c['id']:c for c in D['cases']}
plt.rcParams.update({'font.size':12,'axes.labelsize':12,'axes.titlesize':13,'legend.fontsize':10.5,'axes.grid':True,'grid.alpha':.2,'axes.spines.top':False,'axes.spines.right':False})
ids=['native-016-cold','native-016-repeat','browser-016-fresh'];cold=C[ids[0]];sigma=cold['target']['sigma'];fig,axs=plt.subplots(1,2,figsize=(10.8,5.5),constrained_layout=True)
ref=sorted([p for p in cold['profile']['panels'] if p['y']>0],key=lambda p:p['x'])
axs[0].plot([p['x'] for p in ref],[p['fullyWettedCp'] for p in ref],'--',color='#888',lw=1.3,label='Fully wetted computed reference')
for id,label,color,style in zip(ids,['Current solver · cold start','Current solver · repeat','Current solver · browser'],['#236c9b','#138260','#bc542c'],['-','--',':']):
 c=C[id];assert c['acceptedForDisplay'] and c['checks']['accepted'];p=sorted([p for p in c['profile']['panels'] if p['y']>0],key=lambda p:p['x']);h=c['profile']['height']
 axs[0].plot([v['x'] for v in p],[v['cp'] for v in p],style,color=color,lw=1.6,label=label)
 axs[1].plot([v['x'] for v in h],[v['h'] for v in h],style,color=color,marker='.',ms=4,lw=1.6,label=label)
axs[0].axhline(-sigma,color='#222',ls=':',lw=1.3,label='Target vapor Cp = −σ');axs[0].set(xlabel='Upper-wall position x/c',ylabel='Signed Cp',title='Actual pressure samples')
axs[1].axhline(0,color='#333',lw=.8);axs[1].set(xlabel='Wall position x/c',ylabel='Cavity gap h/c',title='Actual gap nodes and repeatability')
handles,labels=axs[0].get_legend_handles_labels();fig.legend(handles,labels,loc='outside lower center',ncol=2,fontsize=10.5)
fig.suptitle(f'Current solver 0.1.6 · NACA 0020 · incidence 4°\nTarget σ = {sigma:.6f} · L/c = {cold["root"]["length"]:.6f} · computed profiles; accuracy unqualified',fontsize=13)
fig.savefig(R/'current-016-pressure-gap.png',dpi=180);fig.savefig(R/'current-016-pressure-gap.svg');plt.close(fig)
c=C['native-016-original0012'];fig,ax=plt.subplots(figsize=(9.4,5.5),constrained_layout=True)
for mesh,surface,label,color,style in [('coarse','upper','Upper surface · 48 panels (wet reference)','#7b9bb1','--'),('fine','upper','Upper surface · 96 panels (wet reference)','#236c9b','-'),('fine','lower','Lower surface · 96 panels (wet reference)','#bc542c','-')]:
 p=sorted([p for p in c['wetPreflight'][mesh]['panels'] if p['surface']==surface],key=lambda p:p['x']);ax.plot([v['x'] for v in p],[v['cp'] for v in p],style,color=color,marker='.',ms=3.5,lw=1.4,label=label)
ax.axhline(-c['target']['sigma'],color='#222',ls=':',lw=1.3,label='Target vapor-pressure level');ax.set(xlabel='Wall position x/c',ylabel='Signed Cp',title='Fully wetted pressure consistency samples')
fig.suptitle('Current solver 0.1.6 · NACA 0012 · incidence 4°\nU = 20 m/s · p∞ = 101325 Pa · water 20 °C · no admitted partial-sheet result',fontsize=13)
handles,labels=ax.get_legend_handles_labels();fig.legend(handles,labels,loc='outside lower center',ncol=2,fontsize=10.5)
fig.savefig(R/'current-016-original0012-cp.png',dpi=180);fig.savefig(R/'current-016-original0012-cp.svg');plt.close(fig)
print('Legible current figures rendered from stored samples; no physics recomputed.')
