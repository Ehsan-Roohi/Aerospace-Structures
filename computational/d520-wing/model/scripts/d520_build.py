"""Parametric Blender build of the Dewoitine D.520 S from its 1940 'Notice descriptive et d'utilisation'.

Run either inside Blender:      blender -b -P d520_build.py -- --out d520_base.blend
or with the bpy module:         python3 d520_build.py --out d520_base.blend

Nothing is sculpted: every surface is lofted from the laws in d520_geom.py, whose numbers come
from data/d520_params.json (each with its page reference and status PRINTED / SCALED /
DERIVED / GUESS).  Moving parts have their origin on their hinge line and are driven from the
custom properties of the empty 'D520_CONTROLS' with the travel limits printed in the manual.
"""
import sys, os, math, json, argparse
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import d520_geom as G

V = G.v
D2R = math.pi / 180

def B(S, y, Z):
    return (float(y), float(-S), float(Z))

# ============================================================== helpers
COLL = {}
def collection(name, parent=None):
    if name in COLL: return COLL[name]
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    COLL[name] = c
    return c

def new_obj(name, mesh, coll):
    o = bpy.data.objects.new(name, mesh)
    coll.objects.link(o)
    return o

def uv_arc(P, u_rows, wrap=True):
    """UVs with u per row and v = normalised arc length around each ring (seam at index 0, v=1 on the
    wrap corner), so every face has a proper, non-overlapping footprint in texture space."""
    nu, nv = P.shape[:2]
    out = np.zeros((nu, nv + 1, 2))
    for i in range(nu):
        ring = P[i]
        nxt = np.roll(ring, -1, axis=0) if wrap else np.vstack([ring[1:], ring[-1:]])
        seg = np.linalg.norm(nxt - ring, axis=1)
        if not wrap: seg[-1] = 0
        cum = np.concatenate([[0], np.cumsum(seg)])
        tot = max(cum[-1] if wrap else cum[-2], 1e-9)
        out[i, :, 0] = u_rows[i]
        out[i, :, 1] = cum[:nv + 1] / tot
    out[..., 1] = np.clip(out[..., 1], 0, 1)
    return out

def grid_mesh(name, P, wrap_v=False, uv=None, cap0=False, cap1=False, face_mat=None, smooth=True, sharp_angle=35):
    """P: (nu, nv, 3) Blender coordinates. uv: (nu, nv+wrap, 2). face_mat(i, j) -> material index."""
    nu, nv = P.shape[:2]
    verts = P.reshape(-1, 3)
    faces, fij = [], []
    jmax = nv if wrap_v else nv - 1
    for i in range(nu - 1):
        for j in range(jmax):
            j2 = (j + 1) % nv
            faces.append((i * nv + j, (i + 1) * nv + j, (i + 1) * nv + j2, i * nv + j2)); fij.append((i, j))
    caps = []
    if wrap_v and cap0:
        faces.append(tuple(range(nv))[::-1]); caps.append(0)
    if wrap_v and cap1:
        faces.append(tuple((nu - 1) * nv + j for j in range(nv))); caps.append(1)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in verts], [], faces)
    me.update()
    if uv is not None:
        ul = me.uv_layers.new(name="UVMap")
        data = np.zeros((len(me.loops), 2), np.float32)
        li = 0
        for f_idx, poly in enumerate(me.polygons):
            if f_idx < len(fij):
                i, j = fij[f_idx]
                corners = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
                for k, (a, b) in enumerate(corners):
                    data[poly.loop_start + k] = uv[a, b]
            else:  # caps: squeeze into a corner strip
                for k in range(poly.loop_total):
                    data[poly.loop_start + k] = (0.995, 0.995)
        ul.data.foreach_set("uv", data.ravel())
    if face_mat is not None:
        mi = [face_mat(i, j) for (i, j) in fij] + [0] * len(caps)
        me.polygons.foreach_set("material_index", mi)
    if smooth:
        me.shade_smooth()
        try:
            me.set_sharp_from_angle(angle=sharp_angle * D2R)
        except Exception:
            pass
    return me

def fix_normals_outward(obj):
    me = obj.data
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # verify against centroid heuristic (open meshes)
    c = sum((v.co for v in bm.verts), Vector()) / max(1, len(bm.verts))
    s = sum((f.normal.dot(f.calc_center_median() - c) * f.calc_area()) for f in bm.faces)
    if s < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free(); me.update()

def set_origin(obj, point_world):
    """Move object origin to point_world without moving geometry."""
    p = Vector(point_world)
    mw = obj.matrix_world.copy()
    local = mw.inverted() @ p
    obj.data.transform(Matrix.Translation(-local))
    obj.matrix_world = mw @ Matrix.Translation(local)

def hinge_empty(name, p0, p1, coll, up=(0, 0, 1)):
    """Static empty '<name>_Axis' whose local X lies along the hinge p0->p1 (Blender coords),
    with a driven child '<name>' (identity local transform) that carries the moving part.
    Drivers rotate the child about its local X = the hinge line."""
    e = bpy.data.objects.new(name + "_Axis", None)
    e.empty_display_type = 'ARROWS'; e.empty_display_size = 0.12
    coll.objects.link(e)
    x = (Vector(p1) - Vector(p0)).normalized()
    upv = Vector(up)
    if abs(x.dot(upv)) > 0.95: upv = Vector((0, 1, 0))
    z = (upv - x * x.dot(upv)).normalized(); y = z.cross(x)
    M = Matrix((x, y, z)).transposed().to_4x4()
    M.translation = Vector(p0)
    e.matrix_world = M
    d = bpy.data.objects.new(name, None)
    d.empty_display_type = 'PLAIN_AXES'; d.empty_display_size = 0.08
    coll.objects.link(d)
    d.parent = e; d.matrix_parent_inverse = Matrix.Identity(4)
    d["hinge_axis"] = "local X"
    d["hinge_p0"] = list(p0); d["hinge_p1"] = list(p1)
    bpy.context.view_layer.update()
    return d

def parent_keep(child, parent):
    bpy.context.view_layer.update()
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    child.matrix_world = mw

