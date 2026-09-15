# Printing examples

This folder contains a matched sample STL and reference G-code for learning the offline OrcaSlicer workflow.

## Direct downloads

- **[Download the sample STL](https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/printing/examples/reference-glider-model.stl)**
- **[Download the matching reference G-code](https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/printing/examples/reference-k2pro-orcaslicer.gcode)**

The accompanying [sample parametric geometry notebook](../../../notebooks/MIE446_Code_to_Print_Wing.ipynb) demonstrates an executable Python/CadQuery workflow for generating and exporting printable model geometry.

## Do not print the sample

`reference-k2pro-orcaslicer.gcode` is **not approved for printing or reuse**. G-code is specific to its geometry, machine, nozzle, material profile, firmware configuration, and slicer settings. Do not run it, rename it as another user's file, hand-edit it, or use AI to adapt it.

Generate a new file in OrcaSlicer from the checked geometry and the validated profile for the exact printer, nozzle, material, and firmware configuration. Inspect every layer and complete the release checklist before copying the new `.gcode` file to USB.

## File integrity

- Generator recorded in the header: OrcaSlicer 2.4.2
- STL: `reference-glider-model.stl`
  - Original model name: `Surprising Waasa-Uusam (2).stl`
  - SHA-256: `4fdc65754c6969b3c07d22aa9fc53f9efcc0833ce31156c720819ac928ce6f74`
- G-code: `reference-k2pro-orcaslicer.gcode`
  - SHA-256: `7c6b491ecef6f1c900149f7e8c0183ea1a13d74038cc1b1dcffcf69e2f7447c3`
