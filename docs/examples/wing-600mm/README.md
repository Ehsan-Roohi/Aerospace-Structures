# Wing Lab tutorial sample

[Watch the Wing Lab tutorial](https://www.youtube.com/watch?v=jPvV_6v4KXA) · [Open Wing Lab](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab)

- [Editable design JSON](Wing_600mm.json): use **Open JSON** in Wing Lab.
- [Semi-wing STL ZIP](Wing_600mm_Semi_Wing_STL.zip): three modules.
- [Mirrored full-wing STL ZIP](Wing_600mm_Full_Wing_STL.zip): six modules.

NACA 2412; semi-span 600 mm; root/tip chords 160/100 mm; two bonded spars at x/c = 0.25 and 0.60; 1.2 mm skin; 1.6 mm ribs; root/tip incidence +2/-2 degrees. Five requested interior ribs plus the module-interface layout give seven actual ribs. The full mirrored span is 1200 mm.

The demonstration uses a 1 kg total aircraft mass, n = 1, elliptic lift at x/c = 0.25 and wing self-weight. Each half has 4.905 N gross lift and approximately 3.027 N downward weight. Estimated semi-wing model mass is 308.6 g; it is a controls demonstration, not a submission-ready design meeting the project's 300 g limit.

Extract the ZIP before importing the STL files into OrcaSlicer in millimetres. Every module fits inside 300 x 300 x 300 mm. The full-wing files passed independent closed-edge and orientation checks; see [mesh check results](STL_mesh_checks.json). Inspect the sliced layers before printing. Nominal beam results do not certify local strength, joints or buckling.