def mat(name, rgb, rough=0.6, metal=0.0, alpha=1.0, emission=None, transmission=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if transmission:
        for key in ("Transmission Weight", "Transmission"):
            if key in bsdf.inputs: bsdf.inputs[key].default_value = transmission
        bsdf.inputs["IOR"].default_value = 1.5
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    if emission:
        for key in ("Emission Color", "Emission"):
            if key in bsdf.inputs: bsdf.inputs[key].default_value = (*emission, 1)
        if "Emission Strength" in bsdf.inputs: bsdf.inputs["Emission Strength"].default_value = 2.0
    m.diffuse_color = (*rgb, alpha)
    return m

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

MATS = {}
def build_materials():
    # Colour NAMES are printed (p59-p61); RGB values are GUESSES for 1940 French paints.
    MATS["kaki"] = mat("Paint_Kaki", srgb("#6f6c4a"), 0.7)
    MATS["terre"] = mat("Paint_TerreFoncee", srgb("#6b4f3a"), 0.7)
    MATS["grisbleu"] = mat("Paint_GrisBleuFonce", srgb("#4f5b66"), 0.7)
    MATS["dessous"] = mat("Paint_GrisBleuClair", srgb("#a9b5bc"), 0.65)
    MATS["glass"] = mat("Glass", (0.85, 0.9, 0.92), 0.05, 0.0, alpha=0.18, transmission=0.0)
    MATS["frame"] = mat("Canopy_Frame", srgb("#4f5b66"), 0.6)
    MATS["nightblue"] = mat("Cockpit_NightBlue", srgb("#1d2433"), 0.8)
    MATS["black"] = mat("Matt_Black", srgb("#141414"), 0.8)
    MATS["rubber"] = mat("Tyre_Rubber", srgb("#1a1a1a"), 0.9)
    MATS["metal"] = mat("Natural_Metal", srgb("#b8bcbf"), 0.35, 1.0)
    MATS["darkmetal"] = mat("Exhaust_Metal", srgb("#3a3330"), 0.6, 0.8)
    MATS["prop"] = mat("Propeller_Black", srgb("#1c1c1c"), 0.55)
    MATS["white"] = mat("Paint_White", srgb("#e8e6df"), 0.6)
    MATS["red"] = mat("Paint_Red", srgb("#b0262b"), 0.6)
    MATS["navred"] = mat("NavLight_Red", (0.8, 0.02, 0.02), 0.1, emission=(0.8, 0.02, 0.02))
    MATS["navgreen"] = mat("NavLight_Green", (0.02, 0.7, 0.1), 0.1, emission=(0.02, 0.7, 0.1))
    MATS["navwhite"] = mat("NavLight_White", (0.9, 0.9, 0.85), 0.1, emission=(0.9, 0.9, 0.85))
    MATS["chamois"] = mat("Hidden_Chamois", srgb("#c9b07a"), 0.7)
    MATS["radiator"] = mat("Radiator_Core", srgb("#2b2b28"), 0.7, 0.6)
    MATS["dial"] = mat("Dial_Black", srgb("#0d0d0d"), 0.4)

# ============================================================== fuselage
def orient_normals(obj, ref_fn):
    """Flip all faces if the area-weighted normals disagree with ref_fn(face_centre)."""
    me = obj.data
    s = 0.0
    for p in me.polygons:
        s += p.normal.dot(Vector(ref_fn(p.center))) * p.area
    if s < 0:
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(me); bm.free(); me.update()

def build_fuselage(coll):
    f = G.Fuselage()
    Ss = f.stations()
    rings = []
    for S in Ss:
        Y, Z, F = f.section(S, with_cap=False)
        rings.append(np.stack([Y, -np.full_like(Y, S), Z], 1))
    P = np.array(rings)
    nu, nv = P.shape[:2]
    S0, S1 = Ss[0], Ss[-1]
    uv = np.zeros((nu, nv + 1, 2))
    for i in range(nu):
        for j in range(nv + 1):
            uv[i, j] = ((Ss[i] - S0) / (S1 - S0), j / nv)
    cs = f.cs
    def fm(i, j):
        Sm = 0.5 * (Ss[i] + Ss[i + 1])
        zc = 0.25 * (P[i, j, 2] + P[i + 1, j, 2] + P[i, (j + 1) % nv, 2] + P[i + 1, (j + 1) % nv, 2])
        if cs["hood_front"] - 0.02 <= Sm <= cs["hood_rear"] + 0.01 and zc > cs["sill_Z"]:
            return 3                              # cockpit opening (deleted)
        return 0
    me = grid_mesh("Fuselage", P, wrap_v=True, uv=uv, cap0=True, cap1=True, face_mat=fm)
    ob = new_obj("Fuselage", me, coll)
    for m in (MATS["dessous"], MATS["glass"], MATS["frame"], MATS["glass"]):
        ob.data.materials.append(m)
    bm = bmesh.new(); bm.from_mesh(me)
    dele = [fa for fa in bm.faces if fa.material_index == 3]
    bmesh.ops.delete(bm, geom=dele, context='FACES')
    bm.to_mesh(me); bm.free()
    ob.data.materials.pop(index=3); ob.data.materials.pop(index=2); ob.data.materials.pop(index=1)
    fix_normals_outward(ob)
    ob["source"] = "Pl.0 side+plan (SCALED 1/50), main frame 0.94 x 1.50 (PRINTED p14), ovoid section (PRINTED)"
    ob["faces_after_opening"] = len(ob.data.polygons)
    return ob, f

def canopy_loft(f, Ss, name, coll, grow=0.0, mat_fn=None, mats=(), solid=0.0):
    rings, used = [], []
    for S in Ss:
        r = f.canopy_ring(S, grow=grow)
        if r is None: continue
        y, z = r
        rings.append(np.stack([y, -np.full_like(y, S), z], 1)); used.append(S)
    P = np.array(rings)
    nu, nv = P.shape[:2]
    uv = np.zeros((nu, nv, 2))
    for i in range(nu):
        for j in range(nv):
            uv[i, j] = ((used[i] - used[0]) / max(1e-6, used[-1] - used[0]), j / (nv - 1))
    me = grid_mesh(name, P, wrap_v=False, uv=uv, face_mat=(lambda i, j: mat_fn(i, j, P, used)) if mat_fn else None)
    o = new_obj(name, me, coll)
    for m in mats: o.data.materials.append(m)
    orient_normals(o, lambda c: (c[0], 0.0, c[2] - 0.2))
    if solid:
        so = o.modifiers.new("Thickness", 'SOLIDIFY'); so.thickness = solid; so.offset = -1
    return o

def arch_points(f, S, grow=0.0, n=61):
    r = f.canopy_ring(S, n=n, grow=grow)
    if r is None: return None
    y, z = r
    return [B(S, yy, zz) for yy, zz in zip(y, z)]

def build_canopy(coll, f):
    cs = f.cs
    out = {}
    fr = MATS["frame"]
    # windscreen (all glass) + frame tubes
    Sw = np.linspace(cs["windscreen_front"] + 0.012, cs["windscreen_rear"], 16)
    out["windscreen"] = canopy_loft(f, Sw, "Canopy_Windscreen", coll, 0.0, None, (MATS["glass"],), 0.004)
    out["windscreen"]["source"] = "Pl.0 side canopy outline (SCALED); 3-panel screen framing GUESS"
    frames = []
    frames.append(tube("Frame_Windscreen_Bow", arch_points(f, cs["windscreen_rear"], 0.006), 0.012, coll, fr))
    for side in (1, -1):
        base, pill = [], []
        for S in Sw:
            r = f.canopy_ring(S, n=121)
            if r is None: continue
            y, z = r
            base.append(B(S, side * (abs(y[0]) + 0.004), z[0] + 0.004))
            k = int(np.argmin(np.abs(y - side * 0.13)))
            pill.append(B(S, y[k] + side * 0.004, z[k] + 0.006))
        frames.append(tube(f"Frame_Windscreen_Base_{side}", base, 0.010, coll, fr))
        frames.append(tube(f"Frame_Windscreen_Pillar_{side}", pill, 0.009, coll, fr))
    # sliding hood: glass + bows + lower rails, 14 mm outside the fixed arches
    Sh = np.linspace(cs["hood_front"], cs["hood_rear"], 18)
    hood = canopy_loft(f, Sh, "Canopy_Hood", coll, 0.014, None, (MATS["glass"],), 0.004)
    hood["source"] = "Pl.0 side canopy outline (SCALED); slides aft (photos p3/p4, Pl.16); travel 0.55 m GUESS"
    hparts = [tube("Frame_Hood_FrontBow", arch_points(f, cs["hood_front"] + 0.01, 0.018), 0.013, coll, fr),
              tube("Frame_Hood_RearBow", arch_points(f, cs["hood_rear"] - 0.01, 0.018), 0.013, coll, fr)]
    for side in (1, -1):
        rail = []
        for S in Sh:
            r = f.canopy_ring(S, grow=0.014)
            if r is None: continue
            rail.append(B(S, side * abs(r[0][0]), r[1][0] + 0.006))
        hparts.append(tube(f"Frame_Hood_Rail_{side}", rail, 0.011, coll, fr))
    for o in hparts: parent_keep(o, hood)
    out["hood"] = hood
    # rear fairing (painted) with teardrop windows: cut the fairing, add glass patches and frames
    Sr = np.linspace(cs["hood_rear"], cs["rear_fairing_end"] + 0.10, 60)
    def win(t):
        return 0.33 + 0.05 * t, 0.70 - 0.26 * t ** 1.3
    def rfm(i, j, P, used):
        Sm = 0.5 * (used[i] + used[i + 1])
        zc = 0.25 * (P[i, j, 2] + P[i + 1, j, 2] + P[i, j + 1, 2] + P[i + 1, j + 1, 2])
        t = (Sm - cs["hood_rear"]) / (cs["rear_fairing_end"] - cs["hood_rear"])
        bot, top = win(t)
        return 1 if (0.04 < t < 0.94 and bot + 0.008 < zc < top - 0.008) else 0
    rear = canopy_loft(f, Sr, "Canopy_RearFairing", coll, 0.0, rfm, (MATS["dessous"], MATS["glass"]), 0.0)
    bm = bmesh.new(); bm.from_mesh(rear.data)
    bmesh.ops.delete(bm, geom=[fa for fa in bm.faces if fa.material_index == 1], context='FACES')
    bm.to_mesh(rear.data); bm.free(); rear.data.materials.pop(index=1)
    rear["source"] = "Pl.0 side view rear fairing and teardrop windows (SCALED)"
    out["rear"] = rear
    for side in (1, -1):
        rows, outline_top, outline_bot = [], [], []
        ts = np.linspace(0.02, 0.96, 26)
        for t in ts:
            S = cs["hood_rear"] + t * (cs["rear_fairing_end"] - cs["hood_rear"])
            r = f.canopy_ring(S, n=181)
            if r is None: continue
            y, z = r
            half = y > 0
            yy, zz = np.abs(y[half]), z[half]
            o = np.argsort(zz); yy, zz = yy[o], zz[o]
            bot, top = win(t)
            zs_ = np.linspace(bot - 0.004, top + 0.004, 10)
            ys_ = np.interp(zs_, zz, yy) + 0.003
            rows.append([B(S, side * a_, b_) for a_, b_ in zip(ys_, zs_)])
            outline_top.append(B(S, side * (np.interp(top, zz, yy) + 0.006), top))
            outline_bot.append(B(S, side * (np.interp(bot, zz, yy) + 0.006), bot))
        P = np.array(rows)
        me = grid_mesh(f"Canopy_RearWindow_{'R' if side > 0 else 'L'}", P, wrap_v=False)
        o = new_obj(me.name, me, coll); o.data.materials.append(MATS["glass"])
        orient_normals(o, lambda c, s=side: (s, 0.0, 0.3))
        loop = outline_top + outline_bot[::-1]
        tube(f"Frame_RearWindow_{'R' if side > 0 else 'L'}", loop, 0.009, coll, fr, closed=True)
    return out

def build_cockpit_tub(coll, f):
    Ss = np.linspace(3.70, 5.35, 30)
    rings = []
    for S in Ss:
        Y, Z, Fl = f.section(S, n_half=32)
        zc = np.mean(Z); Y2 = Y * 0.94; Z2 = zc + (Z - zc) * 0.94
        Z2 = np.minimum(Z2, f.cs["sill_Z"] - 0.01)
        rings.append(np.stack([Y2, -np.full_like(Y2, S), Z2], 1))
    me = grid_mesh("Cockpit_Tub", np.array(rings), wrap_v=True, cap0=True, cap1=True)
    ob = new_obj("Cockpit_Tub", me, coll)
    ob.data.materials.append(MATS["nightblue"])
    fix_normals_outward(ob)
    # flip: we look at the inside
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(ob.data); bm.free()
    ob["source"] = "cockpit between frames 3 and 5, matt night blue (PRINTED p60)"
    return ob

# ============================================================== airfoil sections
def split_section(x_up_lo, upper, lower, x_cut, gap=0.006, n_cove=5, n_nose=9, part="fwd", n_pts=26):
    """Given an airfoil (x array, upper z, lower z in chord units) return a closed ring (x,z)
    for the part forward of x_cut (with a flat cove) or aft of x_cut+gap (with a round nose).
    The point count is fixed (independent of x_cut) so sections can be lofted."""
    x = x_up_lo
    if part == "fwd":
        xs = x_cut * G.cosine_x(n_pts)
        zu = np.interp(xs, x, upper); zl = np.interp(xs, x, lower)
        up = list(zip(xs[::-1], zu[::-1]))          # x_cut -> LE along upper
        lo = list(zip(xs[1:], zl[1:]))              # LE -> x_cut along lower
        zc0, zc1 = zl[-1], zu[-1]
        cove = [(x_cut - 0.004 * math.sin(math.pi * k / (n_cove + 1)), zc0 + (zc1 - zc0) * k / (n_cove + 1)) for k in range(1, n_cove + 1)]
        ring = up + lo + cove
    else:
        x0 = x_cut + gap
        s = np.linspace(0, 1, n_pts) ** 1.15
        xs = x0 + (1 - x0) * s
        zu = np.interp(xs, x, upper); zl = np.interp(xs, x, lower)
        top = list(zip(xs, zu))                      # nose top -> TE
        bot = list(zip(xs[::-1][1:], zl[::-1][1:]))  # TE -> nose bottom
        r = 0.5 * (zu[0] - zl[0])
        nose = [(x0 - 0.9 * r * math.sin(math.pi * k / (n_nose + 1)), zl[0] + (zu[0] - zl[0]) * k / (n_nose + 1)) for k in range(1, n_nose + 1)]
        ring = top + bot + nose
    return np.array(ring)

def full_ring(x, upper, lower):
    up = list(zip(x[::-1], upper[::-1]))    # TE -> LE
    lo = list(zip(x[1:-1], lower[1:-1]))    # LE -> before TE
    return np.array(up + lo)

def ring_uv(ring_x, part, n):
    """v coordinate around the section: upper TE=0 .. LE=0.5 .. lower TE=1 (approx. by x)."""
    v = []
    half = True
    for k, xv in enumerate(ring_x):
        v.append(xv)
    return v

# ============================================================== wing
NX = 34
def wing_ring(w, y, part, x_cut=None, gap=0.006):
    x = G.cosine_x(NX)
    c = w.chord(y); t = w.thickness(y); tc = t / c
    up, lo, yc = G.airfoil_surfaces(x, tc, w.camber_blend(y))
    if part == "full":
        ring = full_ring(x, up, lo)
    else:
        ring = split_section(x, up, lo, x_cut, gap=gap, part=part)
    # place in 3-D
    S_le = w.S_LE(y); zu = w.z_upper(y)
    up30, lo30, _ = G.airfoil_surfaces(np.array([0.3]), tc, w.camber_blend(y))
    z_chord30 = (zu - t / 2) - (up30[0] + lo30[0]) / 2 * c
    ca, sa = math.cos(w.inc), math.sin(w.inc)
    xx, zz = ring[:, 0], ring[:, 1]
    dx = (xx - 0.3) * c; dz = zz * c
    S = S_le + 0.3 * c + dx * ca + dz * sa
    Z = z_chord30 + dz * ca - dx * sa
    return S, Z, ring

def loft_wing_segment(w, ys, part, x_cut_fn=None, side=1, name="seg", uv_fn=None):
    rings, uvs = [], []
    for y in ys:
        xc = x_cut_fn(y) if x_cut_fn else None
        S, Z, ring = wing_ring(w, y, part, xc)
        rings.append(np.stack([side * np.full_like(S, y), -S, Z], 1))
        uvs.append(ring)
    n = min(len(r) for r in rings)
    assert all(len(r) == n for r in rings), (name, [len(r) for r in rings])
    P = np.array(rings)
    uv = uv_arc(P, np.abs(np.array(ys)) / w.b2 * 0.999)
    me = grid_mesh(name, P, wrap_v=True, uv=uv, cap0=True, cap1=True, sharp_angle=40)
    return me

def join_meshes(name, meshes, coll, mats):
    objs = []
    for me in meshes:
        o = new_obj(me.name, me, coll); objs.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = objs[0]; ob.name = name; ob.data.name = name
    ob.data.materials.clear()
    for m in mats: ob.data.materials.append(m)
    fix_normals_outward(ob)
    return ob

def build_wing(coll, side):
    w = G.Wing()
    tag = "R" if side > 0 else "L"
    ys = w.stations()
    fl0 = V("flap_centre_y") - V("flap_span") / 2; fl1 = V("flap_centre_y") + V("flap_span") / 2
    ai0 = V("aileron_centre_y") - V("aileron_span") / 2; ai1 = V("aileron_centre_y") + V("aileron_span") / 2
    fcut = 1 - V("flap_chord_fraction"); acut = 1 - V("aileron_chord_fraction")
    def seg(a, b):
        s = [y for y in ys if a - 1e-6 <= y <= b + 1e-6]
        if s[0] > a + 1e-6: s = [a] + s
        if s[-1] < b - 1e-6: s = s + [b]
        return np.array(s)
    meshes = []
    meshes.append(loft_wing_segment(w, seg(0.0, fl0), "full", side=side, name=f"W{tag}_root"))
    meshes.append(loft_wing_segment(w, seg(fl0, fl1), "fwd", lambda y: fcut, side, f"W{tag}_flapbay"))
    meshes.append(loft_wing_segment(w, seg(fl1, ai0), "full", side=side, name=f"W{tag}_mid"))
    meshes.append(loft_wing_segment(w, seg(ai0, ai1), "fwd", lambda y: acut, side, f"W{tag}_ailbay"))
    meshes.append(loft_wing_segment(w, seg(ai1, w.b2 - 0.004), "full", side=side, name=f"W{tag}_tip"))
    wing = join_meshes(f"Wing_{tag}", meshes, coll, [MATS["dessous"]])
    wing["source"] = ("planform: c=2.36 centreline (Pl.0), 2.15 root (p13), 0.92 tip (p13), span 10.20, area 15.97 (p63); "
                      "thickness Pl.1 elevation (SCALED); dihedral 3°55'30\" outboard of rib 16 (p13/p63, Pl.1); incidence 1°")
    # control surfaces
    flap = loft_wing_segment(w, seg(fl0 + 0.004, fl1 - 0.004), "aft", lambda y: fcut, side, f"Flap_{tag}")
    flap_o = new_obj(f"Flap_{tag}", flap, coll); flap_o.data.materials.append(MATS["dessous"]); fix_normals_outward(flap_o)
    ail = loft_wing_segment(w, seg(ai0 + 0.004, ai1 - 0.004), "aft", lambda y: acut, side, f"Aileron_{tag}")
    ail_o = new_obj(f"Aileron_{tag}", ail, coll); ail_o.data.materials.append(MATS["dessous"]); fix_normals_outward(ail_o)
    # hinge lines
    def hinge_pt(y, xcut, mode):
        S, Z, ring = wing_ring(w, y, "aft", xcut)
        c = w.chord(y); t = w.thickness(y)
        k0 = 0  # nose top point
        x0 = xcut + 0.006
        Sx = w.S_LE(y) + x0 * c
        if mode == "aileron":   # hinge at the balance-nose centre (Pl.7)
            Zm = 0.5 * (Z.max() + Z.min()) if False else None
        # use ring geometry near the nose
        idx = np.argsort(np.abs(ring[:, 0] - x0))[:6]
        Zn = Z[idx]; Sn = S[idx]
        zc = 0.5 * (Zn.max() + Zn.min())
        if mode == "flap":      # slotted flap: hinge bracket below the rear spar (Pl.2/Pl.6), GUESS 45 mm under the lower skin
            return B(np.mean(Sn) + 0.03 * c, side * y, Zn.min() - 0.045)
        return B(np.mean(Sn) + 0.02, side * y, zc)
    hf0, hf1 = hinge_pt(fl0 + 0.004, fcut, "flap"), hinge_pt(fl1 - 0.004, fcut, "flap")
    ha0, ha1 = hinge_pt(ai0 + 0.004, acut, "aileron"), hinge_pt(ai1 - 0.004, acut, "aileron")
    if side < 0:
        hf0, hf1 = hf1, hf0; ha0, ha1 = ha1, ha0
    hfe = hinge_empty(f"Hinge_Flap_{tag}", hf0, hf1, coll)
    hae = hinge_empty(f"Hinge_Aileron_{tag}", ha0, ha1, coll)
    parent_keep(flap_o, hfe); parent_keep(ail_o, hae)
    for e in (hfe, hae):
        e["axis_direction"] = "outboard->inboard" if side < 0 else "inboard->outboard"
    return wing, flap_o, ail_o, hfe, hae, w

# ============================================================== tail
def tail_section_ring(le, te, z_or_y, axis, tc=0.12, part="full", s_cut=None, gap=0.006):
    x = G.cosine_x(26)
    up, lo, _ = G.airfoil_surfaces(x, tc, 0.0)
    c = te - le
    if part == "full":
        ring = full_ring(x, up, lo)
    else:
        ring = split_section(x, up, lo, (s_cut - le) / c, gap=gap / max(c, 0.05), part=part)
    S = le + ring[:, 0] * c; T = ring[:, 1] * c
    return S, T

def build_tail(coll):
    T = G.Tail(); f = G.Fuselage()
    objs = {}
    # ---------------- tailplane (sections along y, symmetric 12% GUESS)
    hinge = T.hinge_S
    ytip = T.tp_y.max()
    ys = np.unique(np.concatenate([np.linspace(0, ytip * 0.93, 26), ytip * np.array([0.955, 0.975, 0.99, 0.998]), [0.30]]))
    def tp_le_te(y):
        le, te = T.tailplane_chord(min(y, ytip))
        if te - le < 0.04:
            m = 0.5 * (le + te); le, te = m - 0.02, m + 0.02
        return le, te
    def loft(part, ylist, side, name, inner_cut=None):
        rings = []
        for y in ylist:
            le, te = tp_le_te(y)
            if part == "aft":
                S, Tt = tail_section_ring(le, te, y, "y", 0.12, "aft", hinge)
            elif part == "fwd":
                S, Tt = tail_section_ring(le, te, y, "y", 0.12, "fwd", hinge)
            else:
                S, Tt = tail_section_ring(le, te, y, "y")
            rings.append(np.stack([side * np.full_like(S, y), -S, T.tp_Z + Tt], 1))
        n = len(rings[0])
        P = np.array(rings)
        uv = uv_arc(P, 0.5 + side * 0.5 * np.array(ylist) / (ytip * 1.02))
        return grid_mesh(name, P, wrap_v=True, uv=uv, cap0=True, cap1=True)
    ylist_fixed = ys
    ylist_el = ys[ys >= 0.30]
    tp_meshes = []
    for side in (1, -1):
        tp_meshes.append(loft("fwd", ylist_fixed, side, f"TP_{side}"))
    tp = join_meshes("Tailplane", tp_meshes, coll, [MATS["dessous"]])
    tp["source"] = "Pl.0 plan outline, span scaled to 3.54 (PRINTED p13/p14/p67); hinge 5.88 aft of wing LE (PRINTED); NACA 0012 GUESS"
    els = []
    for side, tag in ((1, "R"), (-1, "L")):
        me = loft("aft", ylist_el, side, f"Elevator_{tag}")
        o = new_obj(f"Elevator_{tag}", me, coll); o.data.materials.append(MATS["dessous"]); fix_normals_outward(o); els.append(o)
    # tailplane incidence pivot (GUESS: on the tailplane spar ~ 30% root chord)
    le0, te0 = tp_le_te(0.0)
    piv = B(le0 + 0.30 * (te0 - le0), 0, T.tp_Z)
    tp_piv = hinge_empty("Pivot_Tailplane", piv, (piv[0] + 1, piv[1], piv[2]), coll)
    he = hinge_empty("Hinge_Elevator", B(hinge, 1, T.tp_Z), B(hinge, -1, T.tp_Z), coll)
    for o in els: parent_keep(o, he)
    parent_keep(tp, tp_piv); parent_keep(he.parent, tp_piv)
    # ---------------- fin + rudder (horizontal sections)
    fin_S = T.fin_top_S; fin_Z = T.fin_top_Z
    ktop = int(np.argmax(fin_Z)); S_top = fin_S[ktop]; Z_top = fin_Z[ktop]
    fwd = [(s, z) for s, z in zip(fin_S, fin_Z) if s < S_top]       # leading edge branch
    aft = [(s, z) for s, z in zip(fin_S, fin_Z) if s >= S_top]      # rudder trailing edge (upper)
    fwd = np.array(sorted(fwd, key=lambda p: p[1])); aft = np.array(sorted(aft, key=lambda p: p[1]))
    rb = np.array(sorted(zip(T.rud_bot_S, T.rud_bot_Z), key=lambda p: p[0]))
    Zmin = float(rb[:, 1].min()) + 0.005
    hingeR = T.rudder_hinge_S
    def le_of(z):
        # fin LE line, extrapolated downwards inside the fuselage
        zz, ss = fwd[:, 1], fwd[:, 0]
        if z >= zz.min(): return float(np.interp(z, zz, ss))
        sl = np.polyfit(zz[:8], ss[:8], 1)
        return float(np.polyval(sl, z))
    def te_of(z):
        if z >= aft[:, 1].min(): return float(np.interp(z, aft[:, 1], aft[:, 0]))
        # lower rudder: bottom curve, TE where z meets it (choose max S with Z<=z)
        cand = rb[rb[:, 1] <= z + 1e-6]
        return float(cand[:, 0].max()) if len(cand) else hingeR + 0.05
    zs = np.unique(np.concatenate([np.linspace(Zmin, Z_top - 0.03, 46), [T.horn_Z - 0.003, T.horn_Z + 0.003]]))
    fin_rings, rud_rings_lo, rud_rings_hi = [], [], []
    for z in zs:
        le, te = le_of(z), te_of(z)
        if te - le < 0.08: continue
        cut = hingeR if z < T.horn_Z else T.horn_S
        tc = 0.12 * min(1.0, 0.35 + 0.65 * (Z_top - z) / 0.25) if z > Z_top - 0.25 else 0.12
        if cut - le > 0.04:
            S, Tt = tail_section_ring(le, te, z, "z", tc, "fwd", cut)
            fin_rings.append((z, np.stack([Tt, -S, np.full_like(S, z)], 1)))
        if te - cut > 0.04:
            S2, T2 = tail_section_ring(le, te, z, "z", tc, "aft", cut)
            (rud_rings_lo if z < T.horn_Z else rud_rings_hi).append((z, np.stack([T2, -S2, np.full_like(S2, z)], 1)))
    def mk(name, rings, mats):
        P = np.array([r for _, r in rings])
        zl = np.array([z for z, _ in rings])
        uv = uv_arc(P, (zl - Zmin) / (Z_top - Zmin))
        me = grid_mesh(name, P, wrap_v=True, uv=uv, cap0=True, cap1=True)
        o = new_obj(name, me, coll)
        for m in mats: o.data.materials.append(m)
        fix_normals_outward(o)
        return o
    fin_lo = [r for r in fin_rings if r[0] < T.horn_Z]; fin_hi = [r for r in fin_rings if r[0] >= T.horn_Z]
    fin = mk("Fin", fin_lo, [MATS["dessous"]])
    if len(fin_hi) >= 2:
        fin2 = mk("Fin_top", fin_hi, [MATS["dessous"]])
        bpy.ops.object.select_all(action='DESELECT'); fin.select_set(True); fin2.select_set(True)
        bpy.context.view_layer.objects.active = fin; bpy.ops.object.join()
    fin["source"] = "Pl.0 side outline (SCALED); fin height 1.87 (PRINTED p14); NACA 0012 GUESS"
    rud = mk("Rudder", rud_rings_lo, [MATS["dessous"]])
    if len(rud_rings_hi) >= 2:
        r2 = mk("Rudder_horn", rud_rings_hi, [MATS["dessous"]])
        bpy.ops.object.select_all(action='DESELECT'); rud.select_set(True); r2.select_set(True)
        bpy.context.view_layer.objects.active = rud; bpy.ops.object.join()
    rud["source"] = "hinge 6.08 aft of wing LE (PRINTED), horn balance and outline Pl.0 (SCALED), ±30° (PRINTED)"
    hr = hinge_empty("Hinge_Rudder", B(hingeR, 0, Zmin), B(hingeR, 0, Z_top), coll, up=(0, -1, 0))
    parent_keep(rud, hr)
    # Flettner trim tab on the lower rudder trailing edge (PRINTED p61 'volet Flettner', red); size GUESS
    tab_z0, tab_z1 = 0.05, 0.45
    tab_rings = []
    for z in np.linspace(tab_z0, tab_z1, 6):
        te = te_of(z); c = 0.10
        S, Tt = tail_section_ring(te - c, te + 0.002, z, "z", 0.05)
        tab_rings.append((z, np.stack([Tt, -S, np.full_like(S, z)], 1)))
    tab = mk("Rudder_Tab", tab_rings, [MATS["red"]])
    parent_keep(tab, rud)
    objs.update(tailplane=tp, elevators=els, fin=fin, rudder=rud, tab=tab, hinge_el=he, hinge_rud=hr, pivot_tp=tp_piv)
    return objs, T

# ============================================================== Karman fillet
def build_karman(coll, side, w, f):
    """Wing-root fillet (Karman): concave fairing between the fuselage side and the wing upper
    surface; its upper edge follows the outline drawn on Pl.0 side view (SCALED)."""
    pts = G.SIDE["bottom"]  # not used; fillet edge digitised below
    edge_px = [(2795, 352), (2785, 340), (2775, 333), (2765, 325), (2755, 317), (2745, 309), (2735, 300), (2725, 294),
               (2705, 291), (2685, 291), (2665, 293), (2645, 297), (2625, 305), (2605, 314), (2585, 315), (2565, 314),
               (2545, 314), (2525, 316), (2505, 317), (2485, 321), (2465, 325), (2455, 331)]
    E = np.array([G.side_px_to_SZ(px, py) for px, py in edge_px])
    E = E[np.argsort(E[:, 0])]
    Ss = np.linspace(E[0, 0] + 0.02, E[-1, 0] - 0.02, 44)
    rings = []
    for S in Ss:
        ztop = float(np.interp(S, E[:, 0], E[:, 1]))
        wf = float(f.half_width(S))
        # wing upper surface z at y=wf+R (search the wing section at that span for S)
        def wing_upper_z(y):
            Sw, Zw, ring = wing_ring(w, y, "full")
            n = len(ring); kLE = int(np.argmin(ring[:, 0]))
            Su, Zu = Sw[:kLE + 1], Zw[:kLE + 1]
            o = np.argsort(Su)
            if S < Su.min(): return float(Zw[kLE]), True
            if S > Su.max(): return float(Zu[np.argmax(Su)]), True
            return float(np.interp(S, Su[o], Zu[o])), False
        zw0, out0 = wing_upper_z(wf)
        h = max(0.0, ztop - zw0)
        # lateral reach from Pl.0 plan view (fillet line 0.07-0.22 m outside the fuselage side, SCALED),
        # fading to zero aft of the root trailing edge
        R = float(np.interp(S, [1.95, 2.3, 3.0, 3.8, 4.2, 4.55, 4.95], [0.05, 0.22, 0.16, 0.10, 0.07, 0.03, 0.005]))
        R = max(R, 0.004)
        zw1, _ = wing_upper_z(wf + R)
        A = np.array([wf - 0.004, ztop]); C = np.array([wf - 0.004, zw0]); Bp = np.array([wf + R, zw1 + 0.002])
        t = np.linspace(0, 1, 14)[:, None]
        curve = (1 - t) ** 2 * A + 2 * (1 - t) * t * C + t ** 2 * Bp
        ring = curve
        rings.append(np.stack([side * ring[:, 0], -np.full(len(ring), S), ring[:, 1]], 1))
    P = np.array(rings)
    nu, nv = P.shape[:2]
    uv = np.zeros((nu, nv, 2))
    for i in range(nu):
        for j in range(nv): uv[i, j] = (i / (nu - 1), j / (nv - 1))
    me = grid_mesh(f"Karman_{'R' if side > 0 else 'L'}", P, wrap_v=False, uv=uv)
    o = new_obj(me.name, me, coll); o.data.materials.append(MATS["dessous"])
    orient_normals(o, lambda c: (side, 0.0, 1.0))
    o["source"] = "Karman fillet outline: Pl.0 side view (SCALED); Pl.9 'Ensemble Karman'; cross-section curve GUESS"
    return o

# ============================================================== powerplant
def revolve(name, prof_S, prof_r, n=48, coll=None, mat_=None, axis_offset=(0.0, 0.0)):
    th = np.linspace(0, 2 * math.pi, n, endpoint=False)
    P = np.array([[B(S, axis_offset[0] + r * math.cos(t), axis_offset[1] + r * math.sin(t)) for t in th] for S, r in zip(prof_S, prof_r)])
    me = grid_mesh(name, P, wrap_v=True, cap0=False, cap1=True)
    o = new_obj(name, me, coll)
    if mat_: o.data.materials.append(mat_)
    fix_normals_outward(o)
    return o

def build_powerplant(coll):
    objs = {}
    sp = V("spinner"); L = sp["length"]; R = sp["base_diameter"] / 2
    Sx = np.linspace(0.0, L, 28)
    s = Sx / L
    r = R * (np.sin(0.5 * math.pi * s) ** 0.85)        # pointed ogive (shape GUESS; photos p2-p4)
    r[0] = 0.028                                   # cannon muzzle ring (HS 404 through the hub, PRINTED p30)
    spinner = revolve("Spinner", Sx, r, 48, coll, MATS["metal"])
    spinner["source"] = "Pl.0 side/front (SCALED) base dia ~0.56-0.62; length GUESS bounded by prop plane 0.48 (PRINTED 8.76-8.28)"
    # prop group pivot: prop plane on the thrust axis; engine offset 1° left (PRINTED p15) about a point 2.35 m aft
    S_pp = V("prop_plane_S")
    hub = bpy.data.objects.new("Prop_Hub", None); hub.empty_display_type = 'CIRCLE'; hub.empty_display_size = 0.3
    coll.objects.link(hub)
    hub.matrix_world = Matrix.Translation(Vector(B(S_pp, 0, 0))) @ Matrix.Rotation(-math.pi / 2, 4, 'X')  # local Z = prop axis (forward, +Y)
    spin = bpy.data.objects.new("Prop_Spin", None); spin.empty_display_size = 0.2; coll.objects.link(spin)
    spin.parent = hub; spin.matrix_parent_inverse = Matrix.Identity(4)
    spin["spin_axis"] = "local Z = propeller axis"
    blades = []
    Rt = V("prop_diameter") / 2
    for k in range(3):
        bl = build_blade(f"Blade_{k + 1}", Rt, coll)
        axis = bpy.data.objects.new(f"Blade_{k + 1}_Axis", None); axis.empty_display_size = 0.1; coll.objects.link(axis)
        axis.parent = spin; axis.matrix_parent_inverse = Matrix.Identity(4)
        axis.matrix_basis = Matrix.Rotation(k * 2 * math.pi / 3, 4, 'Z') @ Matrix.Rotation(-math.pi / 2, 4, 'X')
        piv = bpy.data.objects.new(f"Blade_{k + 1}_Pitch", None); piv.empty_display_size = 0.08; coll.objects.link(piv)
        piv.parent = axis; piv.matrix_parent_inverse = Matrix.Identity(4)
        piv["pitch_axis"] = "local Z (radial)"
        bl.parent = piv; bl.matrix_parent_inverse = Matrix.Identity(4)
        blades.append((piv, bl))
    parent_keep(spinner, spin)
    yaw = bpy.data.objects.new("Engine_Offset", None); coll.objects.link(yaw)
    yaw.location = B(2.35, 0, 0)
    parent_keep(hub, yaw)
    yaw.rotation_euler[2] = V("engine_offset_left") * D2R          # nose 1 deg to the left (towards -X)
    yaw["source"] = "engine mount set 1° left (PRINTED p15), 41 mm at the nose (Pl.50 bis)"
    objs.update(spinner=spinner, hub=hub, spin=spin, blades=blades, offset=yaw)
    # exhaust stacks (3 groups per side, GUESS positions from photos)
    ex = V("exhausts")
    f = G.Fuselage()
    for side in (1, -1):
        for Sx_ in ex["S"]:
            wz = float(f.half_width(Sx_))
            # side of the cowling at height Z: superellipse estimate -> use section ring
            Y, Z, _ = f.section(Sx_, n_half=48)
            k = np.argmin(np.abs(Z - ex["Z"]) + (Y * side < 0) * 10)
            y0 = abs(Y[k])
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0)
            for vtx in bm.verts:
                vtx.co.x *= 0.07; vtx.co.y *= 0.16; vtx.co.z *= 0.06
            me = bpy.data.meshes.new(f"Exhaust_{'R' if side > 0 else 'L'}_{Sx_:.2f}")
            bm.to_mesh(me); bm.free()
            o = new_obj(me.name, me, coll); o.data.materials.append(MATS["darkmetal"])
            o.location = B(Sx_, side * (y0 + 0.012), ex["Z"])
            o.rotation_euler = (0, side * 0.25, 0)
    # radiator bath (SCALED Pl.0) + exit flap
    rd = V("radiator")
    rb = np.array([G.side_px_to_SZ(p[0], p[1]) for p in G.SIDE["radiator_bottom"]]); rb = rb[np.argsort(rb[:, 0])]
    Ss = np.linspace(rd["S_front"] + 0.01, rd["S_rear"] - 0.01, 30)
    rings = []
    for S in Ss:
        zb = float(np.interp(S, rb[:, 0], rb[:, 1]))
        ztop = -0.78
        hw = rd["width"] / 2 * (0.82 + 0.18 * math.sin(math.pi * (S - Ss[0]) / (Ss[-1] - Ss[0])))
        th = np.linspace(0, 2 * math.pi, 32, endpoint=False)
        cy, cz = 0.0, 0.5 * (zb + ztop); ay, az = hw, 0.5 * (ztop - zb)
        n = 3.0
        yy = ay * np.sign(np.cos(th)) * np.abs(np.cos(th)) ** (2 / n); zz = cz + az * np.sign(np.sin(th)) * np.abs(np.sin(th)) ** (2 / n)
        rings.append(np.stack([yy, -np.full_like(yy, S), zz], 1))
    me = grid_mesh("Radiator", np.array(rings), wrap_v=True, cap0=False, cap1=False)
    rad = new_obj("Radiator", me, coll); rad.data.materials.append(MATS["dessous"]); fix_normals_outward(rad)
    rad["source"] = "ventral radiator bath, outline Pl.0 side (SCALED), rear flap pilot-controlled (PRINTED p26); width GUESS"
    # core faces (front and rear)
    for S, nm in ((Ss[0] + 0.03, "Radiator_Core_Front"), (Ss[-1] - 0.03, "Radiator_Core_Rear")):
        bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
        me2 = bpy.data.meshes.new(nm); bm.to_mesh(me2); bm.free()
        o = new_obj(nm, me2, coll); o.data.materials.append(MATS["radiator"])
        zb = float(np.interp(S, rb[:, 0], rb[:, 1]))
        o.location = B(S, 0, 0.5 * (zb - 0.78)); o.rotation_euler = (math.pi / 2, 0, 0)
        o.scale = (rd["width"] * 0.80, 0.9 * (-0.78 - zb), 1)
    # exit flap: hinged at the top of the bath's rear lip
    zb_r = float(np.interp(rd["S_rear"], rb[:, 0], rb[:, 1]))
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for vtx in bm.verts:
        vtx.co.x *= rd["width"] * 0.82; vtx.co.y *= 0.32; vtx.co.z *= 0.012
        vtx.co.y -= 0.16
    me3 = bpy.data.meshes.new("Radiator_Flap"); bm.to_mesh(me3); bm.free()
    flap = new_obj("Radiator_Flap", me3, coll); flap.data.materials.append(MATS["dessous"])
    hp = B(rd["S_rear"] - 0.01, -1, zb_r + 0.02)
    he = hinge_empty("Hinge_RadiatorFlap", hp, (hp[0] + 2, hp[1], hp[2]), coll)
    flap.location = (0, hp[1], hp[2]); flap.rotation_euler = (0.12, 0, 0)
    parent_keep(flap, he)
    objs.update(radiator=rad, rad_flap=flap, rad_hinge=he)
    return objs

