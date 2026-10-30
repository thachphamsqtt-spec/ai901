"""Tạo icon PNG cho PWA (Android cần PNG 192/512, iOS cần apple-touch-icon 180).

Cách dùng:
    python scripts/make_icons.py
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WEB = Path(__file__).resolve().parent.parent / "web"
BLUE = (37, 99, 235)
LIGHT = (199, 215, 255)
FONTS = ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf", "DejaVuSans-Bold.ttf"]


def font(size):
    for f in FONTS:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_icon(size, rounded, scale=1.0):
    """scale < 1 thu nhỏ chữ vào giữa (vùng an toàn cho icon maskable)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=BLUE)
    else:
        d.rectangle([0, 0, size, size], fill=BLUE)
    s = size * scale
    d.text((size / 2, size / 2 - s * 0.06), "AI", font=font(int(s * 0.36)), fill="white", anchor="mm")
    d.text((size / 2, size / 2 + s * 0.24), "901", font=font(int(s * 0.17)), fill=LIGHT, anchor="mm")
    return img


def main():
    sys.stdout.reconfigure(errors="replace")  # console Windows không phải UTF-8
    draw_icon(192, True).save(WEB / "icon-192.png")
    draw_icon(512, True).save(WEB / "icon-512.png")
    draw_icon(512, False, scale=0.78).save(WEB / "icon-maskable-512.png")
    draw_icon(180, False).convert("RGB").save(WEB / "apple-touch-icon.png")
    print("Đã tạo icon trong web/")


if __name__ == "__main__":
    main()
