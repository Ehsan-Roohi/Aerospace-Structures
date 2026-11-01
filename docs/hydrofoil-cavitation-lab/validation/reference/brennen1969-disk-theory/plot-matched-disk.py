"""Physical Cp/shape/field profiles; no error bars interpreted as measurements."""
from pathlib import Path
import csv,json,hashlib,os
HERE=Path(__file__).resolve().parent
if os.name=='nt' and not str(HERE).startswith('\\\\?\\'):HERE=Path('\\\\?\\'+str(HERE))
_plot_cache=str(HERE/'.mplcache')
Path(_plot_cache).mkdir(exist_ok=True)
os.environ.setdefault('MPLCONFIGDIR',_plot_cache)
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
if 'font.enable_last_resort' in plt.rcParams:plt.rcParams['font.enable_last_resort']=False

font='DejaVu Sans'
if Path('C:/Windows/Fonts/arial.ttf').exists():
 for p in Path('C:/Windows/Fonts').glob('arial*.ttf'):font_manager.fontManager.addfont(str(p))
 font='Arial'
plt.rcParams.update({'font.family':font,'font.size':13,'axes.labelsize':14,
 'axes.titlesize':15,'legend.fontsize':12,'xtick.labelsize':12,'ytick.labelsize':12,
 'svg.fonttype':'none','savefig.facecolor':'white'})
reference=json.loads((HERE/'brennen-1969-theory-cp.json').read_text())
results={}
colors={32:'#737373',64:'#0072B2',128:'#009E73'}
styles={32:':',64:'--',128:'-'}
summary=[]
portable={'description':'Matched prescribed-sigma comparison with digitized Brennen1969 numerical theory; not experimental validation.',
 'reference':reference,'results':[]}

for sigma in [.3,.7]:
 for Nc in [32,64,128]:
  r=json.loads((HERE/f'sigma-{sigma:.1f}-Nc{Nc}.json').read_text())
  results[sigma,Nc]=r
  ref=[p for p in reference['points'] if p['sigma']==sigma]
  rr=np.array([p['r_R'] for p in ref]);cp=np.array([p['Cp'] for p in ref]);
  x=np.array([p['r_R'] for p in r['face']]);p=np.array([p['CpTrace'] for p in r['face']]);
  predicted=np.interp(rr,x,p);boundlo=np.interp(np.minimum(1,rr+.006),x,p)-.012
  boundhi=np.interp(np.maximum(0,rr-.006),x,p)+.012
  delta=predicted-cp
  row={'targetSigma':sigma,'Nc':Nc,'Nf':r['Nf'],'totalMeridionalPanels':r['N'],
   'L_R':r['L'],'computedSigma':r['sigma'],'sigmaMismatch':r['sigma']-sigma,
   'CD':r['CD'],'CDOver1PlusSigma':r['CD']/(1+r['sigma']),
   'referenceSampleCount':len(ref),'rReferenceCoverage':[float(rr.min()),float(rr.max())],
   'CpTraceRMSEAtReadLocations':float(np.sqrt(np.mean(delta**2))),
   'CpTraceMaxAbsDifferenceAtReadLocations':float(abs(delta).max()),
   'CpTraceSamplesWithinScanReadingRectangle':int(np.sum((cp>=boundlo)&(cp<=boundhi))),
   'maxOffgridNormal_U':r['fieldAudit']['maxNormal_U'],
   'maxOffgridDynamicCpResidual':r['fieldAudit']['maxCavityDynamicCpResidual'],
   'nodalResidual':r['maxDynamicResidual'],'nodalConverged':r['nodalConverged'],
   'fieldGatePassed':r['fieldAudit']['withinPriorOffgridThresholds'],
   'accuracyQualified':r['accuracyQualified']}
  summary.append(row)
  portable['results'].append({'summary':row,'kernelVersion':r['version'],
   'kernelSha256':r['benchmark']['kernelSha256'],'rootTrace':r['benchmark']['trace'],
   'nodes':r['nodes'],'face':r['face'],'qc':r['qc'],
   'fieldAudit':r['fieldAudit'],'geometry':r['geometry'],'status':r['status']})

fig,ax=plt.subplots(2,2,figsize=(16,12),layout='constrained')
for row,sigma in enumerate([.3,.7]):
 ref=[p for p in reference['points'] if p['sigma']==sigma]
 rr=[p['r_R'] for p in ref];cc=[p['Cp'] for p in ref]
 for col in range(2):
  a=ax[row,col]
  for Nc in [32,64,128]:
   r=results[sigma,Nc]
   a.plot([p['r_R'] for p in r['face']],[p['CpTrace'] for p in r['face']],
    color=colors[Nc],ls=styles[Nc],lw=2.0,label=f'Current solver · Nc={Nc} ({r["N"]} total)')
  a.errorbar(rr,cc,xerr=.006,yerr=.012,ls='none',fmt='o',mfc='white',mec='#111111',
   ecolor='#555555',capsize=2.5,ms=6,mew=1.2,label='Brennen (1969) · digitized theory ± reading bounds',zorder=5)
  a.scatter([1],[-sigma],marker='D',s=60,facecolors='none',edgecolors='#CC79A7',
    label='Rim limit Cp = −σ (imposed BC)',zorder=6,clip_on=False)
  a.axhline(0,c='#888888',lw=.8);a.grid(alpha=.23)
  a.set_xlabel('Disk radius r/R');a.set_ylabel('Signed pressure coefficient Cp')
  a.set_title(f'σ = {sigma:.1f} · '+('entire disk face' if col==0 else 'complete rim detail'))
  a.set_xlim((-.025,1.028) if col==0 else (.90,1.0065))
  a.set_ylim(-sigma-.12,1.11 if col==0 else .79)
  if row==0 and col==0:a.legend(loc='lower left',framealpha=.97)
  if col==1:a.text(.03,.035,'No rim sample removed.\nReference symbols stop where the scan resolves them.',
    transform=a.transAxes,fontsize=11,va='bottom',bbox={'facecolor':'white','edgecolor':'#dddddd','alpha':.95})
