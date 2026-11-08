import importlib.util, pathlib, math, copy
b=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('svc',b/'service/lwm_service.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s=m.Service(m.MockBackend(b.parent/'wing-comparison/benchmarks.json'));c=s.backend.bench['cases'][0];q=dict(section='NACA 0012',alphaDeg=c['conditions']['effectiveAlphaDeg'],mach=c['conditions']['effectiveMach'],semiSpanOverChord=c['conditions']['semiSpanOverChord'])
assert m.canonical(q)!=m.canonical(dict(q,alphaDeg=q['alphaDeg']+1e-6))
for bad in [dict(q,mach=float('nan')),dict(q,reynolds=400000),dict(q,mach=True),None]:
 try:s.predict({'cases':[bad]});raise AssertionError('accepted malformed input')
 except ValueError:pass
r=s.predict({'mode':'full','cases':[q]});v=r['results'][0];assert v['status']=='ok';assert r['timing']['coldLoadMs']<1200
near=s.predict({'mode':'mean','cases':[dict(q,alphaDeg=q['alphaDeg']+1e-6)]});assert near['results'][0]['status']=='out_of_domain'
for cov in [[[1,2,0,0],[2,1,0,0],[0,0,1,0],[0,0,0,1]],[[1e-15,2e-15,0,0],[2e-15,1e-15,0,0],[0,0,1e-15,0],[0,0,0,1e-15]]]:
 try:m.validate_result(dict(v,integratedCovariance=cov),'full');raise AssertionError('accepted indefinite covariance')
 except ValueError:pass
try:m.validate_result(dict(v,integratedOrder=list(reversed(m.ORDER))),'full');raise AssertionError('accepted wrong coefficient order')
except ValueError:pass
s.backend.predict_full=lambda model,cases:[];s.cache.clear()
try:s.predict({'mode':'full','cases':[q]});raise AssertionError('accepted incomplete runtime output')
except ValueError:pass
print('PASS independent Python admission: precise cache, malformed/nonfinite/unknown inputs, measured replay timing, no near-case substitution, small/large indefinite covariance and incomplete runtime response')
