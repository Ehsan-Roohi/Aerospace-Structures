"""Independent 400-digit original ring/planar subtraction and elliptic AGM.

No new stable-remainder identity or truncated elliptic expansion is used here.
Inputs are the exact values of each binary-double fixture coordinate.
"""
from decimal import Decimal as D, localcontext
from pathlib import Path
import json

HERE = Path(__file__).resolve().parent


def decimal_pi():
    a, b, t, p = D(1), D(1)/D(2).sqrt(), D(1)/4, D(1)
    for _ in range(12):
        aa = (a+b)/2
        b = (a*b).sqrt()
        t -= p*(a-aa)**2
        a, p = aa, p*2
    return (a+b)**2/(4*t)


with localcontext() as ctx:
    ctx.prec = 400
    pi = decimal_pi()

    def elliptic(q):
        a, b, sm, pw = D(1), q.sqrt(), (1-q)/2, D(1)
        for _ in range(100):
            c = (a-b)/2
            sm += pw*c*c
            aa = (a+b)/2
            b = (a*b).sqrt()
            a, pw = aa, pw*2
            if abs(c) < D('1e-390')*a:
                break
        k = pi/(2*a)
        e = k*(1-sm)
        return [k, e, e-1]

    q_values = [1., .9, .1, .001, .000100000000001,
                .0001, .000099999999999, 1e-5, 1e-8,
                1e-16, 1e-30, 1e-100, 1e-200, 1e-300]
    elliptic_rows = []
    for q in q_values:
        elliptic_rows.append({'q': q, 'reference': list(map(float, elliptic(D.from_float(q))))})

    fixtures = []
    for scale in [1e-6, 1., 1e6]:
        for eps in [1e-1, 1e-4, 1e-8, 1e-12, 1e-14]:
            for direction in [(1., .6), (1., 0.), (0., 1.)]:
                xs, rs = .3*scale, 1.2*scale
                x, r = xs+eps*scale*direction[0], rs+eps*scale*direction[1]
                fixtures.append([x, r, xs, rs])
    fixtures += [[1.3, .003, .2, .001], [.15, 1., -.3, 2.],
                 [13., .1, -7., 2.], [.2, .1, .3, 1.],
                 [0., 1., 0., .25], [3., .5, -3., 2.]]
    rows = []
    for point in fixtures:
        x, r, xs, rs = map(D.from_float, point)
        dx, dr = x-xs, r-rs
        b = dx*dx+dr*dr
        dd = dx*dx+(r+rs)**2
        sd = dd.sqrt()
        k, e, _ = elliptic(b/dd)
        vx = (k+(rs*rs-r*r-dx*dx)*e/b)/(2*pi*sd)
        vr = dx*(-k+(rs*rs+r*r+dx*dx)*e/b)/(2*pi*r*sd)
        remainder = [vx+dr/(2*pi*b), vr-dx/(2*pi*b)]
        rows.append({'point': point, 'ring': list(map(float, [vx, vr])),
                     'remainder': list(map(float, remainder)),
                     'lengthScale': float(max(abs(r), abs(rs)))})

out = {'method': '400-digit Decimal AGM and original ring minus original planar kernel',
       'precisionDecimalDigits': 400, 'elliptic': elliptic_rows, 'kernel': rows,
       'sourceForCoefficientAudit': 'https://dlmf.nist.gov/19.12#E1 through #E3'}
(HERE/'stable-kernel-reference.json').write_text(json.dumps(out, indent=2)+'\n')
print(json.dumps({'ellipticFixtures': len(elliptic_rows), 'kernelFixtures': len(rows)}))
