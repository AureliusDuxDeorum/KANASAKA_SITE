#!/usr/bin/env python3
"""Render the "KS" mark in Tektur, then generate the favicon assets from it."""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "images" / "kanasaka-logo.png"
FONT = ROOT / "assets" / "fonts" / "Tektur-SemiBold.ttf"
ICONS_DIR = ROOT / "assets" / "icons"


def crop_center_square(image: Image.Image) -> Image.Image:
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side))


def render_source(side: int = 1024, fill: float = 0.82) -> Image.Image:
    """White "KS" (Tektur 600) centred on black; ink spans `fill` of the width."""
    image = Image.new("RGBA", (side, side), (0, 0, 0, 255))
    draw = ImageDraw.Draw(image)
    size = 100
    font = ImageFont.truetype(str(FONT), size)
    left, top, right, bottom = draw.textbbox((0, 0), "KS", font=font)
    size = int(size * side * fill / (right - left))
    font = ImageFont.truetype(str(FONT), size)
    left, top, right, bottom = draw.textbbox((0, 0), "KS", font=font)
    x = (side - (right - left)) / 2 - left
    y = (side - (bottom - top)) / 2 - top
    draw.text((x, y), "KS", font=font, fill=(255, 255, 255, 255))
    return image


def main() -> None:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    render_source().save(SOURCE, format="PNG")
    print(f"  wrote {SOURCE.relative_to(ROOT)}")

    source = Image.open(SOURCE).convert("RGBA")
    square = crop_center_square(source)

    sizes = {
        "favicon-16x16.png": 16,
        "favicon-32x32.png": 32,
        "icon-192.png": 192,
        "apple-touch-icon.png": 180,
        "icon-512.png": 512,
    }

    for name, size in sizes.items():
        resized = square.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(ICONS_DIR / name, format="PNG")
        print(f"  wrote assets/icons/{name}")

    square.resize((32, 32), Image.Resampling.LANCZOS).save(
        ICONS_DIR / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32)],
    )
    print("  wrote assets/icons/favicon.ico")

    (ROOT / "favicon.ico").write_bytes((ICONS_DIR / "favicon.ico").read_bytes())
    print("  wrote favicon.ico")

    manifest = {
        "name": "KANASAKA",
        "short_name": "KANASAKA",
        "description": "Software, AI systems, and local-first infrastructure.",
        "start_url": "/",
        "display": "browser",
        "background_color": "#000000",
        "theme_color": "#000000",
        "icons": [
            {
                "src": "/assets/icons/icon-192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any",
            },
            {
                "src": "/assets/icons/icon-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any",
            },
            {
                "src": "/assets/icons/icon-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "maskable",
            },
        ],
    }

    manifest_path = ROOT / "site.webmanifest"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("  wrote site.webmanifest")


if __name__ == "__main__":
    main()
