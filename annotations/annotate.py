#!/usr/bin/env python3
import sys
import json
import shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

def main():
    # Usage: annotate.py render0.png ... renderN.png ref0.png ... diff.json output_dir
    args = sys.argv[1:]
    if len(args) < 3:
        print("Usage: annotate.py <render>... <reference>... <diff.json> <output_dir>")
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
        font = ImageFont.truetype("arial.ttf", 30)
    except:
        font = ImageFont.load_default()

    THUMB = 1024
    PADDING = 8

    for idx, entry in enumerate(entries):
        r = entry.get("renderIndex", -1)
        f = entry.get("referenceIndex", -1)
        # support both singular 'issue' and plural 'issues'
        raw_issues = entry.get("issues") or entry.get("issue") or []
        issues = raw_issues if isinstance(raw_issues, list) else [raw_issues]
        bbox     = entry.get("bbox", [0,0,0,0])
        severity = entry.get("severity", "low")

        # Skip out-of-range
        if r < 0 or r >= len(renders) or f < 0 or f >= len(references):
            continue

        # Load + resize
        img_r = Image.open(renders[r]).convert("RGBA").resize((THUMB, THUMB))
        img_f = Image.open(references[f]).convert("RGBA").resize((THUMB, THUMB))

        # Side-by-side canvas in RGBA
        canvas = Image.new("RGBA", (THUMB*2, THUMB), (255,255,255,255))
        canvas.paste(img_r, (0, 0))
        canvas.paste(img_f, (THUMB, 0))

        draw = ImageDraw.Draw(canvas)

        # Draw box on render side
        x, y, w, h = bbox
        colors = {"low":"green","medium":"orange","high":"red"}
        box_color = colors.get(severity, "red")
        # draw.rectangle([(x, y), (x+w, y+h)], outline=box_color, width=6)

        # Draw each issue as separate label
        y_cursor = y - PADDING
        for issue in issues:
            if not issue:
                continue
            # Measure text size
            tb = draw.textbbox((0,0), issue, font=font)
            tw = tb[2] - tb[0]
            th = tb[3] - tb[1]
            # Position above the box, wrap inside render
            tx = x
            ty = y_cursor - th
            if ty < 0:
                ty = y + h + PADDING
            # Background
            draw.rectangle(
                [(tx-PADDING, ty-PADDING), (tx+tw+PADDING, ty+th+PADDING)],
                fill=(255,255,255,230)
            )
            # Text in black for visibility
            draw.text((tx, ty), issue, fill="black", font=font)
            y_cursor = ty - PADDING

        # Save output image
        output = canvas.convert("RGB")
        out_path = out_dir / f"annot_{idx}_r{r}_ref{f}.png"
        output.save(out_path)

if __name__ == "__main__":
    main()
