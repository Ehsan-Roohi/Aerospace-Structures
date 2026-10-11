"""Blender (Workbench) renders of the FE model and results.

    python3 render_fe.py <tag> <what> <out.png> [options]
what: groups | vm | mode
  groups            structure coloured by part, upper skin removed (shows spar, booms, ribs, stringers)
  vm --n 6 --view top|bottom    von Mises (max of both shell faces) at load factor n, MPa
  mode --sign pos --k 1 --scale 0.12   buckling mode shape, coloured by displacement magnitude
"""
import argparse, json, math, os, sys
import numpy as np
import bpy
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from common import ROOT

SEQ = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"]
def _lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexrgb(h): h = h.lstrip("#"); return tuple(_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))   # linear for Blender
SEQ_RGB = np.array([hexrgb(h) for h in SEQ])
def seq_color(t):
    t = float(np.clip(t, 0, 1)) * (len(SEQ_RGB) - 1); i = min(int(t), len(SEQ_RGB) - 2); f = t - i
    return tuple(SEQ_RGB[i] * (1 - f) + SEQ_RGB[i + 1] * f)
GROUP_COL = {"skin_upper_LE": "#d9d7cf", "skin_upper_box": "#d9d7cf", "skin_lower_LE": "#c9c6bb", "skin_lower_box": "#c9c6bb",
             "spar_web": "#2a78d6", "boom_upper": "#0d366b", "boom_lower": "#0d366b", "false_spar": "#1baf7a",
             "rib": "#eb6834", "stringer_upper": "#6250d6", "stringer_lower": "#6250d6"}

def to_bl(p): return (p[1], -p[0], p[2])

def build(mesh, keep, colors, disp=None, scale=0.0):
    xyz = {int(k): np.array(v) for k, v in mesh["xyz"].items()}
    if disp is not None:
        for k in xyz: xyz[k] = xyz[k] + scale * disp.get(k, np.zeros(3))
    ids = sorted(xyz); idx = {n: i for i, n in enumerate(ids)}
    verts = [to_bl(xyz[n]) for n in ids]
    faces, fcols = [], []
    for i, (typ, nodes, grp, z, t) in enumerate(mesh["elems"]):
        if not keep(grp, i): continue
        faces.append([idx[q] for q in nodes]); fcols.append(colors(grp, i))
    me = bpy.data.meshes.new("fe"); me.from_pydata(verts, [], faces); me.update()
    attr = me.color_attributes.new("col", "FLOAT_COLOR", "CORNER")
    k = 0
    for poly, c in zip(me.polygons, fcols):
        for li in poly.loop_indices:
            attr.data[li].color = (*c, 1.0)
    ob = bpy.data.objects.new("fe", me); bpy.context.scene.collection.objects.link(ob)
    return ob

def setup(view, res=(2000, 1100), lens=50):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = os.environ.get("D520_LIGHT", "FLAT"); sh.color_type = "VERTEX"; sh.show_shadows = False
    sh.show_cavity = os.environ.get("D520_CAVITY", "1") == "1"; sh.cavity_type = "BOTH"; sh.cavity_ridge_factor = 1.0; sh.cavity_valley_factor = 1.0
    sh.curvature_ridge_factor = 1.0; sh.curvature_valley_factor = 1.0
    sh.show_object_outline = True; sh.object_outline_color = (0.2, 0.2, 0.2)
    sh.background_type = "VIEWPORT"; sh.background_color = (0.988, 0.988, 0.984)
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    for attr, val in (("view_transform", "Standard"), ("look", "None")):
        try: setattr(sc.view_settings, attr, val)
        except Exception as e: print("view setting", attr, e)
    print("view transform:", sc.view_settings.view_transform)
    sc.world = bpy.data.worlds.new("w"); sc.world.color = (0.988, 0.988, 0.984)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = lens
    if view in ("top", "bottom"):                       # orthographic plan views, nose up / root left
        cam.data.type = "ORTHO"; cam.data.ortho_scale = 5.30
        sc.render.resolution_x, sc.render.resolution_y = 2000, 760
        cam.location = Vector((2.50, -2.80, 10.0 if view == "top" else -10.0))
        cam.rotation_euler = (0.0, 0.0, 0.0) if view == "top" else (math.pi, 0.0, 0.0)
        return sc
    target = Vector((2.35, -2.85, -0.45))
    if view == "root_low":
        target = Vector((0.55, -2.55, -0.80))
    pos = {"iso": Vector((6.6, -7.9, 3.3)), "front": Vector((6.6, 2.6, 2.0)), "iso_low": Vector((6.9, -7.0, -2.6)),
           "root_low": Vector((2.9, 0.2, -2.9))}[view]
    cam.location = pos
    d = target - pos; cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return sc

def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tag"); ap.add_argument("what"); ap.add_argument("out")
    ap.add_argument("--n", type=float, default=6.0); ap.add_argument("--view", default="top")
    ap.add_argument("--sign", default="pos"); ap.add_argument("--k", type=int, default=1); ap.add_argument("--scale", type=float, default=0.12)
    ap.add_argument("--vmax", type=float, default=None)
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    d = os.path.join(ROOT, "fe", a.tag)
    mesh = json.load(open(os.path.join(d, "mesh.json")))
    meta = {}
    if a.what == "groups":
        build(mesh, lambda g, i: not g.startswith("skin_upper"), lambda g, i: hexrgb(GROUP_COL[g]))
        setup(a.view)
    elif a.what in ("vm", "vmm"):
        R = np.load(os.path.join(d, "elem_results.npz"))
        vm = (R["vm_mem"] if a.what == "vmm" else R["vm"]) * abs(a.n) / 1e6
        vmax = a.vmax or float(np.percentile(vm, 99.7))
        keep = (lambda g, i: g.startswith("skin_lower") or g in ("spar_web", "boom_lower", "false_spar", "rib")) if a.view == "bottom" \
            else (lambda g, i: True)
        build(mesh, keep, lambda g, i: seq_color(vm[i] / vmax))
        setup(a.view); meta = dict(vmax=vmax, vm_max=float(vm.max()))
    elif a.what == "mode":
        import frd
        n3, e3, blocks = frd.read(os.path.join(d, f"wing_buckle_{a.sign}.frd"))
        ds = [b for b in blocks if b["name"] == "DISP"][1:]
        dd = ds[a.k - 1]["data"]
        disp = {}
        for i, (typ, nodes, g, z, t) in enumerate(mesh["elems"]):
            conn = e3[i + 1][1]; k = len(nodes)
            for q, b0, b1 in zip(nodes, conn[:k], conn[k:2 * k]):
                if q not in disp: disp[q] = 0.5 * (np.array(dd[b0][:3]) + np.array(dd[b1][:3]))
        mx = max(np.linalg.norm(v) for v in disp.values())
        disp = {k: v / mx for k, v in disp.items()}
        amp = np.array([np.mean([np.linalg.norm(disp[q]) for q in e[1]]) for e in mesh["elems"]])
        keep = (lambda g, i: not g.startswith("skin_upper")) if a.sign == "neg" and a.view == "bottom" else (lambda g, i: True)
        build(mesh, keep, lambda g, i: seq_color(0.12 + 0.88 * amp[i]), disp, a.scale)
        setup(a.view); meta = dict(factor=ds[a.k - 1]["value"])
    render(a.out)
    json.dump(meta, open(a.out + ".json", "w"))
    print("rendered", a.out, meta)

if __name__ == "__main__":
    main()
