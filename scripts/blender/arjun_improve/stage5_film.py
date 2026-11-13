"""Arjun improvement, stage 5: rebuild him to match his film (clothes first).

    blender -b <versions>/arjun_v3_perf.blend -P scripts/blender/arjun_improve/stage5_film.py -- <film tex dir> <out.blend>

Swaps the clothes' colour and normal textures for the ones film_textures.py made (smooth olive-brown
leather jacket, taupe twill trousers, brown suede boots), and makes the leather a little smoother and
the suede rougher. Saves a .blend for stage 4 (KTX2 export).
"""
import os
import sys

import bpy

TEX, OUT = sys.argv[sys.argv.index('--') + 1:][:2]
for name in ('Jacket_BaseColor', 'Jacket_Normal', 'Jeans_BaseColor', 'Jeans_Normal', 'Shoes_BaseColor', 'Shoes_Normal'):
    img = next(i for i in bpy.data.images if i.name == name or i.name.startswith(name + '.'))
    new = bpy.data.images.load(os.path.join(os.path.abspath(TEX), name + '.png'))
    new.colorspace_settings.name = img.colorspace_settings.name
    new.pack()
    img.user_remap(new)
    bpy.data.images.remove(img)
    new.name = name
    print('SWAP', name, tuple(new.size))

# ---------------------------------------------------------------- hair: the film's volume
# The film's hair is swept up and back with more body on top. Every hair vertex moves away from the
# scalp in proportion to how far it already sits off it (roots stay put, the outer layers lift), more
# on top and toward the front, and the front lifts and leans back a little.
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import bmesh

HAIR_BODY = 0.7     # outer layers move out by this much of their height off the scalp, on top
FRONT_LIFT = 0.012  # metres the top-front lifts...
SWEEP_BACK = 0.008  # ...and leans back

body = bpy.data.objects['Arjun_body']
hair = bpy.data.objects['Arjun_hair']
bm = bmesh.new()
bm.from_mesh(body.data)
bm.transform(body.matrix_world)
scalp = BVHTree.FromBMesh(bm)
mw, inv = hair.matrix_world, hair.matrix_world.inverted()
pts = [mw @ v.co for v in hair.data.vertices]
zs = [p.z for p in pts]
z0, z1 = min(zs), max(zs)
ys = [p.y for p in pts]
front_y = min(ys)  # the face looks along -Y
for v, p in zip(hair.data.vertices, pts):
    q, n, _, d = scalp.find_nearest(p)
    if q is None:
        continue
    top = max(0.0, min(1.0, (p.z - (z0 + 0.45 * (z1 - z0))) / (0.55 * (z1 - z0))))
    front = max(0.0, min(1.0, (p.y - (front_y + 0.12)) / -0.12))
    out = (p - q).normalized() if (p - q).length > 1e-6 else n
    p2 = p + out * (d * HAIR_BODY * top) + Vector((0, SWEEP_BACK, FRONT_LIFT)) * (top * front)
    v.co = inv @ p2
hair.data.update()
print('HAIR', len(pts), 'vertices given volume')

bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT))
print('WROTE', OUT)
