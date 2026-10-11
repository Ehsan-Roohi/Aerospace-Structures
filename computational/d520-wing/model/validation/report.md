# D.520 model vs. manual: validation report

Model: `d520.blend`  |  checks: 67  |  PASS 62  WARN 1  FAIL 1  INFO 3

Tolerance is relative unless the error column shows an absolute value (abs). WARN = within 2.5x tolerance.

| Check | Measured | Target | Error | Verdict | Source |
|---|---|---|---|---|---|
| Wing span | 10.192 m | 10.2 m | -0.1% | **PASS** | PRINTED: p13 [9] 'Envergure maximum 10.20'; p62 Pl.0 '10m200' |
| Overall length (spinner tip to rudder TE) | 8.7689 m | 8.76 m | +0.1% | **PASS** | PRINTED: p63/p66 fiche des cotes 'Longueur hors tout 8.76'; p67 croquis coté '8.76' |
| Rudder TE to propeller plane | 8.2885 m | 8.28 m | +0.1% | **PASS** | PRINTED: p67 croquis coté '8.28' |
| Wing area, gross projected (incl. fuselage strip) | 15.9987 m2 | 15.97 m2 | +0.2% | **PASS** | PRINTED: p63/p66 'Surface des voilures 15m2 97' |
| Chord on the aircraft axis (y=0) | 2.364 m | 2.36 m | +0.2% | **PASS** | PRINTED: p62 Pl.0 '2m360' (dimension of chord on aircraft axis) |
| Chord at wing/fuselage junction (y=0.66) | 2.156 m | 2.15 m | +0.3% | **PASS** | PRINTED: p13 [9] 'Corde dans l'axe ou à l'emplanture 2.15' |
| Chord at tip-cap start (y=4.687) <br>_cap start solved from area_ | 0.924 m | 0.92 m | +0.4% | **PASS** | PRINTED: p13 [9] 'Corde au saumon 0.92' (could read 0.82) |
| Wing LE at junction, S from spinner tip | 2.0218 m | 2.02 m | +0.002 (abs) | **PASS** | DERIVED: rudder hinge S (8.10, SCALED Pl.0 side) - 6.08 (PRINTED p14/p63 hinge-to-LE); Pl.0 side view LE at root: 2.03 (SCALED) |
| Aileron R area, visible (aft of the cove) <br>_incl. nose hidden under the wing: 0.549 m2_ | 0.5004 m2 | 0.5 m2 | +0.1% | **PASS** | PRINTED: p13 [9] |
| Aileron R span | 1.637 m | 1.645 m | -0.5% | **PASS** | PRINTED: p62 Pl.0 '1m645' |
| Aileron R centre distance to axis | 3.84 m | 3.84 m | +0.0% | **PASS** | PRINTED: p13 [9] 'Distance de l'axe de l'aileron à l'axe de l'avion 3.84' |
| Aileron L area, visible (aft of the cove) <br>_incl. nose hidden under the wing: 0.549 m2_ | 0.5 m2 | 0.5 m2 | +0.0% | **PASS** | PRINTED: p13 [9] |
| Aileron L span | 1.637 m | 1.645 m | -0.5% | **PASS** | PRINTED: p62 Pl.0 '1m645' |
| Aileron L centre distance to axis | 3.84 m | 3.84 m | +0.0% | **PASS** | PRINTED: p13 [9] 'Distance de l'axe de l'aileron à l'axe de l'avion 3.84' |
| Flap R area, visible (aft of the cove) <br>_incl. nose hidden under the wing: 1.199 m2_ | 1.0665 m2 | 1.05 m2 | +1.6% | **PASS** | PRINTED: p14 [10] |
| Flap R span | 2.342 m | 2.35 m | -0.3% | **PASS** | PRINTED: p14 [10]; p62 Pl.0 '2m350' |
| Flap R centre distance to axis | 1.77 m | 1.77 m | +0.0% | **PASS** | PRINTED: p14 [10] 'Distance de l'axe du volet à l'axe de l'avion 1.77' |
| Flap L area, visible (aft of the cove) <br>_incl. nose hidden under the wing: 1.197 m2_ | 1.0648 m2 | 1.05 m2 | +1.4% | **PASS** | PRINTED: p14 [10] |
| Flap L span | 2.342 m | 2.35 m | -0.3% | **PASS** | PRINTED: p14 [10]; p62 Pl.0 '2m350' |
| Flap L centre distance to axis | 1.77 m | 1.77 m | +0.0% | **PASS** | PRINTED: p14 [10] 'Distance de l'axe du volet à l'axe de l'avion 1.77' |
| Aileron max chord (visible, at inner end) | 0.3697 m | 0.38 m | -2.7% | **PASS** | PRINTED: p13 [9] |
| Flap max chord (visible part) <br>_printed 0.65 read as including the nose stowed under the shroud_ | 0.628 m | 0.65 m | -3.4% | **PASS** | PRINTED: p14 [10] |
| Upper-surface dihedral outboard of rib 16 | 3.9979 deg | 3.925 deg | +1.9% | **PASS** | PRINTED: p13 [9] / p63 'Dièdre transversal 3°55'30"' (extrados) |
| Lower-surface slope rib 21 -> tip (Pl.1 'tangente 0.1246') | 0.1294 tan | 0.1246 tan | +3.8% | **PASS** | PRINTED: p68 Pl.1 front elevation 'tangente 0.1246' |
| Wing incidence at root (chord line vs thrust axis) | 1.0 deg | 1.0 deg | +0.000 (abs) | **PASS** | PRINTED: p13 [9] 'Calage +1°'; p63 'Incidence de l'aile par rapport à l'axe des propulseurs 1°' |
| Fuselage max width (main frame) | 0.94 m | 0.94 m | +0.0% | **PASS** | PRINTED: p14 [10] 'Dimensions 0.94 - 1.50' |
| Fuselage height incl. canopy at the cockpit (main frame) <br>_includes the sliding hood, which rides 14 mm outside the fixed arches (GUESS); Pl.0 drawn at 1/50 measures 1.53 m_ | 1.5557 m | 1.5 m | +3.7% | **WARN** | PRINTED: p14 [10] |
| Tailplane span | 3.5329 m | 3.54 m | -0.2% | **PASS** | PRINTED: p13 [9] 'Envergure aile démontée 3.54'; p14 [10] 'Envergure maximum 3.54' |
| Tailplane (fixed) area outside the fuselage <br>_including the strip through the fuselage: 1.944 m2_ | 1.7802 m2 | 1.83 m2 | -2.7% | **PASS** | PRINTED: p14 [10]; p63 |
| Elevator area (both) | 1.055 m2 | 1.04 m2 | +1.4% | **PASS** | PRINTED: p14 [10]; p63 |
| Elevator hinge aft of wing LE | 5.8782 m | 5.88 m | -0.0% | **PASS** | PRINTED: p14 [10]; p63 |
| Rudder hinge aft of wing LE | 6.0782 m | 6.08 m | -0.0% | **PASS** | PRINTED: p14 [10]; p63 |
| Fin area exposed above the fuselage (side projection) <br>_total incl. buried root 2.779 m2; the printed 0.59 m2 equals the fin above Z=+0.67 m (thrust-axis frame), i.e. without the curved dorsal fillet_ | 0.7887 m2 | 0.59 m2 | +33.7% | **FAIL** | PRINTED: p14 [10]; p63 |
| Rudder area (side projection) | 1.0172 m2 | 1.04 m2 | -2.2% | **PASS** | PRINTED: p14 [10]; p63 |
| Fin height, fuselage bottom at sternpost to fin tip | 1.8849 m | 1.87 m | +0.8% | **PASS** | PRINTED: p14 [10] 'Hauteur maximum 1.87'; p67 |
| Overall height, flight line (fin tip above ground) <br>_Pl.0 label is blurred; Pl.0 draws the oleos fully extended_ | 3.4327 m | 3.435 m | -0.1% | **PASS** | PRINTED: p62 Pl.0 '3m435' (blurred, low confidence) |
| Propeller diameter | 3.0501 m | 3.05 m | +0.0% | **PASS** | PRINTED: p15 [11] 'Diamètre 3.05'; p63 '3.05' |
| Propeller axis height, flight line | 1.845 m | 1.845 m | +0.0% | **PASS** | PRINTED: p13 [9] '1.845'; p63 '1.84' |
| Propeller ground clearance, flight line | 0.32 m | 0.32 m | -0.000 (abs) | **PASS** | PRINTED: p13 [9] |
| Track (tyre contact points) | 2.88 m | 2.88 m | +0.0% | **PASS** | PRINTED: p14 [10] 'Voie 2.88'; p62 Pl.0 front view scaled 2.85-2.89 |
| Main wheels on the ground in flight line (lowest point Z) | -0.0198 m | 0.0 m | -0.020 (abs) | **PASS** | DERIVED: tyre 6% static deflection |
| Propeller axis height at rest | 2.2649 m | 2.265 m | -0.0% | **PASS** | PRINTED: p13 [9] '2.265' |
| Propeller ground clearance at rest | 0.7399 m | 0.74 m | -0.000 (abs) | **PASS** | PRINTED: p13 [9] |
| Tail wheel on the ground at rest | -0.0151 m | 0.0 m | -0.015 (abs) | **PASS** | DERIVED: p25 tail wheel at frame 12; photo p3 |
| Main wheels on the ground at rest | -0.0298 m | 0.0 m | -0.030 (abs) | **PASS** | DERIVED: prop axis 1.845 -> 2.265 m pivoting on the main wheels |
| Ground angle at rest (derived) | 14.6269 deg |  |  | **INFO** | DERIVED: prop axis 1.845 -> 2.265 m pivoting on the main wheels |
| Right aileron up (stick right) | 30.0 deg | 30 deg | -0.0% | **PASS** | PRINTED: p13 [9] handwritten '30°' |
| Left aileron down (stick right) | 15.0 deg | 15 deg | -0.0% | **PASS** | PRINTED: p13 [9] handwritten '15°' |
| Right aileron down (stick left) | 15.0 deg | 15 deg | -0.0% | **PASS** | PRINTED: p13 [9] handwritten '15°' |
| Left aileron up (stick left) | 30.0 deg | 30 deg | +0.0% | **PASS** | PRINTED: p13 [9] handwritten '30°' |
| Elevator travel up | 20.0 deg | 20 deg | -0.0% | **PASS** | PRINTED: p14 [10] '± 20' |
| Elevator travel down | 20.0 deg | 20 deg | -0.0% | **PASS** | PRINTED: p14 [10] '± 20' |
| Rudder travel right | 30.0 deg | 30 deg | -0.0% | **PASS** | PRINTED: p14 [10] handwritten '30°' |
| Rudder travel left | 30.0 deg | 30 deg | -0.0% | **PASS** | PRINTED: p14 [10] handwritten '30°' |
| Flap travel (down) | 35.0 deg | 35 deg | -0.0% | **PASS** | PRINTED: p14 [10] handwritten '35°' |
| Tailplane incidence +3° | 3.0 deg | 3 deg | -0.0% | **PASS** | PRINTED: p63 'réglable en vol ±3°'; p39 handwheel left of seat |
| Retracted wheel R centre |y| (Pl.0 plan wells) | 0.3047 m | 0.3 m | +0.005 (abs) | **PASS** | SCALED: p62 Pl.0 plan view: retracted wheel centres (fore-aft pivot keeps S) |
| Retracted wheel R protrusion below wing lower surface | -0.0059 m | 0.0 m | -0.006 (abs) | **PASS** | Pl.30: outer face flush with the lower surface |
| Retracted wheel L centre |y| (Pl.0 plan wells) | 0.3047 m | 0.3 m | +0.005 (abs) | **PASS** | SCALED: p62 Pl.0 plan view: retracted wheel centres (fore-aft pivot keeps S) |
| Retracted wheel L protrusion below wing lower surface | -0.0059 m | 0.0 m | -0.006 (abs) | **PASS** | Pl.30: outer face flush with the lower surface |
| Ventral antenna hangs vertical with gear up (z extent) <br>_gear down z extent 0.040 m_ | 0.5507 m |  |  | **INFO** | PRINTED: p29; Pl.45 (p141) |
| Gun port R spanwise station | 1.79 m | 1.79 m | -0.000 (abs) | **PASS** | DERIVED: p145/p148 Pl.50 bis: 1743 and 1840 mm from cannon axis (41 mm off-centre), averaged |
| Gun port R spanwise station | 1.955 m | 1.955 m | +0.000 (abs) | **PASS** | DERIVED: p145/p148 Pl.50 bis: 1743 and 1840 mm from cannon axis (41 mm off-centre), averaged |
| Gun port L spanwise station | 1.79 m | 1.79 m | -0.000 (abs) | **PASS** | DERIVED: p145/p148 Pl.50 bis: 1743 and 1840 mm from cannon axis (41 mm off-centre), averaged |
| Gun port L spanwise station | 1.955 m | 1.955 m | +0.000 (abs) | **PASS** | DERIVED: p145/p148 Pl.50 bis: 1743 and 1840 mm from cannon axis (41 mm off-centre), averaged |
| Pitot on the LEFT wing tip (x < -4.5) <br>_negative x = left (port)_ | -4.8 m |  |  | **INFO** | PRINTED: p27 'au bout de l'aile gauche' |
| Meshes with zero faces or NaN coordinates | 0.0 count | 0 count | +0.000 (abs) | **PASS** | sanity (boolean-failure guard) |

