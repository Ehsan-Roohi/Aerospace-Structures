"""Physical spanwise curves for the controlled 900 mm wing remedy study."""
from pathlib import Path
import json, os
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/900mm-spar-skin-study'
os.environ['MPLCONFIGDIR']=str(OUT/'matplotlib-cache')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
for font in ['arial.ttf','arialbd.ttf','ariali.ttf','arialbi.ttf']:
    font_manager.fontManager.addfont('C:/Windows/Fonts/'+font)
# The bundled Windows plotting environment has no optional LastResort font.
# All labels use the explicitly registered Arial glyphs.
if 'font.enable_last_resort' in plt.rcParams:
    plt.rcParams['font.enable_last_resort']=False

r=json.loads((OUT/'REVIEW.json').read_text(encoding='utf-8'))
valid={v['id']:v for v in r['results'] if v['geometryValid'] and not v.get('solverRefused')}
selected=['original_one_spar_skin1p2','two_spars_0p25_0p65_skin1p2','two_spars_0p25_0p70_skin1p2','one_spar_skin1p3']
passing=[v for v in valid.values() if v['admitted'] and v['smallDisplacement']]
if passing:
    selected.append(min(passing,key=lambda v:v['massG'])['id'])
else:
    best=min(valid.values(),key=lambda v:v['linearScreen']['maxTranslation'])['id']
    if best not in selected: selected.append(best)
short={
    'original_one_spar_skin1p2':'Original: 1 spar, skin 1.2 mm',
    'two_spars_0p25_0p65_skin1p2':'2 spars at 0.25c / 0.65c, skin 1.2 mm',
    'two_spars_0p25_0p70_skin1p2':'2 spars at 0.25c / 0.70c, skin 1.2 mm',
    'one_spar_skin1p3':'1 spar, skin 1.3 mm',
}
plt.rcParams.update({'font.family':'Arial','font.size':12,'axes.labelsize':13,'axes.titlesize':14,'xtick.labelsize':11,'ytick.labelsize':11,'legend.fontsize':12})
fig,axs=plt.subplots(2,2,figsize=(14,10),sharex=True)
styles=[('#111111','-'),('#0072B2','--'),('#D55E00','-.'),('#CC79A7',':'),('#009E73','-')]
handles=[]
for cid,(color,style) in zip(selected,styles):
    case=valid[cid];p=[x for x in r['profiles'] if x['case']==cid];x=[v['yMm'] for v in p]
    label=short.get(cid,case['label'])
    if cid not in short: label+=' (tested stiffened variant)'
    for ax,key,factor in [(axs[0,0],'twistDeg',1),(axs[0,1],'translationZmm',1),(axs[1,0],'GJNmm2',1e-6),(axs[1,1],'torqueNmm',1e-3)]:
        line,=ax.plot(x,[v[key]*factor for v in p],color=color,linestyle=style,linewidth=2.3,marker='o',markersize=3,markevery=5,label=label)
    handles.append(line)
for ax,title,ylabel in [(axs[0,0],'Elastic twist','Twist (degrees)'),(axs[0,1],'Vertical bending displacement','Displacement (mm)'),(axs[1,0],'Section torsional stiffness','GJ (N m²)'),(axs[1,1],'Torque about each design’s shear-centre axis','Torque (N m)')]:
    ax.set_title(title,pad=10);ax.set_ylabel(ylabel);ax.grid(True,color='#d7dce2',linewidth=.8);ax.axhline(0,color='#a9b0b8',linewidth=.7);ax.set_xlim(0,900)
for ax in axs[1,:]:ax.set_xlabel('Semi-span station y (mm)')
fig.suptitle('Same 900 mm wing and 50 m/s aerodynamic load: what internal reinforcement changes',fontsize=17,y=.98)
fig.legend(handles,[h.get_label() for h in handles],loc='lower center',bbox_to_anchor=(.5,.045),ncol=1,frameon=True)
fig.text(.5,.015,'Same outer geometry, α = 2°, 96.884 N upward force per semi-wing. Linear diagnostic curves; refused cases are not accepted coupled predictions.',ha='center',fontsize=10)
fig.tight_layout(rect=(0,.24,1,.95))
for ext in ['png','pdf']:fig.savefig(OUT/f'spanwise_design_comparison.{ext}',dpi=220,bbox_inches='tight')
print('\n'.join(str(OUT/f'spanwise_design_comparison.{ext}') for ext in ['png','pdf']))
