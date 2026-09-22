# Lecture 01: controls, trim and static margin figures

## FAA control-surface illustrations

The following figures were extracted from the Federal Aviation Administration's
[*Pilot's Handbook of Aeronautical Knowledge*, Chapter 6: Flight Controls](https://www.faa.gov/sites/faa.gov/files/08_phak_ch6.pdf).
They retain the original artwork and internal labels; surrounding page text was
cropped away to make the figures readable in Colab. Credit: FAA.

| Repository file | Source figure | Printed page |
|---|---|---|
| `FAA_6_4_Control_Axes.png` | 6-4, controls and axes of rotation | 6-3 |
| `FAA_6_6_Aileron_Deflection.png` | 6-6, differential ailerons | 6-4 |
| `FAA_6_10_Elevator_Pitch.png` | 6-10, elevator effect | 6-5 |
| `FAA_6_15_Rudder_Yaw.png` | 6-15, left rudder effect | 6-8 |

These are published instructional drawings, rather than photographs of a particular
aircraft. Their general arrangement depicts a conventional light airplane.

## Original MIE 446 teaching figures

- `Trim_Worked_Example_v2.svg` / `.png`: side-view force diagram matching the
  notebook's example, with CG ahead of the wing force, tail downforce, dimensions
  and numerical equilibrium checks. The aircraft outline and force lengths are
  schematic. The force-station spacings match the ratio 0.30 m : 4.00 m.
- `Static_Margin_Ruler_v2.svg` / `.png`: common MAC scales with a fixed illustrative
  neutral point and three CG locations. The 40% neutral-point location is teaching
  data, not a claimed property of an actual airplane.

Reproduce the crops and original SVGs with
`scripts/build_lecture01_visual_revision.py`; it requires `pypdfium2` and a local
copy of the FAA chapter at `tmp/lecture01-figures/faa-ch6.pdf`. Render SVGs to PNG
with an SVG renderer such as Sharp. The notebook displays PNG versions for consistent
rendering across notebook viewers.

For background on static margin, see [NACA TN 1670](https://ntrs.nasa.gov/api/citations/19930082297/downloads/19930082297.pdf).
For the distinction between natural stability and active stabilization, see
[NASA, stability augmentation with relaxed static stability](https://ntrs.nasa.gov/citations/19760011057).
