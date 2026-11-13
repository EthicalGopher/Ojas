"""Arjun to match his film: new textures for the clothes (step 1 of the film rebuild).

    python scripts/blender/arjun_improve/film_textures.py <arjun_v3_perf.glb> <out dir>   (needs opencv-python-headless numpy)

The film's Arjun wears the same jacket cut (chest yoke, raglan sleeves, zip) but as smooth olive-brown
leather, taupe twill trousers and brown suede boots, where the model has crumpled, blotchy leather,
washed dark denim and black trainers. Each texture keeps its seams, stitching, zip and pockets (an
edge-preserving filter removes the blotches, the fine detail is added back faintly) and takes the
film's colour; the normal maps keep the seams and lose the crumple. Writes PNGs named like the images.
"""
import json
import os
import struct
import sys

import cv2
import numpy as np

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# Film colours (sRGB, as albedo): measured on the film's last frame, lit side and shade side averaged.
FILM = {
    'Jacket': (64, 57, 46),    # olive-brown leather
    'Jeans': (76, 74, 70),     # grey-taupe twill
    'Shoes': (78, 60, 46),     # brown suede
}
DETAIL = {'Jacket': 0.35, 'Jeans': 0.3, 'Shoes': 0.35}   # how much fine detail (seams, stitching) is kept
RELIEF = {'Jacket': 0.6, 'Jeans': 0.45, 'Shoes': 0.6}    # normal-map strength kept (seams survive the smoothing)

data = open(SRC, 'rb').read()
n = struct.unpack_from('<I', data, 12)[0]
gltf = json.loads(data[20:20 + n])
binary = data[20 + n + 8:]


def image(name):
    for im in gltf['images']:
        if im['name'] == name:
            v = gltf['bufferViews'][im['bufferView']]
            raw = binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
            return cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    raise KeyError(name)


def to_lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055) * 255


for part, rgb in FILM.items():
    img = image(f'{part}_BaseColor')
    h, w = img.shape[:2]
    lum = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    # the blotches: big soft variation; the detail: seams and stitching, a few pixels wide
    base = cv2.bilateralFilter(lum, 0, 40, w / 128)
    base = cv2.GaussianBlur(base, (0, 0), w / 256)
    detail = lum - cv2.GaussianBlur(lum, (0, 0), w / 512)
    # keep the dark structure of the original (zip, pocket edges, logo areas) but only a little of its blotch
    shade = 1.0 + DETAIL[part] * detail / 128.0 + 0.15 * (base - base.mean()) / 128.0
    target = to_lin(np.array(rgb[::-1], np.float32))  # BGR
    out = to_srgb(target[None, None, :] * shade[..., None] ** 2.2)
    if part == 'Jacket':
        # the zip stays metal: where the original is bright and grey, keep it
        sat = img.max(2).astype(np.float32) - img.min(2)
        metal = ((lum > 120) & (sat < 25)).astype(np.float32)
        metal = cv2.GaussianBlur(metal, (0, 0), 1.0)[..., None]
        out = out * (1 - metal) + img * metal
    if part == 'Shoes':
        # no red trainer logo on suede boots
        b, g, r = [img[..., i].astype(np.float32) for i in range(3)]
        red = ((r > g * 1.6) & (r > 80)).astype(np.uint8)
        out = out.astype(np.uint8)
        out = cv2.inpaint(out, cv2.dilate(red, np.ones((5, 5), np.uint8)) * 255, 5, cv2.INPAINT_TELEA)
    cv2.imwrite(os.path.join(OUT, f'{part}_BaseColor.png'), np.clip(out, 0, 255).astype(np.uint8))

    nm = image(f'{part}_Normal').astype(np.float32) / 127.5 - 1.0  # BGR = (z, y, x)
    xy = nm[..., 1:]
    # seams and stitching are thin lines (a few px at this size); the crumple is wide folds: keep the
    # thin high-pass and the broad shape (panels, pockets), drop the band in between
    px = w / 2048
    thin = xy - cv2.GaussianBlur(xy, (0, 0), 3 * px)
    broad = cv2.GaussianBlur(xy, (0, 0), 48 * px)
    xy = thin * 2.5 * RELIEF[part] + broad * RELIEF[part]
    z = np.sqrt(np.clip(1 - (xy ** 2).sum(2), 0, 1))
    out_n = np.dstack([z, xy[..., 0], xy[..., 1]])
    cv2.imwrite(os.path.join(OUT, f'{part}_Normal.png'), np.clip((out_n + 1) * 127.5, 0, 255).astype(np.uint8))
    print('TEX', part, w, 'px')