def build_blade(name, Rt, coll):
    """Ratier-type paddle blade (shape GUESS; diameter 3.05 PRINTED). Built along local +Z (radial)."""
    rs = np.concatenate([np.linspace(0.12, Rt * 0.92, 18), Rt * np.array([0.95, 0.975, 0.99, 1.0])])
    x = G.cosine_x(20)
    rings = []
    for r in rs:
        e = r / Rt
        c = 0.13 + 0.13 * math.sin(math.pi * min(1, e / 0.9)) ** 0.8
        if e > 0.92: c *= math.sqrt(max(0.02, 1 - ((e - 0.92) / 0.08) ** 2))
        c = max(c, 0.01)
        tc = 0.30 - 0.24 * min(1, (e - 0.08) / 0.85) if e > 0.08 else 0.3
        tc = max(tc, 0.06)
        up, lo, _ = G.airfoil_surfaces(x, tc, 0.5)
        ring = full_ring(x, up, lo)
        if e < 0.2:   # round shank
            th = np.linspace(0, 2 * math.pi, len(ring), endpoint=False)
            rr = 0.045
            ring = np.stack([0.5 + rr / c * np.cos(th), rr / c * np.sin(th)], 1)
        beta = math.atan(2.9 / (2 * math.pi * max(r, 0.25)))           # design pitch 2.9 m (GUESS)
        xs = (ring[:, 0] - 0.35) * c; zs = ring[:, 1] * c
        cb, sb = math.cos(beta), math.sin(beta)
        X = xs * cb - zs * sb; Yv = xs * sb + zs * cb
        rings.append(np.stack([X, Yv, np.full_like(X, r)], 1))
    me = grid_mesh(name, np.array(rings), wrap_v=True, cap0=True, cap1=True)
    o = new_obj(name, me, coll); o.data.materials.append(MATS["prop"]); fix_normals_outward(o)
    o["source"] = "3 blades, D=3.05 (PRINTED p15); planform/section/twist GUESS"
    return o

