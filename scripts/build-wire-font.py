#!/usr/bin/env python3
"""Turn a TrueType font into the outline data behind the 3D wireframe letters.

    python3 scripts/build-wire-font.py "/path/to/Font.ttf" > assets/js/wire-font-outlines.js

Standard library only. For every character the site needs (A-Z, 0-9, "_", "-", ".") it reads the
glyph outline, flattens the quadratic curves into a few straight pieces and marks the CORNERS:
the points where the outline changes direction sharply. assets/js/wire-font.js extrudes each
outline into a wireframe; it draws the front and back outline and joins them only at corners, so
a smooth curve gets no connecting lines at all.

The font file itself is not part of the repository or the site: only these outlines are.
"""

import json
import math
import struct
import sys

CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-."
CORNER_DEGREES = 28  # a turn sharper than this is a corner
CURVE_STEP_DEGREES = 25  # a curve is first cut into pieces of about this much turn ...
SIMPLIFY = 30  # ... then cut down to straight facets (Douglas-Peucker): no point further than this from
#                a facet, in font units. About 30 turns a round letter into an octagon.
FACET_DEGREES = 16  # after that every vertex that still turns by more than this is a corner of its own
SLANT = 0.10  # forward lean: x += y * SLANT, so the letters are not simply the source face


def u16(b, o):
    return struct.unpack(">H", b[o : o + 2])[0]


def s16(b, o):
    return struct.unpack(">h", b[o : o + 2])[0]


def u32(b, o):
    return struct.unpack(">I", b[o : o + 4])[0]


def read_font(path):
    b = open(path, "rb").read()
    tabs = {}
    for i in range(u16(b, 4)):
        o = 12 + i * 16
        tabs[b[o : o + 4].decode()] = u32(b, o + 8)

    upm = u16(b, tabs["head"] + 18)
    loca_fmt = s16(b, tabs["head"] + 50)
    glyph_count = u16(b, tabs["maxp"] + 4)
    lo = tabs["loca"]
    loca = [u16(b, lo + 2 * i) * 2 for i in range(glyph_count + 1)] if loca_fmt == 0 else [u32(b, lo + 4 * i) for i in range(glyph_count + 1)]
    hh = tabs["hhea"]
    metrics = u16(b, hh + 34)
    hm = tabs["hmtx"]
    advance = [u16(b, hm + 4 * min(i, metrics - 1)) for i in range(glyph_count)]

    # cmap: format 4
    off = tabs["cmap"]
    cmap = {}
    for i in range(u16(b, off + 2)):
        sub = off + u32(b, off + 8 + i * 8)
        if u16(b, sub) != 4:
            continue
        segs = u16(b, sub + 6) // 2
        ends = [u16(b, sub + 14 + 2 * k) for k in range(segs)]
        sp = sub + 14 + 2 * segs + 2
        starts = [u16(b, sp + 2 * k) for k in range(segs)]
        dp = sp + 2 * segs
        deltas = [s16(b, dp + 2 * k) for k in range(segs)]
        rp = dp + 2 * segs
        ranges = [u16(b, rp + 2 * k) for k in range(segs)]
        for k in range(segs):
            for c in range(starts[k], ends[k] + 1):
                if c == 0xFFFF:
                    continue
                if ranges[k] == 0:
                    g = (c + deltas[k]) & 0xFFFF
                else:
                    g = u16(b, rp + 2 * k + ranges[k] + 2 * (c - starts[k]))
                    g = (g + deltas[k]) & 0xFFFF if g else 0
                if g:
                    cmap[c] = g
        break

    def outline(gid):
        a, z = loca[gid], loca[gid + 1]
        if a == z:
            return []
        o = tabs["glyf"] + a
        nc = s16(b, o)
        if nc < 0:
            raise SystemExit("composite glyphs are not supported")
        ends = [u16(b, o + 10 + 2 * i) for i in range(nc)]
        n = ends[-1] + 1
        p = o + 12 + 2 * nc + u16(b, o + 10 + 2 * nc)
        flags = []
        while len(flags) < n:
            f = b[p]
            p += 1
            flags.append(f)
            if f & 8:
                flags += [f] * b[p]
                p += 1
        xs, v = [], 0
        for f in flags:
            if f & 2:
                d = b[p]
                p += 1
                v += d if f & 16 else -d
            elif not f & 16:
                v += s16(b, p)
                p += 2
            xs.append(v)
        ys, v = [], 0
        for f in flags:
            if f & 4:
                d = b[p]
                p += 1
                v += d if f & 32 else -d
            elif not f & 32:
                v += s16(b, p)
                p += 2
            ys.append(v)
        out, s = [], 0
        for e in ends:
            out.append([(xs[i], ys[i], bool(flags[i] & 1)) for i in range(s, e + 1)])
            s = e + 1
        return out

    return upm, cmap, advance, outline


