"""Render orthographic silhouettes of the model and overlay them on the manual's Pl.0 three-view
(1/50 scale drawing scanned at 150 dpi), using the same calibration as the digitisation.

Output: renders/overlay_pl0_side.png, overlay_pl0_plan.png, overlay_pl0_front.png, overlay_pl0_sheet.png
"""
import sys, os, math, argparse
import numpy as np
import bpy
from mathutils import Vector, Euler
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import d520_geom as G

def render_ortho(name, loc, rot, ortho_scale, resx, resy, out):
    sc = bpy.context.scene
    cam = bpy.data.cameras.new(name); ob = bpy.data.objects.new(name, cam); sc.collection.objects.link(ob)
    cam.type = 'ORTHO'; cam.ortho_scale = ortho_scale; cam.clip_end = 100
    ob.location = loc; ob.rotation_euler = Euler(rot, 'XYZ')
    sc.camera = ob
    sc.render.resolution_x = resx; sc.render.resolution_y = resy
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)

def main(blend, plate, outdir):
    bpy.ops.wm.open_mainfile(filepath=blend)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading; sh.light = 'FLAT'; sh.color_type = 'SINGLE'; sh.single_color = (0.05, 0.25, 0.9)
    sh.show_object_outline = True; sh.object_outline_color = (0.0, 0.0, 0.3)
    sc.render.film_transparent = True
    ctrl = bpy.data.objects["D520_CONTROLS"]
    for k in ("aileron", "elevator", "rudder", "flaps", "gear", "canopy", "attitude"):
        ctrl[k] = 0.0
    sc.frame_set(1)
    for k in ("aileron", "elevator", "rudder", "flaps", "gear", "canopy", "attitude"):
        ctrl[k] = 0.0
    bpy.context.view_layer.update()
    # hide cockpit interior from silhouettes
    zoff = G.v("prop_axis_height_flight_line")       # world Z of the thrust axis (ground at 0)
    os.makedirs(outdir, exist_ok=True)
    tmp = os.path.join(outdir, "_tmp"); os.makedirs(tmp, exist_ok=True)
    # ---- side view: plate crop x 1950..3080, y 40..560, side scale (px/m) and origin as digitised
    k = G.SIDE_PX_PER_M
    x0, x1, y0, y1 = 1950, 3080, 40, 560
    W, H = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    S_c = (G.SIDE_S0_PX - cx) / k; Z_c = (G.SIDE_Z0_PX - cy) / k
    render_ortho("ov_side", (30, -S_c, Z_c + zoff), (math.pi / 2, 0, math.pi / 2), W / k, W, H, os.path.join(tmp, "side.png"))
    # ---- plan view (nose down, seen from above): anisotropic plate scales -> render at k_y, resample S axis
    ky, ks = G.PLAN_PX_PER_M_Y, G.PLAN_PX_PER_M_S
    px0, px1, py0, py1 = 330, 1630, 660, 1770
    Wp, Hp = px1 - px0, py1 - py0
    ccx, ccy = (px0 + px1) / 2, (py0 + py1) / 2
    S_c2 = (G.PLAN_NOSE_PX - ccy) / ks; y_c2 = (ccx - G.PLAN_CENTRE_PX) / ky
    Hr = int(round(Hp * ky / ks))
    render_ortho("ov_plan", (-y_c2, -S_c2, 30), (0, 0, math.pi), Wp / ky, Wp, Hr, os.path.join(tmp, "plan.png"))
    # ---- front view: span 10.20 m = tips 370..1557 px on the plate, spinner centre (980, 282)
    kf = (1557 - 370) / 10.20
    fx0, fx1, fy0, fy1 = 340, 1600, 60, 600
    Wf, Hf = fx1 - fx0, fy1 - fy0
    fcx, fcy = (fx0 + fx1) / 2, (fy0 + fy1) / 2
    yc = -(fcx - 980) / kf; zc = (282 - fcy) / kf
    render_ortho("ov_front", (yc, 30, zc + zoff), (math.pi / 2, 0, math.pi), Wf / kf, Wf, Hf, os.path.join(tmp, "front.png"))
    # ---- composite
    from PIL import Image, ImageDraw, ImageFont, ImageOps
    pl = Image.open(plate).convert("RGB")
    def comp(crop_box, render_path, out, title, resize_to=None):
        base = pl.crop(crop_box)
        g = ImageOps.grayscale(base).convert("RGB")
        r = Image.open(render_path).convert("RGBA")
        if resize_to: r = r.resize(resize_to, Image.LANCZOS)
        a = np.array(r).astype(float); al = a[:, :, 3:4] / 255.0
        b = np.array(g).astype(float)
        # translucent blue fill + keep the red ink of the drawing visible on top
        red = np.array(base).astype(float)
        ink = ((red[:, :, 0] - red[:, :, 1]) > 25)[:, :, None]
        mix = b * (1 - 0.45 * al) + a[:, :, :3] * 0.45 * al
        mix = np.where(ink, np.array([200, 20, 20]), mix)
        img = Image.fromarray(mix.clip(0, 255).astype(np.uint8))
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, img.width, 24], fill=(255, 255, 255))
        d.text((6, 5), title, fill=(0, 0, 0))
        img.save(out)
        return img
    a = comp((x0, y0, x1, y1), os.path.join(tmp, "side.png"), os.path.join(outdir, "overlay_pl0_side.png"),
             "Side: model (blue) over Pl.0 'Vues d'ensemble' 1/50 (red ink), aligned on spinner tip and thrust axis")
    b = comp((px0, py0, px1, py1), os.path.join(tmp, "plan.png"), os.path.join(outdir, "overlay_pl0_plan.png"),
             "Plan (seen from above, nose down): model over Pl.0", resize_to=(Wp, Hp))
    c = comp((fx0, fy0, fx1, fy1), os.path.join(tmp, "front.png"), os.path.join(outdir, "overlay_pl0_front.png"),
             "Front: model over Pl.0 (aligned on spinner)")
    sheet = Image.new("RGB", (max(a.width + c.width, b.width + a.width), a.height + b.height), "white")
    sheet.paste(c, (0, 0)); sheet.paste(a, (c.width, 0)); sheet.paste(b, (0, c.height))
    sheet.save(os.path.join(outdir, "overlay_pl0_sheet.png"))
    print("overlays written")

if __name__ == "__main__":
    argv = sys.argv; argv = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    ap = argparse.ArgumentParser(); ap.add_argument("blend"); ap.add_argument("plate"); ap.add_argument("outdir")
    a = ap.parse_args(argv); main(a.blend, a.plate, a.outdir)
