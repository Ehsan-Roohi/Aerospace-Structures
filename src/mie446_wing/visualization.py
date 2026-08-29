"""Browser-native Plotly preview for Colab and Jupyter."""

from __future__ import annotations

import cadquery as cq
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from .airfoil import naca4_section
from .config import WingParameters


def plot_design_overview(parameters: WingParameters) -> go.Figure:
    """Show the root airfoil and semi-wing planform before building CAD."""

    section = naca4_section(
        parameters.naca,
        chord_mm=parameters.root_chord_mm,
        trailing_edge_mm=parameters.trailing_edge_mm,
        point_count=161,
    )
    span = np.linspace(0.0, parameters.semi_span_mm, 101)
    chords = np.asarray([parameters.chord_at(float(y)) for y in span])
    figure = make_subplots(
        rows=1,
        cols=2,
        subplot_titles=(f"Root airfoil: NACA {parameters.naca}", "Semi-wing planform"),
        horizontal_spacing=0.12,
    )
    figure.add_trace(
        go.Scatter(
            x=np.concatenate((section.x_upper, section.x_lower[::-1])),
            y=np.concatenate((section.z_upper, section.z_lower[::-1])),
            fill="toself",
            fillcolor="rgba(55, 95, 145, 0.18)",
            line={"color": "#1f4e79", "width": 2},
            name="Airfoil surface",
        ),
        row=1,
        col=1,
    )
    figure.add_trace(
        go.Scatter(
            x=section.camber_x,
            y=section.camber_z,
            line={"color": "#b45f06", "dash": "dash", "width": 2},
            name="Camber line",
        ),
        row=1,
        col=1,
    )
    figure.add_trace(
        go.Scatter(
            x=np.concatenate((np.zeros_like(span), chords[::-1])),
            y=np.concatenate((span, span[::-1])),
            fill="toself",
            fillcolor="rgba(80, 80, 80, 0.12)",
            line={"color": "#333333", "width": 2},
            name="Wing planform",
        ),
        row=1,
        col=2,
    )
    for index, spar in enumerate(parameters.spars, start=1):
        figure.add_trace(
            go.Scatter(
                x=spar.chord_fraction * chords,
                y=span,
                line={"width": 2, "dash": "dot"},
                name=f"Rod path {index} (x/c={spar.chord_fraction:.2f})",
            ),
            row=1,
            col=2,
        )
    for boundary in parameters.module_bounds_mm()[1:-1]:
        figure.add_shape(
            type="line",
            x0=0.0,
            x1=parameters.chord_at(boundary),
            y0=boundary,
            y1=boundary,
            line={"color": "#b45f06", "dash": "dash", "width": 2},
            row=1,
            col=2,
        )
    for station in parameters.rib_stations_mm():
        figure.add_shape(
            type="line",
            x0=0.0,
            x1=parameters.chord_at(station),
            y0=station,
            y1=station,
            line={"color": "#777777", "dash": "dot", "width": 1},
            row=1,
            col=2,
        )
    figure.update_xaxes(title_text="x from leading edge (mm)", row=1, col=1)
    figure.update_yaxes(
        title_text="z (mm)",
        scaleanchor="x",
        scaleratio=1,
        row=1,
        col=1,
    )
    figure.update_xaxes(title_text="x from leading edge (mm)", row=1, col=2)
    figure.update_yaxes(
        title_text="span y (mm)",
        scaleanchor="x2",
        scaleratio=1,
        row=1,
        col=2,
    )
    figure.update_layout(
        title="MIE 446 — automatic 2D design check",
        template="plotly_white",
        height=620,
        legend={"orientation": "h", "y": -0.16},
        margin={"l": 30, "r": 20, "t": 75, "b": 90},
    )
    return figure


def plot_modules(
    modules: tuple[cq.Shape, ...],
    *,
    title: str = "MIE 446 printable modules",
    mesh_tolerance_mm: float = 0.6,
) -> go.Figure:
    """Preview printable modules in their assembled locations with distinct colors."""

    colors = ("#4e79a7", "#f28e2b", "#59a14f")
    figure = go.Figure()
    for index, module in enumerate(modules, start=1):
        vertices, triangles = module.tessellate(mesh_tolerance_mm, 0.15)
        xyz = np.asarray([vertex.toTuple() for vertex in vertices], dtype=float)
        ijk = np.asarray(triangles, dtype=int)
        figure.add_trace(
            go.Mesh3d(
                x=xyz[:, 0],
                y=xyz[:, 1],
                z=xyz[:, 2],
                i=ijk[:, 0],
                j=ijk[:, 1],
                k=ijk[:, 2],
                color=colors[(index - 1) % len(colors)],
                name=f"Module {index}",
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
        legend={"orientation": "h", "y": -0.08},
        margin={"l": 0, "r": 0, "t": 45, "b": 30},
    )
    return figure


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
