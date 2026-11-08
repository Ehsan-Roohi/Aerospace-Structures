"""Reproduce the current optional finite-rotation solver and its served assets."""
from pathlib import Path
import hashlib,json,re,datetime
R=Path(__file__).resolve().parents[3]
W=R/'computational/printed-wing-solver/web'
N=Path(__file__).parent
A=R/'docs/wing-panel-stress-analyzer'
dest=A/'nonlinear'
dest.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
# Canonical rod mechanics and engine are shared by page and both workers.
engine=(A/'ui/zero-tip-source/engine.js').read_text(encoding='utf-8-sig').strip()
rod=(N/'wing_rod_system.js').read_text(encoding='utf-8-sig').strip()
for target in [A/'index.html',A/'wing-lab.html']:
 text=target.read_text(encoding='utf-8-sig')
 start=text.index('const WingEngine = (() => {')
 end=text.index('module.exports = WingEngine;',start)+len('module.exports = WingEngine;')
 if 'const WingRodSystem=(()=>{' in text[:start]:
  start=text.index('/* Independent multi-beam rod/sleeve system.')
 text=text[:start]+rod+'\n;\n'+engine+text[end:]
 target.write_text(text,encoding='utf-8',newline='\n')
core=(A/'wing-aero/wing_aero_panel.js').read_text(encoding='utf-8-sig')
module_start='const WingAeroPanel = (() => {'
module_end="if (typeof module !== 'undefined' && module.exports) module.exports = WingAeroPanel;"
core_module=core[core.index(module_start):].strip()
def sync_core(text):
 start=text.index(module_start)
 end=text.index(module_end,start)+len(module_end)
 return text[:start]+core_module+text[end:]
bundle_path=A/'wing-aero/aero_bundle.js'
bundle_path.write_text(sync_core(bundle_path.read_text(encoding='utf-8')),encoding='utf-8',newline='\n')
aero_bundle_hash=sha(bundle_path.read_bytes())[:12]
aero_worker_path=A/'wing-aero/wing_aero_worker.js'
aero_worker=aero_worker_path.read_text(encoding='utf-8')
aero_worker=re.sub(r"(['\"]\./aero_bundle\.js)(?:\?v=[0-9a-f]+)?",rf'\1?v={aero_bundle_hash}',aero_worker)
aero_worker_path.write_text(aero_worker,encoding='utf-8',newline='\n')
aero_worker_hash=sha(aero_worker_path.read_bytes())[:12]
parts=[W/'load_profiles.js',W/'wing_spars.js',W/'vendor/finite-section-geometry/geometry.min.js',N/'wing_finite_section_guarded.js',W/'wing_airfoils.js',W/'wing_geometry.js',W/'wing_frame3d.js',W/'wing_closed_tip_stress.js',N/'wing_rod_system.js',A/'ui/zero-tip-source/engine.js',A/'wing-aero/wing_aero_panel.js',N/'wing_nonlinear_beam.js',N/'wing_flexible_solver.js']
source='/* Finite-section dependency notices:\n'+(W/'vendor/finite-section-geometry/LICENSES.txt').read_text(encoding='utf-8')+' */\n'+'\n;\n'.join(p.read_text(encoding='utf-8-sig') for p in parts)
(dest/'flexible_bundle.js').write_text(source,encoding='utf-8',newline='\n')
bundle_hash=sha(source.encode())[:12]
worker="""/* Worker: cancellation terminates this worker; no background or duplicate solve. */
importScripts('./flexible_bundle.js?v=HASH');
self.onmessage=async e=>{const {id,request}=e.data;try{const result=await WingFlexibleSolver.solve(request,text=>self.postMessage({id,kind:'progress',text}));self.postMessage({id,kind:'complete',result});}catch(error){self.postMessage({id,kind:'error',text:error.message});}};
""".replace('HASH',bundle_hash)
(dest/'flexible_worker.js').write_text(worker,encoding='utf-8',newline='\n')
worker_hash=sha(worker.encode())[:12]
ui=(N/'flexible-ui.js').read_text(encoding='utf-8-sig').replace('__FLEXIBLE_WORKER_HASH__',worker_hash)
(dest/'flexible-ui.js').write_text(ui,encoding='utf-8',newline='\n')
ui_hash=sha(ui.encode())[:12]
for name in ['index.html','wing-lab.html']:
 p=A/name
 text=sync_core(p.read_text(encoding='utf-8'))
 text=re.sub(r'<script src="nonlinear/flexible-ui\.js[^"\n]*"></script>\n?','',text)
 text=re.sub(r'wing_aero_worker\.js\?v=[0-9a-f]+','wing_aero_worker.js?v='+aero_worker_hash,text)
 assert '</body>' in text
 text=re.sub(r'<script src="ml-airfoil/handoff\.js[^"\n]*"></script>\n?','',text)
 handoff_hash=sha((A/'ml-airfoil/handoff.js').read_bytes())[:12]
 text=text.replace('</body>',f'<script src="ml-airfoil/handoff.js?v={handoff_hash}"></script>\n<script src="nonlinear/flexible-ui.js?v={ui_hash}"></script>\n</body>')
 p.write_text(text,encoding='utf-8',newline='\n')
b=json.loads((A/'BUILD.json').read_text(encoding='utf-8'))
b.update(version='0.5.4',builtAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),pageSha256=sha((A/'index.html').read_bytes()))
b['workers']['wing-aero']={'bundle':aero_bundle_hash,'worker':aero_worker_hash}
b['workers']['flexible-wing']={'bundle':bundle_hash,'worker':worker_hash}
b['flexibleWingScope']='Geometrically exact static two-way pressure/beam solver, with refined transverse shear in solid foam; numerical admission is not a material, stability or experimental validation.'
for entry in b['sources'].values():
 p=R/entry.get('path','')
 if p in parts or p==bundle_path or p==A/'ui/zero-tip-source/wing_study_io.js':entry['sha256']=sha(p.read_text(encoding='utf-8-sig').encode())
b['flexibleWingSources']={str(p.relative_to(R)).replace('\\','/'):sha(p.read_text(encoding='utf-8-sig').encode()) for p in parts+[N/'flexible-ui.js',N/'build_flexible_solver.py']}
(A/'BUILD.json').write_text(json.dumps(b,indent=2)+'\n',encoding='utf-8')
p=A/'RELEASE.json'
release=json.loads(p.read_text(encoding='utf-8'))
release.update(version='0.5.4',flexible_solver_version='finite-rotation-coupled-3')
release['scope']='Educational attached inviscid 3D potential-flow pressures and nominal beam stresses, with separate legacy rigid-load models and an optional finite-rotation static two-way beam solver (Kirchhoff for hollow wings; shear-deformable Reissner for solid foam) for positive-chord tips. No viscous/stall model, section distortion, material failure, stability or experimental validation.'
release['ui_release']['page_sha256']=b['pageSha256']
release['flexible_solver']={'source':'computational/printed-wing-solver/nonlinear','builder':'computational/printed-wing-solver/nonlinear/build_flexible_solver.py','scope':b['flexibleWingScope'],'review':'validation/NONLINEAR_FLEXIBLE_WING_REVIEW.json'}
p.write_text(json.dumps(release,indent=2)+'\n',encoding='utf-8')
print('Flexible solver bundle',bundle_hash,'; worker',worker_hash,'; UI',ui_hash)
