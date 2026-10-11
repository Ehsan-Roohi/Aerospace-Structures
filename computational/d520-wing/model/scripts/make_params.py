"""Builds data/d520_params.json: every number the model uses, with its provenance.

Status classes
  PRINTED  value printed in the manual (text table or written on a plate)
  SCALED   measured on a scale drawing of the manual (Pl. 0 is drawn at 1/50 and scanned
           at 150 dpi = 118.11 px/m; Pl. 1 front elevation)
  DERIVED  computed from PRINTED/SCALED values (the formula is given)
  EXTERNAL taken from a published secondary source (only used to break ties)
  GUESS    no source; an explicit, labelled assumption

Page references are PDF page numbers of the scanned manual (printed page in brackets).
Model frame: S = metres aft of the spinner tip, Y = metres to starboard, Z = metres above the
propeller (thrust) axis, which the manual uses as its reference axis.
"""
import json, math, os

P = {}

def add(key, value, unit, status, sources, note="", alternatives=None):
    P[key] = {"value": value, "unit": unit, "status": status, "sources": sources, "note": note}
    if alternatives:
        P[key]["alternatives"] = alternatives

# ---------------- overall ----------------
add("span", 10.20, "m", "PRINTED",
    ["p13 [9] 'Envergure maximum 10.20'", "p62 Pl.0 '10m200'", "p63/p66 fiche des cotes '10.20'", "p165 Pl.60 '10 m 20'"])
add("length", 8.76, "m", "PRINTED",
    ["p63/p66 fiche des cotes 'Longueur hors tout 8.76'", "p67 croquis coté '8.76'", "p165 Pl.60 '8 m 76'"],
    "Spinner tip to rudder trailing edge.",
    [{"value": 8.78, "source": "p13 [9] table (last digit faint, could be 6)", "decision": "rejected 3 to 1"}])
add("rudder_te_to_prop_plane", 8.28, "m", "PRINTED", ["p67 croquis coté '8.28'"])
add("prop_plane_S", 8.76 - 8.28, "m", "DERIVED", ["length - rudder_te_to_prop_plane"])
add("height_flight_line", 3.435, "m", "PRINTED", ["p62 Pl.0 '3m435' (blurred, low confidence)"],
    "Not used to build: the model's height results from fin geometry + gear; checked by validation.")

# ---------------- wing ----------------
add("wing_area", 15.97, "m2", "PRINTED", ["p63/p66 'Surface des voilures 15m2 97'"],
    alternatives=[{"value": 15.95, "source": "p13 [9] 'Surface nette 15.95'", "decision": "0.1% apart; 15.97 used"},
                  {"value": 15.87, "source": "EXTERNAL Wikipedia (Danel & Cuny)", "decision": "not used"}])
add("chord_centreline", 2.36, "m", "PRINTED", ["p62 Pl.0 '2m360' (dimension of chord on aircraft axis)"],
    "Pl.0's 2.360 dimension matches the LE/TE lines extrapolated to the centreline (276 px = 2.34 m at 1/50).")
add("chord_root_junction", 2.15, "m", "PRINTED", ["p13 [9] 'Corde dans l'axe ou à l'emplanture 2.15'"],
    "Interpreted as the chord at the wing/fuselage junction (Pl.0 scaled: 2.16 m at y=0.66 m).")
add("chord_tip", 0.92, "m", "PRINTED", ["p13 [9] 'Corde au saumon 0.92' (could read 0.82)"],
    "Pl.0 extrapolated tip chord 0.905 m supports 0.92 over 0.82.")
add("tip_cap_start_y", None, "m", "DERIVED",
    ["solve: area(c0=2.36, ct=0.92 at y_t, half-elliptic cap to 5.10) = 15.97"],
    "Lands at rib 2 / aileron outer end; Pl.0 drawn cap length 0.41 m agrees.")
add("taper_split_LE_fraction", 0.5226, "-", "SCALED",
    ["p62 Pl.0 plan view: LE slope 0.1428, TE slope 0.1305 (px/px)"],
    "Fraction of the chord reduction taken by the leading edge. Gives a main-spar line (36% chord) swept ~1 deg, matching the printed 'flèche longitudinale 1°' (p63).")
