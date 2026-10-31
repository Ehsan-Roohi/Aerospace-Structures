"""Build the self-contained static Truss Lab page; no network/runtime dependencies."""
from pathlib import Path
here = Path(__file__).resolve().parent
page = (here / 'truss_lab_template.html').read_text(encoding='utf-8')
for token, filename in [('/*__TRUSS_ENGINE__*/', 'truss_engine.js'), ('/*__TRUSS_UI__*/', 'truss_ui.js')]:
    assert page.count(token) == 1
    page = page.replace(token, (here / filename).read_text(encoding='utf-8'))
target = here.parents[2] / 'docs' / 'truss-lab.html'
page = page.replace('href="wing-lab.html#wing"', 'href="wing-panel-stress-analyzer/#wing"')
target.write_text(page, encoding='utf-8', newline='\n')
nested = target.parent / 'wing-panel-stress-analyzer' / 'truss-lab.html'
nested.write_text(page.replace('href="wing-panel-stress-analyzer/#wing"', 'href="./#wing"'), encoding='utf-8', newline='\n')
print(f'{target.name} written ({len(page)} characters)')
