#!/usr/bin/env python3
"""
Generates the rich menu image for the LINE bot.

The rich menu is the permanent panel at the bottom of the chat, so it is the
only part of the bot a first-time user sees before typing anything. Six tiles,
laid out 3x2 over LINE's 2500x1686 canvas.

Usage:
    python3 scripts/richmenu/generate-image.py [--font PATH] [--out PATH]

Needs Pillow and a Japanese TTF (Noto Sans JP recommended).
"""

import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 2500, 1686
COLS, ROWS = 3, 2
CELL_W, CELL_H = WIDTH // COLS, HEIGHT // ROWS

GROUND = (243, 246, 247)
DIVIDER = (219, 227, 229)
INK = (16, 22, 25)
MUTED = (111, 124, 131)

TEAL = (14, 90, 99)
GREEN = (47, 158, 68)
GREY = (122, 134, 140)
BLUE = (28, 95, 192)
RED = (190, 59, 44)

FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
    "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
    "/System/Library/Fonts/ttf/HiraginoSans-W6.ttc",
]

TILES = [
    {"label": "日付を追加", "hint": "カレンダーから選ぶ", "icon": "calendar", "color": TEAL},
    {"label": "監視開始", "hint": "空きを探しはじめる", "icon": "play", "color": GREEN},
    {"label": "監視停止", "hint": "いったん止める", "icon": "pause", "color": GREY},
    {"label": "状態", "hint": "いまの設定を見る", "icon": "status", "color": BLUE},
    {"label": "日付を削除", "hint": "監視をやめる日を選ぶ", "icon": "trash", "color": RED},
    {"label": "使い方", "hint": "はじめての方はこちら", "icon": "help", "color": TEAL},
]


def find_font(explicit):
    """Returns a usable Japanese TTF path, or exits with an explanation."""
    if explicit:
        return explicit
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return path
    sys.exit(
        "No Japanese font found. Pass --font /path/to/NotoSansJP.ttf "
        "(download from https://fonts.google.com/noto/specimen/Noto+Sans+JP)."
    )


def rounded_outline(draw, box, radius, color, width):
    draw.rounded_rectangle(box, radius=radius, outline=color, width=width)