add("sweep_reference", 1.0, "deg", "PRINTED", ["p63/p66 'Flèche longitudinale 1°'", "p13 'V de l'avion en plan 1°'"],
    "Used as a check only (spar line sweep).")
add("wing_incidence", 1.0, "deg", "PRINTED", ["p13 [9] 'Calage +1°'", "p63 'Incidence de l'aile par rapport à l'axe des propulseurs 1°'"])
add("dihedral_upper_outer", 3 + 55/60 + 30/3600, "deg", "PRINTED", ["p13 [9] / p63 'Dièdre transversal 3°55'30\"' (extrados)"],
    "Applied to the upper-surface line outboard of rib 16 (dihedral break, Pl.1).")
add("upper_slope_inner", 0.0046, "tan", "PRINTED", ["p68 Pl.1 front elevation 'tangente 0.0046'"], "Upper surface, root to rib 16.")
add("lower_slope_outer", 0.1246, "tan", "PRINTED", ["p68 Pl.1 front elevation 'tangente 0.1246'"], "Lower surface, rib 21 to tip.")
add("rib_y", {"1": 4.92, "2": 4.68, "5": 3.94, "6": 3.72, "9": 3.01, "11": 2.53, "13": 2.07, "15": 1.66, "16": 1.50, "21": 0.70, "22": 0.51}, "m",
    "SCALED", ["p68 Pl.1 rib stations, scaled with aileron (ribs 2-9 = 1.645 m) and flap (ribs 9-21 = 2.35 m)"],
    "Rib numbering runs 1 (tip) to 22 (root).")
add("root_thickness", 0.409, "m", "SCALED", ["p68 Pl.1 front elevation at rib 22 (162 px at 396 px/m)"],
    "t/c = 18.6 % at rib 22.")
add("tc_tip", None, "-", "DERIVED", ["root_thickness and the two printed surface slopes"], "About 10 % at the tip-cap start.")
add("airfoil_family", "symmetric NACA 4-digit thickness at root, blending to NACA 230 camber line at tip", "-", "GUESS",
    ["p13 [9] zero-lift line '0°4' relative to root chord (near-symmetric root)"],
    "Thickness distribution from the manual; camber family is an assumption. No washout data in the manual: zero twist.")
add("wing_LE_junction_S", 2.02, "m", "DERIVED",
    ["rudder hinge S (8.10, SCALED Pl.0 side) - 6.08 (PRINTED p14/p63 hinge-to-LE)", "Pl.0 side view LE at root: 2.03 (SCALED)"])
add("wing_root_lower_Z", -0.84, "m", "SCALED", ["p62 Pl.0 side view: wing/fuselage bottom line under the wing (px 368-372)"])
add("aileron_span", 1.645, "m", "PRINTED", ["p62 Pl.0 '1m645'"],
    alternatives=[{"value": 1.55, "source": "p13 [9] table (independent audit confirms the 5s)",
                   "decision": "1.645 used: third sources Pl.0 scaled at 1/50 (1.69 m) and Pl.59 aileron/flap split (~1.7 m) side with Pl.0"}])
add("aileron_centre_y", 3.84, "m", "PRINTED", ["p13 [9] 'Distance de l'axe de l'aileron à l'axe de l'avion 3.84'"],
    "Audit: first decimal could read 0 (3.04), which would overlap the flaps; 3.84 is the only consistent reading (aileron then ends at the tip-cap start).")
add("aileron_area_each", 0.50, "m2", "PRINTED", ["p13 [9]"])
add("aileron_chord_max", 0.38, "m", "PRINTED", ["p13 [9]"])
add("aileron_chord_fraction", 0.258, "-", "DERIVED", ["aileron_area_each / integral of wing chord over aileron span"],
    "Pl.0 scaled 0.26. Gives max chord 0.369 m (printed 0.38, -3%).")
