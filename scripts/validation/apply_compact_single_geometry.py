"""UI-only port: one shared geometry editor and one compact header.

Replays from the published 546a71c page. Existing controls are moved, not copied;
the aerodynamic/structural kernels, study schema and solver admission stay intact.
"""
from pathlib import Path
import datetime
import difflib
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'docs/wing-panel-stress-analyzer'
BASE = '546a71c3a3a400f9694d7e5d95759792d3a54d77'
sha = lambda data: hashlib.sha256(data if isinstance(data, bytes) else data.encode()).hexdigest()

def committed(relative):
    return subprocess.check_output(['git', '-c', 'core.longpaths=true', 'show', f'{BASE}:{relative}'], cwd=ROOT).decode('utf-8').replace('\r\n', '\n')

before = committed('docs/wing-panel-stress-analyzer/index.html')
page = before
sources = {}
for name in ['wx-shell.js', 'wx-shell.css', 'wx-aero-results.js', 'wing-aero-ui.js']:
    relative = f'docs/wing-panel-stress-analyzer/ui/{name}'
    old = committed(relative).strip()
    new = (APP / 'ui' / name).read_text(encoding='utf-8').strip()
    if name == 'wing-aero-ui.js':
        old = old[old.index('const WingAeroUI ='):]
        new = new[new.index('const WingAeroUI ='):]
    assert page.count(old) == 1, f'{name}: published source must be embedded once'
    page = page.replace(old, new)
    assert page.count(new) == 1
    sources[name] = sha((APP / 'ui' / name).read_bytes())

# All inline scripts except the UI shell remain byte-identical, including the
# optional advisor kernel and its controller. CSS is the sole non-script delta.
scripts = lambda html: [m[2] for m in re.finditer(r'<script\b([^>]*)>([\s\S]*?)</script>', html, re.I)]
old_scripts, new_scripts = scripts(before), scripts(page)
changed = [i for i, (a, b) in enumerate(zip(old_scripts, new_scripts)) if a != b]
assert len(old_scripts) == len(new_scripts)
assert 1 <= len(changed) <= 2
assert any('Wing AeroStruct UI shell' in old_scripts[i] for i in changed)
assert any('Wing AeroStruct aerodynamic results' in old_scripts[i] for i in changed)
# The independent 2D panel equations at the beginning of the results module are unchanged.
old_foil = committed('docs/wing-panel-stress-analyzer/ui/wx-aero-results.js').split('window.WingAeroStructResults =')[0]
new_foil = (APP / 'ui/wx-aero-results.js').read_text(encoding='utf-8').split('window.WingAeroStructResults =')[0]
assert old_foil == new_foil
assert old_scripts[5].split('const WingAeroUI =')[0] == new_scripts[5].split('const WingAeroUI =')[0]

for name in ['index.html', 'wing-lab.html']:
    (APP / name).write_text(page, encoding='utf-8', newline='\n')
port = 'ui/16-compact-single-geometry.patch'
(APP / port).write_text(''.join(difflib.unified_diff(
    before.splitlines(True), page.splitlines(True),
    fromfile='a/docs/wing-panel-stress-analyzer/index.html',
    tofile='b/docs/wing-panel-stress-analyzer/index.html', n=3)), encoding='utf-8', newline='\n')

build = json.loads((APP / 'BUILD.json').read_text(encoding='utf-8'))
build.update(version='0.3.8', builtAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), pageSha256=sha(page))
for name, digest in sources.items():
    build['sources'].setdefault(name, {'path': f'docs/wing-panel-stress-analyzer/ui/{name}', 'sha256_scope': 'Canonical LF source'})['sha256'] = digest
    build['uiOverlay']['sources'][name] = digest
build['compact_single_geometry_port'] = {
    'path': port, 'baseCommit': BASE, 'sha256': sha((APP / port).read_bytes()),
    'scope': 'UI only: one shared Wing shape editor, no permanent left input panel, results in the first header row, contained Study tree scrolling',
    'unchangedInlineScripts': len(old_scripts) - len(changed),
    'baselineInlineScriptSha256': [sha(s) for s in old_scripts],
    'independent2DSourceSha256': sha(old_foil),
    'structuralAndPanelKernelSha256': sha(old_scripts[5].split('const WingAeroUI =')[0]),
    'regression': 'validation/test_compact_single_geometry.cjs',
    'review': 'validation/COMPACT_SINGLE_GEOMETRY_REVIEW.json',
}
(APP / 'BUILD.json').write_text(json.dumps(build, indent=2) + '\n', encoding='utf-8', newline='\n')
release = json.loads((APP / 'RELEASE.json').read_text(encoding='utf-8'))
release['version'] = build['version']
release['ui_release']['page_sha256'] = sha(page)
if port not in release['ui_release']['source_ports']:
    release['ui_release']['source_ports'].append(port)
feature = 'One shared Wing shape editor before both solver menus; results share the first command row; no permanent left input column; Study tree cannot overlap its properties'
if feature not in release['ui_release']['features']:
    release['ui_release']['features'].append(feature)
release['compact_single_geometry_review'] = 'validation/COMPACT_SINGLE_GEOMETRY_REVIEW.json'
(APP / 'RELEASE.json').write_text(json.dumps(release, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'pageSha256': sha(page), 'changedInlineScripts': changed, 'unchangedInlineScripts': len(old_scripts) - len(changed), 'physicsChanged': False}, indent=2))
