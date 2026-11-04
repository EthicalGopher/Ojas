"""Render a hero's card art: the hero in their signature pose, lit like a splash, on a transparent background.

    blender -b --python scripts/blender/render_hero_card.py -- <hero.glb> <clip> <frame> <out.png> [--yaw D] [--tint r,g,b]

<hero.glb> a built hero (ojas_fc1.glb, arjun.glb) carrying its clips
<clip>     the clip to pose from (hero_move1, hero_move2, ...) and <frame> the frame of it
<out.png>  720x1080 RGBA: the hero and a soft contact shadow; the app puts every hero on the same card
--yaw      turn the hero (degrees, + to their left) for a three-quarter view
--tint     linear multiplier on skin_* materials (the hero's look tint, as the app applies it)
--samples  Cycles samples (96); --scale  resolution factor (1 = 720x1080), for quick previews

Cycles on the GPU (OptiX or CUDA when available): a warm key, a cool fill, two coloured rims from behind
(the app's orange and a blue), and the studio HDRI for soft reflections. The camera frames the posed
body from a slightly low angle.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
GLB, CLIP, FRAME, OUT = argv[0], argv[1], int(argv[2]), argv[3]
opts = dict(zip(argv[4::2], argv[5::2]))
YAW = float(opts.get('--yaw', '25'))
TINT = [float(v) for v in opts['--tint'].split(',')] if '--tint' in opts else None

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 24
bpy.ops.import_scene.gltf(filepath=GLB)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.parent != arm]:
    bpy.data.objects.remove(o)  # the importer's bone-shape helper
ad = arm.animation_data
for t in ad.nla_tracks:
    t.mute = True
act = bpy.data.actions[CLIP]
ad.action = act
if act.slots:
    ad.action_slot = act.slots[0]
sc.frame_set(FRAME)

# turn the hero for a three-quarter view
root = arm
while root.parent:
    root = root.parent
root.rotation_mode = 'XYZ'
root.rotation_euler.z += math.radians(YAW)
bpy.context.view_layer.update()

if TINT:
    for m in bpy.data.materials:
        if not m.name.startswith('skin_') or not m.use_nodes:
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue
        link = next((l for l in nt.links if l.to_socket == bsdf.inputs['Base Color']), None)
        mul = nt.nodes.new('ShaderNodeMix')
        mul.data_type = 'RGBA'
        mul.blend_type = 'MULTIPLY'
        mul.inputs['Factor'].default_value = 1.0
        mul.inputs['B'].default_value = (*TINT, 1.0)
        if link:
            nt.links.new(link.from_socket, mul.inputs['A'])
        else:
            mul.inputs['A'].default_value = bsdf.inputs['Base Color'].default_value
        nt.links.new(mul.outputs['Result'], bsdf.inputs['Base Color'])

# posed bounds, from the evaluated meshes
deps = bpy.context.evaluated_depsgraph_get()
lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm]:
    ev = o.evaluated_get(deps)
    me = ev.to_mesh()
    for v in me.vertices:
        p = ev.matrix_world @ v.co
        lo = Vector(map(min, lo, p))
        hi = Vector(map(max, hi, p))
    ev.to_mesh_clear()
centre = (lo + hi) / 2
height = hi.z - lo.z

# camera: in front (glTF characters face -Y in Blender), a little low, 50 mm
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.lens = 50
cam.data.sensor_width = 36
scale = float(opts.get('--scale', '1'))
sc.render.resolution_x, sc.render.resolution_y = int(720 * scale), int(1080 * scale)
aim = Vector((centre.x, centre.y, lo.z + height * 0.5))
dist = height * 1.7
cam.location = aim + Vector((0.0, -dist, -height * 0.08))
direction = aim - cam.location
cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
cam.data.dof.use_dof = False


def area(name, loc, power, color, size):
    light = bpy.data.lights.new(name, 'AREA')
    light.energy = power
    light.color = color
    light.size = size
    o = bpy.data.objects.new(name, light)
    sc.collection.objects.link(o)
    o.location = aim + Vector(loc)
    o.rotation_euler = (aim - o.location).to_track_quat('-Z', 'Y').to_euler()
    return o


area('key', (-1.6, -2.2, 1.6), 260, (1.0, 0.93, 0.86), 1.6)
area('fill', (2.0, -2.0, 0.2), 50, (0.8, 0.88, 1.0), 2.0)
area('rim_warm', (-1.8, 1.8, 1.2), 420, (1.0, 0.48, 0.24), 0.8)
area('rim_cool', (1.9, 1.6, 1.0), 340, (0.45, 0.65, 1.0), 0.8)

world = bpy.data.worlds.new('w')
sc.world = world
world.use_nodes = True
env = world.node_tree.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(os.path.join(os.path.dirname(bpy.app.binary_path), '5.2', 'datafiles', 'studiolights', 'world', 'studio.exr'))
bg = world.node_tree.nodes['Background']
bg.inputs['Strength'].default_value = 0.12
world.node_tree.links.new(env.outputs['Color'], bg.inputs['Color'])

# a soft contact shadow, kept in the transparent render
bpy.ops.mesh.primitive_plane_add(size=6, location=(centre.x, centre.y, lo.z))
floor = bpy.context.active_object
floor.is_shadow_catcher = True

sc.render.engine = 'CYCLES'
sc.cycles.samples = int(opts.get('--samples', '96'))
sc.cycles.use_denoising = True
prefs = bpy.context.preferences.addons['cycles'].preferences
for backend in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = backend
        prefs.get_devices()
        if any(d.type == backend for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == backend
            sc.cycles.device = 'GPU'
            print('DEVICE', backend)
            break
    except TypeError:
        continue
sc.render.film_transparent = True
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Punchy'
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('WROTE', OUT)
