"""Splits the official logo into aligned layers for the classic mark and the banner intro.

Usage: python scripts/make-brand-layers.py
Reads scripts/brand-src/logo-light-src.webp and writes, all cropped to the same box so they stack exactly:
  public/brand/layer-tiger.png     tiger (with the heartbeat line)
  public/brand/layer-triangle.png  the triangle
  public/brand/layer-word.png      HOSA BAYVIEW (no season)
  public/brand/classic.png         the full logo without the season, for the static mark
The season ("2024-2025" in the art) is left out; the site sets it as live text instead.
Prints the crop box and the season box as percentages for the CSS.
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageOps

root = Path(__file__).resolve().parent.parent
out = root / "public" / "brand"
light = Image.open(root / "scripts" / "brand-src" / "logo-light-src.webp").convert("RGB")
g = ImageOps.grayscale(light)
w, h = g.size

bg = sum(g.getpixel(p) for p in [(5, 5), (w - 6, 5), (5, h - 6), (w - 6, h - 6)]) / 4
hist, acc, ink = g.histogram(), 0, 0
for ink in range(256):
    acc += hist[ink]
    if acc > w * h * 0.01:
        break
span = max(bg - ink - 6, 1)
alpha = g.point(lambda v: max(0, min(255, int((bg - 6 - v) * 255 / span))))

def region(draw_fn):
    m = Image.new("L", (w, h), 0)
    draw_fn(ImageDraw.Draw(m))
    return m

# The triangle's edges, fitted from the art's pixels.
left = lambda y: (450 - 0.6 * (y - 90), y)
right = lambda y: (462 + 0.6 * (y - 70), y)
YEAR = (470, 650, 662, 700)

def tri(d):
    d.line([left(30), left(540)], fill=255, width=24)
    d.line([right(30), right(242)], fill=255, width=24)
    d.line([right(600), right(800)], fill=255, width=34)
    d.rectangle((725, 768, 910, 795), fill=255)

def words(d):
    d.rectangle((130, 617, 440, 698), fill=255)
    d.rectangle((130, 698, 672, 792), fill=255)

year_m = region(lambda d: d.rectangle(YEAR, fill=255))
tri_m = ImageChops.subtract(region(tri), year_m)
word_m = ImageChops.subtract(region(words), tri_m)
not_year = ImageOps.invert(year_m)

layers = {
    "layer-triangle": ImageChops.multiply(alpha, tri_m),
    "layer-word": ImageChops.multiply(ImageChops.multiply(alpha, word_m), not_year),
}
rest = ImageChops.subtract(ImageChops.subtract(alpha, layers["layer-triangle"]), layers["layer-word"])
layers["layer-tiger"] = ImageChops.multiply(rest, not_year)
layers["classic"] = ImageChops.multiply(alpha, not_year)

bbox = layers["classic"].point(lambda v: 255 if v > 40 else 0).getbbox()
pad = 8
box = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad))
for name, a in layers.items():
    img = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    img.putalpha(a)
    img.crop(box).save(out / f"{name}.png", optimize=True)

# Where the season sat, as fractions of the crop, from its actual ink.
yb = ImageChops.multiply(alpha, year_m).point(lambda v: 255 if v > 60 else 0).getbbox()
cw, ch = box[2] - box[0], box[3] - box[1]
print(f"crop={box} size={cw}x{ch}")
print(f"season left={(yb[0]-box[0])/cw*100:.2f}% top={(yb[1]-box[1])/ch*100:.2f}% width={(yb[2]-yb[0])/cw*100:.2f}% height={(yb[3]-yb[1])/ch*100:.2f}%")
tb = layers["layer-tiger"].point(lambda v: 255 if v > 40 else 0).getbbox()
print(f"tiger left={(tb[0]-box[0])/cw*100:.2f}% top={(tb[1]-box[1])/ch*100:.2f}% right={(tb[2]-box[0])/cw*100:.2f}% bottom={(tb[3]-box[1])/ch*100:.2f}%")
