"""Velocity formulation on the identical production C1 compound contour."""
from pathlib import Path
import importlib.util,json
import numpy as np
base=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('hs',base/'independent-cavity-hess-smith.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
original=json.loads((base/'independent-cavity-input.json').read_text())
production=json.loads((base/'closure-regularity-probe.json').read_text())
rows=[]
for m in production['meshes']:
    c=next((v for v in original if v['inputs']['resolution']==m['resolution']),None)
    if c is None:continue
    ids=np.array(c['ids']);sf=np.array(c['foilS']);u=np.maximum(0,(.5*(sf[:-1]+sf[1:])-.85*sf[-1])/(.15*sf[-1]));qc=np.sqrt(1+m['sigma']);target=-qc*(1-m['attenuation']*u)
    r=h.flow(m['points'],4);prod=np.array([v['tangentialSpeed'] for v in m['panels']]);diff=r['vt'][ids]-target;cross=r['vt']-prod
    rows.append(dict(N=m['N'],A=m['attenuation'],sigma=m['sigma'],maxNormalHs=float(max(abs(r['vn']))),fluxHs=r['flux'],clHs=float(r['cl']),clProduction=m['coefficients']['cl'],allCavitySpeedTargetRms=float(np.sqrt(np.mean(diff**2))),allCavitySpeedTargetMax=float(max(abs(diff))),allBoundarySpeedDifferenceRms=float(np.sqrt(np.mean(cross**2))),allBoundarySpeedDifferenceMax=float(max(abs(cross))),productionFirstLastVtSum=float(prod[0]+prod[-1]),hsFirstLastVtSum=float(r['vt'][0]+r['vt'][-1]),samples=[dict(panel=int(j),x=float(r['centers'][j,0]),hsVt=float(r['vt'][j]),productionVt=float(prod[j]),targetVt=float(target[k]),hsCp=float(r['cp'][j]),productionCp=m['panels'][j]['cp']) for k,j in enumerate(ids)]))
result=dict(scope='Exact same compound contour. Independent Hess-Smith Neumann solve; all cavity samples retained. This is an independent-discretisation diagnostic, not experimental validation.',rows=rows)
(base/'independent-cavity-prescribed-contour.json').write_text(json.dumps(result,indent=2)+'\n')
for row in rows:print(json.dumps({k:v for k,v in row.items() if k!='samples'}))
