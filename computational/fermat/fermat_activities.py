"""Exact-arithmetic and model-checking activities accompanying the Fermat reading.

Standard library only. Finite searches are demonstrations, not proofs of FLT.
Run from any working directory: python fermat_activities.py
"""
from fractions import Fraction
from math import isclose, sqrt


def finite_solutions(exponent, bound):
    """Return all 1 <= a <= b <= bound, 1 <= c <= bound solutions."""
    powers = {c**exponent: c for c in range(1, bound + 1)}
    return [(a, b, powers[a**exponent + b**exponent])
            for a in range(1, bound + 1)
            for b in range(a, bound + 1)
            if a**exponent + b**exponent in powers]


def count_points(prime):
    """Count y^2 = x^3 - x over a small prime field, including infinity."""
    if prime < 3 or any(prime % d == 0 for d in range(2, int(sqrt(prime)) + 1)):
        raise ValueError("Use an odd prime: this displayed curve is bad at 2.")
    return 1 + sum((y*y - x*x*x + x) % prime == 0
                   for x in range(prime) for y in range(prime))


def beam_check():
    """Original illustrative inputs; not a tested specimen or material card."""
    b, h, length, load = map(Fraction, ("0.020", "0.004", "0.20", "1"))
    young = Fraction(70_000_000_000)
    inertia = b * h**3 / 12
    rigidity = young * inertia
    closed = load * length**3 / (3 * rigidity)
    # Unit-load integrand for displacement: P (L-x)^2 / (EI).
    # A single midpoint panel under-integrates this quadratic by exactly 25%.
    midpoint = load * length**3 / (4 * rigidity)
    assert midpoint / closed == Fraction(3, 4)
    # Two Gauss points on [0,L] integrate a quadratic exactly, up to float error.
    L, P, EI = float(length), float(load), float(rigidity)
    gauss = sum((L / 2) * P * (L - (L / 2)*(1 + t))**2 / EI
                for t in (-1 / sqrt(3), 1 / sqrt(3)))
    assert isclose(gauss, float(closed), rel_tol=1e-14)
    assert closed == Fraction(1, 2800)
    return inertia, closed, midpoint, gauss


def main():
    print("FINITE SEARCH: bounds apply to all three positive integers.")
    for n in (2, 3, 4):
        results = finite_solutions(n, 100)
        print(f"n={n}, bound=100: {len(results)} solutions; first five={results[:5]}")
        if n == 2:
            assert (3, 4, 5) in results and (5, 12, 13) in results
        else:
            assert not results
    print("No solution in a finite box is NOT an unbounded proof.")

    for a, b, c, n in ((6, 8, 9, 3), (9, 10, 12, 3), (3987, 4365, 4472, 12)):
        residual = a**n + b**n - c**n
        assert residual != 0
        print(f"Exact residual for ({a}, {b}, {c}), n={n}: {residual}")
        print(f"Floating root estimate: {(a**n + b**n)**(1/n):.12g}")

    expected = {3: 4, 5: 8, 7: 8, 11: 12}
    for prime, reference in expected.items():
        count = count_points(prime)
        assert count == reference
        print(f"p={prime}: #E(F_p)={count}, a_p={prime + 1 - count}")
    assert {pow(x, 4, 16) for x in range(16)} == {0, 1}

    inertia, closed, midpoint, gauss = beam_check()
    print(f"Beam I = {float(inertia):.12g} m^4")
    print(f"Closed-form deflection = {float(closed)*1000:.12g} mm")
    print(f"One-panel midpoint = {float(midpoint)*1000:.12g} mm (25% low)")
    print(f"Two-point Gauss = {gauss*1000:.12g} mm")
    print("All activity checks passed. Full Lean proof was not built here.")


if __name__ == "__main__":
    main()
