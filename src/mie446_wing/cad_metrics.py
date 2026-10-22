"""Adaptive B-rep material metrics, independent of attached display meshes."""
from __future__ import annotations

import math


def adaptive_volume(shape) -> float:
    """Return closed-solid material volume in mm³ using adaptive integration.

    CadQuery's default Shape.Volume uses OpenCASCADE's fixed quadrature.
    Station-loft B-spline faces can exceed the segmentation tolerance under
    that integration. Explicit adaptive face integration avoids compensating
    for this numerical error by relaxing manufacturing or mass checks.
    """
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    properties=GProp_GProps()
    error=BRepGProp.VolumeProperties_s(shape.wrapped,properties,1e-8,True,False)
    volume=float(properties.Mass())
    if not math.isfinite(volume) or not math.isfinite(error) or error>1e-6:
        raise ValueError("Adaptive CAD material-volume integration did not converge")
    return volume
