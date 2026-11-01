"""Qualified Waid experiment comparison with unchanged C1 solver predictions.

No absolute experimental profiles are reconstructed. Signed pressure residual
uses the actual Cp+sigma sign: the kernel's stored array has the opposite sign.
"""
import csv,hashlib,json,os
from pathlib import Path
P=Path(__file__).resolve().parent
if os.name == 'nt' and not str(P).startswith('\\\\?\\'): P=Path('\\\\?\\'+str(P))
os.environ['MPLCONFIGDIR']=str(P/'mpl-cache')
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
font_manager.fontManager.addfont('C:/Windows/Fonts/times.ttf')
font_manager.fontManager.addfont('C:/Windows/Fonts/timesbd.ttf')
plt.rcParams.update({'font.family':'Times New Roman','font.size':12,'axes.labelsize':13,'axes.titlesize':14,
                     'legend.fontsize':11,'text.color':'black','axes.labelcolor':'black','xtick.color':'black',
                     'ytick.color':'black','svg.fonttype':'none','font.enable_last_resort':False,
                     'axes.spines.top':False,'axes.spines.right':False})
source=json.loads((P/'waid-digitization.json').read_text())
rows=[];runs={};manifest=[]
for index,exp in enumerate(source['points'],1):
 for Nc in (64,128):
  fn=f'waid-1417-Nc{Nc}.json' if index==2 else f'waid-marker{index}-Nc{Nc}.json'
  if not (P/fn).exists(): raise RuntimeError(f'Missing actual completed run {fn}')
  r=json.loads((P/fn).read_text());runs[index,Nc]=r
  sha=r['benchmark']['sourceSha256']
  assert sha=='9bfb67177b372128a26c0893f7df35fc3bfadae5ea6e30a2770d6b71905bfc7c'
  assert abs(r['sigma']-exp['sigma'])<5e-8
  fa=r['fieldAudit']
  assert fa['allSamplesRetained'] and fa['fractions']==[.02,.05,.1,.25,.5,.75,.9,.95,.98]
  a=r['L']/4;b=(r['Rmax']-1)/2
  row=dict(marker=index,target_sigma=exp['sigma'],actual_sigma=r['sigma'],sigma_input_kind=exp['sigma_input_kind'],
           Nc=Nc,Nf=r['Nf'],N=r['N'],L_over_R=r['L'],a0_over_d=a,b0_over_d=b,
           observed_a0_over_d=exp['a0_over_d'],observed_b0_over_d=exp['b0_over_d'],
           a0_signed_difference_percent=100*(a-exp['a0_over_d'])/exp['a0_over_d'],
           b0_signed_difference_percent=100*(b-exp['b0_over_d'])/exp['b0_over_d'],
           nodal_converged=r['nodalConverged'],geometry_admissible=r['geometry']['admissible'],
           nodal_residual=r['maxDynamicResidual'],direct_normal_max_U=fa['maxNormal_U'],
           direct_dynamic_cp_max=fa['maxCavityDynamicCpResidual'],direct_field_passed=fa['withinPriorOffgridThresholds'],
           experimental_accuracy_qualified=False,status=r['status'],data_file=fn)
  rows.append(row);manifest.append(dict(file=fn,sha256=hashlib.sha256((P/fn).read_bytes()).hexdigest()))
out=dict(title='Current C1 solver versus Waid1957 disk-cavity dimensions',
 source='R.L.Waid, ReportE-73.4, Figs12/13; Caltech record https://authors.library.caltech.edu/records/cape9-a2b62',
 sourceSha256=sha,meshes={'Nc':'cavity bands','Nf':'bands on each disk face','N':'Nc+2*Nf total boundary bands'},
 matching='Only measured sigma is matched. No cavity dimension is an inverse-solver target.',
 measurement=source['manual_reading_bounds'],
 scope='Qualified experimental comparison of first-half dimensions only. Gravity, finite free-surface tunnel, sting/strut, ventilation and actual downstream closure are unmatched.',
 experimentalAccuracyQualified=False,
 signedPressureResidual='Physical Cp+sigma = -(stored fieldAudit.profiles.cavityCpPlusSigmaDefect). Stored value is |v/U|^2-qc^2.',
 results=rows,rawFiles=manifest)