# ============================================================== landing gear
def build_gear(coll, w):
    g = G.solve_gear()
    S_ax = V("main_axle_S"); rake = 0.24          # leg raked forward: axle 0.24 m ahead of the pivot (SCALED Pl.0 side)
    out = {"solve": g}
    for side, tag in ((1, "R"), (-1, "L")):
        pv = Vector(B(S_ax + rake, side * g["pivot_y"], g["pivot_Z"]))
        E = Vector(B(S_ax, side * g["leg_end_y"], g["axle_Z"]))          # static leg end (stub axle root)
        u = (E - pv).normalized()                                      # leg direction, pivot -> axle
        e = bpy.data.objects.new(f"Gear_Pivot_{tag}", None); e.empty_display_type = 'SINGLE_ARROW'; coll.objects.link(e)
        e.location = pv
        e["axis"] = "world/local Y (fore-aft), PRINTED p21"
        bpy.context.view_layer.update()
        casing = cyl(f"Gear_Leg_{tag}", pv, pv + u * 0.62, 0.050, coll, MATS["dessous"])
        # oleo: static axis along the leg, driven child slides along local Z (extension when unloaded)
        ox = bpy.data.objects.new(f"Gear_Oleo_{tag}_Axis", None); coll.objects.link(ox)
        M = Vector((0, 0, 1)).rotation_difference(u).to_matrix().to_4x4(); M.translation = E
        ox.matrix_world = M
        oc = bpy.data.objects.new(f"Gear_Oleo_{tag}", None); oc.empty_display_size = 0.05; coll.objects.link(oc)
        oc.parent = ox; oc.matrix_parent_inverse = Matrix.Identity(4)
        oc["travel"] = "0.15 m remaining travel at static load (PRINTED p13), extends before retraction"
        bpy.context.view_layer.update()
        slider = cyl(f"Gear_Slider_{tag}", E - u * 0.42, E, 0.036, coll, MATS["metal"])
        wc = E + Vector((-side * g["d_off"], 0, 0))
        wheel = build_wheel(f"Wheel_{tag}", g["wheel_r"], V("tyre_width"), coll)
        wheel.location = wc; wheel.rotation_euler = (0, math.pi / 2, 0)
        stub = cyl(f"Gear_Stub_{tag}", E, wc, 0.025, coll, MATS["metal"])
        up_f, lo_f = build_gear_fairing(f"Gear_Fairing_{tag}", pv, E, side, g["wheel_r"], coll)
        for o in (slider, wheel, stub, lo_f):
            parent_keep(o, oc)
        parent_keep(ox, e)
        for o in (casing, up_f):
            parent_keep(o, e)
        out[tag] = dict(pivot=e, wheel=wheel, oleo=oc)
    return out

