"""Prepare the male anatomy sculpt (male_body.fbx, supplied by the user) as the default hero's body.

    blender -b -P scripts/blender/hero_sculpt_prep.py -- <male_body.fbx> <out_dir>

Writes, all facing -Y, feet at z = 0, centred in x, torso centred in y, scaled to 1.70 m like the FC1 body
whose rig the hero uses:
- male_body.ply     ~300k triangles: the shape target the FC1 rig is fitted to (hero_shape.wrap_to_sculpt)
- male_body_hi.ply  ~1.2M triangles: the source of the baked detail (normal map, ink lines)
- male_body_lo.ply  ~34k triangles: the game mesh itself (hero_body.py)
"""
import os
import sys

import bpy
from mathutils import Vector

SRC, OUT_DIR = sys.argv[sys.argv.index('--') + 1:][:2]
LO_TRIS = 34000
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC)
o = next(o for o in bpy.data.objects if o.type == 'MESH')
bpy.context.view_layer.objects.active = o
o.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = o.data
vs = [v.co.copy() for v in me.vertices]
zmin, zmax = min(v.z for v in vs), max(v.z for v in vs)
s = 1.70 / (zmax - zmin)
xmid = (min(v.x for v in vs) + max(v.x for v in vs)) / 2
torso = [v.y for v in vs if abs((v.z - zmin) * s - 1.2) < 0.01 and abs((v.x - xmid) * s) < 0.15]
ymid = (min(torso) + max(torso)) / 2
for v in me.vertices:
    v.co = Vector(((v.co.x - xmid) * s, (v.co.y - ymid) * s, (v.co.z - zmin) * s))
me.update()


def decimate(ratio):
    mod = o.modifiers.new('dec', 'DECIMATE')
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')


def export(name):
    path = os.path.join(OUT_DIR, name)
    bpy.ops.wm.ply_export(filepath=path, export_selected_objects=True, apply_modifiers=True, export_normals=False,
                          export_uv=False, export_colors='NONE', ascii_format=False)
    print('PREP', name, len(me.vertices), 'vertices', len(me.polygons), 'faces')


os.makedirs(OUT_DIR, exist_ok=True)
decimate(0.7)           # 1.67M quads -> ~1.2M triangles
export('male_body_hi.ply')
decimate(300000 / len(me.polygons))
export('male_body.ply')
decimate(LO_TRIS / len(me.polygons))
export('male_body_lo.ply')
