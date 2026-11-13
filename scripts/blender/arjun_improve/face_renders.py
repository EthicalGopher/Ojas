"""Face audit renders of an Arjun version: the expressions the runtime builds from the morph targets.

    blender -b -P scripts/blender/arjun_improve/face_renders.py -- <arjun_vN.glb> <out dir>

Each expression sets ARKit shape weights on every face mesh that has them (body, eyes, brows, lashes, mouth),
the same way the app does. A version without morph targets renders every expression as neutral.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 600, 700
sc.view_settings.view_transform = 'AgX'
w = bpy.data.worlds.new('w')
sc.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.36, 0.4, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
if arm.animation_data:
    arm.animation_data.action = None
    for t in arm.animation_data.nla_tracks:
        t.mute = True
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent != arm:
        o.hide_render = True
for name, loc, e in (('key', (-1.5, -2.5, 2.2), 300), ('fill', (2, -2, 1.8), 120), ('rim', (0, 2.5, 2.5), 200)):
    l = bpy.data.lights.new(name, 'AREA')
    l.energy, l.size = e, 1.5
    o = bpy.data.objects.new(name, l)
    sc.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector((0, 0, 1.65)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
cd = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cd)
sc.collection.objects.link(cam)
sc.camera = cam
cd.lens = 85
head = arm.matrix_world @ arm.pose.bones['CC_Head'].head + Vector((0, 0, 0.09))

EXPR = {
    'neutral': {},
    'blink': {'eyeBlinkLeft': 1, 'eyeBlinkRight': 1},
    'smile': {'mouthSmileLeft': 0.85, 'mouthSmileRight': 0.85, 'cheekSquintLeft': 0.5, 'cheekSquintRight': 0.5,
              'eyeSquintLeft': 0.25, 'eyeSquintRight': 0.25, 'jawOpen': 0.15, 'browInnerUp': 0.15},
    'effort': {'mouthPressLeft': 0.6, 'mouthPressRight': 0.6, 'mouthStretchLeft': 0.35, 'mouthStretchRight': 0.35,
               'browDownLeft': 0.5, 'browDownRight': 0.5, 'browInnerUp': 0.25, 'eyeSquintLeft': 0.5,
               'eyeSquintRight': 0.5, 'cheekSquintLeft': 0.3, 'cheekSquintRight': 0.3, 'jawOpen': 0.08},
    'exhale': {'jawOpen': 0.35, 'mouthStretchLeft': 0.2, 'mouthStretchRight': 0.2, 'browInnerUp': 0.3},
    'glance': {'eyeLookUpLeft': 0.3, 'eyeLookUpRight': 0.3, 'eyeLookOutLeft': 0.35, 'eyeLookInRight': 0.35},
}
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.data.shape_keys]
for ename, ws in EXPR.items():
    for o in meshes:
        for k in o.data.shape_keys.key_blocks[1:]:
            k.value = ws.get(k.name, 0.0)
    for view, az in (('front', 0), ('34', 30)):
        a = math.radians(az)
        cam.location = head + Vector((math.sin(a), -math.cos(a), 0.02)) * 0.55
        cam.rotation_euler = (head - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(OUT, f'{ename}_{view}.png')
        bpy.ops.render.render(write_still=True)
print('DONE', len(meshes), 'meshes with shapes')