add("aileron_up", 30, "deg", "PRINTED", ["p13 [9] handwritten '30°'"])
add("aileron_down", 15, "deg", "PRINTED", ["p13 [9] handwritten '15°'"])
add("flap_span", 2.35, "m", "PRINTED", ["p14 [10]", "p62 Pl.0 '2m350'"])
add("flap_centre_y", 1.77, "m", "PRINTED", ["p14 [10] 'Distance de l'axe du volet à l'axe de l'avion 1.77'"])
add("flap_area_each", 1.05, "m2", "PRINTED", ["p14 [10]"])
add("flap_chord_max", 0.65, "m", "PRINTED", ["p14 [10]"])
add("flap_chord_fraction", 0.25, "-", "DERIVED", ["flap_area_each / integral of wing chord over flap span = 0.246", "Pl.0 scaled 0.26"],
    "Visible flap. The printed 0.65 max chord is read as including the flap nose stowed under the shroud (slotted flap, Pl.6).")
add("flap_down", 35, "deg", "PRINTED", ["p14 [10] handwritten '35°'"])
add("gun_inner_y", 1.79, "m", "DERIVED", ["p145/p148 Pl.50 bis: 1743 and 1840 mm from cannon axis (41 mm off-centre), averaged"])
add("gun_outer_y", 1.955, "m", "DERIVED", ["p145/p148 Pl.50 bis: +168 / +160 mm"])

# ---------------- fuselage ----------------
add("main_frame_width", 0.94, "m", "PRINTED", ["p14 [10] 'Dimensions 0.94 - 1.50'"], "Pl.0 plan scaled 0.93-0.95.")
add("main_frame_height", 1.50, "m", "PRINTED", ["p14 [10]"], "Matches Pl.0 side depth incl. canopy (1.53).")
add("section_shape", "ovoid", "-", "PRINTED", ["p14 [10] 'Forme: ovoïde'"],
    "Widest at 41% of height from the bottom (SCALED, Pl.0 front view); superellipse exponents are a GUESS.")
add("fuselage_profile", "pl0_side_px.json / pl0_plan_px.json", "-", "SCALED",
    ["p62 Pl.0 side and plan views, 1/50"], "Side: S=(3035-px)/118.4, Z=(273-py)/118.4. Plan: S=(1745-py)/120.4, Y=(px-976.5)/119.9.")
add("frames_S", {"1": 2.80, "3": 3.65, "5": 4.90, "12": 7.84}, "m", "DERIVED",
    ["p19: main spar at frame 1, false spar at frame 3", "p60: cockpit between frames 3 and 5", "p25: tail wheel at frame 12; photo p3 tail wheel position"],
    "Intermediate frames evenly spaced (GUESS).")
add("canopy_stations", {"windscreen_front": 3.83, "windscreen_rear": 4.27, "hood_front": 4.29, "hood_rear": 4.86, "rear_fairing_end": 5.51, "top_Z": 0.80, "sill_Z": 0.30}, "m",
    "SCALED", ["p62 Pl.0 side view canopy outline"])
add("canopy_width", 0.60, "m", "SCALED", ["p62 Pl.0 plan (0.57) and front (0.63) views"])
add("canopy_travel", 0.55, "m", "GUESS", ["photos p3/p4 show the hood slid back about its own length"])
add("radiator", {"S_front": 2.77, "S_rear": 4.09, "bottom_Z": -1.106, "width": 0.86}, "m", "SCALED",
    ["p62 Pl.0 side view (bath under centre section)", "p26 'radiateur sous le fuselage, caréné, volet arrière commandé'"],
    "Width is a GUESS bounded by the Pl.0 front view (0.98) and fuselage width.")
add("exhausts", {"S": [1.05, 1.42, 1.79], "Z": 0.20}, "m", "GUESS", ["photos p3/p4: three exhaust groups per side", "p16 flame dampers 'G.A.L.L.'"])

# ---------------- tail ----------------
add("tailplane_span", 3.54, "m", "PRINTED",
    ["p13 [9] 'Envergure aile démontée 3.54'", "p14 [10] 'Envergure maximum 3.54'", "p67 croquis coté half span '1.77'"],
    alternatives=[{"value": 3.63, "source": "p62 Pl.0 '3m630' (drawing scales 3.66)", "decision": "rejected 3 to 1; Pl.0 outline used for shape only"}])
