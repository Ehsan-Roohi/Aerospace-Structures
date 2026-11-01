"""Replot preserved forward results. No BEM solves and no fitted reference."""
from pathlib import Path
import csv, hashlib, json, os
ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).resolve().parent
CACHE=ROOT/'output/opus-bem/forward-problems-help-20261101/mpl-cache'
CACHE.mkdir(parents=True,exist_ok=True)
os.environ['MPLCONFIGDIR']=str(CACHE)
import numpy as np
import matplotlib
matplotlib.use('Agg')
if 'font.enable_last_resort' in matplotlib.rcParams:matplotlib.rcParams['font.enable_last_resort']=False
import matplotlib.pyplot as plt
from matplotlib import font_manager
for font in ('times.ttf','timesbd.ttf'):
 p=Path('C:/Windows/Fonts')/font
 if p.exists():font_manager.fontManager.addfont(str(p))
plt.rcParams.update({'font.family':'Times New Roman','font.size':14,'axes.titlesize':17,
 'axes.labelsize':15,'legend.fontsize':13,'xtick.labelsize':13,'ytick.labelsize':13,'svg.fonttype':'none'})

inputs=[
 ('disk-physical-sigma-0p5.json','output/opus-bem/axisymmetric-forward-20261101/physical-target-sigma-0p5.json'),
 ('disk-explicit-sigma-0p05.json','output/opus-bem/axisymmetric-forward-20261101/explicit-sigma-0p05-extended.json'),
 ('hydrofoil-rejected-roundtrip.json','output/opus-bem/forward-hydrofoil-20261101/actual-inverse-forward-roundtrip.json'),
 ('hydrofoil-controls-and-wet-cases.json','output/opus-bem/forward-hydrofoil-20261101/control-and-wet-tests.json'),
 ('disk-unsupported-default-domain.json','output/opus-bem/axisymmetric-forward-20261101/unsupported-default-domain-sigma-0p05.json'),
 ('disk-interrupted-300-second-attempt.json','output/opus-bem/axisymmetric-forward-20261101/explicit-sigma-0p05-extended-attempt300.json')
]
manifest=[]
for name,rel in inputs:
 raw=(OUT/name).read_bytes() if (OUT/name).exists() else (ROOT/rel).read_bytes()
 assert 'C:\\Users\\' not in raw.decode('utf-8-sig') and 'C:\\\\Users\\\\' not in raw.decode('utf-8-sig')
 (OUT/name).write_bytes(raw)
 manifest.append({'file':name,'sourceRepositoryPath':rel,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'copy':'exact bytes'})
def load(name):return json.loads((OUT/name).read_text(encoding='utf-8-sig'))
def save(fig,name):
 fig.savefig(OUT/(name+'.png'),dpi=150,bbox_inches='tight',facecolor='white')
 fig.savefig(OUT/(name+'.svg'),bbox_inches='tight',facecolor='white');plt.close(fig)
def dump(name,data):(OUT/name).write_text(json.dumps(data,indent=2,ensure_ascii=False),encoding='utf-8')

p5=load('disk-physical-sigma-0p5.json');p05=load('disk-explicit-sigma-0p05.json')
hydro=load('hydrofoil-rejected-roundtrip.json')['result'];wet=load('hydrofoil-controls-and-wet-cases.json')['actualWetted']
assert p5['ok'] and p05['ok'] and p5['directFieldPassed'] and p05['directFieldPassed']
assert not hydro['acceptedForDisplay'] and hydro['checks']['targetSigmaScreen']['wettedBelowVapourPanels']==3
assert all(c['wetPreflight']['coarse']['passed'] and c['wetPreflight']['fine']['passed'] for c in wet.values())

