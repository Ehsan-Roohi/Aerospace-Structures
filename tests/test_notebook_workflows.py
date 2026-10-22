from datetime import date
import json
from pathlib import Path
import re
from types import SimpleNamespace
from zipfile import ZipFile

import pytest

from mie446_wing import (
    WingDesign,
    WingProject,
    WingProjectError,
    make_ai_log,
    WingLabImportError,
    load_wing_lab_study,
)


NOTEBOOK_PATH = (
    Path(__file__).parents[1] / "notebooks" / "MIE446_Code_to_Print_Wing.ipynb"
)


class _FigureStub:
    def show(self) -> None:
        return None


def _code_sources() -> list[str]:
    notebook = json.loads(NOTEBOOK_PATH.read_text(encoding="utf-8"))
    return [
        "".join(cell["source"])
        for cell in notebook["cells"]
        if cell["cell_type"] == "code"
    ]


def _replace_form_defaults(source: str, replacements: dict[str, object]) -> str:
    for name, value in replacements.items():
        source, count = re.subn(
            rf"^{re.escape(name)} = .*?(\s+#@param.*)$",
            lambda match: f"{name} = {value!r}{match.group(1)}",
            source,
            count=1,
            flags=re.MULTILINE,
        )
        assert count == 1, f"form field not found: {name}"
    return source


def _execution_namespace(tmp_path: Path) -> tuple[dict, list[Path], list[str]]:
    downloads: list[Path] = []
    messages: list[str] = []
    counter = iter(range(100))

    def mkdtemp(*, prefix: str) -> str:
        return str(tmp_path / f"{next(counter):02d}_{prefix}")

    namespace = {
        "COURSE_RELEASE": "v1.1.1",
        "Path": Path,
        "date": date,
        "tempfile": SimpleNamespace(mkdtemp=mkdtemp),
        "Markdown": lambda text: text,
        "display": lambda value: messages.append(str(value)),
        "download_in_colab": lambda path: downloads.append(Path(path)),
        "WingDesign": WingDesign,
        "WingProject": WingProject,
        "WingProjectError": WingProjectError,
        "make_ai_log": make_ai_log,
        "WingLabImportError": WingLabImportError,
        "load_wing_lab_study": load_wing_lab_study,
        "plot_design_overview": lambda parameters: _FigureStub(),
        "plot_modules": lambda modules, **kwargs: _FigureStub(),
    }
    return namespace, downloads, messages


@pytest.mark.slow
def test_wing_lab_route_builds_the_uploaded_spar_not_the_form_defaults(tmp_path: Path) -> None:
    from test_wing_lab_bridge import browser_document
    path=tmp_path/'wing.json'
    path.write_text(json.dumps(browser_document()),encoding='utf-8')
    ns, downloads, messages=_execution_namespace(tmp_path)
    _run_student_cells(ns, {
        'DESIGN_SOURCE':'Wing Lab JSON','WING_LAB_JSON_FILE':str(path),
        'WORKFLOW_STAGE':'Final Wing','TEAM_ID':'Bridge07','TEAM_MEMBERS':'Student A',
        'REVISION':'R02','AIRFOIL_CHOICE_REASON':'Reference section for the beam comparison.',
        'PREDICTED_AREA_CHANGE':'decrease','PREDICTED_ASPECT_RATIO_CHANGE':'increase',
        'PREDICTION_EXPLANATION':'The span is fixed while tip chord decreases.',
        'RESULT_INTERPRETATION':'CAD geometry is compared with the imported component inventory.',
        'PRINT_DEFECT_CODE_CANNOT_DETECT':'Layer separation.','AI_USE_DECLARATION':'No material AI use'})
    assert len(downloads)==1
    assert ns['built_project'].build.parameters.semi_span_mm==240
    assert len(ns['built_project'].build.bonded_spars)==1
    assert len(ns['built_project'].build.ribs)==4
    assert ns['coupon_record']['required'] is False
    with ZipFile(downloads[0]) as z:
        assert 'wing_lab_transfer.json' in z.namelist()
        assert len([n for n in z.namelist() if n.endswith('.stl')])==2
    assert any('Wing Lab → CAD import accepted' in m for m in messages)


def test_bad_wing_lab_upload_never_falls_back_to_a_course_wing(tmp_path: Path) -> None:
    path=tmp_path/'bad.json';path.write_text('{}',encoding='utf-8')
    ns,downloads,messages=_execution_namespace(tmp_path)
    _run_student_cells(ns,{'DESIGN_SOURCE':'Wing Lab JSON','WING_LAB_JSON_FILE':str(path),'WORKFLOW_STAGE':'Final Wing'})
    assert ns['project'] is None and ns['built_project'] is None and not downloads
    assert any('No default wing will be built' in m for m in messages)


