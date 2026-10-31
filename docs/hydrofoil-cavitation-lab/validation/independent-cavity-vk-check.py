from pathlib import Path
import importlib.util,json
import numpy as np
base=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('hs',base/'independent-cavity-hess-smith.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
cases=json.loads((base/'independent-cavity-vk-input.json').read_text());rows=[]
for c in cases:
    r=c['production'];ids=np.array(c['ids']);sf=np.array(c['foilS']);u=np.maximum(0,(.5*(sf[:-1]+sf[1:])-.85*sf[-1])/(.15*sf[-1]));target=-np.sqrt(1+r['sigma'])*(1-r['A']*u)
    hs=h.flow(c['points'],c['inputs']['alpha']);v=np.array([p['tangentialSpeed'] for p in r['panels']]);cp=np.array([p['cp'] for p in r['panels']]);dv=hs['vt'][ids]-target
    row=dict(N=len(c['points'])-1,A=r['A'],sigma=r['sigma'],productionStatus=r['status'],productionMinimumGap=min(c['initialGap']),productionCl=r['coefficients']['cl'],independentHsCl=float(hs['cl']),clDifference=float(hs['cl']-r['coefficients']['cl']),productionCm=r['coefficients']['cm'],independentHsCm=float(hs['cm']),allCavityTargetSpeedRms=float(np.sqrt(np.mean(dv**2))),allCavityTargetSpeedMax=float(max(abs(dv))),allCavityCpDifferenceRms=float(np.sqrt(np.mean((hs['cp'][ids]-cp[ids])**2))),allBoundaryVtDifferenceRms=float(np.sqrt(np.mean((hs['vt']-v)**2))),hsNormalMax=float(max(abs(hs['vn']))),hsFlux=hs['flux'],samples=[dict(panel=int(j),x=float(hs['centers'][j,0]),hsVt=float(hs['vt'][j]),productionVt=float(v[j]),targetVt=float(target[k]),hsCp=float(hs['cp'][j]),productionCp=float(cp[j])) for k,j in enumerate(ids)])
    rows.append(row);print(json.dumps({k:v for k,v in row.items() if k!='samples'}),flush=True)
(base/'independent-cavity-vk-check.json').write_text(json.dumps(dict(status='INDEPENDENT_IDENTICAL_CONTOUR_DIAGNOSTIC',fullyFreeBoundaryValidation='NOT_PASSED',experimentalValidation=False,rows=rows),indent=2)+'\n')
