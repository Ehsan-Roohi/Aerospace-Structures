"""Procedural paint for the D.520, evaluated per texel from the baked 3-D position/normal.

Sourced (manual):  colours and where they go (p59-p61): upper surfaces matt kaki / terre foncée /
gris bleu foncé camouflage; lower metal surfaces gris bleu; lower fabric gris bleu clair; wing roundels
white/red/blue; rudder blue/white/red over white with black lettering; Flettner tab red; cockpit night
blue.  Frame/rib/spar stations (Pl.1, Pl.10, Pl.59 doors) from the dimension table.
GUESS: RGB values, camouflage pattern shapes, roundel sizes/positions, rivet pitch, wear, soot.
"""
import math
import numpy as np
import d520_geom as G

# ----------------------------------------------------------------- colours (linear RGB, GUESS values)
def lin(h):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)
    return np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92).astype(np.float32)

KAKI = lin("#706b48"); TERRE = lin("#6a4c35"); GRISBF = lin("#4d5966")
DESSOUS_METAL = lin("#9eaab2"); DESSOUS_FABRIC = lin("#aab6bd")
BLEU = lin("#22397a"); BLANC = lin("#e9e7df"); ROUGE = lin("#a8262c"); NOIR = lin("#141414")
ALU = lin("#b9bec2"); SOOT = lin("#1b1816"); OIL = lin("#2d2418")

# ----------------------------------------------------------------- noise
def _hash(ix, iy, iz, seed):
    n = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    n = n & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    n = n ^ (n >> 16)
    return (n & 0xFFFF).astype(np.float32) / 65535.0

def vnoise3(p, seed=0):
    pi = np.floor(p).astype(np.int64); f = (p - pi).astype(np.float32)
    w = f * f * (3 - 2 * f)
    x, y, z = pi[..., 0], pi[..., 1], pi[..., 2]
    def c(dx, dy, dz): return _hash(x + dx, y + dy, z + dz, seed)
    x00 = c(0, 0, 0) * (1 - w[..., 0]) + c(1, 0, 0) * w[..., 0]
    x10 = c(0, 1, 0) * (1 - w[..., 0]) + c(1, 1, 0) * w[..., 0]
    x01 = c(0, 0, 1) * (1 - w[..., 0]) + c(1, 0, 1) * w[..., 0]
    x11 = c(0, 1, 1) * (1 - w[..., 0]) + c(1, 1, 1) * w[..., 0]
    y0 = x00 * (1 - w[..., 1]) + x10 * w[..., 1]; y1 = x01 * (1 - w[..., 1]) + x11 * w[..., 1]
    return y0 * (1 - w[..., 2]) + y1 * w[..., 2]

def fbm(p, seed=0, octaves=4, lac=2.03, gain=0.5):
    a, s, tot = 1.0, 0.0, 0.0
    for o in range(octaves):
        s = s + a * vnoise3(p * (lac ** o), seed + 17 * o); tot += a; a *= gain
    return s / tot

def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

# ----------------------------------------------------------------- stations
W = G.Wing(); F = G.Fuselage(); T = G.Tail()
FRAMES_S = [2.80, 3.22, 3.65, 4.27, 4.90, 5.35, 5.80, 6.25, 6.70, 7.10, 7.48, 7.84]   # frames 1..12 (DERIVED + even spacing GUESS)
COWL_S = [0.60, 1.00, 1.48, 1.97]                                                   # cowling panel joints (GUESS)
RIB_DISPLAY_X = [255, 312, 369, 425, 483, 539, 596, 652, 708, 764, 820, 875, 931, 976, 1029, 1066, 1106, 1145, 1182, 1218, 1256, 1301]
RIBS_Y = [5.10 - (x - 213) / 237.0 for x in RIB_DISPLAY_X]                          # ribs 1..22, Pl.1 (SCALED)

def wing_xc(S, y):
    ay = np.abs(y)
    yy = np.clip(ay, 0, W.b2 - 1e-3)
    c = np.vectorize(W.chord)(yy); sle = np.vectorize(W.S_LE)(yy)
    return (S - sle) / c, c

def line_mask(d, width):
    """groove profile: 1 at the line centre falling to 0 at width/2"""
    return np.clip(1 - np.abs(d) / (width / 2), 0, 1)