def _run_student_cells(namespace: dict, replacements: dict[str, object]) -> None:
    sources = _code_sources()
    sources[1] = _replace_form_defaults(sources[1], replacements)
    for cell_number, source in enumerate(sources[1:], start=2):
        exec(compile(source, f"notebook step {cell_number}", "exec"), namespace)


def test_coupon_only_run_all_is_clean_and_rerunnable(tmp_path: Path) -> None:
    namespace, downloads, messages = _execution_namespace(tmp_path)

    _run_student_cells(namespace, {})
    _run_student_cells(namespace, {})

    assert len(downloads) == 2
    assert downloads[0] != downloads[1]
    assert all(path.is_file() for path in downloads)
    assert any("Coupon run complete" in message for message in messages)
    with ZipFile(downloads[-1]) as handle:
        assert "wing_parameters.json" in handle.namelist()
        assert "fit_coupon_mapping.json" in handle.namelist()


def test_final_export_requires_an_explicit_ai_declaration(tmp_path: Path) -> None:
    namespace, downloads, messages = _execution_namespace(tmp_path)
    sources = _code_sources()
    form = _replace_form_defaults(
        sources[1],
        {
            "WORKFLOW_STAGE": "Final Wing",
            "TEAM_ID": "Team07",
            "TEAM_MEMBERS": "Student A; Student B; Student C",
            "REVISION": "R02",
            "AIRFOIL_CHOICE_REASON": "A cambered baseline for comparison.",
            "PREDICTED_AREA_CHANGE": "decrease",
            "PREDICTED_ASPECT_RATIO_CHANGE": "increase",
            "PREDICTION_EXPLANATION": "Span is fixed while area decreases.",
            "RESULT_INTERPRETATION": "The computed trend agrees.",
            "PRINT_DEFECT_CODE_CANNOT_DETECT": "Poor first-layer adhesion.",
        },
    )
    exec(compile(form, "notebook step 2", "exec"), namespace)
    namespace["built_project"] = SimpleNamespace(project=namespace["project"])
    exec(compile(sources[-1], "notebook step 6", "exec"), namespace)

    assert downloads == []
    assert any("AI_USE_DECLARATION" in message for message in messages)


@pytest.mark.slow
def test_final_wing_run_all_builds_verified_submission(tmp_path: Path) -> None:
    namespace, downloads, messages = _execution_namespace(tmp_path)
    _run_student_cells(
        namespace,
        {
            "WORKFLOW_STAGE": "Final Wing",
            "TEAM_ID": "Team07",
            "TEAM_MEMBERS": "Student A; Student B; Student C",
            "REVISION": "R02",
            "COUPON_CONFIRMED": True,
            "COUPON_REVISION": "R01",
            "COUPON_FIT_RESULT": "Snug fit selected",
            "COUPON_TESTER": "Student A",
            "COUPON_DATE": "2026-09-15",
            "AIRFOIL_CHOICE_REASON": "A cambered baseline for comparison.",
            "PREDICTED_AREA_CHANGE": "decrease",
            "PREDICTED_ASPECT_RATIO_CHANGE": "increase",
            "PREDICTION_EXPLANATION": "Span is fixed while trapezoid area decreases.",
            "RESULT_INTERPRETATION": "The automatic result agrees with the prediction.",
            "PRINT_DEFECT_CODE_CANNOT_DETECT": "Poor first-layer adhesion.",
            "AI_USE_DECLARATION": "No material AI use",
        },
    )

    assert namespace["built_project"] is not None
    assert len(downloads) == 1
    assert downloads[0].is_file()
    assert any("Submission package ready" in message for message in messages)
    with ZipFile(downloads[0]) as handle:
        names = set(handle.namelist())
        assert {"manifest.json", "Design_Summary.md", "Design_Overview.html"} <= names
        student_record = json.loads(handle.read("student_design_record.json"))
        assert student_record["rib_count"] == 7
        assert student_record["rib_stations_mm"] == [112.5, 146.0, 154.0, 225.0, 296.0, 304.0, 337.5]
        assert student_record["engineering_responses"]["area_prediction_matches"]
        assert student_record["engineering_responses"][
            "aspect_ratio_prediction_matches"
        ]
