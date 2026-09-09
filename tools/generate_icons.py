#!/usr/bin/env python3
"""
Zentra XR launcher icon generator.

Pure-python (stdlib only) rasteriser: draws the Zentra XR mark (orbital ring + Z)
with 4x supersampled anti-aliasing and writes RGBA PNGs used as launcher icons.
The same geometry is reproduced at runtime, in vector quality, by the in-VR logo.
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "app", "src", "main", "res")

BG_INNER = (0x0B, 0x0E, 0x15)   # centre of the backdrop gradient
BG_OUTER = (0x03, 0x04, 0x07)   # edges
INK = (255, 255, 255)           # ring + glyph


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    if l2 <= 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def zentra_coverage(nx, ny, ring=True):
    """Coverage (0..1) of the mark at normalised coords in [-0.5, 0.5]."""
    cov = 0.0
    r = math.hypot(nx, ny)
    ang = math.atan2(ny, nx)                     # -pi..pi

    if ring:
        ring_r, ring_w = 0.355, 0.058
        ring_d = abs(r - ring_r)
        if ring_d <= ring_w * 0.5:
            # orbital gap: lower-right quadrant
            gap = (-0.62 < ang < -0.12)
            if not gap:
                cov = max(cov, 1.0)
        # orbital node (small satellite dot at the end of the arc)
        nx0, ny0 = 0.355 * math.cos(-0.62), 0.355 * math.sin(-0.62)
        nx1, ny1 = 0.355 * math.cos(-0.12), 0.355 * math.sin(-0.12)
        for (cx, cy, rad) in ((nx1, ny1, 0.036), (nx0, ny0, 0.026)):
            if math.hypot(nx - cx, ny - cy) <= rad:
                cov = max(cov, 1.0)
        del nx0, ny0, nx1, ny1

    # The "Z": two horizontal bars + diagonal, rounded caps
    w = 0.088
    hw = 0.185
    top, bot = -0.185, 0.185
    pts = [(-hw, top), (hw, top), (-hw, bot), (hw, bot)]
    if seg_dist(nx, ny, *pts[0], *pts[1]) <= w * 0.5:
        cov = max(cov, 1.0)
    if seg_dist(nx, ny, *pts[2], *pts[3]) <= w * 0.5:
        cov = max(cov, 1.0)
    if seg_dist(nx, ny, pts[1][0], pts[1][1], pts[2][0], pts[2][1]) <= w * 0.52:
        cov = max(cov, 1.0)
    return cov


def render(size, round_icon=False, ring=True):
    ss = 4
    inv = 1.0 / (ss * ss)
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(ss):
                for sx in range(ss):
                    fx = (x + (sx + 0.5) / ss) / size - 0.5
                    fy = (y + (sy + 0.5) / ss) / size - 0.5
                    r = math.hypot(fx, fy) / 0.7071

                    # backdrop: subtle radial depth
                    t = max(0.0, min(1.0, r))
                    bg = [BG_INNER[i] + (BG_OUTER[i] - BG_INNER[i]) * t for i in range(3)]

                    cov = zentra_coverage(fx, fy, ring)
                    # faint inner glow around the glyph
                    glow = max(0.0, 1.0 - r * 1.9) * 0.10

                    col = [bg[i] + (INK[i] - bg[i]) * cov for i in range(3)]
                    col = [col[i] + (255 - col[i]) * glow * (1 - cov) * 0.6 for i in range(3)]

                    a = 1.0
                    if round_icon:
                        d = (math.hypot(fx, fy) - 0.5) * size
                        a = max(0.0, min(1.0, 0.5 - d))
                    acc[0] += col[0] * a
                    acc[1] += col[1] * a
                    acc[2] += col[2] * a
                    acc[3] += 255.0 * a
            row += bytes(int(max(0, min(255, v * inv))) for v in acc)
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)


def main():
    densities = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, size in densities.items():
        base = os.path.join(OUT, folder)
        write_png(os.path.join(base, "ic_launcher.png"), size,
                  render(size, round_icon=False))
        write_png(os.path.join(base, "ic_launcher_round.png"), size,
                  render(size, round_icon=True))
        write_png(os.path.join(base, "ic_launcher_foreground.png"), size,
                  render(size, round_icon=False, ring=True))
        print("wrote", folder, size)


if __name__ == "__main__":
    main()
