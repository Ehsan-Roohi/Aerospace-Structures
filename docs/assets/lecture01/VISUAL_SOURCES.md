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

- `MIE446_L01_Spoileron_vs_Wingtip_Rudder.png`: original teaching schematic
  comparing a modern raised upper-wing panel with Lilienthal's vertical
  wing-tip vane and their distinct structural interfaces. It is not a
  reconstruction to scale; the historical description follows
  [Raffel et al., *Journal of Aircraft* (2022)](https://doi.org/10.2514/1.C037047).
- `MIE446_L01_Airframe_Map.png`: original schematic top view locating flap,
  aileron, spoiler, slat, horizontal tail, elevator, fin and rudder. Typical
  locations only; it is not the geometry of a particular airplane.
- `MIE446_L01_Wing_Structure.png`: original transparent-skin semi-wing diagram
  locating root, tip, spars, ribs, stringers, wing box and example control
  attachment regions. It is not the students' printed-wing CAD.
- `MIE446_L01_Wing_Devices.png`: original schematic comparison of aileron,
  flap, spoiler and slat. Deflections and load arrows are qualitative.
- `Trim_Worked_Example_v2.svg` / `.png`: side-view force diagram matching the
  notebook's example, with CG ahead of the wing force, tail downforce, dimensions
  and numerical equilibrium checks. The aircraft outline and force lengths are
  schematic. The force-station spacings match the ratio 0.30 m : 4.00 m.
- `Static_Margin_Ruler_v2.svg` / `.png`: common MAC scales with a fixed illustrative
  neutral point and three CG locations. The 40% neutral-point location is teaching
  data, not a claimed property of an actual airplane.

Reproduce the earlier FAA crops and SVGs with
`scripts/build_lecture01_visual_revision.py`; it requires `pypdfium2` and a local
copy of the FAA chapter at `tmp/lecture01-figures/faa-ch6.pdf`. Render SVGs to PNG
with an SVG renderer such as Sharp. The notebook displays PNG versions for consistent
rendering across notebook viewers. The three `MIE446_L01_*.png` diagrams are
original raster teaching figures added separately for the wing anatomy studio.

For background on static margin, see [NACA TN 1670](https://ntrs.nasa.gov/api/citations/19930082297/downloads/19930082297.pdf).
For the distinction between natural stability and active stabilization, see
[NASA, stability augmentation with relaxed static stability](https://ntrs.nasa.gov/citations/19760011057).

## Four aircraft photographs in the spoileron studio

The notebook uses these Wikimedia Commons photographs at reduced display size.
The repository files are unannotated Wikimedia thumbnails; no force arrows or
control labels have been added to the images. Please preserve these credits
and licenses when reusing them.

| Repository file | Aircraft and source | Creator | License |
|---|---|---|---|
| `MIE446_L01_Example_Lilienthal_1895.jpg` | [Lilienthal Experimental Monoplane, 1895](https://commons.wikimedia.org/wiki/File:Otto-Lilienthal-Museum_id_F0158b_(cropped).jpg) | P. W. Preobrashenski / Otto-Lilienthal-Museum | [Public Domain Mark](https://creativecommons.org/publicdomain/mark/1.0/) |
| `MIE446_L01_Example_B737_Descent.jpg` | [Qantas Boeing 737-800 in descent](https://commons.wikimedia.org/wiki/File:Qantas_Boeing_737-800_spoiler_deployed_for_descent.jpg) | Jg4817 | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| `MIE446_L01_Example_A319_Landing.jpg` | [EasyJet Airbus A319 during landing](https://commons.wikimedia.org/wiki/File:EasyJet_A319_wing_spoilers.jpg) | John Haslam | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| `MIE446_L01_Example_Capstan_Airbrake.jpg` | [Slingsby T.49 Capstan airbrakes](https://commons.wikimedia.org/wiki/File:Airbrakes_on_Capstan.jpg) | TSRL | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