# Compare physical lengths/radii with common Rn. Sigma is the actual achieved
# value, not a pressure-default sigma or a fitted shape parameter.
rn=p05['input']['diskRn'];sig=p05['achievedSigma']
xy=np.array([[p['xOverRn'],p['rOverRn']] for p in p05['profile']['firstHalf']])
x0=np.linspace(0,2,161);r0=(1+3*x0)**(1/3)
x1=np.linspace(2,xy[-1,0],801);r1=np.sqrt(3.659+.847*(x1-2)-.236*sig*(x1-2)**2)
rows=[]
fig,axs=plt.subplots(2,1,figsize=(12,9),sharex=True,gridspec_kw={'height_ratios':[2,1]})
scale=rn*1000
axs[0].plot(xy[:,0]*scale,xy[:,1]*scale,color='#075eb7',lw=2.7,label='Actual forward C1 BEM, Nc=128')
axs[0].plot(x0*scale,r0*scale,'--',color='#333333',lw=2.1,label='Semenenko Eq.31, front')
axs[0].plot(x1*scale,r1*scale,'-.',color='#ae4b12',lw=2.1,label='Semenenko Eq.32, main region')
axs[0].plot(xy[[0,-1],0]*scale,xy[[0,-1],1]*scale,'o',mfc='white',mec='#075eb7',ms=9,mew=1.8)
axs[0].plot([2*scale],[r0[-1]*scale],'o',mfc='white',mec='#333333',ms=9,mew=1.5)
axs[0].plot([2*scale],[r1[0]*scale],'s',mfc='white',mec='#ae4b12',ms=8,mew=1.5)
for x,r,region in ((x0,r0,'front Eq31'),(x1,r1,'main Eq32')):
 cur=np.interp(x,xy[:,0],xy[:,1]);delta=cur-r
 axs[1].plot(x*scale,delta*scale,color='#075eb7',lw=2.2)
 rows.extend({'referenceRegion':region,'x_m':float(a*rn),'BEM_R_m_interpolated':float(b*rn),'reference_R_m':float(c*rn),'signed_difference_m':float((b-c)*rn)}for a,b,c in zip(x,cur,r))
axs[0].set_ylabel('Cavity radius R (mm)');axs[1].set_ylabel('BEM minus reference (mm)')
axs[1].set_xlabel('Downstream distance from physical disk x (mm)')
axs[1].axhline(0,color='black',lw=.8)
for ax in axs:ax.grid(alpha=.2);ax.set_xlim(-3,xy[-1,0]*scale+3)
fig.legend(*axs[0].get_legend_handles_labels(),loc='upper center',bbox_to_anchor=(.5,.935),ncol=1,frameon=False,fontsize=14)
fig.suptitle(f'Forward disk shape: achieved sigma {sig:.10f}, common disk radius 10 mm',fontsize=20,y=.995)
fig.text(.5,.015,'Disk-to-BEM-maximum coverage only. Source equations are semiempirical; symbols are model endpoints/join, not measurements.',ha='center',fontsize=12.5)
fig.tight_layout(rect=(0,.045,1,.80));save(fig,'disk-sigma005-reference-overlay')
with (OUT/'disk-sigma005-comparison.csv').open('w',newline='',encoding='utf-8')as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
deltas=np.array([r['signed_difference_m'] for r in rows])
comparison={'sigma_used':sig,'target_sigma':p05['targetSigma'],'disk_radius_m':rn,
 'BEM_coverage_x_m':[0,p05['dimensions']['firstHalfLength']],
 'reference_equations':'Semenenko 2001, PDF p15 Eqs31/32, literal rounded coefficients',
 'reference_sigma_range':[.012,.057],'within_reference_sigma_range':.012<=sig<=.057,
 'reference_kind':'semiempirical correlation, not raw measured profile points',
 'largest_sampled_abs_radius_difference_m':float(np.max(np.abs(deltas))),
 'radius_RMSE_m':float(np.sqrt(np.mean(deltas*deltas))),
 'BEM_maximum_x_m':p05['dimensions']['firstHalfLength'],'BEM_maximum_radius_m':p05['dimensions']['Rmax'],
 'reference_eq32_maximum_x_m':rn*(2+.847/(.472*sig)),
 'reference_eq32_maximum_radius_m':rn*np.sqrt(3.659+.847**2/(4*.236*sig)),
 'reference_eq34_reported_natural_length_m':rn*(4+3.595/sig),
 'rear_closure_matched':False,'experimental_validation':False,'shape_parameter_fitted':False,
 'difference_interpolation':'Linear interpolation of all 513 saved actual curved-profile samples; no BEM evaluation or rescaling',
 'source_join_radius_difference_m':rn*(np.sqrt(3.659)-7**(1/3))}
