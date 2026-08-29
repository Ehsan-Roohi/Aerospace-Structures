from math import hypot

import numpy as np
import pytest

from mie446_wing.airfoil import camber_line, naca4_section
from mie446_wing.config import normalize_naca4


def test_symmetric_0012_has_zero_camber() -> None:
    x = np.linspace(0.0, 1.0, 21)
    camber, slope = camber_line("0012", x)
    assert np.allclose(camber, 0.0)
    assert np.allclose(slope, 0.0)


def test_2412_has_two_percent_camber_at_x_04() -> None:
    camber, slope = camber_line("NACA 2412", np.asarray([0.4]))
    assert camber[0] == pytest.approx(0.02)
    assert slope[0] == pytest.approx(0.0)


def test_requested_trailing_edge_thickness_is_physical_distance() -> None:
    section = naca4_section("2412", chord_mm=160.0, trailing_edge_mm=1.2)
    distance = hypot(
        section.x_upper[-1] - section.x_lower[-1],
        section.z_upper[-1] - section.z_lower[-1],
    )
    assert distance == pytest.approx(1.2, abs=1.0e-6)


@pytest.mark.parametrize("value", ["2412", "NACA2412", "NACA 2412"])
def test_naca_code_normalization(value: str) -> None:
    assert normalize_naca4(value) == "2412"


@pytest.mark.parametrize("value", ["2012", "NACA2012", "12", "abcd"])
def test_invalid_naca_code_is_rejected(value: str) -> None:
    with pytest.raises(ValueError):
        normalize_naca4(value)

