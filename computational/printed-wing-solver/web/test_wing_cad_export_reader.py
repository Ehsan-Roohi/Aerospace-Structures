"""Independent Open CASCADE STEP import admission; no exporter code reused."""
import json
import sys
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.BRepBndLib import BRepBndLib
from OCP.Bnd import Bnd_Box
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer

expected = json.load(open(sys.argv[1], encoding="utf-8"))
results = []
for item in expected:
    if item.get("format") == "dxf":
        import ezdxf
        document = ezdxf.readfile(item["path"])
        assert document.units == 4, "DXF must specify millimetres"
        audit = document.audit()
        assert not audit.errors, str(audit.errors)
        polylines = list(document.modelspace().query("LWPOLYLINE"))
        assert len(polylines) == item["expectedPolylines"]
        assert all(line.closed for line in polylines)
        if "expectedHoleRatios" in item:
            holes = list(document.modelspace().query("ELLIPSE CIRCLE"))
            assert len(holes) == len(item["expectedHoleRatios"])
            for hole, ratio in zip(holes, item["expectedHoleRatios"]):
                assert hole.dxftype() == "ELLIPSE"
                assert abs(hole.dxf.ratio-ratio) < 1e-12
                assert abs(hole.dxf.major_axis.magnitude*ratio-item["holeRadius"]) < 1e-10
        if item["planform"]:
            for line in polylines:
                points = list(line.get_points("xy"))
                area = abs(sum(p[0]*points[(i+1) % len(points)][1]-p[1]*points[(i+1) % len(points)][0]
                               for i, p in enumerate(points))) / 2
                assert abs(area/item["expectedArea"]-1) < 5e-5, (area, item["expectedArea"])
        results.append({"file": item["path"], "DXF": "valid", "units": "mm", "closedProfiles": len(polylines)})
        continue
    reader = STEPControl_Reader()
    assert reader.ReadFile(item["path"]) == IFSelect_RetDone, item["path"]
    assert reader.TransferRoots() > 0, "STEP has no transferable roots"
    shape = reader.OneShape()
    assert not shape.IsNull(), "Null imported shape"
    assert BRepCheck_Analyzer(shape).IsValid(), "Imported STEP B-rep is invalid"
    solids = TopExp_Explorer(shape, TopAbs_SOLID)
    count = 0
    while solids.More():
        count += 1
        solids.Next()
    assert count == 1, f"Expected one physical module solid, got {count}"
    props = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, props)
    volume = props.Mass()
    assert volume > 0, "STEP shell orientation is inward"
    assert abs(volume / item["volume"] - 1) < 1e-6, (volume, item["volume"])
    bounds = Bnd_Box()
    BRepBndLib.Add_s(shape, bounds)
    actual = bounds.Get()
    for value, target in zip(actual, item["bounds"]):
        assert abs(value-target) < 2e-5, (actual, item["bounds"])
    results.append({"file": item["path"], "solids": count, "valid": True,
                    "volumeMm3": volume, "boundsMm": actual})
print(json.dumps(results))
