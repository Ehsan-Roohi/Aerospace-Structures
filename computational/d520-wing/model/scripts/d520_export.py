"""Export the textured model to glTF binary.

    python3 d520_export.py build/d520.blend export/d520.glb [--max-tex 2048] [--jpeg 82]

Node names are kept, so every hinge empty (e.g. 'Hinge_Aileron_R', 'Gear_Pivot_L', 'Prop_Spin') can be
driven by a viewer: rotate the driven node about its local X (hinges), local Y in glTF (= Blender local Z:
propeller spin, blade pitch), etc. Custom properties (sources, travel descriptions) go into glTF extras.
"""
import sys, os, argparse, tempfile
import bpy
from PIL import Image

def main(blend, out, max_tex, jpeg):
    bpy.ops.wm.open_mainfile(filepath=blend)
    sc = bpy.context.scene
    c = bpy.data.objects["D520_CONTROLS"]
    if c.animation_data: c.animation_data.action = None
    for k in ("aileron", "elevator", "rudder", "flaps", "gear", "canopy", "attitude", "prop_pitch", "prop_spin_deg", "tailplane_incidence", "radiator_flap"):
        c[k] = 0.0
    c.update_tag(); sc.frame_set(1)
    # remove drivers so exported transforms are the neutral pose and nothing re-evaluates
    for ob in bpy.data.objects:
        if ob.animation_data:
            for d in list(ob.animation_data.drivers): ob.animation_data.drivers.remove(d)
    tmp = tempfile.mkdtemp()
    for im in bpy.data.images:
        if not im.filepath: continue
        p = bpy.path.abspath(im.filepath)
        if not os.path.exists(p): continue
        I = Image.open(p)
        w, h = I.size
        s = min(1.0, max_tex / max(w, h))
        if s < 1.0: I = I.resize((int(w * s), int(h * s)), Image.LANCZOS)
        q = os.path.join(tmp, os.path.basename(p)); I.save(q)
        im.filepath = q; im.reload()
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    kw = dict(filepath=out, export_format='GLB', export_extras=True, export_apply=True, export_yup=True,
              export_animations=False, export_cameras=False, export_lights=False)
    try:
        bpy.ops.export_scene.gltf(**kw, export_image_format='JPEG', export_jpeg_quality=jpeg)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw, export_image_format='JPEG')
    print("EXPORTED", out, os.path.getsize(out) / 1e6, "MB")

if __name__ == "__main__":
    argv = sys.argv; argv = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    ap = argparse.ArgumentParser(); ap.add_argument("blend"); ap.add_argument("out")
    ap.add_argument("--max-tex", type=int, default=2048); ap.add_argument("--jpeg", type=int, default=82)
    a = ap.parse_args(argv); main(os.path.abspath(a.blend), os.path.abspath(a.out), a.max_tex, a.jpeg)
