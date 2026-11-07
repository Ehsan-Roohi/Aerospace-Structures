import json,hashlib
from pathlib import Path
root=Path.cwd();out=root/'output/rod-model-current';r=json.loads((out/'analytic-report.json').read_text());rows=r['matchedProfiles']['rows'];colors={'bonded':'#1769aa','sleeve':'#b64d0b'}
p=['<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600"><rect width="1000" height="600" fill="white"/><path d="M80 40 V520 H960" fill="none" stroke="black"/>']
for v in [0,.1,.2,.3,.4]:
 y=520-v/.4*450;p.append(f'<path d="M80 {y} H960" stroke="#ddd"/><text x="35" y="{y+5}" font-size="17">{v:g}</text>')
for v in [0,225,450,675,900]:p.append(f'<text x="{80+v/900*880}" y="548" text-anchor="middle" font-size="17">{v}</text>')
for idx,mode in enumerate(colors):
 data=[a for a in rows if a['mode']==mode]
 points=' '.join(f'{80+a["y_mm"]/900*880:.3f},{520-a["reference_mm"]/.4*450:.3f}' for a in data)
 p.append(f'<polyline points="{points}" fill="none" stroke="{colors[mode]}" stroke-width="2"/>')
 for a in data[::2]:p.append(f'<circle cx="{80+a["y_mm"]/900*880:.3f}" cy="{520-a["solver_mm"]/.4*450:.3f}" r="3" stroke="{colors[mode]}" fill="white"/>')
 p.append(f'<text x="110" y="{70+idx*25}" fill="{colors[mode]}" font-size="18">{mode.capitalize()}: analytical curve + spatial-solver samples</text>')
p.extend(['<text x="430" y="586" font-size="19">Span position (mm)</text>','<text transform="translate(23 380) rotate(-90)" font-size="19">Transverse displacement (mm)</text>','</svg>']);(out/'matched-profiles.svg').write_text(''.join(p),encoding='utf-8')
(out/'matched-profiles.csv').write_text('mode,y_mm,reference_mm,solver_mm\n'+'\n'.join(','.join(map(str,[a['mode'],a['y_mm'],a['reference_mm'],a['solver_mm']])) for a in rows),encoding='utf-8')
ref=r['results'];bond=[c for c in ref if c['mode']=='bonded-eccentric-composite'];sleeve=[c for c in ref if c['mode'] in ['sleeve-tip-collar','continuous-circular-sleeve']];wing=json.loads((out/'wing-integration-report.json').read_text())
paths=['computational/printed-wing-solver/nonlinear/wing_rod_system.js','computational/printed-wing-solver/nonlinear/test_rod_system.cjs','computational/printed-wing-solver/nonlinear/test_rod_wing.cjs','docs/wing-panel-stress-analyzer/ui/zero-tip-source/engine.js']
review=dict(status='Analytical numerical verification; not experimental validation',models={'bonded':'Separate rod beams; exact six-DOF eccentric ties','sleeve':'Separate rod beams; circular-clearance frictionless compression-only contact; free axial slip and spin'},root_boundary='All six shell and rod root DOFs clamped; integral sleeves rigidly follow shell cross-section; bonded module seams',scope_limit='Small-displacement models only. The finite-rotation single-beam solver refuses rods. No friction, glue strength, bearing/crushing, dry seams or experimental aircraft validation.',references=r['references'],criteria=r['limits'],independent_cases=len(ref),bonded_refinement=[dict(elements=c['n'],reference_mm=c['reference'],solver_mm=c['tip'],relative_error=abs(c['tip']/c['reference']-1)) for c in bond],sleeve_worst_tip_absolute_error_mm=max(abs(c['tip']-c['reference']) for c in sleeve),wing_integration_cases=len(wing['results']),wing_summary=[dict(bonded=c['bonded'],selfWeight=c['selfWeight'],elements=c['actualElements'],tip_mm=c['tip_mm'],smallDisplacement=c['smallDisplacement']) for c in wing['results']],sources={x:hashlib.sha256((root/x).read_text(encoding='utf-8-sig').encode()).hexdigest() for x in paths})
(root/'docs/wing-panel-stress-analyzer/validation/ROD_MODELS_REVIEW.json').write_text(json.dumps(review,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:review[k] for k in ['independent_cases','bonded_refinement','sleeve_worst_tip_absolute_error_mm','wing_integration_cases']},indent=2))
