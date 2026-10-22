"""The current upload cell accepts both preserved v1 and current v1.3 exports.

UI release names are not JSON schema numbers. Exercise the original v1
serializer itself, rather than changing a current document's version field.
No CAD build or additional work is introduced into the student notebook.
"""
import json
from pathlib import Path
import subprocess

import pytest

from mie446_wing import (
    WingDesign, WingLabImportError, WingProject, WingProjectError,
    load_wing_lab_study,
)

ROOT = Path(__file__).parents[1]


@pytest.fixture(scope="module")
def release_documents():
    script = r"""
const fs = require('node:fs'), vm = require('node:vm');
const page = fs.readFileSync('docs/wing-lab-v1.html', 'utf8');
const context = vm.createContext({});
function originalModule(start, end) {
  const a = page.indexOf(start), b = page.indexOf(end, a);
  if (a < 0 || b < a) throw new Error('Original v1 module boundary missing');
  vm.runInContext(page.slice(a, b), context, {timeout: 10000});
}
originalModule('const LoadProfiles =', "if (typeof module !== 'undefined' && module.exports) module.exports = LoadProfiles;");
originalModule('const WingSpars=', "if(typeof module!=='undefined'&&module.exports)module.exports=WingSpars;");
originalModule('const WingEngine =', 'if (typeof module !== "undefined" && module.exports) module.exports = WingEngine;');
const marker = page.indexOf(' * Wing Study IO —');
const start = page.indexOf(';(function (root, factory)', marker);
const end = page.indexOf('</script>', start);
if (marker < 0 || start < 0 || end < start) throw new Error('Original v1 IO missing');
vm.runInContext(page.slice(start, end), context, {timeout: 10000});
const original = vm.runInContext(`WingStudyIO.printedStudyDocument({
  geometry: {...WingEngine.DEFAULT_GEOMETRY},
  plaKey:'pla_upright', plaOver:{}, rodKey:'rod_hobby', rodOver:{},
  assembly:{...WingEngine.DEFAULT_ASSEMBLY},
  load:{...WingEngine.DEFAULT_LOAD}, criteria:{...WingEngine.DEFAULT_CRITERIA}
}, WingEngine, {savedAt:'2026-10-22T00:00:00.000Z'})`, context, {timeout:10000});
const E = require('./computational/printed-wing-solver/web/engine.js');
const IO = require('./computational/printed-wing-solver/web/wing_study_io.js');
function currentExport(document, projectName) {
  const imported = IO.importPrintedStudy(JSON.stringify(document), E);
  if (!imported.ok) throw new Error(JSON.stringify(imported.errors));
  return IO.printedStudyDocument({...imported.state, projectName}, E);
}
const advanced = JSON.parse(fs.readFileSync('tests/fixtures/wing_lab_station_browser.json','utf8'));
console.log(JSON.stringify({
  original_v1: original,
  current_v13_legacy_geometry: currentExport(original, 'Legacy geometry'),
  current_v13_station_geometry: currentExport(advanced, 'Station geometry')
}));
"""
    result = subprocess.run(
        ["node", "-e", script], cwd=ROOT, check=True,
        capture_output=True, text=True, encoding="utf-8", timeout=45,
    )
    return json.loads(result.stdout)


@pytest.mark.parametrize("release", [
    "original_v1", "current_v13_legacy_geometry", "current_v13_station_geometry",
])
def test_current_notebook_upload_preserves_both_ui_releases(release_documents, release, tmp_path):
    document = release_documents[release]
    expected = load_wing_lab_study_from_document(document, tmp_path)
    path = tmp_path / "student-upload.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    notebook = json.loads((ROOT / "notebooks/MIE446_Code_to_Print_Wing.ipynb").read_text(encoding="utf-8"))
    source = next(
        "".join(c["source"]) for c in notebook["cells"]
        if c["cell_type"] == "code" and "#@title Import the Wing Lab design" in "".join(c["source"])
    )
    displayed = []
    env = dict(
        DESIGN_SOURCE="Wing Lab JSON", WING_LAB_JSON_FILE=str(path),
        TEAM_ID="Compatibility", REVISION="R01",
        PRINTER_X_MM=300, PRINTER_Y_MM=300, PRINTER_Z_MM=300,
        load_wing_lab_study=load_wing_lab_study, WingLabImportError=WingLabImportError,
        WingProject=WingProject, WingDesign=WingDesign, WingProjectError=WingProjectError,
        display=displayed.append, Markdown=lambda text: text,
    )
    exec(compile(source, "notebook Wing Lab upload", "exec"), env)
    project = env["project"]
    assert project is not None, displayed
    assert project.parameters == expected.parameters
    assert project.source_record["source_document"] == document
    assert project.source_record["sha256"] == expected.source_record["sha256"]
    if release == "original_v1":
        assert document["version"] == 1 and document["app"]["engine"] == "1.1.0"
        assert "projectName" not in document
        assert project.parameters.sweep_deg == project.parameters.dihedral_deg == 0
        assert not project.parameters.airfoil_stations
    elif release == "current_v13_station_geometry":
        assert document["version"] == 2
        assert project.parameters.sweep_deg == 12
        assert project.parameters.dihedral_deg == 6
        assert project.parameters.airfoil_stations
        assert project.project_name == "Station geometry"


def load_wing_lab_study_from_document(document, tmp_path):
    path = tmp_path / "reference.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return load_wing_lab_study(path)
