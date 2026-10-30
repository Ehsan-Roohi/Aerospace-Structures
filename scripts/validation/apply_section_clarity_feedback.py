"""Reproducibly port the reviewed section-context and design guidance UI.

Starts at the published 6fc4762 page and replaces exactly three whole editable
modules, preserving the numerical kernels and all earlier source ports.
"""
from pathlib import Path
import datetime
import difflib
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'docs/wing-panel-stress-analyzer'
BASE = '6fc4762'

def committed(rel):
    return subprocess.check_output(['git', 'show', f'{BASE}:{rel}'], cwd=ROOT).decode('utf-8').replace('\r\n', '\n')

def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

before = committed('docs/wing-panel-stress-analyzer/index.html')
page = before
modules = ['wing-aero-ui.js', 'wx-aero-results.js', 'wx-shell.js']
for name in modules:
    rel = 'docs/wing-panel-stress-analyzer/ui/' + name
    old = committed(rel).strip()
    new = (ROOT / rel).read_text(encoding='utf-8').strip()
    if name == 'wing-aero-ui.js':
        old = old[old.index('const WingAeroUI ='):]
        new = new[new.index('const WingAeroUI ='):]
    assert page.count(old) == 1, (name, page.count(old))
    page = page.replace(old, new)
    assert page.count(new) == 1

assert page.count('window.WingAeroStructResults = (() => {') == 1
assert 'async function runStudy()' in page
portname = 'ui/12-section-context-design-guidance.patch'
port = ''.join(difflib.unified_diff(before.splitlines(True), page.splitlines(True),
    fromfile='a/docs/wing-panel-stress-analyzer/index.html',
    tofile='b/docs/wing-panel-stress-analyzer/index.html'))
(APP / portname).write_text(port, encoding='utf-8', newline='\n')
for name in ['index.html', 'wing-lab.html']:
    (APP / name).write_text(page, encoding='utf-8', newline='\n')

build = json.loads((APP / 'BUILD.json').read_text(encoding='utf-8'))
build['builtAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
build['status'] = 'Qualified educational solver; explicit 2D/3D section context and tested structural design guidance'
build['pageSha256'] = sha(page)
for source in build['sources'].values():
    if source.get('path') in ['docs/wing-panel-stress-analyzer/ui/' + n for n in modules]:
        source['sha256'] = sha((ROOT / source['path']).read_text(encoding='utf-8'))
build['section_context_design_guidance_port'] = {
    'path': portname, 'sha256': sha(port),
    'scope': 'UI context, navigation and actionable design guidance; numerical kernels and admission limits unchanged',
    'reviews': ['validation/2026-10-29/SECTION_CLARITY_REVIEW.json', 'validation/DESIGN_GUIDANCE_REVIEW.json'],
    'regressions': ['validation/test_section_result_context.cjs', 'validation/test_900mm_design_remedies.cjs']
}
(APP / 'BUILD.json').write_text(json.dumps(build, indent=2) + '\n', encoding='utf-8', newline='\n')
release = json.loads((APP / 'RELEASE.json').read_text(encoding='utf-8'))
release['ui_release']['page_sha256'] = sha(page)
if portname not in release['ui_release']['source_ports']:
    release['ui_release']['source_ports'].append(portname)
for feature in [
    'Independent unit-chord 2D Cp distinguished from actual 3D wing sectional Cp; linked nearest solved strip',
    'Section cl and whole-wing CL use explicit definitions and case labels',
    'Second-spar guidance separates reduced twist from load admission and small-displacement validity',
    'Readable exact-flow Cp and signed trailing-edge error figures retain every raw sample'
]:
    if feature not in release['ui_release']['features']:
        release['ui_release']['features'].append(feature)
release['section_context_review'] = 'validation/2026-10-29/SECTION_CLARITY_REVIEW.json'
(APP / 'RELEASE.json').write_text(json.dumps(release, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'pageSha256': sha(page), 'modules': modules, 'sourcePort': portname}, indent=2))