RIV_R = [0.0022]
def rivets(d_line, s_along, pitch=0.026, r=None, offset=0.0035):
    r = r or RIV_R[0]
    """dome rivets either side of a line (two rows offset by `offset`)."""
    k = np.mod(s_along, pitch) - pitch / 2
    out = np.zeros_like(d_line)
    for off in (-offset, offset):
        rr = np.sqrt(k ** 2 + (d_line - off) ** 2)
        out = np.maximum(out, np.clip(1 - (rr / r) ** 2, 0, 1))
    return out

def rect_dist(a, b, a0, a1, b0, b1):
    """signed-ish distance to a rectangle outline in (a,b) metric coordinates; returns distance to edge and inside flag."""
    da = np.minimum(np.abs(a - a0), np.abs(a - a1)); db = np.minimum(np.abs(b - b0), np.abs(b - b1))
    inside = (a > a0) & (a < a1) & (b > b0) & (b < b1)
    on_a = (b > b0 - 0.004) & (b < b1 + 0.004); on_b = (a > a0 - 0.004) & (a < a1 + 0.004)
    d = np.full(a.shape, 9.0, np.float32)
    d = np.where(on_a, np.minimum(d, da), d); d = np.where(on_b, np.minimum(d, db), d)
    return d, inside

# ----------------------------------------------------------------- paint
def camo(P, N, upper_w):
    S, y, Z = P[..., 0], P[..., 1], P[..., 2]
    q = np.stack([S * 0.42, y * 0.42, Z * 0.42], -1)
    warp = np.stack([fbm(q * 1.7, 11, 3), fbm(q * 1.7 + 5.3, 12, 3), fbm(q * 1.7 + 9.1, 13, 3)], -1) - 0.5
    q2 = q + 0.55 * warp
    f1 = fbm(q2, 21, 4); f2 = fbm(q2 + 31.7, 22, 4)
    # soft spray edge ~3-4 cm
    t_terre = smoothstep(0.515, 0.535, f1)
    t_gris = smoothstep(0.525, 0.545, f2) * (1 - t_terre)
    col = KAKI[None, None] * (1 - t_terre - t_gris)[..., None] + TERRE * t_terre[..., None] + GRISBF * t_gris[..., None]
    return col

def underside_weight(P, N, kind):
    S, y, Z = P[..., 0], P[..., 1], P[..., 2]
    nz = N[..., 2]
    if kind in ("fuselage", "karman", "radiator", "rear"):
        jitter = (fbm(np.stack([S * 2.0, y * 2.0, Z * 2.0], -1), 41, 3) - 0.5) * 0.25
        return smoothstep(-0.30, -0.42, nz + jitter)
    return smoothstep(-0.02, -0.12, nz)

def roundel(d, R):
    col = np.zeros(d.shape + (3,), np.float32); a = np.zeros(d.shape, np.float32)
    aa = 0.004
    a = smoothstep(R + aa, R - aa, d)
    w_blue = smoothstep(R / 3 + aa, R / 3 - aa, d); w_white = smoothstep(2 * R / 3 + aa, 2 * R / 3 - aa, d) - w_blue
    w_red = a - w_blue - w_white
    col = BLEU * w_blue[..., None] + BLANC * w_white[..., None] + ROUGE * np.clip(w_red, 0, 1)[..., None]
    return col, a

