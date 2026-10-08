"""Execute/verify only the independent wing lecture and save visible output.

Uses real NumPy/Matplotlib execution; no mocked scientific dependencies.
All checks run before writing the executed notebook. Preview images go to tmp.
"""
import base64
import contextlib
import hashlib
import io
import json
import re
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import nbformat
import numpy as np
import IPython.display

ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK = ROOT / 'notebooks/MIE446_Wing_Structure_Buckling_Materials_and_Flutter.ipynb'
QA = ROOT / 'tmp/wing-structure-qa'
QA.mkdir(parents=True, exist_ok=True)
PROTECTED = [ROOT / 'notebooks' / name for name in [
    'MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb',
    'MIE446_Lecture_02_Finite_Wings_and_Load_Paths.ipynb']]

def hashes():
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in PROTECTED}

def main():
    before = hashes()
    notebook = nbformat.read(NOTEBOOK, as_version=4)
    nbformat.validate(notebook)
    ids = [c.id for c in notebook.cells]
    assert len(ids) == len(set(ids)), 'Duplicate cell IDs.'
    images = re.findall(r'!\[[^\n]*?\]\(https://raw\.githubusercontent\.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/wing-structure/([^\)]+)\)',
                        '\n'.join(c.source for c in notebook.cells if c.cell_type == 'markdown'))
    assert len(images) >= 15, 'Expected a substantial visual lecture.'
    for file in images:
        assert (ROOT / 'docs/assets/wing-structure' / file).is_file(), file

    scope = {'__name__': '__main__'}
    current_outputs = []
    original_show = plt.show
    original_display = IPython.display.display
    figure_count = 0

    def show(*args, **kwargs):
        nonlocal figure_count
        for number in plt.get_fignums():
            fig = plt.figure(number)
            buf = io.BytesIO()
            fig.savefig(buf, format='png', dpi=140, bbox_inches='tight')
            png = buf.getvalue()
            figure_count += 1
            (QA / f'activity_{figure_count}.png').write_bytes(png)
            current_outputs.append(nbformat.v4.new_output(
                'display_data', data={'image/png': base64.b64encode(png).decode('ascii'),
                                      'text/plain': '<Matplotlib teaching figure>'}))
            plt.close(fig)

    def display(*objects, **kwargs):
        for obj in objects:
            html = getattr(obj, '_repr_html_', None)
            data = {'text/plain': str(obj)}
            if html:
                data['text/html'] = html()
            current_outputs.append(nbformat.v4.new_output('display_data', data=data))

    executed = 0
    plt.show = show
    IPython.display.display = display
    try:
        for cell in notebook.cells:
            if cell.cell_type != 'code':
                continue
            executed += 1
            current_outputs = []
            stream = io.StringIO()
            with contextlib.redirect_stdout(stream), contextlib.redirect_stderr(stream):
                exec(compile(cell.source, cell.id, 'exec'), scope)
            cell.execution_count = executed
            cell.outputs = ([nbformat.v4.new_output('stream', name='stdout', text=stream.getvalue())]
                            if stream.getvalue() else []) + current_outputs
    finally:
        plt.show = original_show
        IPython.display.display = original_display
        plt.close('all')

    # Independent quantitative checks, including changed-input behavior.
    e, width, thickness, length = 70e9, .010, .001, .400
    euler = lambda L, t, K: np.pi**2 * e * width * t**3 / 12 / (K*L)**2
    assert np.isclose(scope['Pcr'], euler(length, thickness, 1))
    assert np.isclose(euler(2*length, thickness, 1)/scope['Pcr'], .25)
    assert np.isclose(euler(length, 2*thickness, 1)/scope['Pcr'], 8)
    assert np.isclose(euler(length, thickness, 2)/scope['Pcr'], .25)
    assert np.isclose(euler(length, thickness, .5)/scope['Pcr'], 4)

    screen = scope['plate_screen']
    sigma, k, mode = screen(150, 50, .8, 70, .33)
    expected = 4*np.pi**2*70e9/(12*(1-.33**2))*(.8/50)**2/1e6
    assert np.isclose(sigma, expected) and np.isclose(k, 4) and mode == 3
    assert np.isclose(screen(150, 50, 1.6, 70, .33)[0]/sigma, 4)
    assert np.isclose(screen(150, 50, .8, 35, .33)[0]/sigma, .5)
    for ratio in [.1, .7, 1., 1.5, 3., 11., 50.]:
        # Dense independent mode search checks the adaptive mode selection.
        m = np.arange(1, 1001)
        ref = np.min((m/ratio + ratio/m)**2)
        assert np.isclose(screen(50*ratio, 50, .8, 70, .33)[1], ref)

    area, depth, moment = 100e-6, .08, 400.
    assert np.isclose(moment/(area*depth)/1e6, 50.)
    assert np.isclose((area*(.75*depth)**2/2)/(area*depth**2/2), .5625)
    assert np.isclose((moment/(area*.75*depth))/(moment/(area*depth)), 1/.75)

    phase = np.linspace(0, 2*np.pi, 8001)
    integrate = getattr(np, 'trapezoid', None) or np.trapz
    for degrees in [-90, 0, 45, 90, 180]:
        phi = np.deg2rad(degrees)
        work = integrate(.2*np.sin(phase+phi)*.005*np.cos(phase), phase)
        assert np.isclose(work, np.pi*.2*.005*np.sin(phi), atol=1e-12)
    assert np.isclose(scope['exact_work']*1000, np.pi)
    assert np.isclose(scope['net_mj'], np.pi-2)
    wn = 2*np.pi*3
    assert np.exp(-.04*wn*3) < 1 and np.exp(.025*wn*3) > 1
    assert hashes() == before, 'A protected lecture changed.'
    assert executed == 6 and figure_count == 4
    nbformat.validate(notebook)
    nbformat.write(notebook, NOTEBOOK)
    report = {'cells': len(notebook.cells), 'executed_code_cells': executed,
              'static_figures': len(images), 'saved_activity_figures': figure_count,
              'physics_checks': 'passed', 'protected_lecture_sha256': before}
    (QA / 'verification.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    main()
