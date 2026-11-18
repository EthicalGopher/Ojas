"""Rookie medal shine as a sprite sheet: same light sweep as rookie_shine.mp4.

Frame 0 = still (rest), frames 1..SWEEP_FRAMES = the sweep. Round alpha cut, cropped to the medal.
usage: medal_sprite.py <source.png> <out_dir>
"""
import sys, os
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
img = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255.0
H, W, _ = img.shape
yy, xx = np.mgrid[0:H, 0:W]

lum = img @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
metal = np.clip((lum - 0.10) / 0.20, 0, 1)
polish = np.clip((lum - 0.25) / 0.45, 0, 1) ** 1.2
gain = metal * (0.45 + 0.55 * polish)
d = (xx + yy * 0.75) / (W + H * 0.75)
warm = np.array([1.0, 0.93, 0.80], dtype=np.float32)

FPS, SWEEP = 30, 1.4
SWEEP_FRAMES = int(FPS * SWEEP)  # 42
CROP = (48, 48, 976, 976)        # medal circle: centre 512, radius ~460
N = 200                          # frame size in px
COLS = 7

def frame(t):
    out = img
    if t is not None:
        p = t / SWEEP
        p = p * p * (3 - 2 * p)
        c = -0.15 + 1.3 * p
        band = 0.75 * np.exp(-((d - c) / 0.07) ** 2) + 1.1 * np.exp(-((d - c) / 0.018) ** 2)
        s = (band * gain)[..., None] * warm
        out = 1 - (1 - img) * (1 - np.clip(s, 0, 1))
    im = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).crop(CROP).resize((N, N), Image.LANCZOS)
    return np.asarray(im)

fy, fx = np.mgrid[0:N, 0:N] + 0.5
R = 459.8 / (CROP[2] - CROP[0]) * N
alpha = (np.clip(R + 0.5 - np.hypot(fx - N / 2, fy - N / 2), 0, 1) * 255).astype(np.uint8)

frames = [frame(None)] + [frame(i / FPS) for i in range(1, SWEEP_FRAMES + 1)]
rows = -(-len(frames) // COLS)
sheet = Image.new("RGBA", (COLS * N, rows * N), (0, 0, 0, 0))
for i, f in enumerate(frames):
    sheet.paste(Image.fromarray(np.dstack([f, alpha]), "RGBA"), ((i % COLS) * N, (i // COLS) * N))
os.makedirs(out, exist_ok=True)
sheet.save(f"{out}/rookie_shine_sheet.webp", "WEBP", quality=88, method=6)
Image.fromarray(np.dstack([frames[0], alpha]), "RGBA").save(f"{out}/rookie.png", optimize=True)
print(len(frames), "frames", sheet.size, "cols", COLS, "rows", rows)
