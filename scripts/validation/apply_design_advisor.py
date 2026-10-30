"""Optional layout-comparison UI and worker, using byte-identical published physics.

Replays on 4791113. The worker kernel is extracted from that exact page; it does
not rebuild or replace a structural or aerodynamic equation.
"""
from pathlib import Path
import datetime, difflib, hashlib, json, re, subprocess

ROOT=Path(__file__).resolve().parents[2]
APP=ROOT/'docs/wing-panel-stress-analyzer'
BASE='47911135d4f21252a63ae61c00229da8a6bf0f77'
sha=lambda b:hashlib.sha256(b if isinstance(b,bytes) else b.encode()).hexdigest()
page=subprocess.check_output(['git','-c','core.longpaths=true','show',f'{BASE}:docs/wing-panel-stress-analyzer/index.html'],cwd=ROOT).decode().replace('\r\n','\n')
before=page
blocks=[m[2] for m in re.finditer(r'<script\b([^>]*)>([\s\S]*?)</script>',page,re.I)]
profiles=blocks[0];profiles=profiles[profiles.index('const LoadProfiles ='):];profiles=profiles[:profiles.index('module.exports = LoadProfiles;')+len('module.exports = LoadProfiles;')]
assert 'const WingEngine =' in blocks[5] and 'document.getElementById' not in profiles
kernel='/* Generated from published '+BASE+'; numerical definitions unchanged. */\n'+profiles+'\n'+blocks[5]
(APP/'wing-design-advisor-kernel.js').write_text(kernel,encoding='utf-8',newline='\n')
core=(APP/'ui/wing-design-advisor.js').read_text(encoding='utf-8')
worker="""/* Optional design comparison worker; cancel terminates this isolated solve. */
'use strict';
importScripts('wing-design-advisor-kernel.js?v=KERNEL_HASH','ui/wing-design-advisor.js?v=CORE_HASH');
self.onmessage=async event=>{
  const {id,state,options}=event.data;
  try{
    const result=await WingDesignAdvisor.run(state,{E:WingEngine,A:WingAeroPanel,U:WingAeroUI,IO:WingStudyIO},
      {...options,progress:p=>self.postMessage({id,type:'progress',...p})});
    self.postMessage({id,type:'result',result});
  }catch(error){self.postMessage({id,type:'error',message:error.message});}
};
""".replace('KERNEL_HASH',sha(kernel)[:16]).replace('CORE_HASH',sha(core)[:16])
(APP/'wing-design-advisor-worker.js').write_text(worker,encoding='utf-8',newline='\n')
ui=(APP/'ui/wing-design-advisor-ui.js').read_text(encoding='utf-8').replace('__ADVISOR_WORKER_SHA__',sha(worker)[:16])
insert='\n<script id="wingDesignAdvisorScript">\n'+core+'\n'+ui+'\n</script>\n'
at=page.rfind('</body>');assert at>0
page=page[:at]+insert+page[at:]
for name in ['index.html','wing-lab.html']:(APP/name).write_text(page,encoding='utf-8',newline='\n')
port='ui/15-design-advisor.patch'
(APP/port).write_text(''.join(difflib.unified_diff(before.splitlines(True),page.splitlines(True),fromfile='a/docs/wing-panel-stress-analyzer/index.html',tofile='b/docs/wing-panel-stress-analyzer/index.html',n=0)),encoding='utf-8',newline='\n')
build=json.loads((APP/'BUILD.json').read_text(encoding='utf-8'))
build.update(version='0.3.7',builtAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),pageSha256=sha(page))
build['design_advisor']={'baseCommit':BASE,'port':port,'coreSha256':sha(core),'workerSha256':sha(worker),'kernelSha256':sha(kernel),'uiSha256':sha(ui),'scope':'Bounded solver-driven comparison; both objectives; closed-tip results exploratory only; numerical kernels and admission unchanged','review':'validation/DESIGN_ADVISOR_REVIEW.json'}
(APP/'BUILD.json').write_text(json.dumps(build,indent=2)+'\n',encoding='utf-8',newline='\n')
release=json.loads((APP/'RELEASE.json').read_text(encoding='utf-8'));release['version']='0.3.7';release['ui_release']['page_sha256']=sha(page)
if port not in release['ui_release']['source_ports']:release['ui_release']['source_ports'].append(port)
feature='Optional background design advisor compares stiffness and mass with actual structural solves, retains all inputs and admission, and labels exact-tip inboard trials without a full-wing optimum'
if feature not in release['ui_release']['features']:release['ui_release']['features'].append(feature)
release['design_advisor_review']='validation/DESIGN_ADVISOR_REVIEW.json'
(APP/'RELEASE.json').write_text(json.dumps(release,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'pageSha256':sha(page),'kernelSha256':sha(kernel),'workerSha256':sha(worker),'physicsChanged':False},indent=2))