def cyl(name, p0, p1, r, coll, m, n=20):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0; L = d.length
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=n, radius1=r, radius2=r, depth=L)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = new_obj(name, me, coll); o.data.materials.append(m)
    o.location = (p0 + p1) / 2
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    me.shade_smooth()
    return o

def tube(name, pts, r, coll, m, closed=False):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for k, p in enumerate(pts): sp.points[k].co = (p[0], p[1], p[2], 1)
    sp.use_cyclic_u = closed
    cu.bevel_depth = r; cu.bevel_resolution = 2; cu.use_fill_caps = True
    o = bpy.data.objects.new(name, cu); coll.objects.link(o)
    bpy.context.view_layer.objects.active = o
    for ob in bpy.context.selected_objects: ob.select_set(False)
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.view_layer.objects.active
    o.data.materials.clear(); o.data.materials.append(m)
    return o

def build_wheel(name, r, wdt, coll):
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=False, segments=48, radius=r - wdt / 2)
    me = bpy.data.meshes.new(name)
    # torus via revolve of circle profile
    th = np.linspace(0, 2 * math.pi, 48, endpoint=False); ph = np.linspace(0, 2 * math.pi, 20, endpoint=False)
    R0 = r - wdt / 2; a = wdt / 2
    P = np.array([[((R0 + a * 1.0 * math.cos(p)) * math.cos(t), (R0 + a * math.cos(p)) * math.sin(t), a * 0.95 * math.sin(p)) for p in ph] for t in th])
    me = grid_mesh(name, P, wrap_v=True)
    # close u-wrap by joining first/last ring: rebuild with bmesh bridge
    o = new_obj(name, me, coll); o.data.materials.append(MATS["rubber"])
    bm = bmesh.new(); bm.from_mesh(me)
    nv = 20
    vs = bm.verts; vs.ensure_lookup_table()
    first = [vs[j] for j in range(nv)]; last = [vs[(len(th) - 1) * nv + j] for j in range(nv)]
    for j in range(nv):
        bm.faces.new((last[j], first[j], first[(j + 1) % nv], last[(j + 1) % nv]))
    bm.to_mesh(me); bm.free(); fix_normals_outward(o); me.shade_smooth()
    hub = cyl(name + "_Hub", (0, 0, -wdt * 0.42), (0, 0, wdt * 0.42), R0 * 0.92, coll, MATS["dessous"], 32)
    hub.parent = o; hub.matrix_parent_inverse = Matrix.Identity(4)
    o["source"] = f"wheel dia {2*r:.2f} m (SCALED Pl.0), tyre '10 bis' (PRINTED p14)"
    return o

