"""Independent Hess-Smith pressure/lift check on the same noncavitating NACA contours."""
from pathlib import Path
import importlib.util,json,numpy as np
b=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('independent_hs',b/'independent-cavity-hess-smith.py');hs=importlib.util.module_from_spec(spec);spec.loader.exec_module(hs)
data=json.loads((b/'cambered-section-verification.json').read_text());rows=[]
for case in data['dry']:
 r=hs.flow(case['points'],case['alpha']);cp=np.array([p['cp'] for p in case['panels']]);err=cp-r['cp']
 rows.append(dict(code=case['code'],alpha=case['alpha'],N=case['N'],currentCl=case['cl'],independentCl=float(r['cl']),clDifference=case['cl']-float(r['cl']),cpRMSAll=float(np.sqrt(np.mean(err**2))),cpMaxAll=float(max(abs(err))),normalMax=float(max(abs(r['vn']))),samples=[dict(x=p['x'],y=p['y'],currentCp=p['cp'],independentCp=float(c)) for p,c in zip(case['panels'],r['cp'])]))
for r in rows:print(json.dumps({k:v for k,v in r.items() if k!='samples'}))
(b/'cambered-independent-trial.json').write_text(json.dumps({'status':'RAW_DIAGNOSTIC_BEFORE_ASSERTIONS','rows':rows},indent=2)+'\n')
for code in ['2412','4412']:
 for alpha in [0,4]:
  r=[v for v in rows if v['code']==code and v['alpha']==alpha]
  assert abs(r[-1]['clDifference'])<.015
  assert r[-1]['cpRMSAll']<r[0]['cpRMSAll']
  assert abs(r[-1]['clDifference'])<abs(r[0]['clDifference'])
report=dict(status='PASS_INDEPENDENT_FULLY_WETTED_CAMBERED_CHECK',scope='Same prescribed contour cross-discretisation, all panel samples retained; not independent cavitating-free-boundary or experimental validation',referenceFormulation='Independent analytic-velocity Hess-Smith source/vortex BEM',rows=rows)
(b/'cambered-independent.json').write_text(json.dumps(report,indent=2)+'\n')
for r in rows:print(json.dumps({k:v for k,v in r.items() if k!='samples'}))
