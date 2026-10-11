"""Bake + paint PBR textures (albedo, normal, ORM) for the D.520 and assign final materials.

Pipeline per textured part:
  1. Cycles EMIT bake of the world-space position and normal into float images (texture space).
  2. d520_paint.paint() evaluates the manual's paint scheme, panel lines, rivets, fabric tapes, wear and
     soot as functions of the 3-D position (so patterns run continuously across separate parts).
  3. Tangent-space normal map from the height field using true metric texel sizes.
  4. Cycles AO bake (whole aircraft present) -> ORM = (AO, roughness, metallic).
  5. Principled material with the three maps (+ glTF occlusion hook), saved as d520.blend.
"""
import sys, os, math, time, argparse
import numpy as np
import bpy
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import d520_geom as G
import d520_paint as PNT
from PIL import Image

ZOFF = G.v("prop_axis_height_flight_line")
REUSE = [False]

TARGETS = [
    # name, kind, (W, H)
    ("Fuselage", "fuselage", (4096, 2048)),
    ("Wing_R", "wing", (4096, 2048)), ("Wing_L", "wing", (4096, 2048)),
    ("Aileron_R", "aileron", (1024, 512)), ("Aileron_L", "aileron", (1024, 512)),
    ("Flap_R", "flap", (1024, 512)), ("Flap_L", "flap", (1024, 512)),
    ("Tailplane", "tailplane", (2048, 1024)), ("Elevator_R", "elevator", (1024, 512)), ("Elevator_L", "elevator", (1024, 512)),
    ("Fin", "fin", (1024, 1024)), ("Rudder", "rudder", (1024, 1024)), ("Rudder_Tab", "tab", (256, 256)),
    ("Karman_R", "karman", (1024, 512)), ("Karman_L", "karman", (1024, 512)),
    ("Canopy_RearFairing", "rear", (1024, 512)), ("Radiator", "radiator", (1024, 512)),
]

def neutral():
    c = bpy.data.objects["D520_CONTROLS"]
    if c.animation_data: c.animation_data.action = None
    for k in ("aileron", "elevator", "rudder", "flaps", "gear", "canopy", "prop_pitch", "tailplane_incidence", "radiator_flap", "attitude", "prop_spin_deg"):
        c[k] = 0.0
    bpy.context.view_layer.update()

