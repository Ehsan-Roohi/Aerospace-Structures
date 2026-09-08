# Printing examples

This folder contains a reference G-code file for inspecting the header, printer identifier, profile metadata, and structure of an OrcaSlicer output.

The accompanying [sample parametric geometry notebook](../../../notebooks/MIE446_Code_to_Print_Wing.ipynb) demonstrates an executable Python/CadQuery workflow for generating and exporting printable model geometry.

## Do not print the sample

`reference-k2pro-orcaslicer.gcode` is **not approved for printing or reuse**. G-code is specific to its geometry, machine, nozzle, material profile, firmware configuration, and slicer settings. Do not run it, rename it as another user's file, hand-edit it, or use AI to adapt it.

Generate a new file in OrcaSlicer from the checked geometry and the validated profile for the exact printer, nozzle, material, and firmware configuration. Inspect every layer and complete the release checklist before copying the new `.gcode` file to USB.

## File integrity

- Generator recorded in the header: OrcaSlicer 2.4.2
- Filename: `reference-k2pro-orcaslicer.gcode`
- SHA-256: `7c6b491ecef6f1c900149f7e8c0183ea1a13d74038cc1b1dcffcf69e2f7447c3`
