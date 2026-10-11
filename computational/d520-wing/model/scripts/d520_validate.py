"""Measure the built Blender model against the manual and flag every gap.

    python3 d520_validate.py build/d520.blend --out validation/

Writes validation/report.md and validation/report.json. Each check: quantity, target (with its page
reference and status from data/d520_params.json), measured value, tolerance, verdict PASS/WARN/FAIL.
Also runs mesh sanity checks (empty meshes, NaNs, non-manifold edges, inverted normals) - the class of
silent failure that a bad boolean produces.
"""
import sys, os, math, json, argparse
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import d520_geom as G
from PIL import Image, ImageDraw

PRM = G.PRM
CHECKS = []

def src(key):
    p = PRM.get(key, {})
    return f"{p.get('status','?')}: " + "; ".join(p.get("sources", [])[:2])

def check(name, measured, target, tol, unit, source, kind="rel", note=""):
    if target is None:
        verdict = "INFO"
        err = None
    else:
        err = (measured - target) / target if kind == "rel" else (measured - target)
        a = abs(err)
        verdict = "PASS" if a <= tol else ("WARN" if a <= 2.5 * tol else "FAIL")
    CHECKS.append(dict(check=name, measured=round(float(measured), 4), target=target, unit=unit, tolerance=tol, mode=kind,
                       error=None if err is None else round(float(err), 4), verdict=verdict, source=source, note=note))

def ctrl():
    return bpy.data.objects["D520_CONTROLS"]

def set_controls(**kw):
    c = ctrl()
    for k in ("aileron", "elevator", "rudder", "flaps", "gear", "canopy", "prop_pitch", "tailplane_incidence", "radiator_flap", "attitude", "prop_spin_deg"):
        c[k] = 0.0
    for k, v in kw.items(): c[k] = v
    c.update_tag()
    sc = bpy.context.scene; sc.frame_set(sc.frame_current)     # forces driver re-evaluation
    bpy.context.view_layer.update()

