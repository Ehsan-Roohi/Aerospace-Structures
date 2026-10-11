"""Camera-match the model to the three photographs printed in the manual (PDF pages 2-4).

For each photo, 6 landmarks were picked on the scan (page pixel coordinates). Their 3-D positions are
taken from the model in the 'at rest' attitude (the photos show the aircraft standing on its tail
wheel). OpenCV solvePnP gives the camera pose for each focal length; the focal length with the lowest
reprojection error is kept. The model is then rendered from that camera and composited next to /
over the photo.

    python3 d520_photomatch.py build/d520.blend renders/photomatch
"""
import sys, os, math, json, argparse
import numpy as np
import bpy
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import cv2
from PIL import Image, ImageDraw

PAGES = os.environ.get("D520_SCANS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scans"))   # folder of page scans p-000.jpg ... p-167.jpg
PHOTOS = {
    "front": dict(page=1, box=(221, 845, 1199, 1485), pts={
        "wingtip_R": (251.8, 1270.9), "wingtip_L": (1165.5, 1286.4), "wheel_R_bottom": (567.3, 1405.5),
        "wheel_L_bottom": (840.9, 1427.3), "hub": (708.0, 1183.6), "blade_top": (710.9, 1036.4)}),
    "profile": dict(page=2, box=(215, 915, 1201, 1627), pts={
        "spinner_tip": (294.2, 1277.5), "fin_top": (1090.0, 1310.0), "rudder_te": (1133.3, 1429.2),
        "tailwheel_bottom": (1035.8, 1510.0), "wheel_L_bottom": (494.2, 1535.8), "tailplane_tip_L": (1150.0, 1427.5)}),
    "three_quarter": dict(page=3, box=(207, 845, 1202, 1541), pts={
        "spinner_tip": (1029.1, 1156.4), "blade_top": (959.0, 994.5), "wingtip_R": (258.2, 1292.7),
        "wheel_R_bottom": (720.0, 1422.7), "wheel_L_bottom": (942.7, 1407.3), "fin_top": (512.7, 1220.9)}),
}

