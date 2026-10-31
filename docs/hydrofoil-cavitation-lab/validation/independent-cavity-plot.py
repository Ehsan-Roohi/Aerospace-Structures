"""Signed physical profiles: retain independent discrepancies and rejected shapes."""
from pathlib import Path
import argparse,json,sys
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);parser.add_argument('--deps',type=Path);args=parser.parse_args()
if args.deps:sys.path.insert(0,str(args.deps))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
base=Path(__file__).resolve().parent
data=json.loads((base/'independent-cavity-prescribed-contour.json').read_text())
domain=json.loads((base/'c1-domain-sweep.json').read_text())
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':12,'legend.fontsize':11,'axes.labelsize':13,'axes.titlesize':14,'lines.linewidth':2,'svg.fonttype':'none','axes.spines.top':False,'axes.spines.right':False})
args.output.mkdir(parents=True,exist_ok=True)
blue,orange='#0072B2','#D55E00'
fig,axs=plt.subplots(1,2,figsize=(13,6));fig.subplots_adjust(top=.72,bottom=.23,left=.075,right=.98,wspace=.22)
fig.suptitle('Independent velocity solution on the identical cavity contour',x=.055,y=.96,ha='left',fontweight='bold',fontsize=19)
fig.text(.055,.85,'NACA 0012, alpha = 4 degrees, l/c = 0.40. All cavity-panel samples retained.\nDifferences are not accepted as a completed independent cavity validation.',fontsize=13)
for row,ls in [(data['rows'][0],'--'),(data['rows'][-1],'-')]:
    p=sorted(row['samples'],key=lambda v:v['x'])
    for ax in axs:
        ax.plot([v['x'] for v in p],[v['productionCp'] for v in p],ls,color=blue,label=f"Potential BIE, N={row['N']}")
        ax.plot([v['x'] for v in p],[v['hsCp'] for v in p],ls,color=orange,label=f"Hess-Smith, N={row['N']}")
for ax in axs:ax.set_xlabel('Chord position, x/c');ax.set_ylabel('Pressure coefficient, Cp');ax.grid(True,color='#dfe5eb')
axs[0].set_title('Entire cavity and pressure recovery');axs[1].set_title('Detachment detail: the largest discrepancy');axs[1].set_xlim(.009,.035);axs[0].legend(loc='upper left',fontsize=10)
fig.text(.055,.065,'At N=213: direct cavity-speed target RMS = 0.01285 U; max = 0.03326 U near x/c=0.01012.\nThe pure-Neumann potential solve matches the mixed potential solve to ~1e-9; TE discretisation remains under study.',fontsize=11)
fig.savefig(args.output/'04_independent_contour_cp.png',dpi=220);fig.savefig(args.output/'04_independent_contour_cp.svg');plt.close(fig)
fig,axs=plt.subplots(1,2,figsize=(13,6));fig.subplots_adjust(top=.73,bottom=.23,left=.075,right=.98,wspace=.22)
fig.suptitle('Physical gap admission: a slope root can still intersect the foil',x=.055,y=.96,ha='left',fontweight='bold',fontsize=19)
fig.text(.055,.85,'Actual 213-panel results. Negative h/c denotes intersection and is preserved, never clipped.\nOne input varies at a time; detachment x/c=0.01 and l/c=0.40 remain fixed.',fontsize=13)
colors=['#CC79A7','#0072B2','#009E73','#D55E00','#777777']
for ax,ids,key in [(axs[0],['thickness-006','thickness-009','base','thickness-015','thickness-018'],'thickness'),(axs[1],['alpha-2','alpha-3','base','alpha-5','alpha-6'],'alpha')]:
    for i,id in enumerate(ids):
        r=next(v for v in domain['rows'] if v['id']==id and v['resolution']==64);h=r['height'];value=r['input'].get(key,domain['default'][key]);state='rejected' if r['status'].startswith('REJECTED') else 'admitted'
        label=f"{'t/c' if key=='thickness' else 'alpha'}={value:g}, {state}"
        ax.plot([v['x'] for v in h],[v['h'] for v in h],color=colors[i],ls='--' if state=='rejected' else '-',label=label)
    ax.axhline(0,color='black',lw=1);ax.grid(True,color='#dfe5eb');ax.set_xlabel('Chord position, x/c');ax.set_ylabel('Physical gap, h/c');ax.legend(fontsize=10)
axs[0].set_title('Thickness variation, alpha = 4 degrees');axs[1].set_title('Incidence variation, t/c = 0.12')
fig.text(.055,.065,'There are 18 admitted numerical roots and 8 rejected roots across 13 one-factor cases on two meshes.\nAdmission is not experimental validation. In particular, alpha=3 degrees is rejected despite its small negative gap.',fontsize=11)
fig.savefig(args.output/'05_c1_domain_gap.png',dpi=220);fig.savefig(args.output/'05_c1_domain_gap.svg');plt.close(fig)
