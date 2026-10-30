"""Rebuild the preview-recovery UI port without modifying numerical kernels.

The source port is a context-checked unified diff against published 213d5f0.
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
BASE = '213d5f04c4ddfb73f61b4bd9ee6e881e2c2fff20'
PORT = 'ui/13-preview-recovery-speed-units.patch'

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
build['version'] = '0.3.5'
build['builtAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
build['pageSha256'] = sha(page)
for item in build['sources'].values():
    if item.get('path') in ['docs/wing-panel-stress-analyzer/ui/' + name for name in sources]:
        item['sha256'] = sha(sources[Path(item['path']).name])
build['preview_recovery_port'] = {
    'path': PORT, 'sha256': sha(port), 'baseCommit': BASE,
    'scope': 'Atomic render replacement, complete geometry recovery after admission refusal, m/s and km/h UI; numerical kernels and admission thresholds unchanged',
    'review': 'validation/PREVIEW_RECOVERY_REVIEW.json',
    'regressions': ['validation/test_geometry_preview_recovery.cjs', 'validation/test_speed_units_guidance.cjs', 'validation/test_900mm_load_refusal.cjs']
}
(APP / 'BUILD.json').write_text(json.dumps(build, indent=2) + '\n', encoding='utf-8', newline='\n')
release = json.loads((APP / 'RELEASE.json').read_text(encoding='utf-8'))
release['version'] = '0.3.5'
release['ui_release']['page_sha256'] = sha(page)
if PORT not in release['ui_release']['source_ports']:
    release['ui_release']['source_ports'].append(PORT)
for feature in [
    'Failed geometry construction retains the last visible model and releases only the rejected candidate',
    'Admission refusal restores a complete opaque undeformed geometry preview with fitted camera',
    'Live km/h equivalent beside m/s input; aerodynamic speed validity distinguished from structural coupling limits'
]:
    if feature not in release['ui_release']['features']:
        release['ui_release']['features'].append(feature)
release['preview_recovery_review'] = 'validation/PREVIEW_RECOVERY_REVIEW.json'
(APP / 'RELEASE.json').write_text(json.dumps(release, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'pageSha256': sha(page), 'sourcePort': PORT, 'numericalKernelsChanged': False}, indent=2))
