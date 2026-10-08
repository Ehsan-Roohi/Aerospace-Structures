# Distributed-load teaching figures

All six figures are original code-generated teaching diagrams, not aircraft
photographs or measured aerodynamic data. Source:
`scripts/enrich_lecture02_load_moments.py`. PNGs are shown in Colab; SVGs are
included as editable vector originals. They load before any code is executed.

The strip figure distinguishes intensity (N/m), force (N) and moment (N m).
The five case figures use a 4 m semi-span and 1200 N half-wing force:
uniform, root-heavy triangle, mirrored tip-heavy triangle, trapezoid with
root/tip intensities 400/200 N/m, and ellipse. Upward arrows illustrate
intensity; they do not represent extra point forces. Equivalent resultants
preserve the total force and root moment, not the entire bending diagram.

The derivations follow elementary force/moment equilibrium. Their closed-form
answers are checked independently against numerical quadrature. Triangles
must be identified by their high-load end. Geometric taper and loading taper
are different inputs. These virtual loads do not authorize physical loading
or flight of the printed student wing.

Rebuild only the relevant notebook cells and these figures with:
`python scripts/enrich_lecture02_load_moments.py`.
The original notebook builder also applies this enrichment, so it will not
restore the shorter three-case lesson. Existing notebook anchors remain valid.