add("tailplane_area_fixed", 1.83, "m2", "PRINTED", ["p14 [10]", "p63"])
add("elevator_area", 1.04, "m2", "PRINTED", ["p14 [10]", "p63"])
add("elevator_hinge_from_LE", 5.88, "m", "PRINTED", ["p14 [10]", "p63", "p67"])
add("elevator_travel", 20, "deg", "PRINTED", ["p14 [10] '± 20'"])
add("tailplane_Z", 0.376, "m", "SCALED", ["p62 Pl.0 side view (py 228.5)"])
add("tailplane_incidence_range", 3, "deg", "PRINTED", ["p63 'réglable en vol ±3°'", "p39 handwheel left of seat"])
add("fin_height", 1.87, "m", "PRINTED", ["p14 [10] 'Hauteur maximum 1.87'", "p67"], "Pl.0 side scaled 1.87 (fuselage bottom at sternpost to fin tip).")
add("fin_area", 0.59, "m2", "PRINTED", ["p14 [10]", "p63"])
add("rudder_area", 1.04, "m2", "PRINTED", ["p14 [10]", "p63"])
add("rudder_hinge_from_LE", 6.08, "m", "PRINTED", ["p14 [10]", "p63", "p67"])
add("rudder_travel", 30, "deg", "PRINTED", ["p14 [10] handwritten '30°'"])
add("tail_airfoil", "NACA 0012", "-", "GUESS", [], "No tail section in the manual.")

# ---------------- powerplant ----------------
add("prop_diameter", 3.05, "m", "PRINTED", ["p15 [11] 'Diamètre 3.05'", "p63 '3.05'", "p67 radius '1.525'"])
add("prop_blades", 3, "-", "PRINTED", ["p26/p27", "photos p2-p4"])
add("prop_make", "Ratier (electric) or Chauvière (pneumatic 2-pitch / electro-magnetic)", "-", "PRINTED", ["p15", "p27"])
add("prop_blade_shape", "paddle blade, max chord 0.24 m at 45% R, Clark-Y-like section", "-", "GUESS", [])
add("prop_pitch_range", [20, 45], "deg at 0.75R", "GUESS", ["p15 'Pas limite' left blank"])
add("spinner", {"length": 0.55, "base_diameter": 0.55}, "m", "SCALED", ["p62 Pl.0 plan cowl ring 0.53, side 0.53-0.62, front 0.57"], "Length GUESS bounded by the prop plane at 0.48 m (PRINTED 8.76-8.28).")
add("engine_offset_left", 1.0, "deg", "PRINTED", ["p15 [11] 'Calage latéral 1° à gauche'", "p145 Pl.50 bis '41 mm at the nose'"])

# ---------------- landing gear ----------------
add("track", 2.88, "m", "PRINTED", ["p14 [10] 'Voie 2.88'", "p62 Pl.0 front view scaled 2.85-2.89"],
    alternatives=[{"value": 2.83, "source": "p62 Pl.0 label '2m830' (independent audit confirms 830)",
                   "decision": "2.88 used: typed characteristics table (audit: both 8s closed); third source Pl.0 front view scaled 2.86-2.92 m does not separate them clearly, so the official table wins"}])
add("prop_axis_height_flight_line", 1.845, "m", "PRINTED", ["p13 [9] '1.845'", "p63 '1.84'"],
    alternatives=[{"value": 1.95, "source": "p62 Pl.0 '1m950'", "decision": "rejected 2 to 1"}])
add("prop_axis_height_rest", 2.265, "m", "PRINTED", ["p13 [9] '2.265'"])
add("prop_clearance_flight_line", 0.32, "m", "PRINTED", ["p13 [9]"])
add("prop_clearance_rest", 0.74, "m", "PRINTED", ["p13 [9]"])
add("wheel_diameter", 0.66, "m", "SCALED", ["p62 Pl.0 side view dashed wheel (0.65-0.73)", "Pl.0 plan retracted wheel circles (0.63)"],
    "Tyre size '10 bis' (p14) not converted: no table in the manual.")