(P/'waid-current-comparison.json').write_text(json.dumps(out,indent=2))
with (P/'waid-current-comparison.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)

sig=np.array([e['sigma'] for e in source['points']])
fit_sigma=np.linspace(.125,.171,250)
fig,axs=plt.subplots(1,2,figsize=(11.8,5.8))
styles={64:dict(color='black',ls=':',marker='^',mfc='white',ms=7,lw=1.7),
        128:dict(color='black',ls='-',marker='s',mfc='black',ms=5.5,lw=1.7)}
for ax,key,obs,bound,title in zip(axs,['a0_over_d','b0_over_d'],['a0_over_d','b0_over_d'],[.10,.012],
                                ['Forward cavity length','Maximum-radius increment']):
 y=np.array([e[obs] for e in source['points']])
 ax.errorbar(sig,y,xerr=.001,yerr=bound,fmt='o',color='black',mfc='white',mec='black',ms=8,capsize=3,
             lw=1.1,label='Waid: digitized measurements',zorder=5)
 for Nc in (64,128):
  vals=[r[key] for r in rows if r['Nc']==Nc]
  ax.plot(sig,vals,label=f'Current C1 solver: Nc={Nc}',**styles[Nc])
 corr=.540*fit_sigma**(-1.118) if key=='a0_over_d' else .267*fit_sigma**(-.568)
 ax.plot(fit_sigma,corr,color='.45',ls='-.',lw=1.7,label='Waid: published empirical fit')
 ax.set_title(title);ax.set_xlabel('Cavitation number σ')
 ax.set_ylabel('a₀/d' if key=='a0_over_d' else 'b₀/d')
 ax.grid(True,alpha=.22);ax.margins(x=.09,y=.13)
 ax.set_xlim(.125,.178)
 if key=='a0_over_d':
  ax.annotate('Printed case: σ=0.1417',xy=(sig[1],y[1]),xytext=(.145,6.05),
              fontsize=11,arrowprops=dict(arrowstyle='-',color='black',lw=.8))
handles,labels=axs[0].get_legend_handles_labels()
fig.legend(handles,labels,loc='lower center',ncol=2,bbox_to_anchor=(.5,.075),frameon=True,edgecolor='.5')
fig.suptitle('Disk cavity: current solver and experiment',fontsize=17,y=.98)
fig.subplots_adjust(left=.075,right=.98,top=.87,bottom=.30,wspace=.30)
fig.text(.5,.045,'Waid (1957), Figs. 12–13: U=12 ft/s; d=1 in; zero incidence. Bounds show digitization only.',
         ha='center',va='bottom',fontsize=10.5)
fig.text(.5,.015,'Nc = cavity bands; total boundary bands = 2Nc. First-half dimensions; physical closure and facility are unmatched.',
         ha='center',va='bottom',fontsize=10.5)
for ext in ('png','svg'):fig.savefig(P/f'waid-current-dimensions.{ext}',dpi=200,facecolor='white')
plt.close(fig)

# Direct signed field profiles: all declared nine fractional samples are retained.
# Normal profiles cover the entire boundary; dynamic profiles cover the entire cavity.
fig,axs=plt.subplots(4,2,figsize=(12,13.8))
for rowi,index in enumerate(range(1,5)):
 for Nc in (64,128):
  r=runs[index,Nc];p=r['fieldAudit']['profiles'];pts=np.asarray(p['points']);pan=np.asarray(p['panel'])
  cav=(pan>=r['Nf'])&(pan<r['Nf']+r['Nc'])
  sn=np.asarray(p['arclength_R'])
  kw=dict(color='black' if Nc==128 else '.5',ls='-' if Nc==128 else ':',lw=1.2,
          label=f'Current C1 solver: Nc={Nc}')
  axs[rowi,0].plot(sn,p['normal_U'],**kw)
  # The field's property name is misleading; convert to physical signed Cp+sigma.
  cp=-np.asarray(p['cavityCpPlusSigmaDefect'])
  assert len(cp)==cav.sum()
  axs[rowi,1].plot(pts[cav,0]/r['L'],cp,**kw)
 for coli,limit in ((0,.01),(1,.02)):
  ax=axs[rowi,coli];ax.axhline(0,color='black',lw=.65)
  ax.axhline(limit,color='.35',ls='--',lw=.8);ax.axhline(-limit,color='.35',ls='--',lw=.8)
  ax.grid(True,alpha=.2);ax.margins(x=.025,y=.12)
  ax.set_title('σ='+f'{sig[rowi]:.5f}',fontsize=13)
  ax.set_ylabel('vₙ/U' if coli==0 else 'Cₚ + σ')
  ax.ticklabel_format(axis='y',style='sci',scilimits=(-2,2),useMathText=False)
  ax.legend(loc='best',frameon=True,fontsize=9.5)
axs[-1,0].set_xlabel('Complete boundary arclength s/R')
axs[-1,1].set_xlabel('Cavity axial position x/L')
fig.suptitle('Direct-field checks: signed full sample coverage',fontsize=17,y=.99)
fig.text(.28,.957,'Normal velocity: front disk + cavity + image disk',ha='center',fontsize=11.5)
fig.text(.76,.957,'Cavity pressure residual (physical sign)',ha='center',fontsize=11.5)
fig.subplots_adjust(left=.08,right=.975,bottom=.07,top=.925,hspace=.49,wspace=.26)
fig.text(.5,.026,'Dashed lines: unchanged limits, ±0.01U and ±0.02Cp. No failed samples removed.',ha='center',fontsize=10.7)
fig.text(.5,.010,'Nc = cavity bands; total boundary bands = 2Nc. All nine fractional samples per band are retained.',ha='center',fontsize=10.7)
for ext in ('png','svg'):fig.savefig(P/f'waid-current-signed-field-audit.{ext}',dpi=180,facecolor='white')
plt.close(fig)

print(json.dumps(dict(rows=rows,figures=['waid-current-dimensions.png','waid-current-signed-field-audit.png']),indent=2))
