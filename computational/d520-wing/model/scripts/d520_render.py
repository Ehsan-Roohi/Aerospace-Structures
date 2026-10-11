"""Cycles renders of the textured model: hero shot (studio grey, like the reference slide) and
control/attitude variants.

    python3 d520_render.py build/d520.blend renders/ --view hero --samples 96
"""
import sys, os, math, argparse
import bpy
from mathutils import Vector, Euler, Matrix

def look(cam, loc, target, lens):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens

def studio(sc, strength=1.0):
    w = bpy.data.worlds.new("Studio"); sc.world = w; w.use_nodes = True
    nt = w.node_tree; bg = nt.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.62, 0.62, 0.62, 1); bg.inputs["Strength"].default_value = 0.55 * strength
    # ground plane catching shadows, same grey (seamless studio)
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, -4, 0))
    g = bpy.context.active_object; g.name = "Studio_Floor"
    m = bpy.data.materials.new("Floor"); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (0.55, 0.55, 0.55, 1); b.inputs["Roughness"].default_value = 0.9
    g.data.materials.append(m)
    # key light (soft area), fill, rim
    def area(name, loc, target, size, energy, color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, 'AREA'); ld.size = size; ld.energy = energy; ld.color = color
        o = bpy.data.objects.new(name, ld); sc.collection.objects.link(o)
        o.location = loc; o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    area("Key", (-9, 6, 12), (0, -3.5, 1), 9, 9000 * strength, (1.0, 0.97, 0.92))
    area("Fill", (12, 4, 5), (0, -3.5, 1), 10, 2500 * strength, (0.9, 0.95, 1.0))
    area("Rim", (2, -16, 7), (0, -4, 1.5), 6, 3000 * strength)

def setup(blend, samples, res, controls):
    bpy.ops.wm.open_mainfile(filepath=blend)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception: pass
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    sc.view_settings.look = 'None'
    c = bpy.data.objects["D520_CONTROLS"]
    if c.animation_data: c.animation_data.action = None
    for k in ("aileron", "elevator", "rudder", "flaps", "gear", "canopy", "attitude", "prop_pitch"): c[k] = 0.0
    for kv in (controls or "").split(","):
        if "=" in kv:
            k, v = kv.split("="); c[k] = float(v)
    c.update_tag(); sc.frame_set(1)
    return sc

VIEWS = {
    # name: (camera location, target, lens)
    "hero": ((-9.0, 5.2, 2.6), (0.4, -3.6, 1.55), 50),
    "hero_right": ((8.6, 4.6, 3.1), (0.0, -3.7, 1.5), 50),
    "rear34": ((-7.5, -15.5, 3.6), (0.0, -4.5, 1.5), 50),
    "top34": ((-6.0, 4.0, 9.5), (0.0, -3.8, 1.0), 45),
    "under": ((5.5, 3.5, 0.35), (0.0, -3.4, 1.25), 35),
    "cockpit": ((-2.4, -2.2, 3.7), (0.0, -4.4, 2.35), 45),
    "tail": ((-4.5, -11.5, 3.2), (0.0, -8.1, 2.3), 50),
}

def main(blend, outdir, view, samples, res, controls, tag, studio_on=True):
    sc = setup(blend, samples, res, controls)
    if studio_on: studio(sc)
    cam = bpy.data.objects.new("RenderCam", bpy.data.cameras.new("RenderCam")); sc.collection.objects.link(cam); sc.camera = cam
    loc, tgt, lens = VIEWS[view]
    look(cam, loc, tgt, lens)
    cam.data.dof.use_dof = False
    os.makedirs(outdir, exist_ok=True)
    sc.render.filepath = os.path.join(outdir, f"{tag or view}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", sc.render.filepath)

if __name__ == "__main__":
    argv = sys.argv; argv = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    ap = argparse.ArgumentParser(); ap.add_argument("blend"); ap.add_argument("outdir")
    ap.add_argument("--view", default="hero"); ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--res", default="1600x1200"); ap.add_argument("--controls", default=""); ap.add_argument("--tag", default="")
    a = ap.parse_args(argv)
    main(os.path.abspath(a.blend), os.path.abspath(a.outdir), a.view, a.samples, tuple(int(x) for x in a.res.split("x")), a.controls, a.tag)
