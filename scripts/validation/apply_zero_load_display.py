"""Rebuild the zero-load display UI port without modifying numerical kernels.

The source port is a context-checked unified diff against published 563d859.
No git working tree edits or third-party patch package are needed to replay it.
"""
from pathlib import Path
import datetime
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'docs/wing-panel-stress-analyzer'
BASE = '563d859527ac0baecbdb8e38a8b7cac345004948'
PORT = 'ui/14-zero-load-display.patch'

def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def replay(before, patch):
    original = before.splitlines(True)
    lines = patch.splitlines(True)
    result, cursor, i = [], 0, 2
    while i < len(lines):
        match = re.match(r'^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@', lines[i])
        assert match, f'Unexpected patch header at line {i+1}'
        start = int(match.group(1)) - (0 if match.group(2) == '0' else 1)
        assert start >= cursor
        result.extend(original[cursor:start])
        cursor, i = start, i + 1
        while i < len(lines) and not lines[i].startswith('@@ '):
            line = lines[i]
            assert line[0] in ' +-', f'Unexpected patch content at line {i+1}'
            if line[0] in ' -':
                assert original[cursor] == line[1:], f'Patch context mismatch at source line {cursor+1}'
                cursor += 1
            if line[0] in ' +':
                result.append(line[1:])
            i += 1
    result.extend(original[cursor:])
    return ''.join(result)

before = subprocess.check_output(['git', '-c', 'core.longpaths=true', 'show', f'{BASE}:docs/wing-panel-stress-analyzer/index.html'], cwd=ROOT).decode('utf-8').replace('\r\n', '\n')
port = (APP / PORT).read_text(encoding='utf-8')
page = replay(before, port)
sources = {name: (APP / 'ui' / name).read_text(encoding='utf-8') for name in ['wing-aero-ui.js', 'wx-shell.js']}
for name, source in sources.items():
    embedded = source[source.index('const WingAeroUI ='):] if name == 'wing-aero-ui.js' else source
    assert page.count(embedded.strip()) == 1, name
for filename in ['index.html', 'wing-lab.html']:
    (APP / filename).write_text(page, encoding='utf-8', newline='\n')

build = json.loads((APP / 'BUILD.json').read_text(encoding='utf-8'))
build['version'] = '0.3.6'
build['builtAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
build['pageSha256'] = sha(page)
for item in build['sources'].values():
    if item.get('path') in ['docs/wing-panel-stress-analyzer/ui/' + name for name in sources]:
        item['sha256'] = sha(sources[Path(item['path']).name])
build['zero_load_display_port'] = {
    'path': PORT, 'sha256': sha(port), 'baseCommit': BASE,
    'scope': 'Unloaded structural response distinguished from an applied panel load; neutral unloaded view, truthful constant/unresolved ranges and explicit transfer actions; kernels and limits unchanged',
    'review': 'validation/ZERO_LOAD_DISPLAY_REVIEW.json',
    'regressions': ['validation/test_zero_load_display.cjs', 'validation/test_unapplied_aero_load.cjs', 'validation/test_geometry_preview_recovery.cjs']
}
(APP / 'BUILD.json').write_text(json.dumps(build, indent=2) + '\n', encoding='utf-8', newline='\n')
release = json.loads((APP / 'RELEASE.json').read_text(encoding='utf-8'))
release['version'] = '0.3.6'
release['ui_release']['page_sha256'] = sha(page)
if PORT not in release['ui_release']['source_ports']:
    release['ui_release']['source_ports'].append(PORT)
for feature in [
    'Unloaded structures show a neutral model and an explicit zero-response notice, with direct load setup actions',
    'Solved aerodynamic fields are clearly distinguished from loads actually applied to structural equilibrium',
    'Constant and unresolved fields do not fabricate a unit contour range; unloaded PNGs contain no false legend or stress probes'
]:
    if feature not in release['ui_release']['features']:
        release['ui_release']['features'].append(feature)
release['zero_load_display_review'] = 'validation/ZERO_LOAD_DISPLAY_REVIEW.json'
(APP / 'RELEASE.json').write_text(json.dumps(release, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'pageSha256': sha(page), 'sourcePort': PORT, 'numericalKernelsChanged': False}, indent=2))