## Parameter provenance

| Status | Count |
|---|---|
| DERIVED | 12 |
| GUESS | 7 |
| PRINTED | 62 |
| SCALED | 12 |

Parameters that are explicit guesses: `airfoil_family`, `canopy_travel`, `exhausts`, `tail_airfoil`, `prop_blade_shape`, `prop_pitch_range`, `tyre_width`

## Mesh sanity

| Object | Faces | Non-manifold edges | Boundary edges | Zero-area faces |
|---|---|---|---|---|
| Aileron_L | 1442 | 0 | 0 | 0 |
| Aileron_R | 1442 | 0 | 0 | 0 |
| Antenna_Mast | 22 | 0 | 0 | 0 |
| Antenna_Ventral | 22 | 0 | 0 | 0 |
| Antenna_Wire | 22 | 0 | 0 | 0 |
| Armour_Plate | 22 | 0 | 0 | 0 |
| Backup_Sight_Post | 22 | 0 | 0 | 0 |
| Blade_1 | 800 | 0 | 0 | 0 |
| Blade_2 | 800 | 0 | 0 | 0 |
| Blade_3 | 800 | 0 | 0 | 0 |
| Canopy_Hood | 1020 | 154 | 154 | 0 |
| Canopy_RearFairing | 2752 | 336 | 336 | 0 |
| Canopy_RearWindow_L | 225 | 68 | 68 | 0 |
| Canopy_RearWindow_R | 225 | 68 | 68 | 0 |
| Canopy_Windscreen | 840 | 148 | 148 | 0 |
| Cockpit_Tub | 1858 | 0 | 0 | 0 |
| Control_Stick | 22 | 0 | 0 | 0 |
| Dial_00_Coolant_(water)_thermometer | 26 | 0 | 0 | 0 |
| Dial_01_Oil_thermometer | 26 | 0 | 0 | 0 |
| Dial_02_Manifold_(boost)_pressure_ga | 26 | 0 | 0 | 0 |
| Dial_03_Carburettor_(fuel)_pressure_ | 26 | 0 | 0 | 0 |
| Dial_04_Oil_pressure_gauge | 26 | 0 | 0 | 0 |
| Dial_05_Tachometer_(rev_counter) | 26 | 0 | 0 | 0 |
| Dial_06_Landing_airspeed_indicator | 26 | 0 | 0 | 0 |
| Dial_07_Vion_compass | 26 | 0 | 0 | 0 |
| Dial_08_Airspeed_indicator_of_the_fl | 26 | 0 | 0 | 0 |
| Dial_09_Turn_indicator_(horizontal_w | 26 | 0 | 0 | 0 |
| Dial_10_Variometer_(vertical-speed_i | 26 | 0 | 0 | 0 |
| Dial_11_Altimeter_(no_callout;_word_ | 26 | 0 | 0 | 0 |
| Dial_12_Clock_(no_callout;_identifie | 26 | 0 | 0 | 0 |
| Dial_13_Oxygen_inhaler_pressure_gaug | 26 | 0 | 0 | 0 |
| Dial_14_Fuel_gauge | 26 | 0 | 0 | 0 |
| Dial_15_Pressure_gauge_(emergency_fl | 26 | 0 | 0 | 0 |
| Dial_16_Brake_supply_(Olaer)_pressur | 26 | 0 | 0 | 0 |
| Elevator_L | 1502 | 0 | 0 | 0 |
| Elevator_R | 1502 | 0 | 0 | 0 |
| Exhaust_L_1.05 | 6 | 0 | 0 | 0 |
| Exhaust_L_1.42 | 6 | 0 | 0 | 0 |
| Exhaust_L_1.79 | 6 | 0 | 0 | 0 |
| Exhaust_R_1.05 | 6 | 0 | 0 | 0 |
| Exhaust_R_1.42 | 6 | 0 | 0 | 0 |
| Exhaust_R_1.79 | 6 | 0 | 0 | 0 |
| Fin | 2580 | 0 | 0 | 0 |
| FinLight_L | 512 | 0 | 0 | 0 |
| FinLight_R | 512 | 0 | 0 | 0 |
| Flap_L | 2222 | 0 | 0 | 0 |
| Flap_R | 2222 | 0 | 0 | 0 |
| Frame_Hood_FrontBow | 492 | 32 | 32 | 0 |
| Frame_Hood_Rail_-1 | 148 | 32 | 32 | 0 |
| Frame_Hood_Rail_1 | 148 | 32 | 32 | 0 |
| Frame_Hood_RearBow | 492 | 32 | 32 | 0 |
| Frame_RearWindow_L | 416 | 0 | 0 | 0 |
| Frame_RearWindow_R | 416 | 0 | 0 | 0 |
| Frame_Windscreen_Base_-1 | 124 | 32 | 32 | 0 |
| Frame_Windscreen_Base_1 | 124 | 32 | 32 | 0 |
| Frame_Windscreen_Bow | 492 | 32 | 32 | 0 |
| Frame_Windscreen_Pillar_-1 | 124 | 32 | 32 | 0 |
| Frame_Windscreen_Pillar_1 | 124 | 32 | 32 | 0 |
| Fuselage | 17598 | 98 | 98 | 0 |
| Gear_Fairing_L_Lower | 72 | 34 | 34 | 0 |
| Gear_Fairing_L_Upper | 16 | 20 | 20 | 0 |
| Gear_Fairing_R_Lower | 72 | 34 | 34 | 0 |
| Gear_Fairing_R_Upper | 16 | 20 | 20 | 0 |
| Gear_Leg_L | 22 | 0 | 0 | 0 |
| Gear_Leg_R | 22 | 0 | 0 | 0 |
| Gear_Slider_L | 22 | 0 | 0 | 0 |
| Gear_Slider_R | 22 | 0 | 0 | 0 |
| Gear_Stub_L | 22 | 0 | 0 | 0 |
| Gear_Stub_R | 22 | 0 | 0 | 0 |
| GunCamera | 22 | 0 | 0 | 0 |
| GunPort_L_1.79 | 22 | 0 | 0 | 0 |
| GunPort_L_1.96 | 22 | 0 | 0 | 0 |
| GunPort_R_1.79 | 22 | 0 | 0 | 0 |
| GunPort_R_1.96 | 22 | 0 | 0 | 0 |
| Gunsight_OPL | 22 | 0 | 0 | 0 |
| Instrument_Panel | 6 | 0 | 0 | 0 |
| Karman_L | 559 | 112 | 112 | 0 |
| Karman_R | 559 | 112 | 112 | 0 |
| NavLight_L | 512 | 0 | 0 | 0 |
| NavLight_R | 512 | 0 | 0 | 0 |
| Pitot | 22 | 0 | 0 | 0 |
| Pitot_Mast | 22 | 0 | 0 | 0 |
| Radiator | 928 | 64 | 64 | 0 |
| Radiator_Core_Front | 1 | 4 | 4 | 0 |
| Radiator_Core_Rear | 1 | 4 | 4 | 0 |
| Radiator_Flap | 6 | 0 | 0 | 0 |
| Rudder | 2704 | 0 | 0 | 0 |
| Rudder_Bar | 22 | 0 | 0 | 0 |
| Rudder_Tab | 252 | 0 | 0 | 0 |
| Seat | 22 | 0 | 0 | 0 |
| Seat_Back | 22 | 0 | 0 | 0 |
| Spinner | 1297 | 48 | 48 | 0 |
| Tailplane | 3364 | 0 | 0 | 0 |
| Tailwheel | 960 | 0 | 0 | 0 |
| Tailwheel_Fork | 22 | 0 | 0 | 0 |
| Tailwheel_Hub | 34 | 0 | 0 | 0 |
| Tailwheel_Strut | 22 | 0 | 0 | 0 |
| Wheel_L | 960 | 0 | 0 | 0 |
| Wheel_L_Hub | 34 | 0 | 0 | 0 |
| Wheel_R | 960 | 0 | 0 | 0 |
| Wheel_R_Hub | 34 | 0 | 0 | 0 |
| Wing_L | 5076 | 0 | 0 | 0 |
| Wing_R | 5076 | 0 | 0 | 0 |