def draw_calendar(draw, cx, cy, size, color):
    half = size // 2
    body = (cx - half, cy - half + size * 0.10, cx + half, cy + half)
    rounded_outline(draw, body, size * 0.12, color, max(3, size // 18))
    # Hanging rings
    ring_w = max(3, size // 18)
    for offset in (-0.24, 0.24):
        x = cx + size * offset
        draw.line(
            [(x, cy - half - size * 0.02), (x, cy - half + size * 0.18)],
            fill=color,
            width=ring_w,
        )
    # Header rule
    header_y = cy - half + size * 0.32
    draw.line(
        [(cx - half, header_y), (cx + half, header_y)], fill=color, width=ring_w
    )
    # Day cells
    cell = size * 0.13
    gap = size * 0.075
    start_x = cx - (cell * 3 + gap * 2) / 2
    for row in range(2):
        for col in range(3):
            x0 = start_x + col * (cell + gap)
            y0 = header_y + size * 0.14 + row * (cell + gap)
            filled = row == 1 and col == 1
            draw.rounded_rectangle(
                (x0, y0, x0 + cell, y0 + cell),
                radius=cell * 0.3,
                fill=color if filled else None,
                outline=color,
                width=max(2, size // 30),
            )


def draw_play(draw, cx, cy, size, color):
    half = size // 2
    draw.ellipse(
        (cx - half, cy - half, cx + half, cy + half),
        outline=color,
        width=max(3, size // 16),
    )
    t = size * 0.24
    draw.polygon(
        [
            (cx - t * 0.75, cy - t),
            (cx - t * 0.75, cy + t),
            (cx + t * 0.95, cy),
        ],
        fill=color,
    )


def draw_pause(draw, cx, cy, size, color):
    half = size // 2
    draw.ellipse(
        (cx - half, cy - half, cx + half, cy + half),
        outline=color,
        width=max(3, size // 16),
    )
    bar_w = size * 0.11
    bar_h = size * 0.42
    for offset in (-0.16, 0.16):
        x = cx + size * offset
        draw.rounded_rectangle(
            (x - bar_w / 2, cy - bar_h / 2, x + bar_w / 2, cy + bar_h / 2),
            radius=bar_w * 0.4,
            fill=color,
        )


def draw_status(draw, cx, cy, size, color):
    half = size // 2
    rounded_outline(
        draw,
        (cx - half, cy - half, cx + half, cy + half),
        size * 0.12,
        color,
        max(3, size // 18),
    )
    line_w = max(3, size // 20)
    dot_r = size * 0.045
    for index, length in enumerate((0.42, 0.30, 0.36)):
        y = cy - size * 0.20 + index * size * 0.20
        draw.ellipse(
            (
                cx - half + size * 0.16 - dot_r,
                y - dot_r,
                cx - half + size * 0.16 + dot_r,
                y + dot_r,
            ),
            fill=color,
        )
        x0 = cx - half + size * 0.28
        draw.line([(x0, y), (x0 + size * length, y)], fill=color, width=line_w)


def draw_trash(draw, cx, cy, size, color):
    stroke = max(3, size // 18)
    half = size // 2
    # Lid
    lid_y = cy - half + size * 0.16
    draw.line(
        [(cx - half * 0.86, lid_y), (cx + half * 0.86, lid_y)],
        fill=color,
        width=stroke,
    )
    draw.line(
        [
            (cx - size * 0.13, lid_y - size * 0.10),
            (cx + size * 0.13, lid_y - size * 0.10),
        ],
        fill=color,
        width=stroke,
    )
    # Body
    draw.line(
        [(cx - half * 0.62, lid_y), (cx - half * 0.44, cy + half * 0.78)],
        fill=color,
        width=stroke,
    )
    draw.line(
        [(cx + half * 0.62, lid_y), (cx + half * 0.44, cy + half * 0.78)],
        fill=color,
        width=stroke,
    )
    draw.line(
        [
            (cx - half * 0.44, cy + half * 0.78),
            (cx + half * 0.44, cy + half * 0.78),
        ],
        fill=color,
        width=stroke,
    )
    for offset in (-0.16, 0.16):
        x = cx + size * offset
        draw.line(
            [(x, lid_y + size * 0.16), (x, cy + half * 0.58)],
            fill=color,
            width=max(2, stroke - 1),
        )


def draw_help(draw, cx, cy, size, color, font_path):
    half = size // 2
    draw.ellipse(
        (cx - half, cy - half, cx + half, cy + half),
        outline=color,
        width=max(3, size // 16),
    )
    font = ImageFont.truetype(font_path, int(size * 0.62))
    box = draw.textbbox((0, 0), "?", font=font)
    draw.text(
        (cx - (box[2] - box[0]) / 2 - box[0], cy - (box[3] - box[1]) / 2 - box[1]),
        "?",
        font=font,
        fill=color,
    )


ICONS = {
    "calendar": draw_calendar,
    "play": draw_play,
    "pause": draw_pause,
    "status": draw_status,
    "trash": draw_trash,
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--font", help="Path to a Japanese TTF/OTF")
    parser.add_argument(
        "--out",
        default=os.path.join(os.path.dirname(__file__), "richmenu.png"),
    )
    args = parser.parse_args()

    font_path = find_font(args.font)
    label_font = ImageFont.truetype(font_path, 76)
    hint_font = ImageFont.truetype(font_path, 44)

    image = Image.new("RGB", (WIDTH, HEIGHT), GROUND)
    draw = ImageDraw.Draw(image)

    for index, tile in enumerate(TILES):
        col, row = index % COLS, index // COLS
        x0, y0 = col * CELL_W, row * CELL_H
        cx, cy = x0 + CELL_W // 2, y0 + CELL_H // 2

        icon_size = 190
        icon_cy = cy - 90
        if tile["icon"] == "help":
            draw_help(draw, cx, icon_cy, icon_size, tile["color"], font_path)
        else:
            ICONS[tile["icon"]](draw, cx, icon_cy, icon_size, tile["color"])

        for text, font, color, dy in (
            (tile["label"], label_font, INK, 110),
            (tile["hint"], hint_font, MUTED, 200),
        ):
            box = draw.textbbox((0, 0), text, font=font)
            draw.text(
                (cx - (box[2] - box[0]) / 2 - box[0], cy + dy - box[1]),
                text,
                font=font,
                fill=color,
            )

    # Dividers, drawn last so tiles read as one grid
    for col in range(1, COLS):
        x = col * CELL_W
        draw.line([(x, 40), (x, HEIGHT - 40)], fill=DIVIDER, width=3)
    draw.line(
        [(40, CELL_H), (WIDTH - 40, CELL_H)], fill=DIVIDER, width=3
    )

    image.save(args.out, "PNG", optimize=True)
    size_kb = os.path.getsize(args.out) / 1024
    print(f"wrote {args.out} ({size_kb:.0f} KB)")
    if size_kb > 1024:
        sys.exit("Image exceeds LINE's 1 MB limit")


if __name__ == "__main__":
    main()
