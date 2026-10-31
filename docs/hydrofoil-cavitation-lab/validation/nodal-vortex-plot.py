"""Reproduce the cross-check figure from nodal-vortex-profiles.json only.

Requirements: Python, NumPy and Matplotlib. Place this script and the JSON in the
same folder, then run: python nodal-vortex-plot.py
"""
from pathlib import Path
import os,json
HERE=Path(__file__).resolve().parent
os.environ.setdefault('MPLCONFIGDIR',str(HERE/'mpl-config'))
import matplotlib as mpl
if 'font.enable_last_resort' in mpl.rcParams:mpl.rcParams['font.enable_last_resort']=False
mpl.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.ticker import FixedLocator,FuncFormatter,NullFormatter
import numpy as np

data=json.loads((HERE/'nodal-vortex-profiles.json').read_text(encoding='utf-8'))
L=data['case']['fullImageSeparation_L_R']
available_fonts={f.name for f in font_manager.fontManager.ttflist}
figure_font=next((f for f in ['Times New Roman','Liberation Serif','DejaVu Serif'] if f in available_fonts),'serif')
mpl.rcParams.update({'font.family':figure_font,
    'font.size':15,'axes.titlesize':18,'axes.labelsize':16,'legend.fontsize':13,
    'xtick.labelsize':13,'ytick.labelsize':13})
fig,axs=plt.subplots(2,2,figsize=(16,10),constrained_layout=True)
detail=axs[1,1].inset_axes([.24,.55,.50,.37])
records=[]
for Nc,col in zip([32,64,192],['#d55e00','#0072b2','#009e73']):
    a=next(m for m in data['meshes'] if m['cavityPanels']==Nc)
    val=a['scalars'];nf=a['facePanelsEach'];nodes=np.array(a['nodes_R'])
    cav=nodes[nf:nf+Nc+1];lab=f'Current solver: {Nc} cavity panels'
    axs[0,0].plot(cav[:,0],cav[:,1],color=col,lw=2,label=lab)
    face=a['physicalDiskTrace']
    axs[0,1].plot([p['r_R'] for p in face],[p['CpTrace'] for p in face],color=col,lw=2,marker='o',markersize=3)
    prof=a['independentFieldProfiles'];pp=np.array(prof['points']);pan=np.array(prof['panel'])
    mask=(pan>=nf)&(pan<nf+Nc)
    vv=np.array(prof['tangent_U'])[mask];un=np.array(prof['normal_U'])[mask];px=pp[mask,0]
    cp=1-vv**2-un**2
    assert mask.sum()==Nc*len(data['samplePolicy']['panelFractions'])
    assert np.all(np.isfinite(cp)) and np.all(np.isfinite(un))
    assert np.all(np.diff(px)>0), 'Actual axial samples must remain in physical order.'
    axs[1,0].plot(px,cp,color=col,lw=.9,alpha=.9)
    axs[1,0].axhline(-val['sigma'],color=col,ls='--',lw=1.3)
    # No folded coordinate. Main panel retains the complete actual axial extent.
    axs[1,1].plot(px,un,color=col,lw=.85,marker='.',markersize=2,alpha=.85)
    front=px<=L/2
    detail.plot(px[front],un[front],color=col,lw=.8,marker='.',markersize=2)
    records.append({'cavityPanels':Nc,'allCavityAuditSamples':int(mask.sum()),
          'actualAxialMinimum_R':float(px.min()),'actualAxialMaximum_R':float(px.max()),
          'maxNormal_U':float(np.max(np.abs(un)))})

axs[0,0].set(title='Computed free boundary',xlabel='Axial position x / R',ylabel='Cavity radius r / R')
axs[0,0].plot([0,0],[0,1],color='black',lw=3);axs[0,0].plot([L,L],[0,1],color='black',lw=3)
axs[0,0].set_ylim(.9,2.05);axs[0,0].legend(loc='lower center')
axs[0,1].set(title='Physical front-disk pressure: nodal trace approximation',xlabel='Disk radius r / R',ylabel='Pressure coefficient Cp')
axs[0,1].set_xlim(0,1);axs[0,1].axhline(0,color='gray',lw=.8)
axs[1,0].set(title='Independently evaluated cavity pressure',xlabel='Axial position x / R',ylabel='Field Cp  (dashed: imposed cavity Cp)')
axs[1,1].set(title='Independent normal-velocity residual: complete cavity',xlabel='Actual axial position x / R',ylabel='Normal velocity / freestream speed')
axs[1,1].set_xlim(0,L);axs[1,1].set_ylim(-.073,.073)
for ax in [axs[1,1],detail]:
    ax.axhline(.01,color='black',ls='--',lw=1)
    ax.axhline(-.01,color='black',ls='--',lw=1)
detail.set_xscale('log');detail.set_xlim(1e-6,.25);detail.set_ylim(-.068,.068)
detail.xaxis.set_major_locator(FixedLocator([1e-5,.001,.1]))
detail.xaxis.set_major_formatter(FuncFormatter(lambda x,p:f'{x:g}'))
detail.xaxis.set_minor_formatter(NullFormatter())
detail.yaxis.set_major_locator(FixedLocator([-.05,0,.05]))
detail.set_title('Front-rim detail',fontsize=12,pad=3)
detail.tick_params(labelsize=10)
detail.grid(alpha=.2)
axs[1,1].text(.5,.045,'Unchanged limits: ±0.01 U; both rims retained',ha='center',va='bottom',
              transform=axs[1,1].transAxes,fontsize=13,
              bbox={'facecolor':'white','edgecolor':'none','alpha':.9,'pad':2})
for ax in axs.flat:ax.grid(alpha=.22);ax.tick_params(direction='out')
fig.suptitle('Numerical cross-check: axisymmetric disk cavity (L / R = 8)\nIndependent surface-field accuracy remains unresolved',fontsize=22)
fig.savefig(HERE/'nodal-vortex-comparison.png',dpi=150)
fig.savefig(HERE/'nodal-vortex-comparison.svg')
(HERE/'comparison-profile-provenance.json').write_text(json.dumps({
    'case':data['model'],'dataFile':'nodal-vortex-profiles.json',
    'script':'nodal-vortex-plot.py','fractionsPerPanel':data['samplePolicy']['panelFractions'],
    'allSamplesRetainedInMainAxes':True,'noOppositeRimConnectionInFoldedCoordinate':True,
    'inset':'Front-rim samples only; main residual panel contains the complete actual axial extent',
    'records':records},indent=2),encoding='utf-8')
