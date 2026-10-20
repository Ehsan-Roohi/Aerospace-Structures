# Beam strength and factor-of-safety screening

The widget below the beam results is a nominal elastic screening tool, not a fracture predictor or certification. No material strength or required factor of safety is assumed. The elastic modulus is never reused as a strength.

## Criteria and input

- Ductile isotropic: von Mises stress `sqrt(sigma²+3*tau²)` compared with the entered yield strength. Both stresses are evaluated at the same material point. This is yield onset, not ultimate fracture or an all-material criterion.
- Separate limits: signed tension, compression and shear checked independently. All three strengths are required for a complete assessment. No interaction, anisotropic laminate or brittle-fracture criterion is claimed.
- Bonded rectangular layers: each material needs its own limits; transformed-section normal stresses and nominal shear follow the existing solver. Interface adhesion/peel/debonding is NOT checked.
- Required FoS must be at least 1. An optional positive displacement limit is a separate serviceability check. Strengths are MPa, displacement mm.

Missing/invalid limits are explicitly NOT CHECKED. A known exceeded limit remains red even when other criteria are missing; this is labelled incomplete. Zero load does not supply missing strength data. No-data states are never rendered as passing.

## Numerical interpretation

Exact equilibrium V and M are evaluated on both sides of concentrated actions. Each interval between solver nodes is subdivided to at most L/240; each subinterval evaluates both endpoints (appropriate limits) and its midpoint. Depth samples include outer fibres, neutral axis, and both sides of section/material junctions. The critical marker is the highest-utilization evaluated point, with x, x-side, z from geometric mid-depth, material, sigma, tau and criterion shown. It is not an exact crack location.

For a green classification, conservative envelopes also cover unsampled extrema. `|q| <= sum(load peak magnitudes)` bounds shear variation; `dM/dx=V` then bounds bending moment over each action-free interval. Depth-wise normal-stress bounds and the supported section's maximum nominal shear factor bound the equivalent stress. These upper envelopes may combine separate maxima only as explicitly conservative bounds, NEVER as a claimed pointwise physical stress. The reported minimum FoS is a conservative lower bound; the separate evaluated-point FoS is displayed as such. A conservative gap can produce amber even when sampled points meet the requirement.

Green means only that the entered nominal criteria meet the entered required FoS within these bounds. Amber means the required margin is not demonstrated, or the small-displacement model has a validity warning. Red means a computed material limit has been reached/exceeded, not that post-failure behaviour has been solved. Grey means missing/not checked. FE displacement over 5% of span uses the existing model-warning threshold and prevents an unqualified green overall assessment. The optional displacement maximum is found analytically within each cubic Hermite FE interpolation, not just from plot samples; mesh/model accuracy still matters.

Hollow-section shear uses the existing width-averaged beam-theory field. Buckling, local contact/clamp concentrations, holes, joint/adhesive failure, fatigue, cracks, process defects, plasticity and post-buckling are outside this check. Passing nominal stress criteria is not a guarantee against those failure modes.

## State and export

The physical beam body uses the same interval colours as the strength map, with a critical evaluated-station marker. Clicking its body (outside active placement tools and selectable loads/supports/hinges) opens the station readout immediately below the picture. Numeric x and left/right-limit controls provide keyboard access and exact discontinuity inspection. The readout reports co-located normal and shear stresses, depth and material of the most utilized evaluated fibre, and the corresponding sampled cross-section FoS. With missing limits it still reports nominal stresses but marks FoS not checked. It does not claim exact through-depth extrema. The global conservative interval colour can be more cautious than a selected sampled section. Near a nominally zero-demand station, floating-point equilibrium residuals may give a very large finite FoS rather than infinity. No stress colour is an additional applied load, support, or selectable/deletable component.

Only the current solved beam is assessed. Pending, invalid or mechanism inputs immediately hide the assessment/map and disable strength export. Material-limit changes recompute the assessment but do not change elastic beam physics. Limits are a validated, version-1 `strength` extension in the beam study JSON; ordinary old files reset limits to unspecified. Share URLs and A/B snapshots omit strength settings and the UI says so. Printed reports and the dedicated strength CSV include the criteria, limits, assessment, critical evaluated point and conservative-bound interpretation. Imported numerical results are never trusted or reused.

## Verification

The Diagrams result view includes Mohr’s circle linked to the selected strength-inspection station (or the initial cut station before one is selected). A separately entered z selects a real, co-located nominal beam stress state; a button selects the section’s governing evaluated depth. For x along the beam and z upward, σx is the recovered bending stress, σz=0 and τxz=−VQ/(Ib). The minus sign translates the app’s positive downward internal V on the +x face into an upward-positive local tensor shear. The circle uses τ positive upward: X=(σx,τxz), Z=(σz,−τxz), C=(σx+σz)/2, R=hypot((σx−σz)/2,τxz), σ1,2=C±R. The physical principal direction is θ1=atan2(2τxz,σx−σz)/2 (modulo 180 degrees); a physical positive rotation maps to a negative doubled circle rotation. Equal principal stresses leave the direction indeterminate. The third principal stress is zero under plane stress. The circle is available with unspecified strengths, but FoS then remains not checked. This does not add transverse normal, contact, or torsional stresses to the beam model.

Run `test_beam_strength.mjs` for analytical bending/yield/FoS, actual same-point stress combination, load reversal, missing/invalid data, zero load, all six section shapes, layer-specific strengths, conservative envelopes compared with independent dense stresses, concentrated-action limits and cubic FE displacement. Run `test_beam_strength_ui.mjs` with jsdom for colours, missing/stale states, limit validation, save/import and old-file reset, CSV content, critical station and print-report content. Browser rendering and interactions are checked separately.

Criterion references: [SOLIDWORKS failure-criteria summary](https://help.solidworks.com/2026/English/SolidWorks/cworks/r_Summary_of_Failure_Criteria.htm), [Autodesk safety-factor interpretation](https://help.autodesk.com/cloudhelp/ENU/Fusion-Simulate/files/SIM-SAFETY-FACTOR-CALC-CONCEPT.htm). These do not validate this implementation or provide material strengths.