def ensure_uv(ob, normalize=True):
    me = ob.data
    if not me.uv_layers:
        for o in bpy.context.view_layer.objects: o.select_set(False)
        ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
        bpy.ops.object.mode_set(mode='OBJECT')
        return
    if normalize:
        uv = np.zeros(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get("uv", uv); uv = uv.reshape(-1, 2)
        real = ~((np.abs(uv[:, 0] - 0.995) < 1e-4) & (np.abs(uv[:, 1] - 0.995) < 1e-4))
        lo = uv[real].min(0); hi = uv[real].max(0)
        if (hi - lo).min() > 0.9: return
        uv[real] = 0.004 + (uv[real] - lo) / np.maximum(hi - lo, 1e-6) * 0.992
        uv[~real] = 0.999
        me.uv_layers.active.data.foreach_set("uv", uv.ravel())

def bake_emit(ob, source, W, H, margin):
    img = bpy.data.images.new(f"_bake_{ob.name}_{source}", W, H, alpha=True, float_buffer=True)
    sentinel = np.zeros((H, W, 4), np.float32); sentinel[..., :3] = 1e5; sentinel[..., 3] = 0
    img.pixels.foreach_set(sentinel.ravel())
    m = bpy.data.materials.new("_BAKE"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    geo = nt.nodes.new('ShaderNodeNewGeometry'); em = nt.nodes.new('ShaderNodeEmission'); out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(geo.outputs[source], em.inputs['Color']); nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; nt.nodes.active = tex
    saved = [s.material for s in ob.material_slots]
    for s in ob.material_slots: s.material = m
    for o in bpy.context.view_layer.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='EMIT', margin=margin, use_clear=False)
    for s, mm in zip(ob.material_slots, saved): s.material = mm
    a = np.zeros(W * H * 4, np.float32); img.pixels.foreach_get(a)
    bpy.data.images.remove(img); bpy.data.materials.remove(m)
    return a.reshape(H, W, 4)

def arc_coords(P, valid):
    """cumulative metric distance along image rows (u) and columns (v), restarted at gaps."""
    Pm = np.where(valid[..., None], P, np.nan)
    du = np.linalg.norm(np.diff(Pm, axis=1), axis=2); du = np.where(np.isfinite(du) & (du < 0.05), du, 0)
    dv = np.linalg.norm(np.diff(Pm, axis=0), axis=2); dv = np.where(np.isfinite(dv) & (dv < 0.05), dv, 0)
    au = np.concatenate([np.zeros((P.shape[0], 1), np.float32), np.cumsum(du, 1)], 1)
    av = np.concatenate([np.zeros((1, P.shape[1]), np.float32), np.cumsum(dv, 0)], 0)
    # texel metric sizes for the normal map
    su = np.concatenate([du, du[:, -1:]], 1); sv = np.concatenate([dv, dv[-1:, :]], 0)
    return au.astype(np.float32), av.astype(np.float32), su, sv

def normal_from_height(Hm, su, sv, valid):
    gx = np.zeros_like(Hm); gy = np.zeros_like(Hm)
    gx[:, 1:-1] = (Hm[:, 2:] - Hm[:, :-2]) / np.maximum(su[:, 1:-1] + su[:, :-2], 1e-5)
    gy[1:-1, :] = (Hm[2:, :] - Hm[:-2, :]) / np.maximum(sv[1:-1, :] + sv[:-2, :], 1e-5)
    gx = np.clip(gx, -1.5, 1.5); gy = np.clip(gy, -1.5, 1.5)
    n = np.stack([-gx, -gy, np.ones_like(gx)], -1); n /= np.linalg.norm(n, axis=2, keepdims=True)
    n = np.where(valid[..., None], n, np.array([0, 0, 1], np.float32))
    return n

def dilate(arr, valid, it=6):
    a = arr.copy(); v = valid.copy()
    for _ in range(it):
        acc = np.zeros_like(a); cnt = np.zeros(v.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sh = np.roll(np.roll(a, dy, 0), dx, 1); sv = np.roll(np.roll(v, dy, 0), dx, 1)
            acc += np.where(sv[..., None] if a.ndim == 3 else sv, sh, 0); cnt += sv
        new = (~v) & (cnt > 0)
        fill = acc / np.maximum(cnt, 1)[..., None] if a.ndim == 3 else acc / np.maximum(cnt, 1)
        a = np.where(new[..., None] if a.ndim == 3 else new, fill, a); v = v | new
    return a

def save_png(arr, path, srgb=False):
    a = np.clip(arr, 0, 1)
    if srgb: a = np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)
    a = (a * 255 + 0.5).astype(np.uint8)
    Image.fromarray(a[::-1]).save(path, optimize=True)

def gltf_settings_group():
    g = bpy.data.node_groups.get("glTF Material Output")
    if g: return g
    g = bpy.data.node_groups.new("glTF Material Output", 'ShaderNodeTree')
    try:
        g.interface.new_socket("Occlusion", in_out='INPUT', socket_type='NodeSocketFloat')
    except Exception:
        g.inputs.new('NodeSocketFloat', 'Occlusion')
    return g

def final_material(name, alb, orm, nrm):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes.get("Principled BSDF")
    def img_node(path, noncolor, x, y):
        im = bpy.data.images.load(path, check_existing=True)
        if noncolor: im.colorspace_settings.name = 'Non-Color'
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = im; n.location = (x, y); return n
    a = img_node(alb, False, -700, 300); o = img_node(orm, True, -700, 0); nn = img_node(nrm, True, -700, -300)
    nt.links.new(a.outputs['Color'], bsdf.inputs['Base Color'])
    sep = nt.nodes.new('ShaderNodeSeparateColor'); sep.location = (-400, 0)
    nt.links.new(o.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (-400, -300)
    nt.links.new(nn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    grp = nt.nodes.new('ShaderNodeGroup'); grp.node_tree = gltf_settings_group(); grp.location = (-100, -500)
    nt.links.new(sep.outputs['Red'], grp.inputs[0])
    return m

def main(blend_in, blend_out, texdir, only=None, ao_samples=24):
    texdir = os.path.abspath(texdir); blend_out = os.path.abspath(blend_out)
    bpy.ops.wm.open_mainfile(filepath=blend_in)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
    try: sc.render.bake.target = 'IMAGE_TEXTURES'
    except Exception: pass
    neutral()
    os.makedirs(texdir, exist_ok=True)
    done = []
    for name, kind, (Wd, Hd) in TARGETS:
        ob = bpy.data.objects.get(name)
        if ob is None: print("missing", name); continue
        base = os.path.join(texdir, name)
        if (only and name not in only) or (REUSE[0] and os.path.exists(base + "_orm.png") and not (only and name in only)):
            if os.path.exists(base + "_orm.png"):
                ensure_uv(ob); done.append((name, kind, Wd, Hd, True))
            continue
        t0 = time.time()
        ensure_uv(ob)
        pos = bake_emit(ob, "Position", Wd, Hd, 6)
        nor = bake_emit(ob, "Normal", Wd, Hd, 6)
        valid = pos[..., 3] > 0.99
        Pw = pos[..., :3]
        P = np.stack([-Pw[..., 1], Pw[..., 0], Pw[..., 2] - ZOFF], -1).astype(np.float32)   # (S, y, Z)
        Nw = nor[..., :3]; N = np.stack([-Nw[..., 1], Nw[..., 0], Nw[..., 2]], -1)
        P = np.where(valid[..., None], P, 0); N = np.where(valid[..., None], N, np.array([0, 0, 1], np.float32))
        au, av, su, sv = arc_coords(P, valid)
        texel = float(np.median(np.concatenate([su[valid], sv[valid]])))
        alb, rough, metal, height, lines = PNT.paint(kind, P, N, au, av, name, texel)
        nrm = normal_from_height(height, su, sv, valid)
        alb = dilate(alb, valid); rough = dilate(rough, valid); metal = dilate(metal, valid)
        base = os.path.join(texdir, name)
        save_png(alb, base + "_albedo.png", srgb=True)
        save_png(nrm * 0.5 + 0.5, base + "_normal.png")
        orm = np.stack([np.ones_like(rough), rough, metal], -1)
        save_png(orm, base + "_orm.png")
        np.save(base + "_valid.npy", valid[::4, ::4])
        done.append((name, kind, Wd, Hd, False))
        print(f"painted {name:20s} {Wd}x{Hd} valid={valid.mean():.2f} {time.time() - t0:.1f}s", flush=True)
    # ---- assign materials (with flat AO first) so the AO bake sees the final geometry
    for name, kind, Wd, Hd, reused in done:
        ob = bpy.data.objects[name]; base = os.path.join(texdir, name)
        m = final_material("MAT_" + name, base + "_albedo.png", base + "_orm.png", base + "_normal.png")
        ob.data.materials.clear(); ob.data.materials.append(m)
        for p in ob.data.polygons: p.material_index = 0
    # ---- AO bake into the ORM red channel
    sc.cycles.samples = ao_samples
    for name, kind, Wd, Hd, reused in done:
        if reused: continue
        t0 = time.time()
        ob = bpy.data.objects[name]
        w2, h2 = max(256, Wd // 2), max(128, Hd // 2)
        img = bpy.data.images.new(f"_ao_{name}", w2, h2, alpha=False, float_buffer=False)
        nt = ob.data.materials[0].node_tree
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; nt.nodes.active = tex
        for o in bpy.context.view_layer.objects: o.select_set(False)
        ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='AO', margin=6, use_clear=True)
        a = np.zeros(w2 * h2 * 4, np.float32); img.pixels.foreach_get(a); a = a.reshape(h2, w2, 4)[..., 0]
        nt.nodes.remove(tex); bpy.data.images.remove(img)
        ao = np.array(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize((Wd, Hd), Image.BILINEAR)).astype(np.float32) / 255
        base = os.path.join(texdir, name)
        orm = np.array(Image.open(base + "_orm.png"))[::-1].astype(np.float32) / 255
        orm[..., 0] = 0.25 + 0.75 * ao
        save_png(orm, base + "_orm.png")
        print(f"AO {name:20s} {time.time() - t0:.1f}s", flush=True)
    rel = os.path.relpath(texdir, os.path.dirname(blend_out))
    for im in bpy.data.images:
        if im.filepath and os.path.basename(im.filepath).startswith(tuple(n for n, *_ in TARGETS)):
            im.filepath = "//" + os.path.join(rel, os.path.basename(im.filepath))
            im.reload()
    # relative texture paths
    bpy.ops.wm.save_as_mainfile(filepath=blend_out)
    try:
        bpy.ops.file.make_paths_relative()
        bpy.ops.wm.save_mainfile()
    except Exception as e:
        print("relative paths:", e)
    print("SAVED", blend_out)

if __name__ == "__main__":
    argv = sys.argv; argv = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    ap = argparse.ArgumentParser(); ap.add_argument("blend_in"); ap.add_argument("blend_out"); ap.add_argument("texdir")
    ap.add_argument("--only", nargs="*"); ap.add_argument("--ao", type=int, default=24); ap.add_argument("--reuse", action="store_true")
    a = ap.parse_args(argv); REUSE[0] = a.reuse; main(a.blend_in, a.blend_out, a.texdir, a.only, a.ao)
