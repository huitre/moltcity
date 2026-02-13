#!/usr/bin/env python3
"""Slice spritesheets into individual sprites by detecting non-background regions."""

from PIL import Image
from collections import deque
import os
import sys

SPRITE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SPRITE_DIR, "sliced")


def is_background_pixel(r, g, b, threshold=12):
    """Check if a pixel is part of the checkered background.
    Background is near-white (~255) or near-light-gray (~237),
    with all channels close together."""
    avg = (r + g + b) / 3
    spread = max(r, g, b) - min(r, g, b)
    return avg > 225 and spread < threshold


def flood_fill_background(img_rgba, visited):
    """Flood fill from all edges to mark background pixels."""
    w, h = img_rgba.size
    queue = deque()

    # Seed from all edge pixels
    for x in range(w):
        for y in [0, h - 1]:
            queue.append((x, y))
    for y in range(h):
        for x in [0, w - 1]:
            queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or x >= w or y < 0 or y >= h:
            continue
        idx = y * w + x
        if visited[idx]:
            continue

        r, g, b, a = img_rgba.getpixel((x, y))
        if not is_background_pixel(r, g, b):
            continue

        visited[idx] = True
        # 4-connected neighbors
        queue.append((x + 1, y))
        queue.append((x - 1, y))
        queue.append((x, y + 1))
        queue.append((x, y - 1))


def find_sprite_regions(visited, w, h, min_size=30):
    """Find connected regions of non-background (foreground) pixels."""
    regions = []
    region_visited = [False] * (w * h)

    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if visited[idx] or region_visited[idx]:
                continue

            # BFS to find this connected region
            min_x, min_y = x, y
            max_x, max_y = x, y
            queue = deque([(x, y)])
            region_pixels = 0

            while queue:
                cx, cy = queue.popleft()
                if cx < 0 or cx >= w or cy < 0 or cy >= h:
                    continue
                cidx = cy * w + cx
                if visited[cidx] or region_visited[cidx]:
                    continue
                region_visited[cidx] = True
                region_pixels += 1

                min_x = min(min_x, cx)
                min_y = min(min_y, cy)
                max_x = max(max_x, cx)
                max_y = max(max_y, cy)

                queue.append((cx + 1, cy))
                queue.append((cx - 1, cy))
                queue.append((cx, cy + 1))
                queue.append((cx, cy - 1))

            # Only keep regions above minimum size
            region_w = max_x - min_x + 1
            region_h = max_y - min_y + 1
            if region_w >= min_size and region_h >= min_size:
                regions.append((min_x, min_y, max_x + 1, max_y + 1, region_pixels))

    return regions


def merge_close_regions(regions, gap=5):
    """Merge regions that are very close together (they're part of the same sprite)."""
    if not regions:
        return regions

    merged = True
    while merged:
        merged = False
        new_regions = []
        used = set()
        for i in range(len(regions)):
            if i in used:
                continue
            x1, y1, x2, y2, p1 = regions[i]
            for j in range(i + 1, len(regions)):
                if j in used:
                    continue
                bx1, by1, bx2, by2, p2 = regions[j]
                # Check if bounding boxes overlap or are within gap distance
                if (x1 - gap <= bx2 and x2 + gap >= bx1 and
                    y1 - gap <= by2 and y2 + gap >= by1):
                    x1 = min(x1, bx1)
                    y1 = min(y1, by1)
                    x2 = max(x2, bx2)
                    y2 = max(y2, by2)
                    p1 += p2
                    used.add(j)
                    merged = True
            new_regions.append((x1, y1, x2, y2, p1))
            used.add(i)
        regions = new_regions

    return regions


