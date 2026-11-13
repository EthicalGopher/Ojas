"""Arjun improvement, stage 3: phone performance (geometry and rig). Runs after stages 1 and 2 in the same Blender
session (make arjun-stage3) and writes arjun_v3_perf.glb (the app's model) plus arjun_v3_lod1.glb and
arjun_v3_lod2.glb (smaller stand-ins for small on-screen views; nothing in the app loads them yet).

1. Hair: 38k triangles of cards, 39% of the character. Collapse-decimated to 40% (about 15k); of the methods
   compared (planar dissolve, un-subdivide, collapse) it kept the silhouette and strand look closest.
2. Mouth: teeth, gums and tongue are 8k triangles, nearly all inside the head. Faces no ray can reach from
   any view in front of the face are deleted, tested with the mouth as open as the runtime ever makes it
   (jawOpen 0.4, and the cheer smile), so nothing that can show is lost.
3. Rig: bones that carry no weight and have no weighted bone under them (Unreal IK / weapon / unused
   corrective bones) are removed, with their animation channels. The CC_ main bones always stay (the app
   addresses them by name).
4. LODs: LOD1 halves the clothes and hair again; LOD2 drops the face shapes and lashes and decimates
   everything (about 12k triangles).
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
OUT_DIR = os.path.dirname(os.path.abspath(argv[3]))
V3 = os.path.join(OUT_DIR, 'arjun_v3_perf')

scene = bpy.context.scene
arm = bpy.data.objects['CC_rig']
ad = arm.animation_data
ad.action = None
for t in ad.nla_tracks:
    t.mute = True
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
scene.frame_set(0)
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm]


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def total():
    return sum(tris(o) for o in meshes)


def decimate(o, ratio):
    """collapse-decimate and apply, under the armature modifier (weights are interpolated)"""
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    m = o.modifiers.new('decimate', 'DECIMATE')
    m.ratio = ratio
    bpy.ops.object.modifier_move_to_index(modifier='decimate', index=0)
    bpy.ops.object.modifier_apply(modifier='decimate')


print(f'STAGE3 start: {total()} triangles')

# ---------------------------------------------------------------- 1. hair
hair = bpy.data.objects['Arjun_hair']
before = tris(hair)
decimate(hair, 0.4)
print(f'HAIR {before} -> {tris(hair)} triangles')

# ---------------------------------------------------------------- 2. mouth interior


def keys(o, values):
    if o.data.shape_keys:
        for k in o.data.shape_keys.key_blocks[1:]:
            k.value = values.get(k.name, 0.0)


mouth = bpy.data.objects['Arjun_mouth']
head_objs = [bpy.data.objects[n] for n in ('Arjun_body', 'Arjun_mouth', 'Arjun_eye')]
POSES = [{'jawOpen': 0.4},
         {'mouthSmileLeft': 0.85, 'mouthSmileRight': 0.85, 'jawOpen': 0.15, 'cheekSquintLeft': 0.5, 'cheekSquintRight': 0.5}]
head_pt = arm.matrix_world @ arm.pose.bones['CC_Head'].head
visible = set()
for pose in POSES:
    for o in head_objs:
        keys(o, pose)
    dg = bpy.context.evaluated_depsgraph_get()
    verts, polys, owner = [], [], []
    mouth_centers = None
    for o in head_objs:
        e = o.evaluated_get(dg)
        me = e.to_mesh()
        base = len(verts)
        verts += [e.matrix_world @ v.co for v in me.vertices]
        for p in me.polygons:
            polys.append([base + i for i in p.vertices])
            owner.append((o.name, p.index))
        if o is mouth:
            mouth_centers = [(p.index, e.matrix_world @ p.center) for p in me.polygons]
        e.to_mesh_clear()
    bvh = BVHTree.FromPolygons(verts, polys)
    centre = sum((c for _, c in mouth_centers), Vector()) / len(mouth_centers)
    eyes = []
    for az in range(-80, 81, 10):
        for el in range(-40, 51, 10):
            a, b = math.radians(az), math.radians(el)
            d = Vector((math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b), math.sin(b)))
            eyes += [centre + d * 0.5, centre + d * 2.0]
    for idx, c in mouth_centers:
        if idx in visible:
            continue
        for eye in eyes:
            ray = c - eye
            dist = ray.length
            hit, _, fi, hd = bvh.ray_cast(eye, ray.normalized(), dist + 1e-3)
            if hit is not None and (owner[fi] == ('Arjun_mouth', idx) or (owner[fi][0] == 'Arjun_mouth' and abs(hd - dist) < 1e-3)):
                visible.add(idx)
                break
for o in head_objs:
    keys(o, {})
bm = bmesh.new()
bm.from_mesh(mouth.data)
bm.faces.ensure_lookup_table()
before = tris(mouth)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in visible], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(mouth.data)  # shape keys travel with the bmesh
bm.free()
mouth.data.update()
print(f'MOUTH {before} -> {tris(mouth)} triangles ({len(visible)} visible faces kept)')

# ---------------------------------------------------------------- 3. unused bones
weighted = set()
for o in meshes:
    names = {g.index: g.name for g in o.vertex_groups}
    for v in o.data.vertices:
        for g in v.groups:
            if g.weight > 1e-4:
                weighted.add(names[g.group])
keep = set()
for b in arm.data.bones:
    if b.name in weighted or b.name.startswith('CC_'):
        p = b
        while p:
            keep.add(p.name)
            p = p.parent
drop = [b.name for b in arm.data.bones if b.name not in keep]
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for n in drop:
    arm.data.edit_bones.remove(arm.data.edit_bones[n])
bpy.ops.object.mode_set(mode='OBJECT')
for o in meshes:
    for n in drop:
        g = o.vertex_groups.get(n)
        if g:
            o.vertex_groups.remove(g)
paths = {f'pose.bones["{n}"]' for n in drop}
for tr in ad.nla_tracks:
    act = tr.strips[0].action
    fcs = act.fcurves if hasattr(act, 'fcurves') else act.layers[0].strips[0].channelbag(act.slots[0]).fcurves
    for fc in [f for f in fcs if f.data_path.rsplit('.', 1)[0] in paths]:
        fcs.remove(fc)
print(f'BONES {len(arm.data.bones) + len(drop)} -> {len(arm.data.bones)} (removed: {", ".join(sorted(drop))})')
print(f'STAGE3 LOD0: {total()} triangles')


# ---------------------------------------------------------------- export


def export(path, morph=True):
    scene.frame_set(0)
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.parent == arm:
            o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, use_selection=True, export_format='GLB', export_image_format='WEBP',
        export_image_quality=88, export_animation_mode='NLA_TRACKS', export_morph=morph, export_morph_normal=False,
        export_morph_tangent=False, export_morph_animation=False, export_try_sparse_sk=True, export_skins=True,
        export_extras=False, export_yup=True,
    )
    print('WROTE', path)


bpy.ops.wm.save_as_mainfile(filepath=V3 + '.blend', compress=True, copy=True)
export(V3 + '.glb')

# ---------------------------------------------------------------- LODs
for n in ('Arjun_hair', 'Arjun_jacket', 'Arjun_jeans', 'Arjun_shoes', 'Arjun_gloves'):
    decimate(bpy.data.objects[n], 0.5)
print(f'LOD1: {total()} triangles')
export(os.path.join(OUT_DIR, 'arjun_v3_lod1.glb'))

lash = bpy.data.objects['Arjun_eyeleash']
meshes.remove(lash)
bpy.data.objects.remove(lash, do_unlink=True)
for o in meshes:
    if o.data.shape_keys:
        o.shape_key_clear()
for n, r in (('Arjun_body', 0.35), ('Arjun_hair', 0.4), ('Arjun_jacket', 0.4), ('Arjun_jeans', 0.4),
             ('Arjun_shoes', 0.3), ('Arjun_gloves', 0.4), ('Arjun_mouth', 0.3), ('Arjun_eyebrows', 0.5)):
    decimate(bpy.data.objects[n], r)
print(f'LOD2: {total()} triangles')
export(os.path.join(OUT_DIR, 'arjun_v3_lod2.glb'), morph=False)
