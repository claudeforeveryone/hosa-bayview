"""Makes the link-preview card: src/app/opengraph-image.png and src/app/twitter-image.png (1200x630).

The chapter mark (public/brand/classic.png, white on transparent) in ice on the navy field, with the banner's own
tagline and one plain line saying what the site is. Square, flat, two colours: the same world as the sign-in page.
Fonts: Barlow Condensed Bold and Barlow Medium (SIL Open Font License), latin subsets in scripts/brand-src/fonts.

Run from the repo root: python scripts/make-og-image.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
MARK = ROOT / "public" / "brand" / "classic.png"
FONTS = ROOT / "scripts" / "brand-src" / "fonts"
OUTPUTS = [ROOT / "src" / "app" / "opengraph-image.png", ROOT / "src" / "app" / "twitter-image.png"]

W, H = 1200, 630
FIELD = (0x1E, 0x3D, 0x62)  # --field (light theme)
ON_FIELD = (0xE8, 0xF2, 0xFA)  # --on-field
ON_FIELD_2 = (0xB4, 0xCB, 0xE0)  # --on-field-2
MARGIN = 72


def tint(mask: Image.Image, colour: tuple[int, int, int]) -> Image.Image:
    solid = Image.new("RGBA", mask.size, colour + (255,))
    solid.putalpha(mask.getchannel("A"))
    return solid


def main() -> None:
    card = Image.new("RGBA", (W, H), FIELD + (255,))
    draw = ImageDraw.Draw(card)

    # The mark on the left, as tall as the card allows with the margin.
    mark = Image.open(MARK).convert("RGBA")
    mark_h = H - 2 * MARGIN + 24
    mark_w = round(mark.width * mark_h / mark.height)
    mark = tint(mark.resize((mark_w, mark_h), Image.LANCZOS), ON_FIELD)
    card.alpha_composite(mark, (MARGIN - 24, (H - mark_h) // 2))

    # The right column: a 3px rule (the app's box rule), the tagline, then what the site is.
    x = MARGIN - 24 + mark_w + 40
    display = ImageFont.truetype(str(FONTS / "BarlowCondensed-Bold-latin.ttf"), 112)
    body = ImageFont.truetype(str(FONTS / "Barlow-Medium-latin.ttf"), 34)
    small = ImageFont.truetype(str(FONTS / "Barlow-Medium-latin.ttf"), 26)

    top = 150
    draw.rectangle((x, top, W - MARGIN, top + 2), fill=ON_FIELD)
    y = top + 34
    for line in ("SHATTER", "EVERY LIMIT"):
        draw.text((x - 4, y), line, font=display, fill=ON_FIELD)
        y += 104
    y += 30
    for line in ("Practice tests, flashcards and", "leaderboards for chapter members."):
        draw.text((x, y), line, font=body, fill=ON_FIELD_2)
        y += 44
    draw.text((x, H - MARGIN - 26), "hosa-bayview.vercel.app", font=small, fill=ON_FIELD_2)

    flat = card.convert("RGB")
    for path in OUTPUTS:
        flat.save(path, format="PNG", optimize=True)
        print(path.relative_to(ROOT), flat.size, path.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