def make_background_transparent(sprite_img):
    """Make background pixels transparent in a cropped sprite."""
    w, h = sprite_img.size
    pixels = sprite_img.load()

    # Flood fill from edges of the cropped sprite
    visited = [False] * (w * h)
    queue = deque()

    for x in range(w):
        for y_edge in [0, h - 1]:
            queue.append((x, y_edge))
    for y in range(h):
        for x_edge in [0, w - 1]:
            queue.append((x_edge, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or x >= w or y < 0 or y >= h:
            continue
        idx = y * w + x
        if visited[idx]:
            continue

        r, g, b, a = pixels[x, y]
        if not is_background_pixel(r, g, b):
            continue

        visited[idx] = True
        pixels[x, y] = (r, g, b, 0)  # Make transparent

        queue.append((x + 1, y))
        queue.append((x - 1, y))
        queue.append((x, y + 1))
        queue.append((x, y - 1))

    return sprite_img


def slice_spritesheet(filepath, output_prefix):
    """Slice a single spritesheet into individual sprites."""
    print(f"\nProcessing: {os.path.basename(filepath)}")

    img = Image.open(filepath).convert("RGBA")
    w, h = img.size

    # Step 1: Flood fill from edges to find background
    print("  Detecting background...")
    visited = [False] * (w * h)
    flood_fill_background(img, visited)

    # Step 2: Find connected foreground regions
    print("  Finding sprite regions...")
    regions = find_sprite_regions(visited, w, h, min_size=30)

    # Step 3: Merge close regions
    regions = merge_close_regions(regions, gap=3)

    # Filter out very small regions (artifacts)
    regions = [r for r in regions if r[4] > 500]  # At least 500 pixels

    # Sort by position: top-to-bottom, left-to-right
    regions.sort(key=lambda r: (r[1] // 50, r[0]))

    print(f"  Found {len(regions)} sprites")

    # Step 4: Crop and save each sprite
    sprites = []
    for i, (x1, y1, x2, y2, pixel_count) in enumerate(regions):
        # Add small padding
        pad = 2
        x1 = max(0, x1 - pad)
        y1 = max(0, y1 - pad)
        x2 = min(w, x2 + pad)
        y2 = min(h, y2 + pad)

        sprite = img.crop((x1, y1, x2, y2)).copy()
        sprite = make_background_transparent(sprite)

        output_path = os.path.join(OUTPUT_DIR, f"{output_prefix}_{i+1:02d}.png")
        sprite.save(output_path, "PNG")
        sprites.append((output_path, x2 - x1, y2 - y1))
        print(f"    Sprite {i+1}: {x2-x1}x{y2-y1}px -> {os.path.basename(output_path)}")

    return sprites


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Map filenames to descriptive prefixes based on content
    sheets = {
        "5105f598-3bc1-4fd5-81dd-79fbd74e6810.webp": "sheet01_houses",
        "03b526e6-19e9-46b4-abb8-4bddc7721455.webp": "sheet02_apartments",
        "0417f57c-dd3c-408b-9607-e49f1afa4300.webp": "sheet03_offices",
        "2024c37d-c1ff-4dfb-8a7a-fe57e7ceb101.webp": "sheet04_buildings",
        "3bd67344-3d43-4b6a-92d5-c22f6f54902e.webp": "sheet05_mixed",
        "74cd249f-0541-4209-9531-5c2e4ed4fd7a.webp": "sheet06_services",
        "890b883f-3533-458b-886a-da5479e33b5d.webp": "sheet07_blocks",
        "8d1048eb-2450-49e7-aef8-e3e43d4e4854.webp": "sheet08_cityscape",
        "93dfa59a-f66f-4663-b7f0-038be97e79bf.webp": "sheet09_emergency",
        "e4a50d2d-c548-4a4c-a8d7-7570d44c48ce.webp": "sheet10_suburban",
    }

    all_sprites = {}
    for filename, prefix in sorted(sheets.items(), key=lambda x: x[1]):
        filepath = os.path.join(SPRITE_DIR, filename)
        if os.path.exists(filepath):
            sprites = slice_spritesheet(filepath, prefix)
            all_sprites[prefix] = sprites

    # Summary
    total = sum(len(v) for v in all_sprites.values())
    print(f"\n{'='*50}")
    print(f"Total sprites extracted: {total}")
    for prefix, sprites in sorted(all_sprites.items()):
        print(f"  {prefix}: {len(sprites)} sprites")


if __name__ == "__main__":
    main()