add("tyre_width", 0.20, "m", "GUESS", ["Pl.30 drawing proportion ~0.3 x diameter"])
add("main_axle_S", 2.38, "m", "SCALED", ["p62 Pl.0 plan view: retracted wheel centres (fore-aft pivot keeps S)"],
    "Pl.0 side view puts it at 2.28.")
add("gear_retract", "inward, 90 deg about a fore-aft axis", "-", "PRINTED", ["p21/p22", "Pl.30"])
add("gear_leg", None, "m", "DERIVED",
    ["track/2, retracted wheel y (0.30, SCALED Pl.0 plan), axle height from 1.845 - wheel radius, retracted wheel at wing mid-thickness"],
    "Solved in the build script: leg length ~1.03 m, splay ~6 deg.")
add("oleo_stroke", 0.30, "m", "PRINTED", ["p14 [10] 'course 300'"])
add("tail_wheel_S", 7.84, "m", "DERIVED", ["p25 tail wheel at frame 12", "photo p3"])
add("rest_attitude", None, "deg", "DERIVED", ["prop axis 1.845 -> 2.265 m pivoting on the main wheels"], "~14.6 deg nose up.")

# ---------------- equipment ----------------
add("pitot", "left wing tip", "-", "PRINTED", ["p27 'au bout de l'aile gauche'"])
add("nav_lights", "red left tip, green right tip, 2 white at top of fin", "-", "PRINTED", ["p48"])
add("gun_camera", "under left wing", "-", "PRINTED", ["p31"], "Spanwise station is a GUESS (y=2.4 m).")
add("antenna_fixed", "mast on top behind cockpit, wire to fin", "-", "PRINTED", ["p29, p46 (upper antenna fixed)", "Pl.44, photos"], "Mast height is a GUESS (0.45 m).")
add("antenna_ventral", "retractable, hinged ahead of frame 7, vertical when gear up", "-", "PRINTED", ["p29", "Pl.45 (p141)"])
add("tail_lift_bar_hole", "through rear fuselage", "-", "PRINTED", ["p48"])

# ---------------- paint ----------------
add("paint_upper", ["kaki mat", "terre foncée mat", "gris bleu foncé mat"], "-", "PRINTED", ["p59 [50 bis] 'camouflage kaki, terre foncée, gris bleu foncé'"],
    "Pattern shape and RGB values are a GUESS (manual names colours only; camouflage drawing number left blank).")
add("paint_lower_metal", "gris bleu (matt blue-grey)", "-", "PRINTED", ["p59"])
add("paint_lower_fabric", "gris bleu clair", "-", "PRINTED", ["p59"])
add("roundels", "white/red/blue, ST letter 10990/A", "-", "PRINTED", ["p59"], "French order (blue centre, white, red outer); sizes GUESS.")
add("rudder_stripes", "blue/white/red over white, black lettering", "-", "PRINTED", ["p60"], "Lettering 'D / 520' from photo p3.")
add("flettner_tab", "red", "-", "PRINTED", ["p61"])
add("cockpit_paint", "matt night blue", "-", "PRINTED", ["p60"])

# ---- derived: tip cap start from the area equation ----
c0 = P["chord_centreline"]["value"]; ct = P["chord_tip"]["value"]; b2 = P["span"]["value"] / 2; A = P["wing_area"]["value"]
# per side: (c0+ct)/2*yt + pi/4*ct*(b2-yt) = A/2
yt = (A / 2 - math.pi / 4 * ct * b2) / ((c0 + ct) / 2 - math.pi / 4 * ct)
P["tip_cap_start_y"]["value"] = round(yt, 4)
k = (c0 - ct) / yt
P["tip_cap_start_y"]["note"] += f" Result y_t = {yt:.3f} m; chord taper {k:.4f} m/m; chord at y=0.66: {c0-k*0.66:.3f} m (printed 2.15)."

os.makedirs(os.path.join(os.path.dirname(__file__), "..", "data"), exist_ok=True)
out = os.path.join(os.path.dirname(__file__), "..", "data", "d520_params.json")
json.dump(P, open(out, "w"), indent=1, ensure_ascii=False)
print("wrote", out, len(P), "parameters; y_t =", round(yt, 3), "k =", round(k, 4), "c(0.66) =", round(c0 - k * 0.66, 3))
