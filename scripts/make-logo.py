"""Builds web logo assets from the two official logo images.

Usage: python scripts/make-logo.py
Reads scripts/brand-src/logo-{light,dark}-src.webp and writes:
  public/brand/logo-mask.png   white artwork with real alpha, cropped (tinted per theme in CSS)
  public/brand/logo-{light,dark}.webp  the originals
  src/app/icon.png, src/app/apple-icon.png  app icons from the dark version
"""
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent.parent
src_dir = root / "scripts" / "brand-src"
out = root / "public" / "brand"
app = root / "src" / "app"
out.mkdir(parents=True, exist_ok=True)

light = Image.open(src_dir / "logo-light-src.webp").convert("RGB")
dark = Image.open(src_dir / "logo-dark-src.webp").convert("RGB")
g = ImageOps.grayscale(light)
w, h = g.size

# Background luminance from the corners; ink from the darkest 1% of pixels.
bg = sum(g.getpixel(p) for p in [(5, 5), (w - 6, 5), (5, h - 6), (w - 6, h - 6)]) / 4
hist, acc, ink = g.histogram(), 0, 0
for ink in range(256):
    acc += hist[ink]
    if acc > w * h * 0.01:
        break
span = max(bg - ink - 6, 1)
alpha = g.point(lambda v: max(0, min(255, int((bg - 6 - v) * 255 / span))))

bbox = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
pad = 8
bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad))

mask = Image.new("RGBA", (w, h), (255, 255, 255, 0))
mask.putalpha(alpha)
mask.crop(bbox).save(out / "logo-mask.png", optimize=True)
light.save(out / "logo-light.webp", quality=90)
dark.save(out / "logo-dark.webp", quality=90)

side = max(bbox[2] - bbox[0], bbox[3] - bbox[1])
cx, cy = (bbox[0] + bbox[2]) // 2, (bbox[1] + bbox[3]) // 2
half = side // 2
icon = dark.crop((max(0, cx - half), max(0, cy - half), min(w, cx + half), min(h, cy + half))).resize((512, 512), Image.LANCZOS)
icon.save(app / "icon.png", optimize=True)
icon.resize((180, 180), Image.LANCZOS).save(app / "apple-icon.png", optimize=True)

print(f"bg={bg:.0f} ink={ink} mask={bbox[2] - bbox[0]}x{bbox[3] - bbox[1]}")
