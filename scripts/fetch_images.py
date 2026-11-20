#!/usr/bin/env python3
"""Download the 360° frames of a Geely model/colour and convert them for geely-3d-card.

The frames come from Geely's public websites (geely.com, geely.com.au and Geely Europe) and are
copyrighted by Geely. They are NOT distributed with this repository; this script
fetches them for your own personal use only.

Usage:
    python3 scripts/fetch_images.py --list
    python3 scripts/fetch_images.py --model ex5 --color silver
    python3 scripts/fetch_images.py --model e5 --color silver
    python3 scripts/fetch_images.py --model ex2 --color star-silver [--variant 2]
    python3 scripts/fetch_images.py --model starray_emi --color cloudveil-silver [--remove-background]

Options:
    --model              ex5 (default) | e5 | ex2 | starray_emi
    --color              colour slug (see --list); default = the model's default colour
    --out DIR            output folder, default ./images/<model>/<color>
    --variant N          (ex2 / starray_emi) which trim's frame set to use, 1-based; default = first complete set
    --remove-background  (e5 / ex2 / starray_emi) experimental: cut the car out of the studio background
    --list               print the models and their colours

Requires Python 3.8+, Pillow (pip install pillow); --remove-background also needs numpy and scipy.
Output: 1.webp … 24.webp, 900x456 px. Copy the folder to /config/www/geely-ex5/<model>/<color>/.
"""
import argparse
import io
import json
import os
import re
import sys
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (geely-3d-card image fetcher)"}
OUT_W, OUT_H = 900, 456

MODELS = {
    "ex5": {
        "name": "Geely EX5", "source": "geely.com", "transparent": True,
        "colors": ["silver", "grey", "green", "black", "white"], "default": "silver",
        "url": "https://www.geely.com/-/media/project/web-portal/models/ex5/model-colors/new/{c}/ex5-{c}---{n}.png",
        "frames": 24, "crop": (0, 235, 1500, 995),   # 1500x1000 source, empty space on top
    },
    "e5": {
        "name": "Geely E5", "source": "geely.de (Geely Europe)", "transparent": False,
        "colors": ["silver", "gray", "white", "black", "green"], "default": "silver",
        # Geely Europe's 360° viewer (www.geely.de/models/geely-e5-electric-suv): 2100x1050 JPGs on white, 00 … 23
        "url": "https://assets.geelyauto.eu/__frames__/exterior/geely-e5/lhd/23f/{c}/{n:02d}.jpg",
        "frames": 24, "first": 0,
    },
    "ex2": {
        "name": "Geely EX2", "source": "geely.com.au", "transparent": False,
        "page": "https://www.geely.com.au/build/geely-ex2", "default": "star-silver",
    },
    "starray_emi": {
        "name": "Geely Starray EM-i", "source": "geely.com.au", "transparent": False,
        "page": "https://www.geely.com.au/build/starray-em-i", "default": "cloudveil-silver",
    },
}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def au_colour_sets(page_url):
    """Parse the Geely Australia configurator page (Next.js RSC payload) into {colour-slug: [frame-set, ...]}."""
    html = get(page_url).decode("utf-8", "replace")
    chunks = re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', html)
    data = "".join(json.loads(c) for c in chunks)
    recs = {}
    for m in re.finditer(r"(?m)^([0-9a-f]+):(.*)$", data):
        try:
            recs[m.group(1)] = json.loads(m.group(2))
        except ValueError:
            pass
    out = {}
    for v in recs.values():
        if not (isinstance(v, dict) and "name" in v and isinstance(v.get("images"), str) and v["images"].startswith("$")):
            continue
        img = recs.get(v["images"][1:])
        if not (isinstance(img, dict) and isinstance(img.get("full_view"), str)):
            continue
        frames = recs.get(img["full_view"][1:])
        if isinstance(frames, list) and frames:
            frames = sorted(frames, key=lambda u: int((re.findall(r"(\d+)\.\w+$", u) or ["0"])[0]))
            out.setdefault(slug(v["name"]), []).append(frames)
    if not out:
        sys.exit(f"Could not find any 360° frame sets on {page_url} - the page layout may have changed.")
    return out


def key_out(im, low=30):
    """Experimental: studio frame -> RGBA, flat background removed, floor shadow kept as a soft black shadow."""
    import numpy as np
    from PIL import Image
    from scipy import ndimage
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    diff = np.abs(a - bg).max(axis=2)
    lab, _ = ndimage.label(diff < low)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(edge))
    dark = np.clip((bg.mean() - a.mean(axis=2)) / bg.mean(), 0, 1)
    out = np.zeros(a.shape[:2] + (4,), np.float32)
    out[..., :3] = a
    out[..., 3] = 255
    out[bgmask, :3] = 0
    out[bgmask, 3] = np.clip(dark * 2.2, 0, 1)[bgmask] * 255
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGBA")