def build_gear_fairing(name, pv, ax, side, rw, coll):
    """Leg fairing (Pl.31) in two telescoping parts on the OUTER side of the leg: an upper strip fixed to
    the leg casing and a lower plate shaped as a half wheel cover that moves with the sliding tube."""
    pv, ax = Vector(pv), Vector(ax)
    d = (ax - pv); L = d.length; u = d.normalized()
    fwd = Vector((0, 1, 0)); n = u.cross(fwd).normalized() * side
    if n.x * side < 0: n = -n
    def sheet(nm, prof, off):
        rows = []
        for s, wdt, sh in prof:
            c = pv + u * (s * L) + n * off + fwd * sh
            rows.append([c + fwd * (-wdt / 2 + k * wdt / 8) for k in range(9)])
        P = np.array([[tuple(p) for p in r] for r in rows])
        me = grid_mesh(nm, P, wrap_v=False)
        o = new_obj(nm, me, coll); o.data.materials.append(MATS["dessous"])
        so = o.modifiers.new("Thickness", 'SOLIDIFY'); so.thickness = 0.008
        return o
    upper = sheet(name + "_Upper", [(0.02, 0.12, 0.0), (0.35, 0.12, 0.0), (0.66, 0.13, 0.0)], 0.06)
    R = rw * 1.05
    prof = [(0.60, 0.14, 0.0)]
    for k in range(9):
        t = k / 8
        ang = -math.pi / 2 + math.pi * t
        s = 1.0 + (R * math.sin(ang)) / L
        wdt = 2 * R * math.cos(ang) * 0.98 if abs(ang) < math.pi / 2 - 1e-3 else 0.04
        prof.append((s, max(0.04, wdt), -0.05 * math.cos(ang)))
    prof = sorted(prof)
    lower = sheet(name + "_Lower", prof, 0.075)
    upper["source"] = lower["source"] = "Pl.31 undercarriage fairing, two telescoping parts (PRINTED); outer half-disc wheel cover from photos p2-p4"
    return upper, lower

