"""Regenerate signed validation profiles without changing numerical samples.

Current solver identifies reviewed results. Historical curves keep separate labels.
Experimental symbols have full endpoint margins and no marker clipping.
"""
from pathlib import Path
import argparse, csv, hashlib, json, math, os, sys

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/wing-panel-stress-analyzer/validation/2026-10-29'
SRC = OUT
ap=argparse.ArgumentParser();ap.add_argument('--plot-deps');args=ap.parse_args()
if args.plot_deps: sys.path.insert(0,args.plot_deps)
os.environ.setdefault('MPLCONFIGDIR',str(ROOT/'tmp/validation-label-marker-mpl'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.ticker import NullFormatter, NullLocator
from matplotlib import font_manager
for font in ['C:/Windows/Fonts/arial.ttf','C:/Windows/Fonts/arialbd.ttf']:
    if Path(font).exists(): font_manager.fontManager.addfont(font)

plt.rcParams.update({
    'font.family': 'Arial', 'font.size': 13, 'text.color': '#152536',
    'axes.labelsize': 14, 'axes.titlesize': 15, 'axes.titleweight': 'bold',
    'axes.labelcolor': '#152536', 'xtick.labelsize': 12, 'ytick.labelsize': 12,
    'legend.fontsize': 12.5, 'legend.framealpha': 1, 'legend.edgecolor': '#c9d3df',
    'lines.linewidth': 2.1, 'axes.spines.top': False, 'axes.spines.right': False,
    'grid.color': '#bdc9d4', 'grid.alpha': .38, 'svg.fonttype': 'none',
    'pdf.fonttype': 42, 'savefig.facecolor': 'white', 'figure.facecolor': 'white'
})
BLUE, ORANGE, GRAY, BLACK = '#075ba8', '#c56a11', '#6a737d', '#151515'
inputs = ['TE_PROFILES.csv', 'EXPERIMENT_COMPARISON.json', 'THREED_ELLIPSOID.json',
          'THREED_PANAIR_SAMPLES.json', 'THREED_NASA3151.json']
before = {n: hashlib.sha256((SRC/n).read_bytes()).hexdigest() for n in inputs}
series = []

def read(n):
    return json.loads((SRC/n).read_text(encoding='utf-8'))

def plot(ax, x, y, *, tag, **kwargs):
    # Keep signs, native coordinates, ordering and every missing value.
    x, y = list(x), list(y)
    series.append({'tag': tag, 'x': x, 'y': [None if v is None or not math.isfinite(v) else v for v in y]})
    return ax.plot(x, [math.nan if v is None else v for v in y], **kwargs)

def finish(fig, name, note):
    fig.text(.075, .018, note, fontsize=11.5, va='bottom', linespacing=1.45)
    for ext in ['svg', 'png', 'pdf']:
        fig.savefig(OUT/f'{name}.{ext}', dpi=220)
        if ext == 'svg':
            destination=OUT/f'{name}.{ext}'
            destination.write_text('\n'.join(line.rstrip() for line in destination.read_text(encoding='utf8').splitlines())+'\n',encoding='utf8')
    plt.close(fig)

def axes_style(ax):
    ax.grid(True)
    ax.tick_params(pad=6)

# Measurements remain at the published coordinates; no continuous experimental curve.
ex=read('EXPERIMENT_COMPARISON.json')
fig=plt.figure(figsize=(12,10.5));gs=fig.add_gridspec(2,2);axs=[fig.add_subplot(gs[0,0]),fig.add_subplot(gs[0,1]),fig.add_subplot(gs[1,:])]
for ax,p in zip(axs,ex['pressure']):
    for key,color,ls,label in [('candidate',BLUE,'-','Current solver'),('previous',ORANGE,'--','Previous solver')]:
        d=sorted(p[key],key=lambda v:v['x']);plot(ax,(v['x'] for v in d),(v['cp'] for v in d),tag=f'experiment/Cp/{p["alphaDeg"]}/{key}',color=color,ls=ls,label=label)
    e=p['experiment']['data'];plot(ax,(v[0] for v in e),(v[1] for v in e),tag=f'experiment/Cp/{p["alphaDeg"]}/measured',ls='none',marker='o',ms=7.5,mfc='white',mec=BLACK,mew=1.5,zorder=8,clip_on=False,label='Wind-tunnel measurements')
    ax.set(xlabel='Chord position x/c',ylabel='Upper-surface Cp',title=f'Pressure at {p["alphaDeg"]} degrees\nRe = 2.88 million',xlim=(-.025,1.025));ax.margins(y=.09);ax.invert_yaxis();axes_style(ax)
ax=axs[2];m=ex['lift'];e=[v for v in ex['experimental_lift']['data'] if -4<=v[0]<=10]
plot(ax,(v['alphaDeg'] for v in m),(v['cl'] for v in m),tag='experiment/lift/current',color=BLUE,label='Current solver')
plot(ax,(v[0] for v in e),(v[1] for v in e),tag='experiment/lift/measured',ls='none',marker='o',ms=7.5,mfc='white',mec=BLACK,mew=1.5,zorder=8,clip_on=False,label='Ladson wind-tunnel measurements')
ax.set(xlabel='Angle of attack (degrees)',ylabel='Section lift coefficient cl',title='Lift | Re = 6 million, Mach = 0.15, tripped surface');axes_style(ax)
fig.suptitle('2D NACA 0012: comparison with wind-tunnel measurements',fontsize=17,y=.985,weight='bold')
fig.legend(*axs[0].get_legend_handles_labels(),loc='upper center',bbox_to_anchor=(.5,.95),ncol=3)
ax.legend(loc='upper left')
fig.subplots_adjust(top=.82,bottom=.14,left=.085,right=.98,hspace=.59,wspace=.27)
finish(fig,'Experimental_validation','Pressure: Gregory & O\'Reilly. Lift: Ladson. NASA TMR source data; native sample positions.\nSolver: inviscid, incompressible, 320 panels. Boundary-layer and tunnel effects are omitted.\nThe visible discrepancy is a model limitation; this is not a viscous-flow accuracy pass.')

d=read('THREED_ELLIPSOID.json')
fig,axs=plt.subplots(1,2,figsize=(12,6.4))
for ax,eta in zip(axs,[.3,.8]):
    th=[math.pi*i/500 for i in range(501)];x=[.5*(1+math.cos(t)) for t in th];f=math.sqrt(1-eta**2);cp=[]
    for t in th:
        normal=[f*math.cos(t)/100,eta/300,f*math.sin(t)/20]
        cp.append(1-d['K']**2*(1-normal[0]**2/sum(v*v for v in normal)))
    plot(ax,x,cp,tag=f'ellipsoid/exact/{eta}',color=BLACK,lw=2.4,label='Exact potential-flow solution')
    for run,color,marker in zip(d['runs'],[GRAY,ORANGE,BLUE],['s','^','o']):
        p=[s for s in run['samples'] if s['eta']==eta]
        plot(ax,(s['xc'] for s in p),(s['cp'] for s in p),tag=f'ellipsoid/{run["mesh"]}/{eta}',color=color,marker=marker,ms=4,lw=1.5,label=f'Current solver: {run["mesh"][0]} x {run["mesh"][1]} mesh')
    ax.set(xlabel='Local chord position x/c',ylabel='Pressure coefficient Cp',title=f'Span position y/s = {eta:.1f}',xlim=(-.025,1.025));ax.margins(y=.09);ax.invert_yaxis();axes_style(ax)
fig.suptitle('3D analytic verification: non-lifting ellipsoid',fontsize=17,y=.985,weight='bold')
fig.legend(*axs[0].get_legend_handles_labels(),loc='upper center',bbox_to_anchor=(.5,.94),ncol=2)
fig.subplots_adjust(top=.69,bottom=.23,left=.085,right=.98,wspace=.28)
finish(fig,'THREED_ellipsoid','Semi-axes 100 : 300 : 20 mm; zero incidence. Mesh = chord x span. Negative Cp is upward.\nCommon-position RMS error: 0.1271 -> 0.03860 -> 0.02103. Missing samples remain gaps.\nThis tests a non-lifting 3D body; it does not validate the lifting-wing tip/wake corner.')

d=read('THREED_PANAIR_SAMPLES.json')
fig=plt.figure(figsize=(12,11.2));gs=fig.add_gridspec(2,2);axs=[fig.add_subplot(gs[0,:]),fig.add_subplot(gs[1,0]),fig.add_subplot(gs[1,1])]
ax=axs[0];stations=d['stations'];x=[r['eta'] for r in stations]
for key,col,ls,marker,label in [('panair64x48',BLACK,'-','o','PANAIR: 64 x 48'),('core48x36',ORANGE,'--','s','Current solver: 48 x 36'),('core64x48',BLUE,'-','^','Current solver: 64 x 48')]:
    plot(ax,x,(r[key] for r in stations),tag=f'PANAIR/span/{key}',color=col,ls=ls,marker=marker,ms=6,label=label)
ax.set(xlabel='Span position y/s (0 = root, 1 = tip)',ylabel='Section lift coefficient cl',title='A. Lift at six fixed span positions',xlim=(.48,1));axes_style(ax)
ax.legend(loc='upper right')
for ax,side,letter in zip(axs[1:],['upper','lower'],['B','C']):
    pts=[r for r in d['rays'] if r['phi']==45 and r['side']==side]
    for i,col,ls,marker,label in [(2,GRAY,':','s','PANAIR: 32 x 24'),(3,BLACK,'-','o','PANAIR: 64 x 48'),(0,ORANGE,'--','s','Current solver: 48 x 36'),(1,BLUE,'-','^','Current solver: 64 x 48')]:
        plot(ax,(r['distance_mm'] for r in pts),(r['values'][i] for r in pts),tag=f'PANAIR/tip/{side}/{i}',color=col,ls=ls,marker=marker,ms=6,label=label)
    ax.set(xscale='log',xlabel='Distance from tip trailing-edge\ncorner (mm)',ylabel='Pressure coefficient Cp',title=f'{letter}. {side.title()} surface\nFixed 45-degree ray')
    ax.set_xticks([2,4,8,16],labels=['2','4','8','16']);ax.xaxis.set_minor_locator(NullLocator());ax.xaxis.set_minor_formatter(NullFormatter());ax.margins(y=.09);ax.invert_yaxis();axes_style(ax)
fig.suptitle('3D lifting wing: independent comparison with PANAIR A502',fontsize=17,y=.985,weight='bold')
fig.text(.5,.943,'NACA 0012 | aspect ratio 6 | semi-span 600 mm | chord 200 mm | angle of attack 4 degrees',ha='center',fontsize=12.5)
fig.legend(*axs[1].get_legend_handles_labels(),loc='upper center',bbox_to_anchor=(.5,.514),ncol=2)
fig.subplots_adjust(top=.88,bottom=.145,left=.09,right=.98,hspace=.82,wspace=.3)
finish(fig,'THREED_PANAIR','Mesh = chord x span. Cp panels: negative (suction) is upward. Lines join the sampled positions only.\nSame surface nodes in both solvers. PANAIR has documented corner/abutment warnings.\nThe deepest tip/wake corner remains unvalidated; an integrated-load check does not certify its peak.')

d=read('THREED_NASA3151.json')
fig,axs=plt.subplots(2,1,figsize=(12,11.1))
colors={'published':GRAY,'candidate8':ORANGE,'finalCandidate':BLUE}
labels={'published':'Previous solver 0.3.1','candidate8':'Earlier diagnostic (revision 8)','finalCandidate':'Current solver (reviewed revision)'}
for ax,key,yl,title in zip(axs,['cl','cm'],['Section lift coefficient cl','Quarter-chord moment\ncoefficient cm'],['A. Lift distribution','B. Pitching-moment distribution']):
    for run in d['runs']:
        if run['name']=='published' and run['tipClosure']=='rounded':continue
        flat=run['tipClosure']=='flat';s=run['strips'];method=run['mesh'].get('doubletModel','constant')
        label=labels[run['name']]+(' | square tip' if flat else ' | rounded tip')
        plot(ax,(v['eta'] for v in s),(v[key] for v in s),tag=f'NASA/{run["name"]}/{run["tipClosure"]}/{key}',color=colors[run['name']],ls='-' if flat else '--',label=label)
    e=d['reference']['points'];ax.errorbar([v['eta'] for v in e],[v[key] for v in e],yerr=.005,fmt='o',color=BLACK,mfc='white',ms=7.5,mew=1.5,capsize=4,zorder=8,clip_on=False,label='NASA wind-tunnel data (+/-0.005 rounding only)')
    series.append({'tag':f'NASA/experiment/{key}','x':[v['eta'] for v in e],'y':[v[key] for v in e]})
    ax.axhline(0,color='#8896a3',lw=.8);ax.set(xlabel='Span position y/s (0 = root, 1 = tip)',ylabel=yl,title=title,xlim=(-.025,1.025));axes_style(ax)
fig.suptitle('3D NACA 0015 wing: secondary experimental comparison',fontsize=17,y=.985,weight='bold')
fig.text(.5,.949,'Angle of attack 4 degrees | aspect ratio 6.576 | NASA TP-3151, Fig. 21(a)',ha='center',fontsize=13)
fig.legend(*axs[0].get_legend_handles_labels(),loc='upper center',bbox_to_anchor=(.5,.921),ncol=1)
fig.subplots_adjust(top=.69,bottom=.155,left=.105,right=.98,hspace=.55)
finish(fig,'THREED_NASA3151','NASA: Re = 1.5 million, square tip, uncorrected tunnel measurements. Solver: inviscid free air.\nSquare-tip diagnostic uses span-Q2; rounded tip uses tensor-Q2. Geometry and method both differ.\nRounding intervals are not experimental uncertainty. This is a comparison, not an experimental pass.')

after={n:hashlib.sha256((SRC/n).read_bytes()).hexdigest() for n in inputs}
assert before==after
receipt={'date':'2026-10-30','scope':'Presentation only: consistent Current solver labels; visible experimental endpoints','generator':'scripts/validation/plot_validation_labels_markers.py','sourceHashes':before,'sourceFilesUnchanged':True,'numericalSolverUnchanged':True,'allExperimentalSamplesRetained':True,'markerStyle':{'shape':'open circle','size_pt':7.5,'edge_width_pt':1.5,'zorder':8,'clipping':False},'chordAndSpanLimits':[-.025,1.025],'series':series}
prior=json.loads((SRC/'FIGURE_READABILITY_REVIEW.json').read_text(encoding='utf8'))
previous={r['tag']:r for r in prior['series']}
for row in series:
    assert row['tag'] in previous
    assert row['x']==previous[row['tag']]['x'] and row['y']==previous[row['tag']]['y'],row['tag']
receipt['seriesComparisonToEarlierReceipt']='PASS: all 39 non-airfoil numerical series identical'
names=['Airfoil_repaired','Airfoil_edge_error','Experimental_validation','THREED_ellipsoid','THREED_PANAIR','THREED_NASA3151']
receipt['figures']={name:{ext:hashlib.sha256((OUT/f'{name}.{ext}').read_bytes()).hexdigest() for ext in ['svg','png','pdf']} for name in names}
(OUT/'LABEL_MARKER_REVIEW.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8')
print(json.dumps({'figures':4,'formats':['svg','png','pdf'],'series':len(series),'rawDataUnchanged':before==after}))
