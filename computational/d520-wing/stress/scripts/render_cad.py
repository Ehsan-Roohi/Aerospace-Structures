"""Preview renders of the exported CAD (STEP parts tessellated to STL, then Blender Workbench).

    python3 render_cad.py tessellate      -> cad/stl_parts/*.stl
    python3 render_cad.py render out.png  (run with bpy)
"""
import os, sys, math, glob
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from common import ROOT
CAD = os.path.join(ROOT, "cad")
PARTS = ["Fuselage", "Wing", "Flap_R", "Flap_L", "Aileron_R", "Aileron_L", "Tailplane", "Elevator_R", "Elevator_L", "Fin", "Rudder", "Spinner", "Radiator"]
COL = {"Fuselage": "#b9bdb0", "Wing": "#b9bdb0", "Tailplane": "#b9bdb0", "Fin": "#b9bdb0", "Radiator": "#8f948a", "Spinner": "#d9d7cf",
       "Flap_R": "#2a78d6", "Flap_L": "#2a78d6", "Aileron_R": "#eb6834", "Aileron_L": "#eb6834", "Elevator_R": "#1baf7a",
       "Elevator_L": "#1baf7a", "Rudder": "#6250d6"}

def tessellate():
    import cadquery as cq
    out = os.path.join(CAD, "stl_parts"); os.makedirs(out, exist_ok=True)
    for p in PARTS:
        s = cq.importers.importStep(os.path.join(CAD, f"D520_{p}.step"))
        cq.exporters.export(s, os.path.join(out, f"{p}.stl"), tolerance=0.4, angularTolerance=0.12)
        print(p)

def render(path, view="iso"):
    import bpy
    from mathutils import Vector
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    def lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    for p in PARTS:
        bpy.ops.wm.stl_import(filepath=os.path.join(CAD, "stl_parts", f"{p}.stl"))
        ob = bpy.context.selected_objects[0]; ob.name = p
        ob.scale = (0.001, 0.001, 0.001)
        # CAD axes (X aft, Y starboard, Z up) -> Blender (X starboard, Y forward)
        ob.rotation_euler = (0, 0, -math.pi / 2)
        h = COL[p].lstrip("#"); ob.color = (*[lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)], 1)
        ob.data.polygons.foreach_set("use_smooth", [True] * len(ob.data.polygons))
    sh = sc.display.shading
    sc.render.engine = "BLENDER_WORKBENCH"; sh.light = "STUDIO"; sh.color_type = "OBJECT"
    sh.show_cavity = False; sh.show_object_outline = True; sh.object_outline_color = (0.25, 0.25, 0.25)
    sh.show_specular_highlight = False
    sh.background_type = "VIEWPORT"; sh.background_color = (0.988, 0.988, 0.984)
    sc.view_settings.view_transform = "Standard"
    sc.render.resolution_x, sc.render.resolution_y = 2000, 1250
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 50
    tgt = Vector((-0.2, -4.2, -0.1))
    pos = {"iso": Vector((-9.5, 4.0, 5.0)), "rear": Vector((7.5, -14.5, 4.2))}[view]
    cam.location = pos; cam.rotation_euler = (tgt - pos).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)

if __name__ == "__main__":
    if sys.argv[1] == "tessellate": tessellate()
    else: render(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "iso")