def build_tailwheel(coll, att):
    S_tw = V("tail_wheel_S"); th = att
    z_contact = -V("prop_axis_height_flight_line") + (S_tw - V("main_axle_S")) * math.tan(th)
    r = 0.075
    w = build_wheel("Tailwheel", r, 0.06, coll)
    w.location = B(S_tw + 0.05, 0, z_contact + r); w.rotation_euler = (0, math.pi / 2, 0)
    f = G.Fuselage()
    zb = float(f.z_bot(S_tw - 0.08))
    strut = cyl("Tailwheel_Strut", B(S_tw - 0.10, 0, zb + 0.05), B(S_tw + 0.05, 0, z_contact + r), 0.03, coll, MATS["dessous"])
    fork = cyl("Tailwheel_Fork", B(S_tw + 0.05, 0.045, z_contact + r), B(S_tw + 0.05, -0.045, z_contact + r), 0.012, coll, MATS["metal"])
    w["source"] = "tail wheel No.592 at frame 12 (PRINTED p14/p25); contact from rest attitude (DERIVED); size GUESS"
    return w

# ============================================================== small equipment
def build_equipment(coll, w, f, T):
    objs = {}
    # Pitot: left wing tip (PRINTED p27)
    y = -4.80; Sle = w.S_LE(4.80); zu = w.z_upper(4.80)
    objs["pitot"] = cyl("Pitot", B(Sle + 0.20, y, zu - 0.10), B(Sle - 0.32, y, zu - 0.10), 0.009, coll, MATS["metal"])
    cyl("Pitot_Mast", B(Sle + 0.22, y, zu - 0.05), B(Sle + 0.20, y, zu - 0.10), 0.01, coll, MATS["metal"])
    # navigation lights (PRINTED p48)
    for side, m in ((1, MATS["navgreen"]), (-1, MATS["navred"])):
        yy = w.b2 - 0.02
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.025, location=B(w.S_LE(yy) + w.chord(yy) * 0.4, side * yy, w.z_upper(yy) - 0.02))
        o = bpy.context.active_object; o.name = f"NavLight_{'R' if side > 0 else 'L'}"; o.data.materials.append(m)
        for c in o.users_collection: c.objects.unlink(o)
        coll.objects.link(o)
    for side in (1, -1):
        Ztop = T.fin_top_Z.max() - 0.12
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.018, location=B(8.0, side * 0.03, Ztop))
        o = bpy.context.active_object; o.name = f"FinLight_{'R' if side > 0 else 'L'}"; o.data.materials.append(MATS["navwhite"])
        for c in o.users_collection: c.objects.unlink(o)
        coll.objects.link(o)
    # wing gun ports (Pl.50 bis), lower half of the leading edge
    for side in (1, -1):
        for yg in (V("gun_inner_y"), V("gun_outer_y")):
            S, Z, ring = wing_ring(w, yg, "full")
            kLE = int(np.argmin(ring[:, 0]))
            p = Vector(B(S[kLE], side * yg, Z[kLE] - 0.03))
            cyl(f"GunPort_{'R' if side > 0 else 'L'}_{yg:.2f}", p + Vector((0, -0.10, 0)), p + Vector((0, 0.025, 0)), 0.016, coll, MATS["black"])
    # gun camera under the left wing (PRINTED p31), station GUESS
    yc = -2.40; S, Z, ring = wing_ring(w, 2.40, "full")
    kLE = int(np.argmin(ring[:, 0])); zl = Z[kLE:].min()
    cyl("GunCamera", B(S[kLE] + 0.10, yc, zl - 0.07), B(S[kLE] + 0.55, yc, zl - 0.07), 0.055, coll, MATS["dessous"])
    # antenna mast behind the canopy + wire to fin (PRINTED p29/p46; height GUESS)
    S_m = 5.75; zt = float(f.z_body_top(S_m))
    mast = cyl("Antenna_Mast", B(S_m, 0, zt - 0.02), B(S_m - 0.06, 0, zt + 0.45), 0.012, coll, MATS["dessous"])
    fin_top = T.fin_top_Z.max()
    cyl("Antenna_Wire", B(S_m - 0.06, 0, zt + 0.44), B(7.95, 0, fin_top - 0.05), 0.0025, coll, MATS["black"])
    # backup sight post ahead of the windscreen (Pl.46 'ligne de visée de secours', photo p3)
    S_p = 3.45; cyl("Backup_Sight_Post", B(S_p, 0, float(f.z_body_top(S_p)) - 0.02), B(S_p, 0, float(f.z_body_top(S_p)) + 0.13), 0.008, coll, MATS["black"])
    # retractable ventral antenna (Pl.45): hinged ahead of frame 7; L-shaped mast
    S_h = 5.78; zb = float(f.z_bot(S_h))
    he = hinge_empty("Hinge_VentralAntenna", B(S_h, -0.1, zb - 0.01), B(S_h, 0.1, zb - 0.01), coll)
    a1 = cyl("Antenna_Ventral", B(S_h, 0, zb - 0.01), B(S_h + 0.55, 0, zb - 0.03), 0.010, coll, MATS["dessous"])
    parent_keep(a1, he)
    objs["ventral_hinge"] = he
    return objs

# ============================================================== cockpit
def build_cockpit(coll, f):
    objs = {}
    S_panel = 3.98
    zs = f.cs["sill_Z"]
    # instrument panel board (Pl.39)
    ph = 0.36
    pw = 2 * (f.body_halfwidth_at(S_panel, zs + 0.04) - 0.03)      # fits inside the skin at its top corners
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for vtx in bm.verts: vtx.co.x *= pw; vtx.co.y *= 0.02; vtx.co.z *= ph
    me = bpy.data.meshes.new("Instrument_Panel"); bm.to_mesh(me); bm.free()
    panel = new_obj("Instrument_Panel", me, coll); panel.data.materials.append(MATS["nightblue"])
    panel.location = B(S_panel, 0, zs - ph / 2 + 0.04)
    panel["source"] = "Pl.39 instrument panel (p134); matt night blue (PRINTED p60)"
    # dials from the Pl.39 catalogue
    try:
        pj = json.load(open(os.path.join(HERE, "..", "data", "pl39_panel_layout.json")))
        layout = pj.get("panel_layout", [])
    except Exception:
        layout = []
    n = 0
    for it in layout:
        if it.get("kind") not in ("dial",):
            continue
        x = float(it.get("x", 0.5)); yv = float(it.get("y", 0.5)); dia = float(it.get("approx_diameter", 0.08) or 0.08)
        d = max(0.045, min(0.11, dia * pw))
        px = (x - 0.5) * pw; pz = (0.5 - yv) * ph
        c = cyl(f"Dial_{n:02d}_{it.get('label_en','dial')[:28].replace(' ','_')}",
                Vector(B(S_panel - 0.011, px, panel.location.z + pz)), Vector(B(S_panel - 0.018, px, panel.location.z + pz)), d / 2, coll, MATS["dial"], 24)
        c["label_fr"] = it.get("label_fr", ""); c["label_en"] = it.get("label_en", "")
        parent_keep(c, panel); n += 1
    objs["panel"] = panel; objs["n_dials"] = n
    # gunsight O.P.L. on the centreline above the panel (PRINTED p31)
    gs = cyl("Gunsight_OPL", B(S_panel + 0.02, 0, zs + 0.02), B(S_panel + 0.02, 0, zs + 0.12), 0.035, coll, MATS["black"])
    # seat (Pl.40) - simple tubular frame proxy
    seat = cyl("Seat", B(4.70, 0, zs - 0.42), B(4.70, 0, zs - 0.40), 0.20, coll, MATS["nightblue"])
    back = cyl("Seat_Back", B(4.83, 0, zs - 0.40), B(4.88, 0, zs + 0.10), 0.19, coll, MATS["nightblue"])
    back.scale = (1, 0.15, 1)
    armour = cyl("Armour_Plate", B(4.95, 0, zs - 0.35), B(4.97, 0, zs + 0.22), 0.22, coll, MATS["darkmetal"])
    armour.scale = (1, 0.04, 1); armour["source"] = "7 mm armour at frame 6 (PRINTED p29)"
    stick = cyl("Control_Stick", B(4.42, 0, zs - 0.58), B(4.38, 0, zs - 0.12), 0.014, coll, MATS["black"])
    stick["source"] = "Pl.18 manche à balai"
    hs = bpy.data.objects.new("Pivot_Stick", None); coll.objects.link(hs); hs.location = B(4.42, 0, zs - 0.58)
    parent_keep(stick, hs)
    rb = cyl("Rudder_Bar", B(3.95, -0.22, zs - 0.62), B(3.95, 0.22, zs - 0.62), 0.016, coll, MATS["black"])
    hr = bpy.data.objects.new("Pivot_RudderBar", None); coll.objects.link(hr); hr.location = B(3.95, 0, zs - 0.62)
    parent_keep(rb, hr)
    objs.update(stick_pivot=hs, rudderbar_pivot=hr)
    return objs

# ============================================================== rig
def add_driver(obj, path, index, expr, vars_):
    fc = obj.driver_add(path, index)
    d = fc.driver; d.type = 'SCRIPTED'; d.expression = expr
    for name, (target, prop) in vars_.items():
        var = d.variables.new(); var.name = name; var.type = 'SINGLE_PROP'
        var.targets[0].id_type = 'OBJECT'; var.targets[0].id = target; var.targets[0].data_path = f'["{prop}"]'
    return fc

