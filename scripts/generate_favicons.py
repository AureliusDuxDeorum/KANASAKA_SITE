#!/usr/bin/env python3
"""Generate favicon assets from the KANASAKA logo source image."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(
    "/home/prometheus/.cursor/projects/home-prometheus-KANASAKA-SITE/assets/"
    "image-129df45b-2a86-4113-a3b1-8ec7bd752bf8.png"
)
ICONS_DIR = ROOT / "assets" / "icons"
IMAGES_DIR = ROOT / "assets" / "images"


def crop_center_square(image: Image.Image) -> Image.Image:
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side))


def main() -> None:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    source = Image.open(SOURCE).convert("RGBA")
    IMAGES_DIR.joinpath("kanasaka-logo.png").write_bytes(SOURCE.read_bytes())

    square = crop_center_square(source)

    sizes = {
        "favicon-16x16.png": 16,
        "favicon-32x32.png": 32,
        "apple-touch-icon.png": 180,
        "icon-512.png": 512,
    }

    ico_images = []
    for name, size in sizes.items():
        resized = square.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(ICONS_DIR / name, format="PNG")
        if size in (16, 32):
            ico_images.append(resized)
        print(f"  wrote assets/icons/{name}")

    square.resize((32, 32), Image.Resampling.LANCZOS).save(
        ICONS_DIR / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32)],
    )
    print("  wrote assets/icons/favicon.ico")

    (ROOT / "favicon.ico").write_bytes((ICONS_DIR / "favicon.ico").read_bytes())
    print("  wrote favicon.ico")


if __name__ == "__main__":
    main()