fig.suptitle('Axisymmetric disk cavity: matched-sigma comparison with published numerical theory',fontsize=19)
fig.supxlabel('Same Riabouchinsky image-disk closure; L/R solved for each σ. No experimental-validation claim.\n'
 'Reference: Brennen (1969), p.680 Fig.3; scan bounds ±0.006 in r/R and ±0.012 in Cp are reading bounds.',fontsize=12)
fig.savefig(HERE/'matched-disk-cp.png',dpi=180);fig.savefig(HERE/'matched-disk-cp.svg');plt.close(fig)

fig,ax=plt.subplots(3,2,figsize=(16,14),layout='constrained')
fieldcsv=[]
for col,sigma in enumerate([.3,.7]):
 for Nc in [32,64,128]:
  r=results[sigma,Nc];nodes=np.array(r['nodes']);Nf=r['Nf'];cav=nodes[Nf:Nf+Nc+1]
  ax[0,col].plot(cav[:,0],cav[:,1],color=colors[Nc],ls=styles[Nc],lw=2,label=f'Current solver · Nc={Nc} ({r["N"]} total)')
  profiles=r['fieldAudit']['profiles'];points=np.array(profiles['points']);pan=np.array(profiles['panel'])
  normal=np.array(profiles['normal_U']);vt=np.array(profiles['tangent_U'])
  lengths=np.sqrt(((nodes[1:]-nodes[:-1])**2).sum(axis=1));cum=np.r_[0,np.cumsum(lengths)]
  distance=cum[pan]+np.sqrt(((points-nodes[pan])**2).sum(axis=1))
  ax[1,col].plot(distance,normal,color=colors[Nc],ls=styles[Nc],lw=1.0,marker='.',ms=2)
  mask=(pan>=Nf)&(pan<Nf+Nc)
  dynamic=1-normal[mask]**2-vt[mask]**2+r['sigma']
  ax[2,col].plot(points[mask,0]/r['L'],dynamic,color=colors[Nc],ls=styles[Nc],lw=1.0,marker='.',ms=2)
  for i in range(len(pan)):
   fieldcsv.append({'sigma':sigma,'Nc':Nc,'panel':int(pan[i]),'axial_x_R':float(points[i,0]),
    'radius_r_R':float(points[i,1]),'boundary_arc_R':float(distance[i]),'normal_U':float(normal[i]),
    'tangent_U':float(vt[i]),'Cp_direct':float(1-normal[i]**2-vt[i]**2),
    'Cp_trace':float(1-profiles['negativeGamma_U'][i]**2),
    'is_cavity':bool(mask[i]),'cavity_Cp_plus_sigma':float(1-normal[i]**2-vt[i]**2+r['sigma']) if mask[i] else ''})
 ax[0,col].set_title(f'σ = {sigma:.1f} · computed cavity geometry')
 ax[0,col].set_xlabel('Axial position x/R');ax[0,col].set_ylabel('Cavity radius r/R');ax[0,col].legend(loc='upper right')
 ax[1,col].set_title('Direct exterior normal velocity · all nine fractions per band')
 ax[1,col].set_xlabel('Meridional boundary arclength s/R');ax[1,col].set_ylabel('Normal velocity / U')
 ax[1,col].axhspan(-.01,.01,facecolor='#009E73',alpha=.1,label='Unchanged ±0.01 screen');ax[1,col].axhline(0,c='#333333',lw=.8)
 ax[2,col].set_title('Free-surface pressure residual · all nine fractions per band')
 ax[2,col].set_xlabel('Axial position along cavity x/L');ax[2,col].set_ylabel('Direct Cp + σ')
 ax[2,col].axhspan(-.02,.02,facecolor='#009E73',alpha=.1);ax[2,col].axhline(0,c='#333333',lw=.8)
 for a in ax[:,col]:a.grid(alpha=.23);a.margins(x=.025,y=.12)
fig.suptitle('The disk-face comparison does not qualify the complete cavity field',fontsize=19)
fig.supxlabel('Direct exterior velocity uses the current stable singular kernel. All points at fractions 0.02, 0.05, 0.10, 0.25,\n'
 '0.50, 0.75, 0.90, 0.95 and 0.98 are retained; every mesh still fails the unchanged field screens.',fontsize=12)
fig.savefig(HERE/'matched-disk-field.png',dpi=180);fig.savefig(HERE/'matched-disk-field.svg');plt.close(fig)

(HERE/'matched-disk-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(HERE/'matched-disk-profiles.json').write_text(json.dumps(portable,separators=(',',':'))+'\n')
with (HERE/'matched-disk-summary.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=summary[0].keys());w.writeheader();w.writerows(summary)
with (HERE/'matched-disk-field-samples.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=fieldcsv[0].keys());w.writeheader();w.writerows(fieldcsv)
print(json.dumps(summary,indent=2))
