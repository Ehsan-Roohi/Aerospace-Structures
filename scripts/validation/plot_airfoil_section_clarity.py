"""Replot committed exact-airfoil evidence; no solver values are edited.

Usage: python scripts/validation/plot_airfoil_section_clarity.py --plot-deps PATH
The optional path supplies a task-local Matplotlib install on this workstation.
"""
import argparse, csv, hashlib, json, os, sys
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('--plot-deps');args=ap.parse_args()
if args.plot_deps: sys.path.insert(0,args.plot_deps)
os.environ.setdefault('MPLCONFIGDIR',str(Path(__file__).resolve().parents[2]/'tmp/validation-label-marker-mpl'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
for font in ['C:/Windows/Fonts/arial.ttf','C:/Windows/Fonts/arialbd.ttf']:
 if Path(font).exists(): font_manager.fontManager.addfont(font)
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/wing-panel-stress-analyzer/validation/2026-10-29'
with (OUT/'TE_PROFILES.csv').open(encoding='utf-8-sig',newline='') as f: raw=list(csv.DictReader(f))
rows=[]
for r in raw:
 if float(r['alpha_deg'])!=4: continue
 rows.append({**r,**{k:float(r[k]) for k in ['x_c','z_c','Cp_candidate','Cp_exact_same_point']},'N':int(r['panels'])})
review=json.loads((OUT/'TE_REPAIR_REVIEW.json').read_text(encoding='utf-8'))
plt.rcParams.update({'font.family':'Arial','font.size':15,'axes.titlesize':18,'axes.labelsize':16,'xtick.labelsize':13,'ytick.labelsize':13,'legend.fontsize':15,'svg.fonttype':'none','pdf.fonttype':42})
colors={80:'#b55b0a',160:'#168a9a',320:'#1959b8'}
names=[('joukowski (cusp)','Joukowski airfoil · sharp cusp'),('karman-trefftz 12 deg (finite wedge)','Karman–Trefftz airfoil · 12° finite edge')]
def series(name,N,side):return sorted([r for r in rows if r['airfoil']==name and r['N']==N and r['side']==side],key=lambda r:r['x_c'])
def decorate(ax):
 ax.grid(color='#dce2e8',linewidth=.8);ax.spines[['top','right']].set_visible(False);ax.set_xlabel('Chord position x/c');ax.set_ylabel('Signed pressure coefficient Cp');ax.invert_yaxis()
def write(fig,name):
 for ext in ['png','svg','pdf']:
  destination=OUT/f'{name}.{ext}';fig.savefig(destination,dpi=180,facecolor='white')
  if ext=='svg':destination.write_text('\n'.join(line.rstrip() for line in destination.read_text(encoding='utf-8').splitlines())+'\n',encoding='utf-8')
fig,axes=plt.subplots(2,2,figsize=(17,13))
fig.subplots_adjust(left=.075,right=.98,bottom=.18,top=.79,hspace=.52,wspace=.20)
fig.suptitle('Independent 2D airfoil verification · α = 4°',x=.075,y=.985,ha='left',fontsize=25,fontweight='bold')
fig.text(.075,.943,'Every curve uses the same stated conformal airfoil and angle. Cp is compared at matching physical points.',fontsize=16)
from matplotlib.lines import Line2D
handles=[Line2D([0],[0],color=colors[160],lw=2.3,label='Current solver · 160 contour panels'),Line2D([0],[0],color=colors[320],lw=2.3,label='Current solver · 320 contour panels'),Line2D([0],[0],color='#171d22',lw=2,label='Exact potential flow'),Line2D([0],[0],color='#43505d',ls='-',label='Upper surface: solid'),Line2D([0],[0],color='#43505d',ls='--',label='Lower surface: dashed')]
fig.legend(handles=handles,loc='upper left',bbox_to_anchor=(.068,.91),ncol=3,frameon=False,fontsize=15,columnspacing=2)
for j,(name,label) in enumerate(names):
 for col in [0,1]:
  ax=axes[j,col]
  for N in [160,320]:
   for side,ls in [('upper','-'),('lower','--')]:
    rr=series(name,N,side);xx=[r['x_c'] for r in rr];yy=[r['Cp_candidate'] for r in rr]
    ax.plot(xx,yy,color=colors[N],ls=ls,lw=2,marker='o' if col else None,ms=4.3 if col else 0,mew=.5)
  for side,ls in [('upper','-'),('lower','--')]:
   rr=series(name,320,side);ax.plot([r['x_c'] for r in rr],[r['Cp_exact_same_point'] for r in rr],color='#171d22',ls=ls,lw=1.7)
  decorate(ax);ax.set_title(label+(' · full chord' if col==0 else ' · last 2% of chord'),loc='left',pad=12)
  if col==0:ax.set_xlim(0,1);ax.set_ylim(1.15,-1.85)
  else:
   ax.set_xlim(.98,1.0004)
   if j==0:
    ax.set_ylim(.162,.120)
    edge=next(r for r in review['rows'] if r['airfoil']==name and r['alphaDeg']==4 and r['panels']==320)['edge_exact']['cp']
    ax.scatter([1],[edge],s=65,marker='D',facecolor='white',edgecolor='#171d22',zorder=8,clip_on=False)
    ax.annotate('Exact common edge limit',xy=(1,edge),xytext=(.981,.138),arrowprops={'arrowstyle':'->','color':'#485565'},fontsize=13,color='#273744')
   else:
    near=[r for r in rows if r['airfoil']==name and r['N'] in [160,320] and r['x_c']>.98]
    cp=[r[k] for r in near for k in ['Cp_candidate','Cp_exact_same_point']];pad=.1*(max(cp)-min(cp));ax.set_ylim(max(cp)+pad,min(cp)-pad)
    ax.text(.04,.10,'Exact edge point: Cp = 1\nSamples stop at x/c < 1',transform=ax.transAxes,va='bottom',fontsize=13,bbox={'facecolor':'white','edgecolor':'#ccd6df','alpha':.94})
fig.text(.075,.10,'Dots are panel-centre predictions, not edge values. The near-edge bends are retained numerical errors, not physical shocks.',fontsize=15)
fig.text(.075,.066,'Sharp cusp: max |ΔCp| among the last 3 panels = 0.0100 (160) and 0.00587 (320). See the separate signed-error figure.',fontsize=15)
fig.text(.075,.028,'Source: committed TE_PROFILES.csv and TE_REPAIR_REVIEW.json. No clipping, smoothing, reference replacement or new solver run.',fontsize=13,color='#42566b')
write(fig,'Airfoil_repaired');plt.close(fig)
fig,axes=plt.subplots(1,2,figsize=(17,8.5));fig.subplots_adjust(left=.075,right=.98,bottom=.22,top=.69,wspace=.22)
fig.suptitle('Trailing-edge discretization error · same-point comparison',x=.075,y=.98,ha='left',fontsize=24,fontweight='bold')
fig.text(.075,.90,'Current solver Cp − exact Cp at each panel centre; α = 4°. All samples in the last 2% of chord are shown.',fontsize=16)
handles=[Line2D([0],[0],color=colors[N],lw=2,marker='o',label=f'{N} contour panels') for N in [80,160,320]]+[Line2D([0],[0],color='#43505d',ls='-',label='Upper: solid'),Line2D([0],[0],color='#43505d',ls='--',label='Lower: dashed')]
fig.legend(handles=handles,loc='upper left',bbox_to_anchor=(.068,.84),ncol=5,frameon=False,fontsize=15)
summary=[]
for ax,(name,label) in zip(axes,names):
 for N in [80,160,320]:
  for side,ls in [('upper','-'),('lower','--')]:
   rr=[r for r in series(name,N,side) if r['x_c']>=.98]
   ax.plot([1-r['x_c'] for r in rr],[r['Cp_candidate']-r['Cp_exact_same_point'] for r in rr],color=colors[N],ls=ls,lw=2,marker='o',ms=5)
  st=next(r for r in review['rows'] if r['airfoil']==name and r['alphaDeg']==4 and r['panels']==N)
  summary.append({'airfoil':name,'alphaDeg':4,'panels':N,'last3_max_abs_Cp_error':st['last3_panels_max_abs_Cp_error'],'last_panel_max_abs_Cp_error':st['last_panel_max_abs_Cp_error']})
 minimum_distance=min(1-r['x_c'] for r in rows if r['airfoil']==name and r['N'] in [80,160,320] and r['x_c']>=.98)
 ax.set_xscale('log');ax.set_xlim(.8*minimum_distance,.022);ax.axhline(0,color='#53616e',lw=1);ax.grid(color='#dce2e8',which='both',lw=.7);ax.spines[['top','right']].set_visible(False);ax.set_title(label,loc='left',pad=14);ax.set_xlabel('Distance from trailing edge, 1 − x/c (log scale)');ax.set_ylabel('Signed Cp error: current solver − exact')
fig.text(.075,.11,'The exact edge is at zero distance and is not a panel-centre sample. Mesh refinement moves the sampling locations.',fontsize=15)
fig.text(.075,.075,'Finite-panel discrepancies are real error: Kutta equality at the mathematical edge does not remove this near-edge error.',fontsize=15)
fig.text(.075,.03,'Only the raw sample positions and errors are connected. These exact-flow checks do not establish viscous or experimental accuracy.',fontsize=14,color='#42566b')
write(fig,'Airfoil_edge_error');plt.close(fig)
(OUT/'SECTION_CLARITY_REVIEW.json').write_text(json.dumps({'date':'2026-10-30','scope':'Display and interpretation only; numerical solver unchanged','plot_generator':'scripts/validation/plot_airfoil_section_clarity.py','raw_profile_file':'TE_PROFILES.csv','raw_review_file':'TE_REPAIR_REVIEW.json','raw_sha256':{name:hashlib.sha256((OUT/name).read_bytes()).hexdigest() for name in ['TE_PROFILES.csv','TE_REPAIR_REVIEW.json']},'angleDeg':4,'signedErrorFigure':'Airfoil_edge_error.svg','actualTrailingEdgeErrors':summary,'preserved_all_raw_samples':True,'clipping_or_smoothing':False,'interpretation_test':'../test_section_result_context.cjs','interpretation_scope':'Independent 2D cl = lift per span / (q c); finite-wing CL = lift / (q S). Same normalized airfoil, entered angle and mesh give identical isolated inviscid Cp; 3D wing sectional Cp is a different result.'},indent=2)+'\n',encoding='utf-8')
print('Regenerated readable full profiles and added signed trailing-edge error distributions.')
