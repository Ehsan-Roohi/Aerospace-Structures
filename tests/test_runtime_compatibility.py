from pathlib import Path
import tomllib


ROOT = Path(__file__).parents[1]


def test_project_metadata_accepts_current_colab_python() -> None:
    metadata = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    assert metadata["project"]["version"] == "1.1.1"
    assert metadata["project"]["requires-python"] == ">=3.11,<3.14"


def test_ci_exercises_python_313() -> None:
    workflow = (ROOT / ".github" / "workflows" / "tests.yml").read_text(
        encoding="utf-8"
    )
    assert 'python-version: ["3.12", "3.13"]' in workflow
    assert "python-version: ${{ matrix.python-version }}" in workflow