def studio_box(images, pad=0.04):
    """One crop box (same for every frame, so the car does not jump) around the car, at the card's aspect ratio."""
    from PIL import ImageChops, Image
    box = None
    for im in images:
        rgb = im.convert("RGB")
        bg = Image.new("RGB", rgb.size, rgb.getpixel((3, 3)))
        diff = ImageChops.difference(rgb, bg).convert("L").point(lambda v: 255 if v > 24 else 0)
        b = diff.getbbox()
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    w, h = images[0].size
    if not box:
        return (0, 0, w, h)
    x0, y0, x1, y1 = box
    bw, bh = (x1 - x0) * (1 + 2 * pad), (y1 - y0) * (1 + 2 * pad)
    aspect = OUT_W / OUT_H
    if bw / bh < aspect:
        bw = bh * aspect
    else:
        bh = bw / aspect
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    bw, bh = min(bw, w), min(bh, h)
    left = min(max(cx - bw / 2, 0), w - bw)
    top = min(max(cy - bh / 2, 0), h - bh)
    return tuple(int(round(v)) for v in (left, top, left + bw, top + bh))


def main():
    try:
        from PIL import Image
    except ImportError:
        sys.exit("Pillow is required: pip install pillow")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="ex5", choices=sorted(MODELS))
    ap.add_argument("--color")
    ap.add_argument("--out")
    ap.add_argument("--variant", type=int)
    ap.add_argument("--remove-background", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("legacy", nargs="*", help=argparse.SUPPRESS)   # old form: fetch_images.py <color> [out]
    a = ap.parse_args()
    if a.legacy:
        a.color = a.color or a.legacy[0]
        if len(a.legacy) > 1:
            a.out = a.out or a.legacy[1]

    if a.list:
        for key, m in MODELS.items():
            colours = m.get("colors") or sorted(au_colour_sets(m["page"]))
            print(f"{key:12s} {m['name']:20s} ({m['source']}): {', '.join(colours)}  [default {m['default']}]")
        return

    m = MODELS[a.model]
    color = (a.color or m["default"]).lower()
    out = a.out or os.path.join("images", a.model, color)

    if "url" in m:
        if color not in m["colors"]:
            sys.exit(f"Unknown colour '{color}' for {a.model}. Choose one of: {', '.join(m['colors'])}")
        first = m.get("first", 1)
        urls = [m["url"].format(c=color, n=n) for n in range(first, first + m["frames"])]
    else:
        sets = au_colour_sets(m["page"])
        if color not in sets:
            sys.exit(f"Unknown colour '{color}' for {a.model}. Choose one of: {', '.join(sorted(sets))}")
        cand = sets[color]
        if a.variant:
            if not 1 <= a.variant <= len(cand):
                sys.exit(f"--variant must be 1..{len(cand)} for this colour")
            urls = cand[a.variant - 1]
        else:
            urls = next((s for s in cand if len(s) == 24), cand[0])
        urls = [u + "/m/1500x0" for u in urls]   # Storyblok image service: 1500 px wide is plenty

    os.makedirs(out, exist_ok=True)
    print(f"{m['name']} / {color}: {len(urls)} frames from {m['source']} -> {out}")
    frames = []
    for n, url in enumerate(urls, 1):
        frames.append(Image.open(io.BytesIO(get(url))))
        print(f"  downloaded {n}/{len(urls)}", end="\r")
    print()

    if m["transparent"]:
        box = m["crop"]
    else:
        box = studio_box(frames)
    total = 0
    for n, im in enumerate(frames, 1):
        if m["transparent"]:
            im = im.convert("RGBA")
            if im.size != (1500, 1000):
                im = im.resize((1500, 1000), Image.LANCZOS)
        elif a.remove_background:
            im = key_out(im)
        else:
            im = im.convert("RGB")
        im = im.crop(box).resize((OUT_W, OUT_H), Image.LANCZOS)
        path = os.path.join(out, f"{n}.webp")
        im.save(path, "WEBP", quality=80, method=6)
        total += os.path.getsize(path)
    print(f"Done: {len(frames)} frames, {total // 1024} KB total in {out}")
    if not m["transparent"] and not a.remove_background:
        print("These frames have a studio background; the card draws a matching panel behind them.")


if __name__ == "__main__":
    main()
