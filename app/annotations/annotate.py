#!/usr/bin/env python3
import sys
import json
import shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

def main():
    # Usage:
    #   annotate.py render0.png ... render3.png ref0.png ... diff.json output_dir
    args = sys.argv[1:]
    if len(args) < 3:
        print(
            "Usage: annotate.py <render0>..<render3> <ref0>..<refN> <diff.json> <output_dir>"
        )
        sys.exit(1)

    diff_path = Path(args[-2])
    out_dir   = Path(args[-1])
    files     = args[:-2]

    # First 4 are renders, rest are references
    renders    = files[:4]
    references = files[4:]

    # Clear previous output
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Load diff JSON
    diff = json.loads(diff_path.read_bytes())
    entries = diff.get("differences", [])

    # Prepare font
    try:
        font = ImageFont.truetype("arial.ttf", 20)
    except:
        font = ImageFont.load_default()

    THUMB = 1024

    for idx, entry in enumerate(entries):
        r = entry.get("renderIndex", -1)
        f = entry.get("referenceIndex", -1)
        issues = entry.get("issues", [])
        if not isinstance(issues, list):
            issues = [issues]
        bbox     = entry.get("bbox", [0,0,0,0])
        severity = entry.get("severity", "low")

        # Skip out‐of‐range
        if r < 0 or r >= len(renders) or f < 0 or f >= len(references):
            continue

        # Load + resize
        img_r = Image.open(renders[r]).convert("RGB").resize((THUMB, THUMB))
        img_f = Image.open(references[f]).convert("RGB").resize((THUMB, THUMB))

        # Side‐by‐side canvas
        canvas = Image.new("RGB", (THUMB*2, THUMB*2), (255,255,255))
        canvas.paste(img_r, (0, 0))
        canvas.paste(img_f, (THUMB, 0))

        draw = ImageDraw.Draw(canvas)

        # We are no longer drawing the bounding‐box rectangle itself
        # x, y, w, h = bbox
        # colors = {"low":"green","medium":"orange","high":"red"}
        # c = colors.get(severity, "red")
        # draw.rectangle([(x, y), (x+w, y+h)], outline=c, width=6)

        # Issue text: only first issue, ensure visible
        text = issues[0] if issues else ""
        if text:
            # Measure text
            tb = draw.textbbox((0,0), text, font=font)
            tw = tb[2] - tb[0]
            th = tb[3] - tb[1]

            # Place text near the top‐left of the original bbox
            x, y, w_box, h_box = bbox
            tx = x
            ty = y - th - 8
            if ty < 0:
                ty = y + h_box + 8

            # Draw semi-transparent background
            bg_xy = [(tx-4, ty-4), (tx+tw+4, ty+th+4)]
            draw.rectangle(bg_xy, fill=(255,255,255,200))

            # Draw text in severity color
            colors = {"low":"green","medium":"orange","high":"red"}
            c = colors.get(severity, "red")
            draw.text((tx, ty), text, fill=c, font=font)

        # Save individual annotated image
        out_path = out_dir / f"annot_{idx}_r{r}_ref{f}.png"
        canvas.save(out_path)

if __name__ == "__main__":
    main()
