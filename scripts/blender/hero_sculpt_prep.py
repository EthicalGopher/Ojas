"""Prepare the male anatomy sculpt (male_body.fbx, supplied by the user) as the default hero's body shape.

    blender -b -P scripts/blender/hero_sculpt_prep.py -- <male_body.fbx> <out.ply>

Decimated to about 300k triangles (plenty for a shape target), facing -Y, feet at z = 0, centred in x,
torso centred in y, and scaled to 1.70 m like the FC1 body the hero is built on (hero_shape.py).
"""
import sys

import bpy
from mathutils import Vector

SRC, OUT = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC)
o = next(o for o in bpy.data.objects if o.type == 'MESH')
bpy.context.view_layer.objects.active = o
o.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mod = o.modifiers.new('dec', 'DECIMATE')
mod.ratio = 0.18
bpy.ops.object.modifier_apply(modifier='dec')
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
bpy.ops.wm.ply_export(filepath=OUT, export_selected_objects=True, apply_modifiers=True, export_normals=False,
                      export_uv=False, export_colors='NONE', ascii_format=False)
print('PREP', len(me.vertices), 'vertices', len(me.polygons), 'faces ->', OUT)