def paint(kind, P, N, arc_u, arc_v, name="", texel=0.001):
    """Returns albedo (linear), roughness, metallic, height (m)."""
    H, Wd = P.shape[:2]
    S, y, Z = P[..., 0], P[..., 1], P[..., 2]
    fabric = kind in ("rudder", "elevator")
    under = underside_weight(P, N, kind)
    base = camo(P, N, 1 - under)
    low = DESSOUS_FABRIC if fabric else DESSOUS_METAL
    alb = base * (1 - under)[..., None] + low * under[..., None]
    rough = np.full((H, Wd), 0.62, np.float32); metal = np.zeros((H, Wd), np.float32)
    height = np.zeros((H, Wd), np.float32)
    lines = np.zeros((H, Wd), np.float32); riv = np.zeros((H, Wd), np.float32)
    RIV_R[0] = max(0.0022, 1.6 * texel)
    gw = max(0.0016, 2.5 * texel)                 # panel-line groove width (>= 2.5 texels so it renders)
    # ---------------------------------------------------- markings
    if kind in ("wing", "aileron", "flap"):
        side = np.sign(y)
        yc = 3.95 * side; Sc = W.S_LE(3.95) + 0.45 * W.chord(3.95)
        d = np.sqrt((S - Sc) ** 2 + (y - yc) ** 2)
        col, a = roundel(d, 0.85 / 2)               # wing roundels upper and lower (p59), size GUESS
        alb = alb * (1 - a[..., None]) + col * a[..., None]
    if kind in ("fuselage", "rear"):
        for sd in (1, -1):
            sel = (y * sd > 0.05)
            d = np.sqrt((S - 5.85) ** 2 + (Z - 0.12) ** 2)
            col, a = roundel(d, 0.60 / 2)           # fuselage roundel (photo p3), size/position GUESS
            a = a * sel
            alb = alb * (1 - a[..., None]) + col * a[..., None]
    if kind == "rudder":
        hinge = T.rudder_hinge_S
        b1, b2 = hinge + 0.227, hinge + 0.453     # three equal bands across the 0.68 m max rudder chord
        wb = smoothstep(b1 + 0.003, b1 - 0.003, S)
        wr = smoothstep(b2 - 0.003, b2 + 0.003, S)
        ww = 1 - wb - wr
        alb = BLEU * wb[..., None] + BLANC * ww[..., None] + ROUGE * wr[..., None]
        txt = rudder_text(S, Z, y)                # black lettering 'D / 520' (p60, photo p3)
        alb = alb * (1 - txt[..., None]) + NOIR * txt[..., None]
    if kind == "tab":
        alb = np.broadcast_to(ROUGE, alb.shape).copy()      # Flettner tab red (p61)
    # ---------------------------------------------------- structure lines
    if kind in ("fuselage", "rear"):
        for s0 in FRAMES_S + COWL_S:
            dd = S - s0
            lines = np.maximum(lines, line_mask(dd, gw))
            riv = np.maximum(riv, rivets(dd, arc_v))
        for z0 in (0.02, -0.40, 0.30):            # cowling / skin longitudinal seams (GUESS)
            m = (S < 1.97) if z0 in (0.02, -0.40) else (S > 2.0)
            dd = np.where(m, Z - z0, 9.0)
            lines = np.maximum(lines, line_mask(dd, gw))
            riv = np.maximum(riv, rivets(dd, arc_u) * (S > 2.0))
        # access doors (Pl.59, approximate positions); (S0,S1,Z0,Z1,side) side: +1 right, -1 left, 0 top
        doors = [(5.95, 6.20, 0.50, 0.66, 0), (5.15, 5.40, 0.38, 0.52, -1), (3.55, 3.75, 0.30, 0.42, 1),
                 (2.45, 2.75, 0.40, 0.52, 0), (2.85, 3.15, 0.40, 0.52, 0), (1.90, 2.05, 0.22, 0.34, 1),
                 (7.15, 7.35, -0.20, -0.08, -1), (2.60, 2.95, -0.15, 0.05, 1), (1.05, 1.25, -0.48, -0.36, 1),
                 (1.05, 1.25, -0.48, -0.36, -1), (2.40, 2.90, -0.20, 0.08, -1)]
        for (s0, s1, z0, z1, sd) in doors:
            if sd == 0:
                sel = np.abs(y) < 0.30
                dd, ins = rect_dist(S, y, s0, s1, -0.08, 0.08)
            else:
                sel = (y * sd > 0.1)
                dd, ins = rect_dist(S, Z, s0, s1, z0, z1)
            lines = np.maximum(lines, line_mask(np.where(sel, dd, 9.0), gw))
        # baggage door (round, left side, frames 7-8, Pl.57/Pl.59 F7)
        dd = np.abs(np.sqrt((S - 6.02) ** 2 + (Z - 0.05) ** 2) - 0.16)
        lines = np.maximum(lines, line_mask(np.where(y < -0.1, dd, 9.0), gw))
    if kind in ("wing", "aileron", "flap"):
        ay = np.abs(y)
        xc, c = wing_xc(S, y)
        for ry in RIBS_Y:
            dd = ay - ry
            lines = np.maximum(lines, 0.55 * line_mask(dd, gw))
            riv = np.maximum(riv, rivets(dd, arc_v))
        for xs in (0.36, 0.72):                    # main and rear spars (Pl.1, Pl.51 SCALED)
            dd = (xc - xs) * c
            lines = np.maximum(lines, line_mask(dd, gw) * (ay < W.b2 - 0.3))
            riv = np.maximum(riv, rivets(dd, arc_u) * (ay < W.b2 - 0.3))
        # wing doors (Pl.59): (y0,y1, x0,x1, surface) surface +1 upper, -1 lower, 0 both
        wd = [(3.60, 3.75, 0.40, 0.50, 1), (2.65, 2.78, 0.50, 0.60, -1), (2.18, 2.28, 0.38, 0.48, -1),
              (1.40, 1.50, 0.56, 0.64, -1), (1.60, 1.95, 0.32, 0.62, 0), (0.85, 1.55, 0.34, 0.45, -1),
              (1.70, 1.78, 0.15, 0.20, -1), (1.80, 1.88, 0.15, 0.20, -1), (3.70, 3.80, 0.34, 0.68, -1),
              (2.18, 2.28, 0.58, 0.65, -1)]
        for (y0, y1, x0, x1, sf) in wd:
            surf = N[..., 2] > 0 if sf == 1 else (N[..., 2] < 0 if sf == -1 else np.ones_like(ay, bool))
            dd, ins = rect_dist(ay, xc * c, y0, y1, x0 * np.interp(0, [0], [1]) * W.chord((y0 + y1) / 2), x1 * W.chord((y0 + y1) / 2))
            lines = np.maximum(lines, line_mask(np.where(surf, dd, 9.0), gw))
        # gun ports' blast tubes (dark) at the leading edge
        for gy in (G.v("gun_inner_y"), G.v("gun_outer_y")):
            dd = np.sqrt((ay - gy) ** 2 + ((xc - 0.0) * c) ** 2 * 0.5)
            alb = np.where((dd < 0.03)[..., None] & (N[..., 2] < 0.6)[..., None], NOIR, alb)
        # wheel-well outline on the lower centre section (Pl.0 plan, Pl.30), wells at y=+-0.30
        dd = np.abs(np.sqrt((S - 2.38) ** 2 + (ay - 0.30) ** 2) - 0.34)
        lines = np.maximum(lines, line_mask(np.where(N[..., 2] < 0, dd, 9.0), gw))
    if kind == "tailplane":                        # 5 ribs per half (Pl.27 count), positions GUESS
        for r in (0.45, 0.75, 1.05, 1.35, 1.60):
            dd = np.abs(y) - r
            lines = np.maximum(lines, 0.6 * line_mask(dd, gw)); riv = np.maximum(riv, rivets(dd, arc_v))
    if kind == "fin":                              # 3 fin ribs (Pl.25 count), positions GUESS
        for r in (0.85, 1.15, 1.42):
            dd = Z - r
            lines = np.maximum(lines, 0.6 * line_mask(dd, gw)); riv = np.maximum(riv, rivets(dd, arc_u))
    if fabric:
        if kind == "rudder":
            ribs = np.linspace(-0.12, 1.15, 7)
            coord = Z
        else:
            ribs = np.linspace(0.36, 1.72, 7)
            coord = np.abs(y)
        sag = np.zeros_like(coord)
        for k in range(len(ribs) - 1):
            a0, a1 = ribs[k], ribs[k + 1]
            inb = (coord > a0) & (coord < a1)
            t = (coord - a0) / (a1 - a0)
            sag = np.where(inb, -0.0009 * np.sin(math.pi * t), sag)
        tape = np.zeros_like(coord)
        for r in ribs:
            tape = np.maximum(tape, smoothstep(0.014, 0.011, np.abs(coord - r)))
            stitch = (np.abs(coord - r) < 0.003) & (np.mod(arc_v, 0.02) < 0.006)
            tape = np.maximum(tape, stitch * 1.4)
        height += sag + 0.00025 * tape
        rough = rough + 0.05
    # ---------------------------------------------------- wear, soot, grime
    nchip = fbm(np.stack([S * 9, y * 9, Z * 9], -1), 77, 3)
    nchip2 = fbm(np.stack([S * 30, y * 30, Z * 30], -1), 76, 2)
    chips = (lines > 0.05) & (nchip > 0.74) & (nchip2 > 0.55)
    if kind in ("wing", "flap"):
        walkway = (y < -0.47) & (y > -1.05) & (N[..., 2] > 0.3)
        xc_, c_ = wing_xc(S, y)
        walkway = walkway & (xc_ > 0.25) & (xc_ < 0.75)
        chips = chips | (walkway & (fbm(np.stack([S * 14, y * 14, Z * 14], -1), 78, 3) > 0.66))
        le = (xc_ < 0.02) & (fbm(np.stack([S * 22, y * 22, Z * 22], -1), 79, 3) > 0.72)
        chips = chips | le
    if kind in ("fuselage", "rear"):
        sill = (np.abs(Z - 0.30) < 0.05) & (S > 4.2) & (S < 4.95) & (y < 0)
        chips = chips | (sill & (fbm(np.stack([S * 16, y * 16, Z * 16], -1), 80, 3) > 0.58))
        # exhaust soot (exhaust groups, GUESS positions), both sides
        for sd in (1, -1):
            for s_ex in G.v("exhausts")["S"]:
                ds = S - s_ex
                zline = G.v("exhausts")["Z"] - 0.06 * np.clip(ds, 0, None)
                wdt = 0.04 + 0.07 * np.clip(ds, 0, None)
                streak = fbm(np.stack([S * 3.0, y * 3.0, Z * 40.0], -1), 90, 3)
                amt = np.exp(-np.clip(ds, 0, None) / 0.55) * np.exp(-((Z - zline) / wdt) ** 2) * (ds > -0.03) * (y * sd > 0.1)
                amt = np.clip(amt * (0.55 + 0.8 * streak), 0, 0.9)
                alb = alb * (1 - amt[..., None]) + SOOT * amt[..., None]
                rough = rough + 0.15 * amt
        # oil streaks under the cowling
        under_b = (N[..., 2] < -0.4) & (S > 1.0) & (S < 3.4)
        st = fbm(np.stack([S * 1.5, y * 25.0, Z * 2.0], -1), 91, 3)
        amt = under_b * np.clip((st - 0.55) * 2.5, 0, 0.5) * np.exp(-(S - 1.0) / 1.6)
        alb = alb * (1 - amt[..., None]) + OIL * amt[..., None]
    # metal shows through the chips
    chips = chips.astype(np.float32)
    alb = alb * (1 - chips[..., None]) + ALU * chips[..., None]
    metal = np.maximum(metal, chips); rough = np.where(chips > 0, 0.35, rough)
    # slight paint variation and fading on upper surfaces
    var = (fbm(np.stack([S * 1.3, y * 1.3, Z * 1.3], -1), 95, 3) - 0.5) * 0.10
    alb = alb * (1 + var[..., None])
    rough = np.clip(rough + (fbm(np.stack([S * 4, y * 4, Z * 4], -1), 96, 2) - 0.5) * 0.12, 0.25, 0.95)
    # grime settles in the panel lines and around rivets
    alb = alb * (1 - 0.28 * lines[..., None]) * (1 - 0.08 * riv[..., None])
    # height: grooves down 0.45 mm, rivet domes up 0.35 mm, chips down 0.05 mm
    height += -0.00045 * lines + 0.00035 * riv - 0.00005 * chips
    return alb.astype(np.float32), rough.astype(np.float32), metal.astype(np.float32), height.astype(np.float32), lines

