"""Same-frame audit renders of an Arjun version, for before/after comparison of each improvement stage.

    blender -b -P scripts/blender/arjun_improve/audit_renders.py -- <arjun_vN.glb> <out dir>

Shots (Eevee, neutral grey studio): squat at its deepest frame (full, knee side, knee back, hip),
cheer at mid clip (full, armpit), push-up deepest (elbow), crunch mid (forearm twist).
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
sc.render.resolution_x, sc.render.resolution_y = 600, 800
sc.view_settings.view_transform = 'AgX'
w = bpy.data.worlds.new('w')
sc.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.36, 0.4, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm]
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent != arm:
        o.hide_render = True  # the importer's bone-shape icosphere


def light(name, loc, energy):
    l = bpy.data.lights.new(name, 'AREA')
    l.energy, l.size = energy, 2
    o = bpy.data.objects.new(name, l)
    sc.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector((0, 0, 1)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


light('key', (-2.5, -3.5, 3), 600)
light('fill', (3, -3, 2), 200)
light('rim', (0, 3.5, 3), 400)
cd = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cd)
sc.collection.objects.link(cam)
sc.camera = cam


def bone(n):
    return arm.matrix_world @ arm.pose.bones[n].head


def bounds():
    dg = bpy.context.evaluated_depsgraph_get()
    pts = [e.matrix_world @ Vector(c) for o in meshes for e in [o.evaluated_get(dg)] for c in e.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def shoot(name, target, dist, azim, elev, lens=50):
    a, e = math.radians(azim), math.radians(elev)
    cam.location = target + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cd.lens = lens
    sc.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)


def play(name, frame):
    ad = arm.animation_data or arm.animation_data_create()
    for t in ad.nla_tracks:
        t.mute = True
    act = bpy.data.actions[name]
    ad.action = act
    if act.slots and not ad.action_slot:
        ad.action_slot = act.slots[0]
    sc.frame_set(frame)


def lowest_hip(name):
    a = bpy.data.actions[name]
    best = (1e9, 0)
    for f in range(int(a.frame_range[0]), int(a.frame_range[1]) + 1):
        play(name, f)
        best = min(best, (bone('CC_Hip').z, f))
    return best[1]


H = 1.88
f = lowest_hip('squat')
play('squat', f)
lo, hi = bounds()
shoot('a_squat', (lo + hi) / 2, 3.4, 25, 10)
shoot('b_squat_knee_side', bone('CC_L_Calf'), 0.75, -75, 5, 85)
shoot('c_squat_knee_back', bone('CC_L_Calf') + Vector((0, 0.06, 0)), 1.0, 160, 5, 70)
shoot('d_squat_hip', bone('CC_L_Thigh'), 0.9, -95, 5, 85)
a = bpy.data.actions['cheer']
play('cheer', int(sum(a.frame_range) / 2))
lo, hi = bounds()
shoot('e_cheer', (lo + hi) / 2, 3.6, 20, 5)
shoot('f_cheer_armpit', bone('CC_L_Upperarm'), 0.7, -40, -10, 85)
shoot('f2_cheer_shoulder_top', bone('CC_L_Upperarm'), 0.8, -60, 35, 70)
shoot('f3_cheer_shoulder_back', bone('CC_L_Upperarm'), 0.8, -150, 15, 70)
f = lowest_hip('ex_pushup')
play('ex_pushup', f)
shoot('g_pushup_elbow', bone('CC_L_Forearm'), 0.7, -70, 25, 85)
a = bpy.data.actions['ex_crunch']
play('ex_crunch', int(sum(a.frame_range) / 2))
shoot('h_crunch_forearm', (bone('CC_L_Forearm') + bone('CC_L_Hand')) / 2, 0.7, -30, 40, 85)
print('DONE')