dump('disk-reference-comparison.json',comparison)

fig,axs=plt.subplots(2,1,figsize=(12,8))
for ax,d,title in zip(axs,(p5,p05),('Physical-input case: sigma target 0.5','Explicit-sigma extended case: target 0.05')):
 full=d['profile']['full'];xx=np.array([p['x'] for p in full])*1000;rr=np.array([p['r'] for p in full])*1000
 mask=xx<=d['dimensions']['firstHalfLength']*1000+1e-8
 for sign in (-1,1):
  ax.plot(xx[mask],sign*rr[mask],color='#075eb7',lw=2.2,label='Front-to-maximum'if sign==1 else None)
  ax.plot(xx[~mask],sign*rr[~mask],'--',color='#a34b14',lw=2.2,label='Artificial symmetric rear'if sign==1 else None)
 L=d['dimensions']['imageSeparation']*1000;R=d['input']['diskRn']*1000
 ax.plot([0,0],[-R,R],color='black',lw=3);ax.plot([L,L],[-R,R],color='#a34b14',lw=3)
 ax.axhline(0,color='#777777',lw=.6);ax.grid(alpha=.2)
 ax.set_aspect('equal',adjustable='datalim');ax.set_title(title);ax.set_ylabel('Radial coordinate (mm)')
 ax.text(.98,.93,f'Image separation = {L:.3f} mm',transform=ax.transAxes,ha='right',va='top',fontsize=13)
axs[1].set_xlabel('Axial coordinate from physical disk (mm)')
fig.legend(*axs[0].get_legend_handles_labels(),loc='upper center',bbox_to_anchor=(.5,.935),ncol=2,frameon=False)
fig.suptitle('Actual solved disk/image contours: full geometry retained',fontsize=20,y=.995)
fig.tight_layout(rect=(0,0,1,.87),h_pad=3);save(fig,'disk-forward-full-shapes')

