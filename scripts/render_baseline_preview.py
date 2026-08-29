"""Render the tested baseline geometry for README visual QA."""

from pathlib import Path

from vtkmodules.vtkCommonCore import vtkPoints
from vtkmodules.vtkCommonDataModel import vtkCellArray, vtkPolyData, vtkTriangle
from vtkmodules.vtkFiltersCore import vtkPolyDataNormals
from vtkmodules.vtkIOImage import vtkPNGWriter
from vtkmodules.vtkRenderingCore import (
    vtkActor,
    vtkPolyDataMapper,
    vtkRenderer,
    vtkRenderWindow,
    vtkWindowToImageFilter,
)
import vtkmodules.vtkRenderingOpenGL2  # noqa: F401 -- registers the OpenGL backend

from mie446_wing import WingParameters, build_wing, validate_wing


def main() -> None:
    build = build_wing(WingParameters())
    validate_wing(build).raise_for_failure()
    vertices, triangles = build.complete.tessellate(0.7, 0.12)

    points = vtkPoints()
    for vertex in vertices:
        points.InsertNextPoint(*vertex.toTuple())
    cells = vtkCellArray()
    for indices in triangles:
        triangle = vtkTriangle()
        for corner, index in enumerate(indices):
            triangle.GetPointIds().SetId(corner, index)
        cells.InsertNextCell(triangle)

    polydata = vtkPolyData()
    polydata.SetPoints(points)
    polydata.SetPolys(cells)
    normals = vtkPolyDataNormals()
    normals.SetInputData(polydata)
    normals.ConsistencyOn()
    normals.AutoOrientNormalsOn()

    mapper = vtkPolyDataMapper()
    mapper.SetInputConnection(normals.GetOutputPort())
    actor = vtkActor()
    actor.SetMapper(mapper)
    actor.GetProperty().SetColor(0.72, 0.74, 0.77)
    actor.GetProperty().SetSpecular(0.15)
    actor.GetProperty().SetSpecularPower(18.0)

    renderer = vtkRenderer()
    renderer.SetBackground(1.0, 1.0, 1.0)
    renderer.AddActor(actor)
    window = vtkRenderWindow()
    window.SetOffScreenRendering(1)
    window.SetSize(1600, 900)
    window.AddRenderer(renderer)
    camera = renderer.GetActiveCamera()
    camera.SetPosition(430.0, -360.0, 280.0)
    camera.SetFocalPoint(75.0, 225.0, 0.0)
    camera.SetViewUp(0.0, 0.0, 1.0)
    renderer.ResetCameraClippingRange()
    window.Render()

    capture = vtkWindowToImageFilter()
    capture.SetInput(window)
    capture.SetScale(1)
    capture.ReadFrontBufferOff()
    capture.Update()
    destination = Path(__file__).resolve().parents[1] / "docs" / "baseline_preview.png"
    destination.parent.mkdir(parents=True, exist_ok=True)
    writer = vtkPNGWriter()
    writer.SetFileName(str(destination))
    writer.SetInputConnection(capture.GetOutputPort())
    writer.Write()
    print(destination)


if __name__ == "__main__":
    main()
