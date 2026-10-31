"""Independent analytic-velocity replay on unchanged production free boundaries."""
from pathlib import Path
import json,importlib.util
base=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('off',base/'cavity-2d-off-collocation-study.py')
off=importlib.util.module_from_spec(spec);spec.loader.exec_module(off)
source=json.loads((base/'cavity-2d-wet-pressure.json').read_text());rows=[]
for r in source['rows']:
 q=off.check(r);wet=[v for v in q['samples'] if not v['cavity']];summary=[]
 for fraction in [.25,.5,.75]:
  subset=[v for v in wet if v['fraction']==fraction];v=min(subset,key=lambda v:v['cp'])
  summary.append(dict(fraction=fraction,minimumCp=v['cp'],margin=v['cp']+r['sigma'],x=v['x'],y=v['y'],panel=v['panel'],belowVapourSamples=sum(s['belowVapour'] for s in subset)))
 q['productionCentroidMargin']=r['wettedPressureMargin'];q['wettedSummaryByPanelFraction']=summary;rows.append(q)
 print(json.dumps({k:v for k,v in q.items() if k!='samples'}),flush=True)
 (base/'cavity-2d-wet-replay.json').write_text(json.dumps(dict(status='INDEPENDENT_PRE_ADMISSION_DIAGNOSTIC_NOT_VALIDATION',rows=rows),indent=2)+'\n')
