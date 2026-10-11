"""Builds the installed-app icons from the official logo layers.

Usage: python scripts/make-pwa-icons.py
Reads public/brand/classic.png (the logo without the season, white with real alpha, made by make-brand-layers.py)
and writes:
  public/icons/icon-192.png, icon-512.png   manifest "any" icons: the white mark on field navy, 8% margin
  public/icons/maskable-512.png             manifest "maskable": every logo pixel inside the 80% safe circle
  public/icons/badge-96.png                 Android status-bar badge: white on transparent, the triangle and pulse
  src/app/apple-icon.png                    iPhone home screen (180 px): clear of iOS's rounded corners
Field navy is the site's --field token (#1e3d62), so the splash, the icon and the app's own bars match.
"""
from math import hypot
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
icons = root / "public" / "icons"
icons.mkdir(parents=True, exist_ok=True)
FIELD = (0x1E, 0x3D, 0x62, 255)

mark = Image.open(root / "public" / "brand" / "classic.png").convert("RGBA")
mark = mark.crop(mark.split()[3].point(lambda v: 255 if v > 24 else 0).getbbox())
alpha = mark.split()[3]
mw, mh = mark.size


def reach(img_alpha):
    """Farthest visible pixel from the centre of the mark, in mark pixels."""
    w, h = img_alpha.size
    cx, cy = w / 2, h / 2
    px = img_alpha.load()
    far = 0.0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if px[x, y] > 24:
                far = max(far, hypot(x - cx, y - cy))
    return far


REACH = reach(alpha)


def white_mark(scale):
    size = (max(1, round(mw * scale)), max(1, round(mh * scale)))
    a = alpha.resize(size, Image.LANCZOS)
    out = Image.new("RGBA", size, (255, 255, 255, 0))
    out.putalpha(a)
    return out


def on_field(side, scale):
    # Drawn at 4x and scaled down, so thin strokes stay smooth at 192 px.
    big = side * 4
    canvas = Image.new("RGBA", (big, big), FIELD)
    m = white_mark(scale * 4)
    canvas.alpha_composite(m, ((big - m.width) // 2, (big - m.height) // 2))
    return canvas.resize((side, side), Image.LANCZOS).convert("RGB")


def fit_box(side, margin):
    return (side * (1 - 2 * margin)) / max(mw, mh)


def fit_circle(side, radius_share):
    return (side * radius_share) / REACH


for side in (192, 512):
    on_field(side, fit_box(side, 0.08)).save(icons / f"icon-{side}.png", optimize=True)

# Maskable: the safe zone is a circle of radius 40% of the icon. 0.38 leaves a hair of room.
on_field(512, fit_circle(512, 0.38)).save(icons / "maskable-512.png", optimize=True)

# iOS clips to a rounded square (about 22% corner radius). A 10% margin keeps the triangle's corners and the
# wordmark clear of the curve.
on_field(180, fit_box(180, 0.10)).save(root / "src" / "app" / "apple-icon.png", optimize=True)

# Badge: Android shows only its alpha, tiny, in the status bar. The full tiger would be a smudge at that size, so
# this is the logo's two simplest parts as geometry: the triangle and the heartbeat line through it.
S = 96 * 8
badge = Image.new("L", (S, S), 0)
d = ImageDraw.Draw(badge)
stroke = round(S * 0.085)
apex, left, right = (S * 0.5, S * 0.08), (S * 0.06, S * 0.86), (S * 0.94, S * 0.86)
d.line([left, apex, right, left], fill=255, width=stroke, joint="curve")
for p in (apex, left, right):
    r = stroke / 2
    d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=255)
y = S * 0.62
pulse = [
    (S * 0.20, y), (S * 0.40, y), (S * 0.46, y - S * 0.10), (S * 0.53, y + S * 0.16),
    (S * 0.60, y - S * 0.26), (S * 0.66, y), (S * 0.80, y),
]
d.line(pulse, fill=255, width=round(stroke * 0.8), joint="curve")
badge = badge.resize((96, 96), Image.LANCZOS)
out = Image.new("RGBA", (96, 96), (255, 255, 255, 0))
out.putalpha(badge)
out.save(icons / "badge-96.png", optimize=True)

print(f"mark {mw}x{mh}, reach {REACH:.0f}px; maskable scale {fit_circle(512, 0.38):.3f}")
