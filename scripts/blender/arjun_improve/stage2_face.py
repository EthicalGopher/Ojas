"""Arjun improvement, stage 2: facial expressions. Runs after build_arjun.py and stage1_deform.py in the same
Blender session (make arjun-stage2) and writes arjun_v2_face.glb / .blend next to v1.

build_arjun.py drops all the Survival Character's ARKit shape keys, so Arjun's face could never blink or move.
This copies a working set back from the FBX (by vertex index: the build keeps every mesh's vertex order) onto
the body, eyes, brows, lashes and mouth, under the same ARKit names on every mesh, so the runtime sets one
name and the whole face follows (a blink closes the lid and moves the lashes; jawOpen moves the teeth too).

Kept (24): blinks, squints, wide eyes are left out (they look startled at game distance); brows; jawOpen;
smile + cheek squint (the cheer); press + stretch (effort on a hard rep); eye looks (small glances).
Exported as sparse morph targets without normals: normals were 4 MB of the 6 MB added, and at these
small expression amounts the neutral normals light the face well enough.
"""
import os
import sys

import bpy
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
FBX_PATH = argv[0]
OUT_DIR = os.path.dirname(os.path.abspath(argv[3]))
V2 = os.path.join(OUT_DIR, 'arjun_v2_face')

KEEP = [
    'eyeBlinkLeft', 'eyeBlinkRight', 'eyeSquintLeft', 'eyeSquintRight',
    'browInnerUp', 'browDownLeft', 'browDownRight',
    'jawOpen', 'mouthSmileLeft', 'mouthSmileRight', 'cheekSquintLeft', 'cheekSquintRight',
    'mouthPressLeft', 'mouthPressRight', 'mouthStretchLeft', 'mouthStretchRight',
    'eyeLookUpLeft', 'eyeLookUpRight', 'eyeLookDownLeft', 'eyeLookDownRight',
    'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight',
]
# FBX mesh -> built mesh (build_arjun.py renames them)
MESHES = {'Body3': 'Arjun_body', 'Eye': 'Arjun_eye', 'Eyebrows': 'Arjun_eyebrows',
          'Eyeleash': 'Arjun_eyeleash', 'Mouth1': 'Arjun_mouth'}

scene = bpy.context.scene
arm = bpy.data.objects['CC_rig']
ad = arm.animation_data
saved_action = ad.action
ad.action = None
before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=FBX_PATH)
imported = [o for o in bpy.data.objects if o not in before]

for src_name, dst_name in MESHES.items():
    src = next(o for o in imported if o.name.split('.')[0] == src_name)
    dst = bpy.data.objects[dst_name]
    assert len(src.data.vertices) == len(dst.data.vertices), (src_name, 'vertex count changed')
    sk = src.data.shape_keys.key_blocks
    n = len(dst.data.vertices)
    base_src = np.empty(n * 3, dtype=np.float32)
    sk[0].data.foreach_get('co', base_src)
    base_dst = np.empty(n * 3, dtype=np.float32)
    dst.data.vertices.foreach_get('co', base_dst)
    assert np.abs(base_src - base_dst).max() < 1e-3, (src_name, 'vertex order or rest shape differs')
    if not dst.data.shape_keys:
        dst.shape_key_add(name='Basis', from_mix=False)
    added = []
    for name in KEEP:
        if name not in sk:
            continue
        co = np.empty(n * 3, dtype=np.float32)
        sk[name].data.foreach_get('co', co)
        k = dst.shape_key_add(name=name, from_mix=False)
        k.data.foreach_set('co', base_dst + (co - base_src))
        k.value = 0.0
        added.append(name)
    print('SHAPES', dst_name, len(added), ', '.join(added))

# the re-imported FBX goes again (its armature, meshes, actions and materials)
for o in imported:
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images, bpy.data.actions):
    for d in list(coll):
        if d.users == 0:
            coll.remove(d)
ad.action = saved_action
scene.frame_set(0)

bpy.ops.wm.save_as_mainfile(filepath=V2 + '.blend', compress=True, copy=True)
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=V2 + '.glb', use_selection=True, export_format='GLB', export_image_format='WEBP',
    export_image_quality=88, export_animation_mode='NLA_TRACKS', export_morph=True, export_morph_normal=False,
    export_morph_tangent=False, export_morph_animation=False, export_try_sparse_sk=True, export_skins=True,
    export_extras=False, export_yup=True,
)
print('WROTE', V2 + '.glb')