def angle_between(a, b):
    la = math.hypot(*a)
    lb = math.hypot(*b)
    if not la or not lb:
        return 0
    c = max(-1, min(1, (a[0] * b[0] + a[1] * b[1]) / (la * lb)))
    return math.degrees(math.acos(c))


def pieces_of(contour):
    """The contour as straight lines and quadratic curves between its on-curve nodes."""
    n = len(contour)
    start = next((i for i, p in enumerate(contour) if p[2]), None)
    if start is None:
        a, b = contour[0], contour[-1]
        first = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        seq = list(contour)
    else:
        first = (contour[start][0], contour[start][1])
        seq = contour[start + 1 :] + contour[: start + 1]

    pieces = []
    cur = first
    i = 0
    while i < len(seq):
        p = seq[i]
        if p[2]:
            pieces.append(("L", cur, (p[0], p[1])))
            cur = (p[0], p[1])
            i += 1
        else:
            nxt = seq[(i + 1) % len(seq)]
            if nxt[2]:
                end = (nxt[0], nxt[1])
                i += 2
            else:
                end = ((p[0] + nxt[0]) / 2, (p[1] + nxt[1]) / 2)
                i += 1
            pieces.append(("Q", cur, (p[0], p[1]), end))
            cur = end
    if pieces and pieces[-1][-1] != first:
        pieces.append(("L", cur, first))
    return pieces


def tangent_out(piece):
    return (piece[2][0] - piece[1][0], piece[2][1] - piece[1][1])  # first direction


def tangent_in(piece):
    if piece[0] == "L":
        return (piece[2][0] - piece[1][0], piece[2][1] - piece[1][1])
    return (piece[3][0] - piece[2][0], piece[3][1] - piece[2][1])


def flatten(contour):
    """-> (points, corner_indices) for one closed contour."""
    pieces = [p for p in pieces_of(contour) if p[1] != p[-1]]
    pts, corners = [], []
    count = len(pieces)
    for k, piece in enumerate(pieces):
        before = pieces[(k - 1) % count]
        turn = angle_between(tangent_in(before), tangent_out(piece))
        if turn > CORNER_DEGREES:
            corners.append(len(pts))
        pts.append(piece[1])
        if piece[0] == "Q":
            p0, c, p1 = piece[1], piece[2], piece[3]
            sweep = angle_between((c[0] - p0[0], c[1] - p0[1]), (p1[0] - c[0], p1[1] - c[1]))
            steps = max(1, math.ceil(sweep / CURVE_STEP_DEGREES))
            for s in range(1, steps):
                t = s / steps
                x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t**2 * p1[0]
                y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t**2 * p1[1]
                pts.append((x, y))
    return pts, corners