fig,axs=plt.subplots(2,2,figsize=(14,9))
for ax,(name,d) in zip(axs[0],wet.items()):
 for mesh,color,style in (('coarse','#777777','--'),('fine','#075eb7','-')):
  result=d['wetPreflight'][mesh]
  for side,marker in (('upper','o'),('lower','s')):
   v=sorted((p for p in result['panels']if p['surface']==side),key=lambda p:p['x'])
   ax.plot([p['x']for p in v],[p['margin']for p in v],style,color=color,lw=1.8,
    marker=marker,markevery=max(1,len(v)//10),ms=5,mfc='white',
    label=f"{result['panelsPerSurface']}/surface, {side}")
 ax.set_title(f"Wet NACA{d['geometry']['naca']}, alpha {d['geometry']['alpha']} deg\nsigma {d['target']['sigma']:.6f}: both meshes pass")
 ax.set_xlabel('Chord position x/c');ax.set_ylabel('Wetted Cp + target sigma')
 ax.legend(frameon=False,fontsize=11,ncol=2)
panels=hydro['diagnosticCandidate']['panels'];target=hydro['target']['sigma']
for side,color,label in ((1,'#075eb7','Upper wetted surface'),(-1,'#a34b14','Lower wetted surface')):
 v=sorted((p for p in panels if side*p['y']>0),key=lambda p:p['x'])
 for ax in axs[1]:
  ax.plot([p['x']for p in v],[np.nan if p['cavity'] else p['cp']+target for p in v],color=color,lw=1.8,label=label)
 neg=[p for p in v if not p['cavity'] and p['cp']+target< -1e-12]
 for ax in axs[1]:
  ax.plot([p['x']for p in neg],[p['cp']+target for p in neg],'o',color='#b01d1d',ms=7,label='Below cavity pressure'if side==1 else None)
axs[1,0].set(title='Hydrofoil root: complete wetted extent',xlabel='Chord position x/c',ylabel='Cp + target sigma',xlim=(0,1))
axs[1,1].set(title='Same failed trial: upstream detail',xlabel='Chord position x/c',ylabel='Cp + target sigma',xlim=(0,.02),ylim=(-.02,.06))
axs[1,0].legend(frameon=False,fontsize=11)
for ax in axs[1]:ax.axhline(0,color='black',lw=.9)
for ax in axs.flat:ax.grid(alpha=.2)
fig.suptitle('Hydrofoil forward evidence: wet passes and a rejected cavity root',fontsize=20,y=.995)
fig.text(.5,.015,'All raw wetted samples retained. Three negative upstream samples reject the cavity root; the right-hand panel is a separately labelled zoom.',ha='center',fontsize=12.5)
fig.tight_layout(rect=(0,.045,1,.95));save(fig,'hydrofoil-forward-pressure-status')

# Keep a portable, concise table of the inputs/outputs alongside exact raw cases.
case_summary=[]
for d,name in ((p5,'physical sigma .5'),(p05,'explicit sigma .05')):
 a=d['final']['fieldAudit']
 case_summary.append({'case':name,'input':d['input'],'status':d['status'],'sigmaTarget':d['targetSigma'],
 'sigmaAchieved':d['achievedSigma'],'sigmaResidual':d['sigmaResidual'],'dimensions':d['dimensions'],
 'scalarCalls':len(d['search']['evaluations']),'separateFinalAuditedSolve':True,
 'maxNormalOverU':a['maxNormal_U'],'maxAbsCpDefect':a['maxCavityDynamicCpResidual'],
 'all15AuditFractions':a['fractions'],'directFieldPassed':d['directFieldPassed'],
 'meshAccuracyQualified':d['meshAccuracyQualified'],'experimentalAccuracyQualified':d['experimentalAccuracyQualified']})
dump('case-summary.json',{'disk':case_summary,'hydrofoilRoot':hydro['root'],'hydrofoilAccepted':hydro['acceptedForDisplay'],
 'hydrofoilPressureScreen':hydro['checks']['targetSigmaScreen'],'wetCases':{k:{'target':v['target'],'geometry':v['geometry'],
 'coarseMinimum':v['wetPreflight']['coarse']['minimum'],'fineMinimum':v['wetPreflight']['fine']['minimum']}for k,v in wet.items()}})
dump('manifest.json',{'date':'2026-11-01','rawFiles':manifest,'plotInputs':'Exact stored profile/pressure arrays, no new BEM solves',
 'referenceURL':'https://apps.dtic.mil/sti/tr/pdf/ADP012080.pdf','referenceRetrievedCopy':'https://archive.org/download/DTIC_ADP012080/DTIC_ADP012080.pdf',
 'referencePdfSha256':'74c80c61579c268ec547d8b2ea078739996667873f715b1649d9d79026b3523f',
 'referencePages':'PDF p15, printed 11-14, Eqs31-34','noExperimentalShapePointsInvented':True})
print(json.dumps({'cases':2,'referenceMaxDifference_mm':comparison['largest_sampled_abs_radius_difference_m']*1000,
 'rawCopies':len(manifest),'allHydrofoilCavityClaimsRejected':not hydro['acceptedForDisplay']},indent=2))
