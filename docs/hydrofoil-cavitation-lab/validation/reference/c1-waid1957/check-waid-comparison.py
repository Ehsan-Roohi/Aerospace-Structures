"""Audit the completed four-case comparison without repeating expensive solves."""
import csv, hashlib, json, os, os
from pathlib import Path

P = Path(__file__).resolve().parent
if os.name == 'nt' and not str(P).startswith('\\\\?\\'): P = Path('\\\\?\\' + str(P))
source_sha = '9bfb67177b372128a26c0893f7df35fc3bfadae5ea6e30a2770d6b71905bfc7c'
core = P.parents[2] / 'axisymmetric-cavity-c1.js'
core_bytes = core.read_bytes()
if hashlib.sha256(core_bytes).hexdigest() != source_sha:
    core_bytes = core_bytes.replace(b'\r\n',b'\n')
assert hashlib.sha256(core_bytes).hexdigest() == source_sha
summary = json.loads((P / 'waid-current-comparison.json').read_text())
source = json.loads((P / 'waid-digitization.json').read_text())
rows = summary['results']
assert len(rows) == 8
assert {(r['marker'], r['Nc']) for r in rows} == {(i,n) for i in range(1,5) for n in (64,128)}
assert not summary['experimentalAccuracyQualified']
profiles = []
for row in rows:
    r = json.loads((P / row['data_file']).read_text())
    target = source['points'][row['marker']-1]['sigma']
    assert r['benchmark']['sourceSha256'] == source_sha
    assert abs(r['sigma'] - target) < 5e-8
    assert r['Nf'] == r['Nc']//2 and r['N'] == 2*r['Nc']
    assert r['nNear'] == 24 and r['nFar'] == 12
    assert r['nodalConverged'] and r['geometry']['admissible']
    audit = r['fieldAudit']; p = audit['profiles']
    assert audit['allSamplesRetained']
    assert audit['fractions'] == [.02,.05,.1,.25,.5,.75,.9,.95,.98]
    assert len(p['points']) == len(p['normal_U']) == 9*r['N']
    assert len(p['cavityCpPlusSigmaDefect']) == 9*r['Nc']
    assert abs(max(map(abs,p['normal_U']))-audit['maxNormal_U']) < 1e-13
    assert abs(max(map(abs,p['cavityCpPlusSigmaDefect']))-audit['maxCavityDynamicCpResidual']) < 1e-13
    assert audit['thresholds'] == {'maxNormal_U':.01,'maxCavityDynamicCpResidual':.02}
    passed = audit['maxNormal_U'] <= .01 and audit['maxCavityDynamicCpResidual'] <= .02
    assert passed == audit['withinPriorOffgridThresholds'] == row['direct_field_passed']
    assert not row['experimental_accuracy_qualified']
    profiles.append(dict(marker=row['marker'],Nc=r['Nc'],normal_samples=len(p['normal_U']),
                         cavity_samples=len(p['cavityCpPlusSigmaDefect']),direct_field_passed=passed))
assert {(r['marker'],r['Nc']) for r in rows if not r['direct_field_passed']} == {(1,64),(2,64)}
with (P/'waid-current-comparison.csv').open(newline='') as f:
    assert len(list(csv.DictReader(f))) == 8
figures = ['waid-current-dimensions.png','waid-current-dimensions.svg',
           'waid-current-signed-field-audit.png','waid-current-signed-field-audit.svg']
assert all((P/f).stat().st_size > 10000 for f in figures)
payload = ['METHOD.md','compare-waid-current.py','check-waid-comparison.py',
           'match-waid-additional.cjs','match-waid-1417.cjs','waid-digitization.json',
           'waid-digitized-dimensions.csv','waid-current-comparison.json','waid-current-comparison.csv']
payload += [r['data_file'] for r in rows] + figures
receipt = dict(
    title='Four-case Waid experimental dimension comparison: reviewed evidence',
    sourceKernel=dict(relativePath='../../../axisymmetric-cavity-c1.js',sha256=source_sha),
    tests=dict(eightCompletedRuns=True,fourMeasuredPointsRetained=True,sigmaMismatchBelow5eMinus8=True,
               declaredMeshAndQuadrature=True,allNineFractionSamplesRetained=True,
               absoluteProfilesMatchReportedMaxima=True,unchangedDirectThresholds=True,
               coarseFailuresRetained=True,noExperimentalQualificationClaim=True),
    profileCounts=profiles,
    noPublicSourceImages=True,
    excludedPrivateSources=['waid1957.pdf','waid1957.txt','waid-p*.png','waid-hi-*.png','review-page-*.png'],
    files=[dict(path=f,bytes=(P/f).stat().st_size,sha256=hashlib.sha256((P/f).read_bytes()).hexdigest()) for f in payload])
(P/'waid-current-manifest.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(dict(passed=True,files=len(payload),cases=4,runs=8,
                      coarseDirectPass=sum(r['direct_field_passed'] for r in rows if r['Nc']==64),
                      fineDirectPass=sum(r['direct_field_passed'] for r in rows if r['Nc']==128),
                      profiles=profiles),indent=2))
