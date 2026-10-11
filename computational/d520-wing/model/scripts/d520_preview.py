"""Quick Workbench previews of the built model (ortho side/top/front + perspective)."""
import sys, os, math, argparse
import bpy
from mathutils import Vector, Euler

def setup_cam(name, loc, rot, ortho=None, lens=50):
    cam = bpy.data.cameras.new(name); ob = bpy.data.objects.new(name, cam)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc; ob.rotation_euler = Euler(rot, 'XYZ')
    if ortho:
        cam.type = 'ORTHO'; cam.ortho_scale = ortho
    else:
        cam.lens = lens
    cam.clip_end = 200
    return ob

def main(blend, outdir, res=1400, controls=None, engine='BLENDER_WORKBENCH'):
    bpy.ops.wm.open_mainfile(filepath=blend)
    sc = bpy.context.scene
    if controls:
        c = bpy.data.objects["D520_CONTROLS"]
        if c.animation_data: c.animation_data.action = None
        for kv in controls.split(","):
            k, v = kv.split("="); c[k] = float(v)
        sc.frame_set(1)
        for k, v in [kv.split("=") for kv in controls.split(",")]:
            c[k] = float(v)
        bpy.context.view_layer.update()
    sc.render.engine = engine
    if engine == 'BLENDER_WORKBENCH':
        sh = sc.display.shading
        sh.light = 'STUDIO'; sh.color_type = 'MATERIAL'; sh.show_cavity = True; sh.show_object_outline = True
        sc.display.shading.background_type = 'WORLD' if False else 'THEME'
    sc.render.resolution_x = res; sc.render.resolution_y = int(res * 0.6)
    sc.render.film_transparent = False
    # world
    if sc.world is None:
        sc.world = bpy.data.worlds.new("W")
    os.makedirs(outdir, exist_ok=True)
    zc = 1.0
    views = {
        "side": ((14, -4.4, zc + 0.0), (math.pi / 2, 0, math.pi / 2), 10.5),
        "top": ((0, -4.4, 20), (0, 0, 0), 11.5),
        "front": ((0, 15, zc), (math.pi / 2, 0, math.pi), 11.0),
        "persp": ((9.5, 7.5, 3.6), None, None),
    }
    for name, (loc, rot, ortho) in views.items():
        if rot is None:
            target = Vector((0, -3.8, 1.2)); d = target - Vector(loc)
            rot = d.to_track_quat('-Z', 'Y').to_euler()
        cam = setup_cam("cam_" + name, loc, rot, ortho, 40)
        sc.camera = cam
        sc.render.filepath = os.path.join(outdir, f"prev_{name}.png")
        bpy.ops.render.render(write_still=True)

if __name__ == "__main__":
    argv = sys.argv; argv = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    ap = argparse.ArgumentParser(); ap.add_argument("blend"); ap.add_argument("outdir"); ap.add_argument("--res", type=int, default=1400)
    ap.add_argument("--controls", default=None)
    a = ap.parse_args(argv)
    main(a.blend, a.outdir, a.res, a.controls)

def closeups(blend, outdir, res=1000):
    bpy.ops.wm.open_mainfile(filepath=blend)
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'MATERIAL'; sh.show_cavity = True
    sc.render.resolution_x = res; sc.render.resolution_y = int(res * 0.75)
    shots = {"tail": ((3.0, -10.5, 3.6), (0, -8.0, 2.4), 45), "cockpit": ((2.2, -2.6, 3.4), (0, -4.6, 2.2), 40),
             "root": ((3.2, 0.2, 1.4), (0.6, -3.0, 1.2), 35), "under": ((3.5, 2.0, -1.2), (0.0, -3.4, 1.0), 30)}
    for name, (loc, tgt, lens) in shots.items():
        d = Vector(tgt) - Vector(loc); rot = d.to_track_quat('-Z', 'Y').to_euler()
        cam = setup_cam("cc_" + name, loc, rot, None, lens); sc.camera = cam
        sc.render.filepath = os.path.join(outdir, f"close_{name}.png"); bpy.ops.render.render(write_still=True)
