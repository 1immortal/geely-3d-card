#!/usr/bin/env python3
"""Download the Geely EX5 360° frames for one color and convert them for geely-ex5-card.

The frames come from geely.com's public 360° viewer and are copyrighted by Geely.
They are NOT distributed with this repository; this script fetches them for your
own personal use only.

Usage:
    python3 scripts/fetch_images.py [color] [output_dir]

    color       silver (default), grey, green, black or white
    output_dir  default: ./images/<color>

Requires: Python 3.8+ and Pillow (pip install pillow).
Output: 1.webp … 24.webp, 900x456 px, transparent background.
Copy the folder to /config/www/geely-ex5/<color>/ in Home Assistant.
"""
import io
import os
import sys
import urllib.request

COLORS = ("silver", "grey", "green", "black", "white")
URL = "https://www.geely.com/-/media/project/web-portal/models/ex5/model-colors/new/{c}/ex5-{c}---{n}.png"
FRAMES = 24
CROP = (0, 235, 1500, 995)   # source frames are 1500x1000 with ~235 px empty space on top
SIZE = (900, 456)            # output size (keeps the cropped aspect ratio)


def main():
    try:
        from PIL import Image
    except ImportError:
        sys.exit("Pillow is required: pip install pillow")

    color = (sys.argv[1] if len(sys.argv) > 1 else "silver").lower()
    if color not in COLORS:
        sys.exit(f"Unknown color '{color}'. Choose one of: {', '.join(COLORS)}")
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join("images", color)
    os.makedirs(out, exist_ok=True)

    total = 0
    for n in range(1, FRAMES + 1):
        url = URL.format(c=color, n=n)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (geely-ex5-card image fetcher)"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        im = Image.open(io.BytesIO(data)).convert("RGBA")
        if im.size != (1500, 1000):
            im = im.resize((1500, 1000), Image.LANCZOS)
        im = im.crop(CROP).resize(SIZE, Image.LANCZOS)
        path = os.path.join(out, f"{n}.webp")
        im.save(path, "WEBP", quality=80, method=6)
        size = os.path.getsize(path)
        total += size
        print(f"[{n:2d}/{FRAMES}] {path} ({size // 1024} KB)")
    print(f"Done: {FRAMES} frames, {total // 1024} KB total in {out}")


if __name__ == "__main__":
    main()
