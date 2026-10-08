"""App icons for the installable web app (phase 6c, PWA): a calm blue tile with a white house glyph.

Writes app/icons/icon.svg (purpose "any", also the favicon), icon-maskable.svg, and PNGs
icon-192.png, icon-512.png, icon-maskable-512.png. Standard library only (zlib + struct); the PNGs are
rasterised here with 4x4 supersampling, so there is no image dependency.

Run:  python tools/build_icons.py        (re-run only when the design changes; then python tools/build_sw_manifest.py)
Colours = app/styles/base.css tokens: --accent-ink #1f5fae (tile), --surface #ffffff (glyph).
"""
import struct
import zlib
from pathlib import Path

ICONS = Path(__file__).resolve().parent.parent / "app" / "icons"
TILE = (0x1F, 0x5F, 0xAE)
GLYPH = (0xFF, 0xFF, 0xFF)
RADIUS = 112  # rounded-tile corner on the 512 grid ("any" icon only; maskable is full-bleed)

# house glyph on a 512 grid: roof triangle, body, door cut-out (door is drawn in the tile colour)
ROOF = [(256, 116), (436, 270), (76, 270)]
BODY = (150, 236, 362, 404)   # x0, y0, x1, y1
DOOR = (226, 312, 286, 404)
CENTRE = (256, 260)
MASKABLE_SCALE = 0.72         # keeps the glyph well inside the maskable safe circle (radius 0.4 x size)


def _in_tri(px, py, tri):
    (x1, y1), (x2, y2), (x3, y3) = tri
    d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2)
    d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3)
    d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def _in_rect(px, py, r):
    return r[0] <= px < r[2] and r[1] <= py < r[3]


def _in_round(px, py, size, radius):
    if radius <= 0:
        return 0 <= px < size and 0 <= py < size
    cx = min(max(px, radius), size - radius)
    cy = min(max(py, radius), size - radius)
    return (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2


def _shapes(scale):
    """Glyph geometry on the 512 grid, scaled about CENTRE (maskable) or as is."""
    cx, cy = CENTRE
    f = lambda x, y: (cx + (x - cx) * scale, cy + (y - cy) * scale)  # noqa: E731
    roof = [f(x, y) for x, y in ROOF]
    body = (*f(BODY[0], BODY[1]), *f(BODY[2], BODY[3]))
    door = (*f(DOOR[0], DOOR[1]), *f(DOOR[2], DOOR[3]))
    return roof, body, door


def _sample(px, py, maskable, shapes):
    """Colour (or None = transparent) at a point on the 512 grid."""
    if not _in_round(px, py, 512, 0 if maskable else RADIUS):
        return None
    roof, body, door = shapes
    if _in_rect(px, py, door):
        return TILE
    if _in_tri(px, py, roof) or _in_rect(px, py, body):
        return GLYPH
    return TILE


def render(size, maskable=False, ss=4):
    shapes = _shapes(MASKABLE_SCALE if maskable else 1.0)
    k = 512 / size
    rows = []
    for y in range(size):
        row = bytearray([0])  # PNG filter type 0
        for x in range(size):
            r = g = b = a = 0
            for sy in range(ss):
                for sx in range(ss):
                    c = _sample((x + (sx + 0.5) / ss) * k, (y + (sy + 0.5) / ss) * k, maskable, shapes)
                    if c:
                        r += c[0]; g += c[1]; b += c[2]; a += 1  # noqa: E702
            n = ss * ss
            if a:
                row += bytes((round(r / a), round(g / a), round(b / a), round(255 * a / n)))
            else:
                row += b"\0\0\0\0"
        rows.append(bytes(row))
    return png(size, size, b"".join(rows))


def png(w, h, raw):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def svg(maskable=False):
    roof, body, door = _shapes(MASKABLE_SCALE if maskable else 1.0)
    hexc = lambda c: "#%02x%02x%02x" % c  # noqa: E731
    n = lambda v: f"{v:.1f}".rstrip("0").rstrip(".")  # noqa: E731
    rx = 0 if maskable else RADIUS
    pts = " ".join(f"{n(x)},{n(y)}" for x, y in roof)
    rect = lambda r, fill: f'<rect x="{n(r[0])}" y="{n(r[1])}" width="{n(r[2] - r[0])}" height="{n(r[3] - r[1])}" fill="{fill}"/>'  # noqa: E731
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
            f'<rect width="512" height="512" rx="{rx}" fill="{hexc(TILE)}"/>'
            f'<polygon points="{pts}" fill="{hexc(GLYPH)}"/>{rect(body, hexc(GLYPH))}{rect(door, hexc(TILE))}</svg>\n')


def main():
    ICONS.mkdir(parents=True, exist_ok=True)
    (ICONS / "icon.svg").write_text(svg(), encoding="utf-8")
    (ICONS / "icon-maskable.svg").write_text(svg(maskable=True), encoding="utf-8")
    for name, size, mask in (("icon-192.png", 192, False), ("icon-512.png", 512, False), ("icon-maskable-512.png", 512, True)):
        (ICONS / name).write_bytes(render(size, mask))
        print(f"wrote app/icons/{name}")
    print("wrote app/icons/icon.svg, icon-maskable.svg")


if __name__ == "__main__":
    main()