# ----------------------------------------------------------------- rudder lettering raster
_TXT = None
def rudder_text(S, Z, y=None):
    global _TXT
    from PIL import Image, ImageDraw, ImageFont
    s0, s1, z0, z1, res = 8.0, 8.85, -0.3, 1.7, 0.002
    if _TXT is None:
        Wp, Hp = int((s1 - s0) / res), int((z1 - z0) / res)
        im = Image.new("L", (Wp, Hp), 0); d = ImageDraw.Draw(im)
        try:
            font_big = ImageFont.truetype("DejaVuSans-Bold.ttf", int(0.13 / res))
            font_mid = ImageFont.truetype("DejaVuSans-Bold.ttf", int(0.10 / res))
        except Exception:
            font_big = font_mid = ImageFont.load_default()
        hinge = T.rudder_hinge_S
        cx = (hinge + 0.34 - s0) / res
        def put(txt, zc, font):
            bb = d.textbbox((0, 0), txt, font=font); w = bb[2] - bb[0]; h = bb[3] - bb[1]
            d.text((cx - w / 2, (z1 - zc) / res - h / 2), txt, fill=255, font=font)
        put("D", 0.95, font_big); put("520", 0.72, font_mid)
        _TXT = np.array(im).astype(np.float32) / 255.0
    Hp, Wp = _TXT.shape
    ix = np.clip(((S - s0) / res).astype(int), 0, Wp - 1); iz = np.clip(((z1 - Z) / res).astype(int), 0, Hp - 1)
    # port side (y<0) is seen with the nose to the left: text reads with S increasing to the right.
    # starboard side is seen with the nose to the right: mirror the raster so it reads correctly.
    if y is not None:
        ixm = np.clip(((s1 - S) / res).astype(int) - (Wp - int((s1 - s0) / res)), 0, Wp - 1)
        cxp = int((T.rudder_hinge_S + 0.34 - s0) / res)
        ixm = np.clip(2 * cxp - ix, 0, Wp - 1)
        return np.where(y > 0, _TXT[iz, ixm], _TXT[iz, ix])
    return _TXT[iz, ix]