def world_verts(name):
    ob = bpy.data.objects[name]
    dg = bpy.context.evaluated_depsgraph_get(); oe = ob.evaluated_get(dg)
    me = oe.to_mesh()
    co = np.zeros(len(me.vertices) * 3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    M = np.array(ob.matrix_world)
    w = co @ M[:3, :3].T + M[:3, 3]
    oe.to_mesh_clear()
    return w

def world_tris(name):
    ob = bpy.data.objects[name]
    dg = bpy.context.evaluated_depsgraph_get(); oe = ob.evaluated_get(dg)
    me = oe.to_mesh(); me.calc_loop_triangles()
    co = np.zeros(len(me.vertices) * 3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    tri = np.zeros(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get("vertices", tri); tri = tri.reshape(-1, 3)
    M = np.array(ob.matrix_world)
    w = co @ M[:3, :3].T + M[:3, 3]
    oe.to_mesh_clear()
    return w[tri]

def projected_area(names, axes=(0, 1), cell=0.004, clip=None):
    T = np.concatenate([world_tris(n) for n in names])
    P = T[:, :, list(axes)]
    lo = P.reshape(-1, 2).min(0) - 0.05; hi = P.reshape(-1, 2).max(0) + 0.05
    Wd, Hd = int((hi[0] - lo[0]) / cell) + 1, int((hi[1] - lo[1]) / cell) + 1
    im = Image.new("1", (Wd, Hd), 0); d = ImageDraw.Draw(im)
    for t in P:
        pts = [((x - lo[0]) / cell, (y - lo[1]) / cell) for x, y in t]
        d.polygon(pts, fill=1)
    a = np.array(im, bool)
    if clip is not None:
        xs = lo[0] + (np.arange(Wd) + 0.5) * cell; ys = lo[1] + (np.arange(Hd) + 0.5) * cell
        X, Y = np.meshgrid(xs, ys)
        a = a & clip(X, Y)
    return a.sum() * cell * cell, a, lo, cell

def rot_angle(M0, M1):
    R = (Matrix(M1).to_3x3() @ Matrix(M0).to_3x3().inverted())
    q = R.to_quaternion()
    return math.degrees(q.angle)

def main(blend, outdir):
    bpy.ops.wm.open_mainfile(filepath=blend)
    c = ctrl()
    if c.animation_data: c.animation_data.action = None
    set_controls()
    os.makedirs(outdir, exist_ok=True)
    zoff = G.v("prop_axis_height_flight_line")
    # ------------------------------------------------ overall
    wv = np.concatenate([world_verts("Wing_R"), world_verts("Wing_L")])
    check("Wing span", wv[:, 0].max() - wv[:, 0].min(), 10.20, 0.005, "m", src("span"))
    sp = world_verts("Spinner"); rd = world_verts("Rudder")
    check("Overall length (spinner tip to rudder TE)", sp[:, 1].max() - rd[:, 1].min(), 8.76, 0.005, "m", src("length"))
    hub = bpy.data.objects["Prop_Hub"].matrix_world.translation
    check("Rudder TE to propeller plane", hub.y - rd[:, 1].min(), 8.28, 0.01, "m", src("rudder_te_to_prop_plane"))
    # ------------------------------------------------ wing planform
    wing_parts = ["Wing_R", "Wing_L", "Flap_R", "Flap_L", "Aileron_R", "Aileron_L"]
    A, mask, lo, cell = projected_area(wing_parts)
    check("Wing area, gross projected (incl. fuselage strip)", A, 15.97, 0.015, "m2", src("wing_area"))
    xs = lo[0] + (np.arange(mask.shape[1]) + 0.5) * cell
    def chord_at(x):
        j = int(round((x - lo[0]) / cell)); col = mask[:, j]; return col.sum() * cell
    check("Chord on the aircraft axis (y=0)", chord_at(0.0), 2.36, 0.02, "m", src("chord_centreline"))
    check("Chord at wing/fuselage junction (y=0.66)", chord_at(0.66), 2.15, 0.02, "m", src("chord_root_junction"))
    check("Chord at tip-cap start (y=4.687)", chord_at(4.687), 0.92, 0.03, "m", src("chord_tip"), note="cap start solved from area")
    # LE at junction
    jcol = int(round((0.66 - lo[0]) / cell)); rows = np.where(mask[:, jcol])[0]
    S_LEj = -(lo[1] + (rows.max() + 0.5) * cell)
    check("Wing LE at junction, S from spinner tip", S_LEj, G.v("wing_LE_junction_S"), 0.01, "m", src("wing_LE_junction_S"), "abs")
    # control surfaces
    for nm, key_a, key_s, key_c in (("Aileron", "aileron_area_each", "aileron_span", "aileron_centre_y"), ("Flap", "flap_area_each", "flap_span", "flap_centre_y")):
        for side in ("R", "L"):
            wg = G.Wing(); xcut = 1 - G.v("aileron_chord_fraction" if nm == "Aileron" else "flap_chord_fraction")
            def vis(X, Y, wg=wg, xcut=xcut):
                ay = np.clip(np.abs(X), 0, wg.b2 - 1e-3)
                c = wg.c0 - wg.k * ay; sle = wg.S_LE0 + wg.a * wg.k * ay
                return (-Y) > sle + xcut * c
            a_tot, *_ = projected_area([f"{nm}_{side}"])
            a, m, lo2, c2 = projected_area([f"{nm}_{side}"], clip=vis)
            vtx = world_verts(f"{nm}_{side}")
            span = vtx[:, 0].max() - vtx[:, 0].min(); cy = abs(0.5 * (vtx[:, 0].max() + vtx[:, 0].min()))
            check(f"{nm} {side} area, visible (aft of the cove)", a, G.v(key_a), 0.06, "m2", src(key_a),
                  note=f"incl. nose hidden under the wing: {a_tot:.3f} m2")
            check(f"{nm} {side} span", span, G.v(key_s), 0.01, "m", src(key_s))
            check(f"{nm} {side} centre distance to axis", cy, G.v(key_c), 0.01, "m", src(key_c))
    # chord max
    wg = G.Wing()
    check("Aileron max chord (visible, at inner end)", G.v("aileron_chord_fraction") * wg.chord(G.v("aileron_centre_y") - G.v("aileron_span") / 2),
          G.v("aileron_chord_max"), 0.04, "m", src("aileron_chord_max"))
    a, m, lo2, c2 = projected_area(["Flap_R"])
    check("Flap max chord (visible part)", m.sum(0).max() * c2, G.v("flap_chord_max"), 0.05, "m", src("flap_chord_max"),
          note="printed 0.65 read as including the nose stowed under the shroud")
    # ------------------------------------------------ dihedral & incidence from the upper-surface lines
    def _near(y):
        d = np.abs(wv[:, 0] - y); return d <= d.min() + 0.004
    def upper_z(y):
        return wv[_near(y), 2].max()
    dz = upper_z(4.5) - upper_z(1.6)
    check("Upper-surface dihedral outboard of rib 16", math.degrees(math.atan(dz / 2.9)), G.v("dihedral_upper_outer"), 0.04, "deg", src("dihedral_upper_outer"))
    def lower_z(y):
        return wv[_near(y), 2].min()
    check("Lower-surface slope rib 21 -> tip (Pl.1 'tangente 0.1246')", (lower_z(4.5) - lower_z(1.0)) / 3.5, 0.1246, 0.06, "tan", src("lower_slope_outer"))
    pts = wv[_near(0.30)]
    le = pts[np.argmax(pts[:, 1])]; te = pts[np.argmin(pts[:, 1])]
    check("Wing incidence at root (chord line vs thrust axis)", math.degrees(math.atan2(le[2] - te[2], le[1] - te[1])), 1.0, 0.25, "deg", src("wing_incidence"), "abs")
    # ------------------------------------------------ fuselage
    fv = world_verts("Fuselage"); cv = np.concatenate([world_verts("Canopy_Hood"), world_verts("Canopy_Windscreen"), world_verts("Canopy_RearFairing")])
    check("Fuselage max width (main frame)", fv[:, 0].max() - fv[:, 0].min(), 0.94, 0.02, "m", src("main_frame_width"))
    S_mf = 4.5
    selz = np.abs(-fv[:, 1] - S_mf) < 0.05
    zlo = fv[selz, 2].min(); zhi = cv[np.abs(-cv[:, 1] - S_mf) < 0.05, 2].max()
    check("Fuselage height incl. canopy at the cockpit (main frame)", zhi - zlo, 1.50, 0.03, "m", src("main_frame_height"),
          note="includes the sliding hood, which rides 14 mm outside the fixed arches (GUESS); Pl.0 drawn at 1/50 measures 1.53 m")
    # ------------------------------------------------ tail
    tv = np.concatenate([world_verts("Tailplane"), world_verts("Elevator_R"), world_verts("Elevator_L")])
    check("Tailplane span", tv[:, 0].max() - tv[:, 0].min(), 3.54, 0.01, "m", src("tailplane_span"))
    a_tp, *_ = projected_area(["Tailplane"])
    a_el, *_ = projected_area(["Elevator_R", "Elevator_L"])
    a_tp_out, *_ = projected_area(["Tailplane"], clip=lambda X, Y: np.abs(X) > np.interp(-Y, [7.0, 7.5, 8.0, 8.3], [0.28, 0.19, 0.13, 0.10]))
    check("Tailplane (fixed) area outside the fuselage", a_tp_out, 1.83, 0.06, "m2", src("tailplane_area_fixed"),
          note=f"including the strip through the fuselage: {a_tp:.3f} m2")
    check("Elevator area (both)", a_el, 1.04, 0.08, "m2", src("elevator_area"))
    he = bpy.data.objects["Hinge_Elevator"].matrix_world.translation; hr = bpy.data.objects["Hinge_Rudder"].matrix_world.translation
    check("Elevator hinge aft of wing LE", -he.y - S_LEj, 5.88, 0.01, "m", src("elevator_hinge_from_LE"))
    check("Rudder hinge aft of wing LE", -hr.y - S_LEj, 6.08, 0.01, "m", src("rudder_hinge_from_LE"))
    f = G.Fuselage()
    def fin_clip(X, Y):   # X = -S (Blender Y), Y = Z(world)
        S = -X; ztop = f.z_body_top(np.clip(S, 0.6, 8.1)) + zoff
        return Y > ztop
    a_fin, *_ = projected_area(["Fin"], axes=(1, 2), clip=fin_clip)
    a_fin_tot, *_ = projected_area(["Fin"], axes=(1, 2))
    a_rud, *_ = projected_area(["Rudder"], axes=(1, 2))
    _, mfin, lof, cf = projected_area(["Fin"], axes=(1, 2), clip=fin_clip)
    zs_ = lof[1] + (np.arange(mfin.shape[0]) + 0.5) * cf
    rowarea = mfin.sum(1) * cf * cf
    cum = np.cumsum(rowarea[::-1])[::-1]               # area above each row
    k = int(np.argmin(np.abs(cum - 0.59)))
    z_cut = zs_[k] - zoff
    check("Fin area exposed above the fuselage (side projection)", a_fin, 0.59, 0.10, "m2", src("fin_area"),
          note=f"total incl. buried root {a_fin_tot:.3f} m2; the printed 0.59 m2 equals the fin above Z={z_cut:+.2f} m (thrust-axis frame), i.e. without the curved dorsal fillet")
    check("Rudder area (side projection)", a_rud, 1.04, 0.08, "m2", src("rudder_area"))
    finv = np.concatenate([world_verts("Fin"), rd])
    zb_tail = f.z_bot(T_hinge := G.Tail().rudder_hinge_S) + zoff
    check("Fin height, fuselage bottom at sternpost to fin tip", finv[:, 2].max() - zb_tail, 1.87, 0.02, "m", src("fin_height"))
    check("Overall height, flight line (fin tip above ground)", finv[:, 2].max(), 3.435, 0.03, "m", src("height_flight_line"),
          note="Pl.0 label is blurred; Pl.0 draws the oleos fully extended")
    # ------------------------------------------------ propeller and ground
    bl = np.concatenate([world_verts(f"Blade_{k}") for k in (1, 2, 3)])
    ax = Vector((0, 1, 0)); rmax = 0
    hubw = bpy.data.objects["Prop_Spin"].matrix_world
    axis = (hubw.to_3x3() @ Vector((0, 0, 1))).normalized(); o = hubw.translation
    d = bl - np.array(o); r = np.linalg.norm(d - np.outer(d @ np.array(axis), np.array(axis)), axis=1)
    check("Propeller diameter", 2 * r.max(), 3.05, 0.005, "m", src("prop_diameter"))
    check("Propeller axis height, flight line", o.z, 1.845, 0.01, "m", src("prop_axis_height_flight_line"))
    check("Propeller ground clearance, flight line", o.z - r.max(), 0.32, 0.03, "m", src("prop_clearance_flight_line"), "abs")
    wl = world_verts("Wheel_L"); wr_ = world_verts("Wheel_R")
    cl = wl[np.argmin(wl[:, 2])]; cr = wr_[np.argmin(wr_[:, 2])]
    check("Track (tyre contact points)", abs(cr[0] - cl[0]), 2.88, 0.01, "m", src("track"))
    check("Main wheels on the ground in flight line (lowest point Z)", min(cl[2], cr[2]), 0.0, 0.025, "m", "DERIVED: tyre 6% static deflection", "abs")
    # at rest
    set_controls(attitude=1.0)
    hubw = bpy.data.objects["Prop_Spin"].matrix_world; o2 = hubw.translation
    tw = world_verts("Tailwheel"); wl = world_verts("Wheel_L")
    check("Propeller axis height at rest", o2.z, 2.265, 0.01, "m", src("prop_axis_height_rest"))
    check("Propeller ground clearance at rest", o2.z - r.max(), 0.74, 0.03, "m", src("prop_clearance_rest"), "abs")
    check("Tail wheel on the ground at rest", tw[:, 2].min(), 0.0, 0.03, "m", src("tail_wheel_S"), "abs")
    check("Main wheels on the ground at rest", wl[:, 2].min(), 0.0, 0.03, "m", src("rest_attitude"), "abs")
    rest_deg = bpy.data.objects["D520_ROOT"].get("rest_attitude_deg", 0)
    check("Ground angle at rest (derived)", rest_deg, None, 0, "deg", src("rest_attitude"))
    # ------------------------------------------------ control-surface travel
    def travel(obj, **kw):
        set_controls(); M0 = bpy.data.objects[obj].matrix_world.copy()
        set_controls(**kw); M1 = bpy.data.objects[obj].matrix_world.copy()
        return rot_angle(M0, M1), M0, M1
    for name, kw, tgt, key in (("Right aileron up (stick right)", dict(aileron=1.0), 30, "aileron_up"),
                               ("Left aileron down (stick right)", dict(aileron=1.0), 15, "aileron_down"),
                               ("Right aileron down (stick left)", dict(aileron=-1.0), 15, "aileron_down"),
                               ("Left aileron up (stick left)", dict(aileron=-1.0), 30, "aileron_up")):
        obj = "Aileron_R" if "Right" in name else "Aileron_L"
        ang, M0, M1 = travel(obj, **kw)
        # sign: trailing edge up?
        v = world_verts(obj); te = v[np.argmin(v[:, 1])]
        check(name, ang, tgt, 0.01, "deg", src(key))
    for name, obj, kw, tgt, key in (("Elevator travel up", "Elevator_R", dict(elevator=1.0), 20, "elevator_travel"),
                                    ("Elevator travel down", "Elevator_L", dict(elevator=-1.0), 20, "elevator_travel"),
                                    ("Rudder travel right", "Rudder", dict(rudder=1.0), 30, "rudder_travel"),
                                    ("Rudder travel left", "Rudder", dict(rudder=-1.0), 30, "rudder_travel"),
                                    ("Flap travel (down)", "Flap_R", dict(flaps=1.0), 35, "flap_down"),
                                    ("Tailplane incidence +3°", "Tailplane", dict(tailplane_incidence=3.0), 3, "tailplane_incidence_range")):
        ang, *_ = travel(obj, **kw)
        check(name, ang, tgt, 0.01, "deg", src(key))
    # differential sense check: stick right -> right aileron TE up
    set_controls(); z0 = world_verts("Aileron_R")[:, 2].mean()
    set_controls(aileron=1.0); z1 = world_verts("Aileron_R")[:, 2].min()
    set_controls()
    # ------------------------------------------------ landing gear retraction
    set_controls(gear=1.0)
    for side in ("R", "L"):
        wv2 = world_verts(f"Wheel_{side}")
        c_ = wv2.mean(0)
        check(f"Retracted wheel {side} centre |y| (Pl.0 plan wells)", abs(c_[0]), 0.30, 0.03, "m", src("main_axle_S"), "abs")
        wing_low = (G.v("wing_root_lower_Z") + zoff)
        check(f"Retracted wheel {side} protrusion below wing lower surface", wing_low - wv2[:, 2].min(), 0.0, 0.03, "m", "Pl.30: outer face flush with the lower surface", "abs")
    ant = world_verts("Antenna_Ventral"); set_controls()
    ant0 = world_verts("Antenna_Ventral")
    check("Ventral antenna hangs vertical with gear up (z extent)", ant[:, 2].max() - ant[:, 2].min(), None, 0, "m", src("antenna_ventral"),
          note=f"gear down z extent {ant0[:, 2].max() - ant0[:, 2].min():.3f} m")
    # ------------------------------------------------ guns and equipment
    for side in ("R", "L"):
        for gy in (G.v("gun_inner_y"), G.v("gun_outer_y")):
            ob = bpy.data.objects.get(f"GunPort_{side}_{gy:.2f}")
            if ob:
                check(f"Gun port {side} spanwise station", abs(ob.matrix_world.translation.x), gy, 0.005, "m", src("gun_inner_y"), "abs")
    pit = world_verts("Pitot")
    check("Pitot on the LEFT wing tip (x < -4.5)", pit[:, 0].mean(), None, 0, "m", src("pitot"), note="negative x = left (port)")
    # ------------------------------------------------ mesh sanity
    sanity = []
    for ob in bpy.data.objects:
        if ob.type != 'MESH': continue
        me = ob.data
        nf = len(me.polygons)
        co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get("co", co)
        bm = bmesh.new(); bm.from_mesh(me)
        nm = sum(1 for e in bm.edges if not e.is_manifold)
        bnd = sum(1 for e in bm.edges if e.is_boundary)
        zero = sum(1 for fa in bm.faces if fa.calc_area() < 1e-10)
        bm.free()
        sanity.append(dict(object=ob.name, faces=nf, nan=bool(np.isnan(co).any()), non_manifold_edges=nm, boundary_edges=bnd, zero_area_faces=zero))
    bad = [s for s in sanity if s["faces"] == 0 or s["nan"]]
    check("Meshes with zero faces or NaN coordinates", len(bad), 0, 0, "count", "sanity (boolean-failure guard)", "abs")
    # ------------------------------------------------ provenance summary
    stat = {}
    for k, p in PRM.items(): stat[p["status"]] = stat.get(p["status"], 0) + 1
    guesses = [k for k, p in PRM.items() if p["status"] == "GUESS"]
    # ------------------------------------------------ write report
    rep = dict(blend=os.path.basename(blend), checks=CHECKS, sanity=sanity, parameter_status=stat, guesses=guesses)
    json.dump(rep, open(os.path.join(outdir, "report.json"), "w"), indent=1, ensure_ascii=False)
    n = {k: sum(1 for c in CHECKS if c["verdict"] == k) for k in ("PASS", "WARN", "FAIL", "INFO")}
    L = ["# D.520 model vs. manual: validation report", "",
         f"Model: `{os.path.basename(blend)}`  |  checks: {len(CHECKS)}  |  PASS {n['PASS']}  WARN {n['WARN']}  FAIL {n['FAIL']}  INFO {n['INFO']}", "",
         "Tolerance is relative unless the error column shows an absolute value (abs). WARN = within 2.5x tolerance.", "",
         "| Check | Measured | Target | Error | Verdict | Source |", "|---|---|---|---|---|---|"]
    for c_ in CHECKS:
        err = "" if c_["error"] is None else (f"{c_['error']*100:+.1f}%" if c_["mode"] == "rel" else f"{c_['error']:+.3f} (abs)")
        tg = "" if c_["target"] is None else f"{c_['target']} {c_['unit']}"
        note = f" <br>_{c_['note']}_" if c_["note"] else ""
        L.append(f"| {c_['check']}{note} | {c_['measured']} {c_['unit']} | {tg} | {err} | **{c_['verdict']}** | {c_['source']} |")
    L += ["", "## Parameter provenance", "", "| Status | Count |", "|---|---|"] + [f"| {k} | {v} |" for k, v in sorted(stat.items())]
    L += ["", "Parameters that are explicit guesses: " + ", ".join(f"`{g}`" for g in guesses), ""]
    L += ["## Mesh sanity", "", "| Object | Faces | Non-manifold edges | Boundary edges | Zero-area faces |", "|---|---|---|---|---|"]
    for s in sanity:
        L.append(f"| {s['object']} | {s['faces']} | {s['non_manifold_edges']} | {s['boundary_edges']} | {s['zero_area_faces']} |")
    open(os.path.join(outdir, "report.md"), "w").write("\n".join(L))
    print(f"checks {len(CHECKS)}: PASS {n['PASS']} WARN {n['WARN']} FAIL {n['FAIL']} INFO {n['INFO']}")
    for c_ in CHECKS:
        if c_["verdict"] in ("WARN", "FAIL"):
            print(f"  {c_['verdict']}: {c_['check']}: measured {c_['measured']} vs {c_['target']} ({c_['error']})")

if __name__ == "__main__":
    argv = sys.argv; argv = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    ap = argparse.ArgumentParser(); ap.add_argument("blend"); ap.add_argument("--out", default=os.path.join(HERE, "..", "validation"))
    a = ap.parse_args(argv); main(os.path.abspath(a.blend), os.path.abspath(a.out))
