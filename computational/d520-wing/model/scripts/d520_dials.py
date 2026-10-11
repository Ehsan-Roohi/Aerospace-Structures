"""Dial faces for the instrument panel (Pl.39): one texture per dial with its caption from the plate.

    python3 d520_dials.py build/d520.blend textures/dials
"""
import sys, os, math, json
import numpy as np
import bpy
from PIL import Image, ImageDraw, ImageFont

def face(label, path, kind_seed):
    S = 256
    im = Image.new("RGB", (S, S), (14, 14, 14)); d = ImageDraw.Draw(im)
    c = S / 2; R = S * 0.46
    d.ellipse([c - R, c - R, c + R, c + R], outline=(70, 70, 70), width=4)
    rng = np.random.default_rng(kind_seed)
    a0, a1 = math.radians(225), math.radians(-45)
    n = 10
    for k in range(n * 5 + 1):
        a = a0 + (a1 - a0) * k / (n * 5)
        r1 = R * (0.80 if k % 5 == 0 else 0.88)
        d.line([c + r1 * math.cos(a), c - r1 * math.sin(a), c + R * 0.95 * math.cos(a), c - R * 0.95 * math.sin(a)],
               fill=(235, 232, 220), width=3 if k % 5 == 0 else 1)
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
        fs = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf", 15)
    except Exception:
        f = fs = ImageFont.load_default()
    for k in range(0, n + 1, 2):
        a = a0 + (a1 - a0) * k / n
        t = str(k)
        d.text((c + R * 0.62 * math.cos(a) - 6, c - R * 0.62 * math.sin(a) - 10), t, fill=(235, 232, 220), font=f)
    words = (label or "").upper().split()
    lines, cur = [], ""
    for w in words:
        if len(cur) + len(w) + 1 > 12: lines.append(cur); cur = w
        else: cur = (cur + " " + w).strip()
    if cur: lines.append(cur)
    for i, ln in enumerate(lines[:2]):
        bb = d.textbbox((0, 0), ln, font=fs); w = bb[2] - bb[0]
        d.text((c - w / 2, c + R * 0.30 + i * 17), ln, fill=(220, 210, 160), font=fs)
    a = a0 + (a1 - a0) * rng.uniform(0.15, 0.6)
    d.line([c, c, c + R * 0.78 * math.cos(a), c - R * 0.78 * math.sin(a)], fill=(245, 245, 240), width=4)
    d.ellipse([c - 9, c - 9, c + 9, c + 9], fill=(40, 40, 40))
    im.save(path)

def main(blend, outdir):
    bpy.ops.wm.open_mainfile(filepath=blend)
    os.makedirs(outdir, exist_ok=True)
    n = 0
    for ob in bpy.data.objects:
        if not ob.name.startswith("Dial_") or ob.type != 'MESH': continue
        label = ob.get("label_fr") or ob.get("label_en") or ""
        p = os.path.join(outdir, ob.name + ".png")
        face(label, p, n)
        me = ob.data
        if not me.uv_layers: me.uv_layers.new(name="UVMap")
        co = np.array([v.co[:] for v in me.vertices]); r = max(1e-6, np.abs(co[:, :2]).max())
        uv = me.uv_layers.active.data
        for poly in me.polygons:
            for li in poly.loop_indices:
                v = co[me.loops[li].vertex_index]
                uv[li].uv = (0.5 + v[0] / (2 * r), 0.5 + v[1] / (2 * r))
        m = bpy.data.materials.new("MAT_" + ob.name); m.use_nodes = True
        nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(p)
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"]); bsdf.inputs["Roughness"].default_value = 0.25
        ob.data.materials.clear(); ob.data.materials.append(m)
        n += 1
    rel = os.path.relpath(os.path.abspath(outdir), os.path.dirname(os.path.abspath(blend)))
    for im in bpy.data.images:
        if im.filepath and os.path.basename(im.filepath).startswith("Dial_"):
            im.filepath = "//" + os.path.join(rel, os.path.basename(im.filepath))
    bpy.ops.wm.save_mainfile()
    print("dials", n)

if __name__ == "__main__":
    argv = sys.argv; argv = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    main(os.path.abspath(argv[0]), os.path.abspath(argv[1]))
