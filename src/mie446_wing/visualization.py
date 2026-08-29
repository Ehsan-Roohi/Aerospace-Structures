"""Browser-native Plotly preview for Colab and Jupyter."""

from __future__ import annotations

import cadquery as cq
import numpy as np
import plotly.graph_objects as go


def plot_shape(
    shape: cq.Shape,
    *,
    title: str = "MIE 446 wing preview",
    mesh_tolerance_mm: float = 0.6,
) -> go.Figure:
    vertices, triangles = shape.tessellate(mesh_tolerance_mm, 0.15)
    xyz = np.asarray([vertex.toTuple() for vertex in vertices], dtype=float)
    ijk = np.asarray(triangles, dtype=int)
    figure = go.Figure(
        go.Mesh3d(
            x=xyz[:, 0],
            y=xyz[:, 1],
            z=xyz[:, 2],
            i=ijk[:, 0],
            j=ijk[:, 1],
            k=ijk[:, 2],
            color="#9aa0a6",
            flatshading=False,
            opacity=1.0,
            lighting={"ambient": 0.55, "diffuse": 0.75, "roughness": 0.9},
        )
    )
    figure.update_layout(
        title=title,
        scene={
            "aspectmode": "data",
            "xaxis_title": "x: chordwise (mm)",
            "yaxis_title": "y: spanwise (mm)",
            "zaxis_title": "z: thickness (mm)",
        },
        margin={"l": 0, "r": 0, "t": 45, "b": 0},
    )
    return figure

