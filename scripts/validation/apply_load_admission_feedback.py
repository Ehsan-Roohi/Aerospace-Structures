"""Port the load-admission UI repair to both deployed entry pages.

The numerical solvers and admission tolerances are unchanged. The extra patch
records the executable-template edits alongside the established source ports.
"""
from pathlib import Path
import difflib
import subprocess

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'docs/wing-panel-stress-analyzer'
# This is a one-time source port from the published 0.3.4 baseline. Read that
# baseline explicitly so repeating the command never compounds an inline edit.
page = subprocess.check_output(['git','show','c5daa65:docs/wing-panel-stress-analyzer/index.html'],cwd=ROOT).decode('utf-8').replace('\r\n','\n')
before = page

def once(old, new):
    global page
    assert page.count(old) == 1, (old[:100], page.count(old))
    page = page.replace(old, new)

# The editable aerodynamic UI source is embedded verbatim.
a = page.index('const WingAeroUI =')
b = page.index("if (typeof module !== 'undefined' && module.exports) module.exports = WingAeroUI;", a)
b += len("if (typeof module !== 'undefined' && module.exports) module.exports = WingAeroUI;")
source = (APP / 'ui/wing-aero-ui.js').read_text(encoding='utf-8')
a0 = source.index('const WingAeroUI =')
page = page[:a] + source[a0:].strip() + page[b:]

once('  let autoSolve = false, inputError = null, fieldErrors = {};', '  let autoSolve = false, inputError = null, fieldErrors = {};\n  let analysisRefusal = null; // Valid inputs, but a coupled-model admission check failed.')
once('  function showErrorDialog(message,target=null){', '  function showErrorDialog(message,target=null,options={}){')
once("    $('#wingErrorMessage').textContent=String(message);", "    $('#wingErrorTitle').textContent=options.title||'Could not apply this change';\n    $('#wingErrorMessage').textContent=String(message);")

old = '    stale = true; inputError = null;\n    wingAero?.syncApplied();'
assert page.count(old) == 2
page = page.replace(old, '    stale = true; inputError = null; analysisRefusal = null;\n    wingAero?.syncApplied();')
once("label==='Input error'?'Check input details.':", "label==='Structural result withheld'?'Model limit · review details.':label==='Input error'?'Check input details.':")
once('    if (inputError) { chip.className = "chip bad";', '    if (analysisRefusal) { chip.className="chip warn"; chip.textContent="Structural result withheld"; t.textContent=analysisRefusal.message; return; }\n    if (inputError) { chip.className = "chip bad";')
once('    running = true; stale = false;\n    beginWingActivity(', '    running = true; stale = false; analysisRefusal = null;\n    beginWingActivity(')
once("        if (!adm.admitted) throw Object.assign(Error(`Coupled result withheld: the aerodynamic load is not admitted (${adm.failed.join('; ')}). See Aerodynamics for the admission table.`), { withheld: true });", """        if (!adm.admitted) {
          const failure=WingAeroUI.admissionFailure(adm,{flow:S.aeroLoad.flow,liftN:solved.analysis3D?.aeroLoad?.appliedWrench?.force?.[2],validity:solved.analysis3D?.validity});
          throw Object.assign(Error(failure.message),{withheld:true,refusal:failure});
        }""")
once("      if (!err?.withheld) console.error(err);   // a withheld coupled result is a decision, not a failure\n      flash(err.message || String(err));", """      if (err?.withheld) {
        analysisRefusal=err.refusal; inputError=null;
        showErrorDialog(analysisRefusal.message,null,{title:analysisRefusal.title});
      } else {
        console.error(err);
        flash(err.message || String(err));
      }""")
once('      running = false;\n      setStatus();\n      renderTree();\n      renderSparResults();', '      running = false;\n      if(analysisRefusal)previewGeometry(); // Retain current valid geometry; never render a rejected field.\n      setStatus();\n      renderTree();\n      renderSparResults();')
once("      $('#viewStale').textContent = 'Geometry preview unavailable: correct the geometry inputs. Previous geometry remains visible; analysis is not up to date.';", "      $('#viewStale').textContent = 'Geometry preview unavailable: '+(err.message||String(err))+'. Previous geometry remains visible; analysis is not up to date.';")
once('inputError: () => inputError,\n    showError:', 'inputError: () => inputError, admissionRefusal: () => analysisRefusal,\n    showError:')

shell_start = page.rindex('/* Wing AeroStruct UI shell:') # CSS has a separate comment with this prefix.
shell_end = page.index('</script>', shell_start)
page = page[:shell_start] + (APP / 'ui/wx-shell.js').read_text(encoding='utf-8').strip() + '\n\n' + page[shell_end:]
port = ''.join(difflib.unified_diff(before.splitlines(True), page.splitlines(True), fromfile='a/docs/wing-panel-stress-analyzer/index.html', tofile='b/docs/wing-panel-stress-analyzer/index.html'))
(APP / 'ui/11-load-admission-feedback.patch').write_text(port, encoding='utf-8', newline='\n')
for name in ['index.html', 'wing-lab.html']:
    (APP / name).write_text(page, encoding='utf-8', newline='\n')
print('Synchronized admission feedback and geometry-preview recovery; numerical kernels unchanged.')
