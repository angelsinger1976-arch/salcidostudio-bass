#!/usr/bin/env python3
"""Genera iconos PWA (192, 512, 512-maskable) a partir del ícono 1024 generado."""
from PIL import Image, ImageOps
import os

SRC = "generated_images/generated_image_91f50310-3477-4e9b-a228-f397a604ebd2_0.png"
OUT_DIR = "public/icons"
os.makedirs(OUT_DIR, exist_ok=True)

src = Image.open(SRC).convert("RGBA")
print("Fuente:", src.size, src.mode)

def save(img, name):
    path = os.path.join(OUT_DIR, name)
    img.save(path, "PNG", optimize=True)
    print("OK", path, img.size)

# Icono normal: recorte centrado al área segura
for size, name in [(192, "icon-192.png"), (512, "icon-512.png")]:
    img = ImageOps.fit(src, (size, size), Image.LANCZOS, centering=(0.5, 0.5))
    save(img, name)

# Maskable: contenido dentro del círculo central (~80%) sobre fondo del tema
bg = Image.new("RGBA", (512, 512), (22, 24, 29, 255))  # --bg #16181d
inner_size = int(512 * 0.78)
inner = src.resize((inner_size, inner_size), Image.LANCZOS)
mask = Image.new("L", (inner_size, inner_size), 0)
from PIL import ImageDraw
d = ImageDraw.Draw(mask)
d.ellipse((0, 0, inner_size - 1, inner_size - 1), fill=255)
bg.paste(inner, ((512 - inner_size) // 2, (512 - inner_size) // 2), mask)
save(bg, "icon-512-maskable.png")
