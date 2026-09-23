"""Headless execution of Ivan C. Christov's GPL-3.0 notebook.
Course wrapper added 2026-09-23. Scientific cells and parameters unchanged.
Only unused widget imports, the IPython magic and rich display are omitted.
"""
import os,json,time,platform,contextlib,io
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import scipy,sympy
BASE=Path(__file__).resolve().parent
os.chdir(BASE)
OUT=BASE/'results';OUT.mkdir(exist_ok=True)
nb=json.loads((BASE/'NS_blowup_vortex.ipynb').read_text())
ns={'display':lambda *x:None,'__name__':'__main__'}
records=[];start=time.time()
offset = int('MIE 446 computational companion' in ''.join(nb['cells'][0]['source']))
for cell_index,c in enumerate(nb['cells']):
 i = cell_index - offset
 if c['cell_type']!='code':continue
 src=''.join(c['source'])
 src='\n'.join(s for s in src.splitlines() if not s.startswith(('from ipywidgets','import ipywidgets','%matplotlib')))
 buf=io.StringIO()
 with contextlib.redirect_stdout(buf):exec(compile(src,f'notebook_cell_{i}','exec'),ns)
 if i==3:plt.rcParams['figure.figsize']=(12,5.5)
 if i in {27,30,41,44}:
  name={27:'swirl_profiles',30:'meridional_flow',41:'particle_paths',44:'speed_and_energy'}[i]
  ns['fig'].savefig(OUT/(name+'.png'),dpi=145,bbox_inches='tight')
 if i==34:ns['animation_figure']=ns['fig']
 records.append({'cell':i,'status':'ok','stdout':buf.getvalue()})
 print('completed cell',i,flush=True)
# Animation generated from the original callback and 50 original frames.
ns['anim'].save(OUT/'core_collapse.gif',writer='pillow',fps=7,dpi=75)
# Independent recording of success for every particle path.
statuses=[]
for i in range(ns['num_particles']):
 sol=scipy.integrate.solve_ivp(ns['pathline_ode'],[ns['t0'],ns['t_end']],[ns['r0'][i]*np.cos(ns['th0'][i]),ns['r0'][i]*np.sin(ns['th0'][i]),ns['z0'][i]],t_eval=ns['t_eval'],rtol=1e-6,atol=1e-9)
 statuses.append(bool(sol.success))
div=sympy.simplify(sympy.diff(ns['r']*ns['v_r'],ns['r'])/ns['r']+sympy.diff(ns['v_z'],ns['z']))
metrics={'h':float(ns['h']),'divergence_symbolic':str(div),'all_particle_integrations_success':all(statuses),'particles':len(statuses),'swirl_log_slope':float(np.polyfit(np.log(ns['tau_list']),np.log(ns['vmax_list']),1)[0]),'expected_swirl_log_slope':-float(ns['A']),'energy_log_slope':float(np.polyfit(np.log(ns['tau_list']),np.log(ns['Ecore_list']),1)[0]),'leading_energy_log_slope':.5-3*float(ns['h']),'tau_start':float(ns['tau_list'][0]),'tau_end':float(ns['tau_list'][-1]),'speed_start':float(ns['vmax_list'][0]),'speed_end':float(ns['vmax_list'][-1]),'energy_start':float(ns['Ecore_list'][0]),'energy_end':float(ns['Ecore_list'][-1]),'finite_diagnostics':bool(np.isfinite(ns['vmax_list']).all() and np.isfinite(ns['Ecore_list']).all()),'runtime_seconds':time.time()-start,'versions':{'python':platform.python_version(),'numpy':np.__version__,'scipy':scipy.__version__,'sympy':sympy.__version__,'matplotlib':matplotlib.__version__},'cells':records}
(OUT/'run_metrics.json').write_text(json.dumps(metrics,indent=2))
np.savetxt(OUT/'scaling_data.csv',np.column_stack([ns['tau_list'],ns['vmax_list'],ns['Ecore_list']]),delimiter=',',header='tau,max_swirl,core_energy',comments='')
assert str(div)=='0' and all(statuses) and metrics['finite_diagnostics']
print(json.dumps({k:v for k,v in metrics.items() if k!='cells'},indent=2))