def wv(name):
    ob = bpy.data.objects[name]
    dg = bpy.context.evaluated_depsgraph_get(); oe = ob.evaluated_get(dg); me = oe.to_mesh()
    co = np.zeros(len(me.vertices) * 3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    M = np.array(ob.matrix_world); oe.to_mesh_clear()
    return co @ M[:3, :3].T + M[:3, 3]

def landmarks():
    out = {}
    wr, wl = wv("Wing_R"), wv("Wing_L")
    out["wingtip_R"] = wr[np.argmax(wr[:, 0])]; out["wingtip_L"] = wl[np.argmin(wl[:, 0])]
    for s in ("R", "L"):
        w = wv(f"Wheel_{s}"); out[f"wheel_{s}_bottom"] = w[np.argmin(w[:, 2])]
    spin = bpy.data.objects["Prop_Spin"].matrix_world
    o = spin.translation; ax = (spin.to_3x3() @ Vector((0, 0, 1))).normalized()
    up = Vector((0, 0, 1)); up = (up - ax * up.dot(ax)).normalized()
    out["hub"] = np.array(o); out["blade_top"] = np.array(o + up * 1.525)
    sp = wv("Spinner"); out["spinner_tip"] = sp[np.argmax(sp @ np.array(ax))]
    fr = np.concatenate([wv("Fin"), wv("Rudder")]); out["fin_top"] = fr[np.argmax(fr[:, 2])]
    rd = wv("Rudder"); out["rudder_te"] = rd[np.argmin(rd[:, 1])]
    tw = wv("Tailwheel"); out["tailwheel_bottom"] = tw[np.argmin(tw[:, 2])]
    tp = np.concatenate([wv("Tailplane"), wv("Elevator_L")]); out["tailplane_tip_L"] = tp[np.argmin(tp[:, 0])]
    return out

def solve(obj, img, box):
    best = None
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    for f in np.linspace(500, 6000, 221):
        K = np.array([[f, 0, cx], [0, f, cy], [0, 0, 1]], float)
        ok, rv, tv = cv2.solvePnP(obj, img, K, None, flags=cv2.SOLVEPNP_ITERATIVE)
        if not ok: continue
        proj, _ = cv2.projectPoints(obj, rv, tv, K, None)
        err = np.sqrt(((proj.reshape(-1, 2) - img) ** 2).sum(1)).mean()
        R, _ = cv2.Rodrigues(rv); C = -R.T @ tv.ravel()
        # camera must be in front of the points and above ground
        zc = (R @ obj.T + tv).T[:, 2]
        if (zc <= 0).any() or C[2] < 0.2: continue
        if best is None or err < best[0]: best = (err, f, rv, tv, K)
    return best

def main(blend, outdir, samples=48):
    bpy.ops.wm.open_mainfile(filepath=blend)
    sc = bpy.context.scene
    c = bpy.data.objects["D520_CONTROLS"]
    if c.animation_data: c.animation_data.action = None
    for k in ("aileron", "elevator", "rudder", "flaps", "gear", "canopy"): c[k] = 0.0
    c["attitude"] = 1.0; c["prop_spin_deg"] = 180.0; c["canopy"] = 1.0     # photos: at rest, hood open, blade at 12 o'clock
    c.update_tag(); sc.frame_set(1); bpy.context.view_layer.update()
    L = landmarks()
    os.makedirs(outdir, exist_ok=True)
    sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.8, 0.8, 0.8, 1); w.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", 'SUN')); sun.data.energy = 3.5; sc.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    results = {}
    for name, ph in PHOTOS.items():
        keys = list(ph["pts"].keys())
        obj = np.array([L[k] for k in keys], float); img = np.array([ph["pts"][k] for k in keys], float)
        err, f, rv, tv, K = solve(obj, img, ph["box"])
        R, _ = cv2.Rodrigues(rv); C = -R.T @ tv.ravel()
        proj, _ = cv2.projectPoints(obj, rv, tv, K, None); proj = proj.reshape(-1, 2)
        bw, bh = ph["box"][2] - ph["box"][0], ph["box"][3] - ph["box"][1]
        results[name] = dict(focal_px=float(f), mean_reprojection_px=float(err), camera_xyz=[float(x) for x in C],
                             per_point={k: [float(a) for a in (proj[i] - img[i])] for i, k in enumerate(keys)},
                             equiv_lens_mm_36=float(f / bw * 36), photo_size_px=[bw, bh])
        # Blender camera: OpenCV (x right, y down, z forward) -> Blender (x right, y up, -z forward)
        cam = bpy.data.objects.new("PM_" + name, bpy.data.cameras.new("PM_" + name)); sc.collection.objects.link(cam)
        Rbl = Matrix(R.T.tolist()) @ Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1)))
        M = Rbl.to_4x4(); M.translation = Vector(C.tolist()); cam.matrix_world = M
        cam.data.sensor_fit = 'HORIZONTAL'; cam.data.sensor_width = 36; cam.data.lens = f / bw * 36
        cam.data.clip_end = 200
        scale = 2
        sc.render.resolution_x, sc.render.resolution_y = bw * scale, bh * scale
        # principal point: photo box centre = image centre (no shift)
        sc.camera = cam
        rp = os.path.join(outdir, f"{name}_render.png"); sc.render.filepath = rp
        bpy.ops.render.render(write_still=True)
        # composites
        page = Image.open(os.path.join(PAGES, f"p-{ph['page']:03d}.jpg")).convert("RGB")
        photo = page.crop(ph["box"]).resize((bw * scale, bh * scale), Image.LANCZOS)
        rend = Image.open(rp).convert("RGBA")
        over = photo.convert("RGBA").copy(); over.alpha_composite(Image.blend(Image.new("RGBA", rend.size, (0, 0, 0, 0)), rend, 0.55))
        d = ImageDraw.Draw(over)
        for i, k in enumerate(keys):
            x, y = (img[i] - [ph["box"][0], ph["box"][1]]) * scale; px, py = (proj[i] - [ph["box"][0], ph["box"][1]]) * scale
            d.ellipse([x - 7, y - 7, x + 7, y + 7], outline=(255, 40, 40, 255), width=3)
            d.line([x, y, px, py], fill=(255, 220, 0, 255), width=3)
        bg = Image.new("RGBA", rend.size, (232, 232, 232, 255)); bg.alpha_composite(rend)
        side = Image.new("RGB", (bw * scale * 2 + 20, bh * scale), "white")
        side.paste(photo, (0, 0)); side.paste(bg.convert("RGB"), (bw * scale + 20, 0))
        side.save(os.path.join(outdir, f"{name}_side_by_side.jpg"), quality=90)
        over.convert("RGB").save(os.path.join(outdir, f"{name}_overlay.jpg"), quality=90)
        print(name, "f=%.0f px  err=%.1f px  cam=(%.2f, %.2f, %.2f)" % (f, err, *C))
    json.dump(results, open(os.path.join(outdir, "camera_solutions.json"), "w"), indent=1)

if __name__ == "__main__":
    argv = sys.argv; argv = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    ap = argparse.ArgumentParser(); ap.add_argument("blend"); ap.add_argument("outdir"); ap.add_argument("--samples", type=int, default=48)
    a = ap.parse_args(argv); main(os.path.abspath(a.blend), os.path.abspath(a.outdir), a.samples)