def build_rig(ctrl, parts):
    props = {
        "aileron": (0.0, -1.0, 1.0, "+1 = roll right: right aileron up 30°, left down 15° (PRINTED p13)"),
        "elevator": (0.0, -1.0, 1.0, "+1 = stick back: elevators up 20° (PRINTED p14)"),
        "rudder": (0.0, -1.0, 1.0, "+1 = right rudder 30° (PRINTED p14)"),
        "flaps": (0.0, 0.0, 1.0, "0..1 -> 0..35° (PRINTED p14)"),
        "gear": (0.0, 0.0, 1.0, "0 = down, 1 = up (inward, 90°)"),
        "canopy": (0.0, 0.0, 1.0, "0 = closed, 1 = slid aft 0.55 m (GUESS travel)"),
        "prop_pitch": (0.0, 0.0, 1.0, "0 = fine, 1 = coarse (+20°, GUESS: 'pas limite' blank on p15)"),
        "prop_spin_deg": (0.0, -36000.0, 36000.0, "propeller rotation angle"),
        "tailplane_incidence": (0.0, -3.0, 3.0, "degrees, adjustable in flight ±3° (PRINTED p63)"),
        "radiator_flap": (0.0, 0.0, 1.0, "0..1 -> 0..25° (travel GUESS)"),
        "attitude": (0.0, 0.0, 1.0, "0 = flight line, 1 = at rest on tail wheel (DERIVED 14.6°)"),
    }
    for k, (dv, lo, hi, desc) in props.items():
        ctrl[k] = dv
        ui = ctrl.id_properties_ui(k); ui.update(min=lo, max=hi, soft_min=lo, soft_max=hi, description=desc)
    up, dn = V("aileron_up"), V("aileron_down")
    # local X of each hinge empty points inboard->outboard on the right wing, outboard->inboard on the left (mirror)
    add_driver(parts["Hinge_Aileron_R"], "rotation_euler", 0, f"radians(-{up}*max(a,0) - {dn}*min(a,0))", {"a": (ctrl, "aileron")})
    add_driver(parts["Hinge_Aileron_L"], "rotation_euler", 0, f"radians(-{dn}*max(a,0) - {up}*min(a,0))", {"a": (ctrl, "aileron")})
    fd = V("flap_down")
    add_driver(parts["Hinge_Flap_R"], "rotation_euler", 0, f"radians({fd}*f)", {"f": (ctrl, "flaps")})
    add_driver(parts["Hinge_Flap_L"], "rotation_euler", 0, f"radians({fd}*f)", {"f": (ctrl, "flaps")})
    et = V("elevator_travel")
    add_driver(parts["Hinge_Elevator"], "rotation_euler", 0, f"radians(-{et}*e)", {"e": (ctrl, "elevator")})
    add_driver(parts["Pivot_Tailplane"], "rotation_euler", 0, "radians(-i)", {"i": (ctrl, "tailplane_incidence")})
    rt = V("rudder_travel")
    add_driver(parts["Hinge_Rudder"], "rotation_euler", 0, f"radians({rt}*r)", {"r": (ctrl, "rudder")})
    for tag, sgn in (("R", 1), ("L", -1)):
        add_driver(parts[f"Gear_Pivot_{tag}"], "rotation_euler", 1, f"radians({sgn}*90*g)", {"g": (ctrl, "gear")})
        add_driver(parts[f"Gear_Oleo_{tag}"], "location", 2, "0.15*min(1.0, 6.0*g)", {"g": (ctrl, "gear")})
    add_driver(parts["Hinge_VentralAntenna"], "rotation_euler", 0, "radians(-90*g)", {"g": (ctrl, "gear")})
    add_driver(parts["Canopy_Hood"], "location", 1, "-0.55*c", {"c": (ctrl, "canopy")})
    add_driver(parts["Hinge_RadiatorFlap"], "rotation_euler", 0, "radians(25*r)", {"r": (ctrl, "radiator_flap")})
    add_driver(parts["Prop_Spin"], "rotation_euler", 2, "radians(s)", {"s": (ctrl, "prop_spin_deg")})
    for k in range(3):
        add_driver(parts[f"Blade_{k + 1}_Pitch"], "rotation_euler", 2, "radians(20*p)", {"p": (ctrl, "prop_pitch")})
    # cockpit controls follow the surfaces
    add_driver(parts["Pivot_Stick"], "rotation_euler", 1, "radians(15*a)", {"a": (ctrl, "aileron")})
    add_driver(parts["Pivot_Stick"], "rotation_euler", 0, "radians(-15*e)", {"e": (ctrl, "elevator")})
    add_driver(parts["Pivot_RudderBar"], "rotation_euler", 2, "radians(-12*r)", {"r": (ctrl, "rudder")})
    # attitude: rotate whole aircraft about the main-wheel contact line
    add_driver(parts["D520_ATTITUDE"], "rotation_euler", 0, f"radians({parts['_rest_deg']:.3f}*t)", {"t": (ctrl, "attitude")})

def demo_animation(ctrl):
    """10-second control check, using only the printed travel limits."""
    seq = [(1, {}), (24, {"aileron": 1.0}), (48, {"aileron": -1.0}), (72, {"aileron": 0.0, "elevator": 1.0}),
           (96, {"elevator": -1.0}), (120, {"elevator": 0.0, "rudder": 1.0}), (144, {"rudder": -1.0}),
           (168, {"rudder": 0.0, "flaps": 1.0}), (192, {"flaps": 0.0, "canopy": 1.0}), (216, {"canopy": 0.0, "gear": 1.0}),
           (250, {"gear": 0.0})]
    keys = ["aileron", "elevator", "rudder", "flaps", "canopy", "gear"]
    state = {k: 0.0 for k in keys}
    for frame, ch in seq:
        state.update(ch)
        for k in keys:
            ctrl[k] = state[k]; ctrl.keyframe_insert(f'["{k}"]', frame=frame)
    for k in keys:
        ctrl[k] = 0.0
    bpy.context.scene.frame_start = 1; bpy.context.scene.frame_end = 250

# ============================================================== main
def main(out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    build_materials()
    root = bpy.data.objects.new("D520_ROOT", None); sc.collection.objects.link(root)
    att = bpy.data.objects.new("D520_ATTITUDE", None); sc.collection.objects.link(att)
    ctrl = bpy.data.objects.new("D520_CONTROLS", None); ctrl.empty_display_type = 'CUBE'; ctrl.empty_display_size = 0.2
    sc.collection.objects.link(ctrl); ctrl.location = (0, 2.0, 2.5)
    C_air = collection("Airframe"); C_ctl = collection("Control_Surfaces"); C_pp = collection("Powerplant")
    C_gear = collection("Landing_Gear"); C_eq = collection("Equipment"); C_ck = collection("Cockpit")
    fus, f = build_fuselage(C_air)
    can = build_canopy(C_air, f)
    tub = build_cockpit_tub(C_ck, f)
    wR, flR, aiR, hfR, haR, w = build_wing(C_air, 1)
    wL, flL, aiL, hfL, haL, _ = build_wing(C_air, -1)
    for o in (flR, aiR, flL, aiL): o.users_collection[0].objects.unlink(o); C_ctl.objects.link(o)
    tail, T = build_tail(C_air)
    kR = build_karman(C_air, 1, w, f); kL = build_karman(C_air, -1, w, f)
    pp = build_powerplant(C_pp)
    gear = build_gear(C_gear, w)
    rest = G.rest_attitude(V("main_axle_S"))
    tw = build_tailwheel(C_gear, rest)
    eq = build_equipment(C_eq, w, f, T)
    ck = build_cockpit(C_ck, f)
    # hierarchy: everything under ATTITUDE (pivot at main-wheel contact line), ATTITUDE under ROOT
    g = gear["solve"]
    contact = Vector(B(V("main_axle_S"), 0, -V("prop_axis_height_flight_line")))
    att.location = contact
    for o in list(bpy.data.objects):
        if o in (root, att, ctrl) or o.parent is not None: continue
        parent_keep(o, att)
    parent_keep(att, root)
    root.location = (0, 0, 0)
    # put the ground at world Z = 0 (flight line): shift root
    root.location.z = V("prop_axis_height_flight_line")
    parts = {o.name: o for o in bpy.data.objects}
    parts["_rest_deg"] = math.degrees(rest)
    build_rig(ctrl, parts)
    demo_animation(ctrl)
    # record provenance on the root
    root["manual"] = "Notice descriptive et d'utilisation de l'avion de chasse D.520 S, moteur 12 Y 45 (Archives départementales de la Haute-Garonne)"
    root["frame"] = "Blender X = starboard, -Y = aft (S), Z = up; datum: spinner tip on thrust axis"
    root["rest_attitude_deg"] = math.degrees(rest)
    root["gear_solution"] = json.dumps({k: round(x, 4) for k, x in g.items()})
    # sanity: no empty or degenerate meshes (lesson from boolean failures)
    report = {}
    for o in bpy.data.objects:
        if o.type == 'MESH':
            report[o.name] = len(o.data.polygons)
            assert len(o.data.polygons) > 0, o.name
    root["face_counts"] = json.dumps(report)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("SAVED", out, "objects:", len(bpy.data.objects), "mesh faces:", sum(report.values()), "dials:", ck["n_dials"])

if __name__ == "__main__":
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=os.path.join(HERE, "..", "build", "d520_base.blend"))
    a = ap.parse_args(argv)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    main(os.path.abspath(a.out))