def distance_to_line(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    if not length:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    return abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / length


def douglas_peucker(points, tolerance):
    """Keeps the first and last point; drops the ones that lie within `tolerance` of the line."""
    if len(points) < 3:
        return points
    worst, index = 0, 0
    for i in range(1, len(points) - 1):
        d = distance_to_line(points[i], points[0], points[-1])
        if d > worst:
            worst, index = d, i
    if worst <= tolerance:
        return [points[0], points[-1]]
    return douglas_peucker(points[: index + 1], tolerance)[:-1] + douglas_peucker(points[index:], tolerance)


def simplify(points, corners):
    """Cut a closed contour down to straight facets. The corners of the source always stay.
    Returns (points, connector_indices): the facets meet at corners now, so every vertex that
    turns noticeably is one (a round letter has become a polygon); a loop that still has fewer
    than two gets its leftmost and rightmost points (the silhouette edges of the extruded loop)
    so it does not float apart."""
    n = len(points)
    connectors = set(corners)
    if len(connectors) < 2:
        connectors.add(min(range(n), key=lambda i: points[i][0]))
        connectors.add(max(range(n), key=lambda i: points[i][0]))
    fixed = sorted(connectors)
    if len(fixed) < 2:
        fixed = [0, n // 2]

    kept = []
    for k, start in enumerate(fixed):
        end = fixed[(k + 1) % len(fixed)]
        span = [points[i % n] for i in range(start, end + (n if end <= start else 0) + 1)]
        kept.append((start, douglas_peucker(span, SIMPLIFY)[:-1]))

    out = []
    for _, run in kept:
        out.extend(run)

    m = len(out)
    marks = []
    for i in range(m):
        before = (out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1])
        after = (out[(i + 1) % m][0] - out[i][0], out[(i + 1) % m][1] - out[i][1])
        if angle_between(before, after) > FACET_DEGREES:
            marks.append(i)
    if len(marks) < 2:
        marks = sorted({min(range(m), key=lambda i: out[i][0]), max(range(m), key=lambda i: out[i][0])})
    return out, marks


# Glyphs that are drawn here instead of read from the font. Every vertex of these is a corner.
#
# K is the K of the KS logo (assets/logo/ks-horizontal.svg), cut away from the S along the vertical
# line through the tip of its upper arm (x = 761.75): the stem with its foot and counter, and the two
# parallel diagonals. Logo units are y-down, 761.85 high; they are scaled to the cap height.
#
# O is a plain rectangle ring: the font's O box, with a counter one stroke (128) in.
CAP = 700
LOGO_HEIGHT = 761.85
LOGO_K = [
    [(0, 0), (101.6, 0), (101.6, 514.4), (615.98, 0), (761.75, 0), (380.73, 380.7), (460.22, 460.1),
     (761.75, 158.57), (761.75, 304.45), (533.25, 533.0), (659.85, 660.12), (761.75, 660.12),
     (761.75, 761.85), (615.98, 761.85), (460.22, 606.05), (307.35, 761.85), (0, 761.85)],
    [(307.35, 453.7), (387.48, 533.0), (260.35, 660.12), (101.6, 660.12)],
]
BEARING = 73  # the font's left side bearing, kept so the spacing matches the other letters
STROKE = 128


def logo_k():
    k = CAP / LOGO_HEIGHT
    contours = [[(BEARING + x * k, (LOGO_HEIGHT - y) * k) for x, y in loop] for loop in LOGO_K]
    width = max(x for loop in contours for x, _ in loop)
    return contours, round(width + BEARING)


def rect_o():
    left, right = 45, 768
    outer = [(left, 0), (right, 0), (right, CAP), (left, CAP)]
    inner = [(left + STROKE, STROKE), (right - STROKE, STROKE), (right - STROKE, CAP - STROKE), (left + STROKE, CAP - STROKE)]
    return [outer, inner], 809


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    upm, cmap, advance, outline = read_font(sys.argv[1])

    data = {}
    cap = 0
    for ch in CHARS:
        gid = cmap.get(ord(ch))
        if gid is None:
            raise SystemExit("the font has no glyph for " + repr(ch))
        contours = []
        if ch in ("K", "O"):
            loops, adv = logo_k() if ch == "K" else rect_o()
            for loop in loops:
                pts = [(x + y * SLANT, y) for x, y in loop]
                contours.append([[round(v) for xy in pts for v in xy], list(range(len(pts)))])
            data[ch] = [adv, contours]
            continue
        for c in outline(gid):
            pts, corners = flatten(c)
            pts, connectors = simplify(pts, corners)
            pts = [(x + y * SLANT, y) for x, y in pts]
            contours.append([[round(v) for xy in pts for v in xy], connectors])
            if ch == "E":
                cap = max(cap, max(p[1] for p in pts))
        data[ch] = [advance[gid], contours]

    # "." and a space advance; everything else comes from the glyph
    body = json.dumps({"cap": round(cap), "upm": upm, "glyphs": data}, separators=(",", ":"))
    print("// Generated by scripts/build-wire-font.py from a TrueType font: glyph outlines flattened to")
    print("// polylines, with the corner points marked. Do not edit by hand; see wire-font.js.")
    print("window.KanasakaWireFontData = " + body + ";")


if __name__ == "__main__":
    main()
