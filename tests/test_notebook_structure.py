import json
from pathlib import Path
import re


NOTEBOOK_PATH = (
    Path(__file__).parents[1] / "notebooks" / "MIE446_Code_to_Print_Wing.ipynb"
)


def _notebook() -> dict:
    return json.loads(NOTEBOOK_PATH.read_text(encoding="utf-8"))


def test_notebook_has_six_consecutive_student_steps() -> None:
    notebook = _notebook()
    headings = []
    for cell in notebook["cells"]:
        if cell["cell_type"] != "markdown":
            continue
        for line in "".join(cell["source"]).splitlines():
            if line.startswith("## "):
                headings.append(line)

    assert headings == [
        "## 1. Start the design tool",
        "## 2. Enter your wing design",
        "## 3. Preview and understand the design",
        "## 4. Print and record the rod-fit coupon",
        "## 5. Build and verify the 3D wing",
        "## 6. Export and download the submission",
    ]


def test_notebook_exposes_one_editable_form_and_hides_automation() -> None:
    notebook = _notebook()
    code_cells = [cell for cell in notebook["cells"] if cell["cell_type"] == "code"]
    sources = ["".join(cell["source"]) for cell in code_cells]

    assert all(cell.get("metadata", {}).get("cellView") == "form" for cell in code_cells)
    assert sum("#@param" in source for source in sources) == 1
    assert sum("#@title STUDENT INPUT FORM" in source for source in sources) == 1

    notebook_text = "\n".join(sources)
    forbidden_student_api = (
        "SparSpec(",
        "build_wing(",
        "validate_wing(",
        "export_build(",
        "AI_LOG =",
        "pytest",
        "assert FIT_COUPON",
    )
    assert not any(token in notebook_text for token in forbidden_student_api)


def test_notebook_supports_safe_coupon_and_final_run_all_modes() -> None:
    notebook_text = "\n".join(
        "".join(cell["source"]) for cell in _notebook()["cells"]
    )

    assert 'WORKFLOW_STAGE = "Coupon Only"' in notebook_text
    assert '["Coupon Only", "Final Wing"]' in notebook_text
    assert 'COURSE_RELEASE = "v1.1.0"' in notebook_text
    assert "tempfile.mkdtemp" in notebook_text
    assert not re.search(r"\bassert\s+COUPON_CONFIRMED\b", notebook_text)
