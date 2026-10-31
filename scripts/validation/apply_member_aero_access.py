"""UI-only port: preserve AeroStruct access and move Truss group editing into Member."""
from pathlib import Path
import datetime, difflib, hashlib, json, re, subprocess
ROOT=Path(__file__).resolve().parents[2]
APP=ROOT/'docs/wing-panel-stress-analyzer'
BASE='bf4523b'
sha=lambda s:hashlib.sha256(s if isinstance(s,bytes) else s.encode()).hexdigest()
def committed(p):
    return subprocess.check_output(['git','show',f'{BASE}:{p}'],cwd=ROOT).decode('utf-8').replace('\r\n','\n')
before=committed('docs/wing-panel-stress-analyzer/index.html')
page=before
sources={}
for name in ['wx-shell.js','wx-shell.css']:
    old=committed('docs/wing-panel-stress-analyzer/ui/'+name).strip()
    text=(APP/'ui'/name).read_text(encoding='utf-8').replace('\r\n','\n')
    assert page.count(old)==1
    page=page.replace(old,text.strip())
    sources[name]=sha(text)
scripts=lambda s:[m[2] for m in re.finditer(r'<script\b([^>]*)>([\s\S]*?)</script>',s,re.I)]
old,new=scripts(before),scripts(page)
assert len(old)==len(new)
assert [i for i,(a,b) in enumerate(zip(old,new)) if a!=b]==[8]
for name in ['index.html','wing-lab.html']:(APP/name).write_text(page,encoding='utf-8',newline='\n')
port='ui/17-member-aero-access.patch'
(APP/port).write_text(''.join(difflib.unified_diff(before.splitlines(True),page.splitlines(True),fromfile='a/docs/wing-panel-stress-analyzer/index.html',tofile='b/docs/wing-panel-stress-analyzer/index.html')),encoding='utf-8',newline='\n')
build=json.loads((APP/'BUILD.json').read_text(encoding='utf-8'))
build.update(version='0.3.9',builtAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),pageSha256=sha(page))
for name,digest in sources.items():
    build['sources'][name]['sha256']=digest
    build['uiOverlay']['sources'][name]=digest
build['member_aero_access_port']={'path':port,'baseCommit':BASE,'sha256':sha((APP/port).read_bytes()),'scope':'UI only: prominent Aerodynamics command; Truss Wing navigation returns to AeroStruct; Select multiple belongs to Member menu','review':'validation/MEMBER_AERO_ACCESS_REVIEW.json','regression':'validation/test_member_aero_access.cjs','unchangedInlineScripts':len(old)-1,'baselineInlineScriptSha256':[sha(s) for s in old]}
(APP/'BUILD.json').write_text(json.dumps(build,indent=2)+'\n',encoding='utf-8',newline='\n')
release=json.loads((APP/'RELEASE.json').read_text(encoding='utf-8'))
release['version']=build['version'];release['ui_release']['page_sha256']=sha(page)
if port not in release['ui_release']['source_ports']:release['ui_release']['source_ports'].append(port)
release['member_aero_access_review']='validation/MEMBER_AERO_ACCESS_REVIEW.json'
(APP/'RELEASE.json').write_text(json.dumps(release,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'pageSha256':sha(page),'version':build['version'],'physicsChanged':False}))
