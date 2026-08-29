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
        "COURSE_RELEASE": "v1.1.0",
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
        "plot_design_overview": lambda parameters: _FigureStub(),
        "plot_modules": lambda modules, **kwargs: _FigureStub(),
    }
    return namespace, downloads, messages


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
    exec(compile(sources[5], "notebook step 6", "exec"), namespace)

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
        assert student_record["engineering_responses"]["area_prediction_matches"]
        assert student_record["engineering_responses"][
            "aspect_ratio_prediction_matches"
        ]
