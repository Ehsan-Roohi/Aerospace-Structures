"""Physical profiles from actual results. No endpoint deletion or fitted data."""
from pathlib import Path
import json, sys, argparse, os
p=argparse.ArgumentParser();p.add_argument('--deps',type=Path);a=p.parse_args()
if a.deps:sys.path.insert(0,str(a.deps))
os.environ.setdefault('MPLCONFIGDIR',str(Path.cwd()/'tmp'/'cavity-plot-font-cache'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
for font in ['arial.ttf','arialbd.ttf','ariali.ttf']:
 f=Path('C:/Windows/Fonts')/font
 if f.exists():font_manager.fontManager.addfont(str(f))
b=Path(__file__).resolve().parent
read=lambda f:json.loads((b/f).read_text(encoding='utf8'))
new=read('smooth-contact-example.json');old=read('example-result.json')
mesh=read('smooth-contact-verification.json')['rows'];research=read('closure-regularity-probe.json')
ind=read('independent-cavity-vk-check.json')['rows']
out=b/'figures';out.mkdir(exist_ok=True)
plt.rcParams.update({'font.family':'Arial' if Path('C:/Windows/Fonts/arial.ttf').exists() else 'DejaVu Sans','font.size':12.5,'legend.fontsize':11.5,'axes.titlesize':14,'axes.labelsize':13,'lines.linewidth':2,'svg.fonttype':'none','axes.spines.top':False,'axes.spines.right':False})
blue,orange,black='#0072B2','#D55E00','#263747'
def finish(fig,name,note):
 fig.text(.065,.025,note,fontsize=10.5,color='#34495e',va='bottom')
 fig.savefig(out/(name+'.png'),dpi=200,facecolor='white');fig.savefig(out/(name+'.svg'),facecolor='white');plt.close(fig)
fig,ax=plt.subplots(1,2,figsize=(13,6));fig.subplots_adjust(top=.75,bottom=.23,left=.075,right=.98,wspace=.22)
fig.suptitle('Cavity endpoint repair: physical gap closes smoothly',x=.065,y=.96,ha='left',fontsize=19,fontweight='bold')
fig.text(.065,.84,'NACA 0012; angle 4 degrees; detachment x/c = 0.01; prescribed l/c = 0.40.\nAll gap nodes retained. A is solved by an additional smooth-contact closure assumption.',fontsize=12.5)
base=new['closure']['baseline']['height'];height=new['height']
for z in ax:
 z.plot([v['x'] for v in base],[v['h'] for v in base],'--',color=orange,label='Fixed A = 0.30, velocity Kutta')
 z.plot([v['x'] for v in height],[v['h'] for v in height],'-o',markersize=3,color=blue,label='Current solver: solved A + velocity Kutta',clip_on=True)
 z.axhline(0,color=black,lw=.8);z.set_xlabel('Chord position, x/c');z.set_ylabel('Cavity gap, h/c');z.grid(True,color='#dfe5eb')
ax[0].set_title('Complete cavity');ax[0].legend(loc='upper left',fontsize=10.5)
ax[1].set_title('Endpoint detail (same computed nodes)');ax[1].set_xlim(.37,.412)
near=[v['h'] for v in base+height if v['x']>.37];ax[1].set_ylim(-max(near)*.05,max(near)*1.1)
finish(fig,'01_endpoint_repair',f"No sample deletion. Shown N={len(new['panels'])}: turning angle {new['metrics']['closureTurningAngleDeg']:.3f} degrees (fixed A: {new['closure']['baseline']['metrics']['closureTurningAngleDeg']:.2f} degrees).\nThe separate five-node endpoint derivative decreases with mesh; this is numerical verification, not experimental validation.")
fig,ax=plt.subplots(1,2,figsize=(13,6));fig.subplots_adjust(top=.73,bottom=.23,left=.075,right=.98,wspace=.22)
fig.suptitle('Independent velocity BEM on the identical computed contour',x=.065,y=.96,ha='left',fontsize=18,fontweight='bold')
fig.text(.065,.83,'213 panels; all cavity samples retained. Hess-Smith independently solves velocity,\nwhereas the current solver solves mixed potential boundary conditions. Neither curve is experiment.',fontsize=12.5)
r=ind[-1];s=sorted(r['samples'],key=lambda v:v['x'])
for z in ax:
 z.plot([v['x'] for v in s],[v['productionCp'] for v in s],'-o',markersize=3,color=blue,label='Current solver, Cp',clip_on=True)
 z.plot([v['x'] for v in s],[v['hsCp'] for v in s],'--s',markersize=3,color=orange,label='Independent Hess-Smith, Cp',clip_on=True)
 z.set_xlabel('Chord position, x/c');z.set_ylabel('Signed pressure coefficient, Cp');z.grid(True,color='#dfe5eb');z.invert_yaxis()
ax[0].set_title('Complete cavity and recovery');ax[0].legend()
ax[1].set_title('Detachment detail: discrepancy retained');ax[1].set_xlim(.009,.04)
near=[v for v in s if v['x']<.04];lo=min(v[k] for v in near for k in ['productionCp','hsCp']);hi=max(v[k] for v in near for k in ['productionCp','hsCp']);ax[1].set_ylim(hi+.003,lo-.003)
finish(fig,'02_independent_cp','On the same contour at N = 213: lift difference 0.00474 (~0.94% of Hess-Smith); speed-target RMS 0.00664 U.\nThis is an independent prescribed-contour diagnostic. The full independent free-boundary benchmark has NOT PASSED.')
fig,ax=plt.subplots(1,2,figsize=(13,6));fig.subplots_adjust(top=.75,bottom=.23,left=.075,right=.98,wspace=.24)
fig.suptitle('Mesh study: endpoint geometry and equivalent-contour lift',x=.065,y=.96,ha='left',fontsize=18,fontweight='bold')
fig.text(.065,.84,'Current solver = smooth-contact closure + velocity Kutta. Computed values, not fitted reference data.\nN is the total boundary-panel count. Each mesh solves its own cavity contour.',fontsize=12.5)
ax[0].plot([r['N'] for r in mesh],[r['cornerDeg'] for r in mesh],'-o',color=blue,clip_on=True,label='Current solver: endpoint panel angle')
ax[0].set_xlabel('Boundary panels, N');ax[0].set_ylabel('Endpoint turning angle (degrees)');ax[0].legend(fontsize=10.5)
ax[1].plot([r['N'] for r in mesh],[r['cl'] for r in mesh],'-o',color=blue,clip_on=True,label='Current solver')
ax[1].plot([r['N'] for r in ind],[r['independentHsCl'] for r in ind],'--s',color=orange,clip_on=True,label='Hess-Smith on each current contour')
ax[1].set_xlabel('Boundary panels, N');ax[1].set_ylabel('Equivalent-contour lift coefficient, CL');ax[1].legend(fontsize=10.5)
for z in ax:z.grid(True,color='#dfe5eb');z.margins(x=.06,y=.1)
finish(fig,'03_mesh_study','Current CL = 0.50133, 0.50164, 0.50155, 0.50159, 0.50187 at N = 80, 107, 160, 213, 320.\nCavity-force experimental accuracy is not established. Rejected negative-gap free-boundary branches remain in the evidence.')
