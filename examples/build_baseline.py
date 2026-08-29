"""Build, validate, preview, and export the course baseline."""

from pathlib import Path

from mie446_wing import WingParameters, build_wing, export_build, validate_wing


def main() -> None:
    parameters = WingParameters()
    build = build_wing(parameters)
    report = validate_wing(build)
    print(report.summary())
    report.raise_for_failure()
    destination = Path("outputs") / "baseline"
    manifest = export_build(build, destination, team="Team00", revision="R01")
    print(f"Exported {len(manifest['files'])} geometry files to {destination.resolve()}")


if __name__ == "__main__":
    main()

