"""Builds the tiger-only mark (no triangle, no wordmark) from the official light logo.

Usage: python scripts/make-tiger.py
Reads scripts/brand-src/logo-light-src.webp and writes public/brand/tiger-mask.png
(white artwork with real alpha, cropped; tinted per theme in CSS like logo-mask.png).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

root = Path(__file__).resolve().parent.parent
light = Image.open(root / "scripts" / "brand-src" / "logo-light-src.webp").convert("RGB")
g = ImageOps.grayscale(light)
w, h = g.size

# Same alpha extraction as make-logo.py.
bg = sum(g.getpixel(p) for p in [(5, 5), (w - 6, 5), (5, h - 6), (w - 6, h - 6)]) / 4
hist, acc, ink = g.histogram(), 0, 0
for ink in range(256):
    acc += hist[ink]
    if acc > w * h * 0.01:
        break
span = max(bg - ink - 6, 1)
alpha = g.point(lambda v: max(0, min(255, int((bg - 6 - v) * 255 / span))))

erase = ImageDraw.Draw(alpha)
# Wordmark and year (source coordinates, 1024 px art).
for box in [(130, 606, 440, 698), (470, 650, 662, 700), (130, 698, 672, 792)]:
    erase.rectangle(box, fill=0)
# Triangle, fitted from the art: both sides have slope 0.6 px across per px down.
# Left side and base go entirely; the right side only where the tiger doesn't cover it.
left = lambda y: (450 - 0.6 * (y - 90), y)
right = lambda y: (462 + 0.6 * (y - 70), y)
erase.line([left(30), left(540)], fill=0, width=24)
erase.line([right(30), right(242)], fill=0, width=24)
erase.line([right(600), right(800)], fill=0, width=34)
erase.rectangle((725, 768, 910, 795), fill=0)

bbox = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
pad = 6
bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad))
mask = Image.new("RGBA", (w, h), (255, 255, 255, 0))
mask.putalpha(alpha)
out = mask.crop(bbox)
out.save(root / "public" / "brand" / "tiger-mask.png", optimize=True)
print(f"tiger={out.size[0]}x{out.size[1]} bbox={bbox}")
