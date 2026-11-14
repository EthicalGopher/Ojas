"""The default hero's world: a gym, drawn in his comic look (flat tones, black ink lines), as a 16:9 plate.

    blender -b -P scripts/blender/render_gym.py -- <out.jpg> [--size 1920x1080] [--spot x,foot,height] [--hero hero.glb]

--spot: where a 1.70 m figure standing on the platform lands in the picture (fractions: feet centre across,
feet line down, head-to-feet), the same numbers the app's placement uses; the camera's distance sets the
size and a lens shift moves the platform there, so the room's perspective fits the hero standing on it.

The plate is a backdrop: the app stands the 3D hero on the wooden lifting platform in the middle (the lobby,
his hero page) and the VS screen composites him on it (render_toon.py --backdrop). --hero puts him in the
render too, for checking the scale and the spot only.

Everything is built here from simple solids (a power rack with a loaded bar, a dumbbell rack, a bench,
kettlebells, a plate tree, mirrors, high windows), shaded like render_toon.py (diffuse -> constant 3-tone
ramp x colour) and inked with Freestyle. The floor spot is the world origin; the camera looks at it from
5.4 m at chest height.
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
opts = dict(zip(argv[1::2], argv[2::2]))
W, H = (int(x) for x in opts.get('--size', '1920x1080').split('x'))

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


MATS = {}


def toon(name, hexcol, tones=(0.62, 0.82, 1.0), emit=False):
    """flat comic shading: the light's diffuse, in three steps, times the colour"""
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = nt.nodes['Material Output']
    em = nt.nodes.new('ShaderNodeEmission')
    if emit:
        em.inputs['Color'].default_value = srgb(hexcol)
        em.inputs['Strength'].default_value = 1.0
    else:
        diff = nt.nodes.new('ShaderNodeBsdfDiffuse')
        s2r = nt.nodes.new('ShaderNodeShaderToRGB')
        nt.links.new(diff.outputs['BSDF'], s2r.inputs['Shader'])
        bw = nt.nodes.new('ShaderNodeRGBToBW')
        nt.links.new(s2r.outputs['Color'], bw.inputs['Color'])
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.interpolation = 'CONSTANT'
        e = ramp.color_ramp.elements
        e[0].position, e[0].color = 0.0, (tones[0],) * 3 + (1,)
        e[1].position, e[1].color = 0.10, (tones[1],) * 3 + (1,)
        e.new(0.32).color = (tones[2],) * 3 + (1,)
        nt.links.new(bw.outputs['Val'], ramp.inputs['Fac'])
        mul = nt.nodes.new('ShaderNodeMix')
        mul.data_type = 'RGBA'
        mul.blend_type = 'MULTIPLY'
        mul.inputs['Factor'].default_value = 1.0
        mul.inputs['B'].default_value = srgb(hexcol)
        nt.links.new(ramp.outputs['Color'], mul.inputs['A'])
        nt.links.new(mul.outputs['Result'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    MATS[name] = m
    return m


def tiled(name, a, b, scale, kind='brick'):
    """two-colour pattern (floor tiles, wall bricks, wood planks) under the same 3-tone light"""
    m = toon(name, a)
    nt = m.node_tree
    mul = next(n for n in nt.nodes if n.type == 'MIX')
    tex = nt.nodes.new('ShaderNodeTexBrick')
    tex.inputs['Color1'].default_value = srgb(a)
    tex.inputs['Color2'].default_value = srgb(a)
    tex.inputs['Mortar'].default_value = srgb(b)
    tex.inputs['Scale'].default_value = scale
    tex.inputs['Mortar Size'].default_value = 0.015 if kind == 'brick' else 0.008
    if kind == 'tile':
        tex.offset = 0.0
        tex.inputs['Brick Width'].default_value = 1.0
        tex.inputs['Row Height'].default_value = 1.0
    elif kind == 'plank':
        tex.inputs['Brick Width'].default_value = 3.0
        tex.inputs['Row Height'].default_value = 0.35
    coord = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(coord.outputs['Object'], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], mul.inputs['B'])
    return m


def box(name, size, loc, mat, rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width = bevel
        b.segments = 2
    o.data.materials.append(mat)
    return o


def cyl(name, r, depth, loc, mat, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth() if verts > 8 else None
    return o


# ---------------------------------------------------------------- palette (the concept's lilac, the app's orange)
WALL = '#B9A9D9'      # lilac
WALL_LOW = '#5B4B86'  # deep purple band
STRIPE = '#FF7A2E'    # the app's orange
FLOOR = '#3B3F4A'
FLOOR_LINE = '#2C2F37'
WOOD = '#C98F55'
WOOD_LINE = '#9C6A3A'
STEEL = '#2B2D33'
STEEL_LIGHT = '#8C93A3'
RUBBER = '#22242A'
PLATE_RED = '#D8453B'
PLATE_BLUE = '#3A6FD0'
PAD = '#2E3442'
MIRROR = '#CFE2F2'
WINDOW = '#FFF3D6'

ink_none = set()

# room
box('floor', (16, 12, 0.1), (0, 2.0, -0.05), tiled('floor', FLOOR, FLOOR_LINE, 1.0, 'tile'))
box('platform', (2.6, 2.6, 0.05), (0, 0.15, 0.025), tiled('platform', WOOD, WOOD_LINE, 2.2, 'plank'))
box('platform_rubber_l', (0.55, 2.6, 0.052), (-1.0, 0.15, 0.026), toon('rubber', RUBBER))
box('platform_rubber_r', (0.55, 2.6, 0.052), (1.0, 0.15, 0.026), toon('rubber', RUBBER))
box('wall_back', (16, 0.2, 6), (0, 6.0, 3.0), tiled('wall', WALL, '#A898C9', 1.4, 'brick'))
box('wall_low', (16, 0.22, 1.1), (0, 5.98, 0.55), toon('wall_low', WALL_LOW))
box('stripe', (16, 0.23, 0.12), (0, 5.97, 1.18), toon('stripe', STRIPE))
box('wall_left', (0.2, 12, 6), (-6.2, 2.0, 3.0), tiled('wall_l', '#AE9ED0', '#9C8CBF', 1.4, 'brick'), rot=(0, 0, 0))
box('wall_left_low', (0.22, 12, 1.1), (-6.18, 2.0, 0.55), toon('wall_low', WALL_LOW))
box('stripe_left', (0.23, 12, 0.12), (-6.17, 2.0, 1.18), toon('stripe', STRIPE))
box('wall_right', (0.2, 12, 6), (6.2, 2.0, 3.0), tiled('wall_r', '#AE9ED0', '#9C8CBF', 1.4, 'brick'))
box('wall_right_low', (0.22, 12, 1.1), (6.18, 2.0, 0.55), toon('wall_low', WALL_LOW))
box('stripe_right', (0.23, 12, 0.12), (6.17, 2.0, 1.18), toon('stripe', STRIPE))

# high windows, with light coming in
for i, x in enumerate((-3.6, -1.2, 1.2, 3.6)):
    box(f'window_{i}', (1.8, 0.05, 1.1), (x, 5.88, 4.3), toon('window', WINDOW, emit=True))
    box(f'window_bar_{i}', (0.06, 0.06, 1.1), (x, 5.85, 4.3), toon('steel', STEEL))
    box(f'window_sill_{i}', (1.9, 0.12, 0.08), (x, 5.84, 3.72), toon('steel', STEEL))
# mirrors along the back wall, low, with streaks
for i, x in enumerate((-4.4, -2.2, 2.2, 4.4)):
    box(f'mirror_{i}', (2.0, 0.04, 1.6), (x, 5.86, 2.2), toon('mirror', MIRROR, tones=(0.85, 0.93, 1.0)))
    box(f'mirror_frame_{i}', (2.08, 0.035, 1.68), (x, 5.875, 2.2), toon('steel', STEEL))
    for k, dx in enumerate((-0.35, 0.1)):
        box(f'mirror_streak_{i}_{k}', (0.09 + 0.05 * k, 0.01, 1.5), (x + dx, 5.83, 2.2), toon('streak', '#FFFFFF', emit=True),
            rot=(0, math.radians(32), 0))
# ceiling lights (just in frame at the top)
for i, x in enumerate((-4, 0, 4)):
    box(f'lamp_{i}', (2.4, 0.4, 0.06), (x, 3.0, 5.6), toon('lamp', '#FFFFFF', emit=True))


def power_rack(x, y):
    st = toon('steel', STEEL)
    for dx in (-0.6, 0.6):
        for dy in (-0.55, 0.55):
            box('rack_up', (0.08, 0.08, 2.3), (x + dx, y + dy, 1.15), st)
    for dy in (-0.55, 0.55):
        box('rack_top', (1.28, 0.08, 0.08), (x, y + dy, 2.3), st)
    for dx in (-0.6, 0.6):
        box('rack_side', (0.08, 1.18, 0.08), (x + dx, y, 2.3), st)
        box('rack_foot', (0.1, 1.3, 0.06), (x + dx, y, 0.03), st)
        box('jhook', (0.1, 0.16, 0.1), (x + dx, y - 0.62, 1.35), toon('stripe', STRIPE))
    # the bar on the hooks, loaded
    cyl('bar', 0.016, 2.2, (x, y - 0.62, 1.42), toon('steel_light', STEEL_LIGHT), rot=(0, math.pi / 2, 0))
    for side in (-1, 1):
        for k, (r, w, col) in enumerate(((0.225, 0.06, PLATE_RED), (0.225, 0.06, PLATE_RED), (0.16, 0.04, PLATE_BLUE))):
            cyl('plate', r, w, (x + side * (0.78 + k * 0.065), y - 0.62, 1.42), toon('plate_' + col, col),
                rot=(0, math.pi / 2, 0), verts=32)
        cyl('collar', 0.03, 0.04, (x + side * 0.99, y - 0.62, 1.42), toon('steel_light', STEEL_LIGHT), rot=(0, math.pi / 2, 0))


def dumbbell(x, y, z, r, length=0.36, col=RUBBER):
    cyl('db_handle', 0.016, length, (x, y, z), toon('steel_light', STEEL_LIGHT), rot=(0, math.pi / 2, 0), verts=12)
    for s in (-1, 1):
        cyl('db_head', r, r * 1.2, (x + s * (length / 2), y, z), toon('db_' + col, col), rot=(0, math.pi / 2, 0), verts=6)


def dumbbell_rack(x, y):
    st = toon('steel', STEEL)
    for dx in (-1.1, 1.1):
        box('dbr_leg', (0.07, 0.5, 0.9), (x + dx, y, 0.45), st)
    box('dbr_shelf1', (2.3, 0.32, 0.05), (x, y - 0.05, 0.55), st, rot=(math.radians(-12), 0, 0))
    box('dbr_shelf2', (2.3, 0.32, 0.05), (x, y + 0.12, 0.88), st, rot=(math.radians(-12), 0, 0))
    for i in range(5):
        r = 0.06 + 0.008 * i
        dumbbell(x - 0.85 + i * 0.42, y - 0.08, 0.63 + r * 0.5, r, col=RUBBER if i % 2 else '#3A3D46')
        dumbbell(x - 0.85 + i * 0.42, y + 0.1, 0.96 + r * 0.5, r * 0.85, col=PLATE_BLUE if i == 2 else RUBBER)


def bench(x, y, rot):
    o1 = box('bench_pad', (0.32, 1.25, 0.1), (x, y, 0.45), toon('pad', PAD), rot=(0, 0, rot), bevel=0.03)
    box('bench_frame', (0.1, 1.1, 0.06), (x, y, 0.37), toon('steel', STEEL), rot=(0, 0, rot))
    for s in (-0.48, 0.48):
        dx, dy = -math.sin(rot) * s, math.cos(rot) * s
        box('bench_leg', (0.4, 0.07, 0.36), (x + dx, y + dy, 0.18), toon('steel', STEEL), rot=(0, 0, rot))
    return o1


def kettlebell(x, y, r, col):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(x, y, r * 0.95), segments=24, ring_count=12)
    o = bpy.context.object
    o.data.materials.append(toon('kb_' + col, col))
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_torus_add(major_radius=r * 0.62, minor_radius=r * 0.13, location=(x, y, r * 1.85),
                                     rotation=(math.pi / 2, 0, 0))
    t = bpy.context.object
    t.data.materials.append(toon('steel', STEEL))
    bpy.ops.object.shade_smooth()


def plate_tree(x, y):
    st = toon('steel', STEEL)
    box('tree_post', (0.07, 0.07, 1.2), (x, y, 0.6), st)
    box('tree_base', (0.6, 0.6, 0.05), (x, y, 0.025), st)
    for k, (z, r, col) in enumerate(((0.35, 0.225, PLATE_RED), (0.7, 0.2, PLATE_BLUE), (1.0, 0.16, '#F2C230'))):
        for s in (-1, 1):
            cyl('tree_plate', r, 0.05, (x + s * 0.1, y, z), toon('plate_' + col, col), rot=(0, math.pi / 2, 0), verts=32)


power_rack(-3.3, 3.2)
dumbbell_rack(3.2, 4.9)
bench(2.4, 2.2, math.radians(18))
kettlebell(-1.9, 1.6, 0.13, '#2F323A')
kettlebell(-1.55, 1.75, 0.11, PLATE_RED)
kettlebell(-1.25, 1.6, 0.09, '#F2C230')
plate_tree(4.6, 2.6)
# a medicine ball and a jump box at the front corners
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.17, location=(3.4, 0.4, 0.17), segments=24, ring_count=12)
bpy.context.object.data.materials.append(toon('medball', '#4C9A5B'))
bpy.ops.object.shade_smooth()
box('jump_box', (0.75, 0.6, 0.6), (-3.6, 0.6, 0.3), tiled('jumpbox', WOOD, WOOD_LINE, 1.6, 'plank'), rot=(0, 0, math.radians(-14)),
    bevel=0.01)

if opts.get('--hero'):  # the hero on the spot, in his thumbs-up (a check of scale and place only)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=opts['--hero'])
    new = [o for o in bpy.data.objects if o not in before]
    rig = next(o for o in new if o.type == 'ARMATURE')
    for o in [o for o in new if o.type == 'MESH' and o.parent != rig]:
        bpy.data.objects.remove(o)
    rig.location = (0, 0.15, 0.05)
    if rig.animation_data:
        for t in rig.animation_data.nla_tracks:
            t.mute = True
        rig.animation_data.action = bpy.data.actions.get('hero_idle')
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.parent == rig:
            for slot in o.material_slots:
                slot.material = toon('hero_yellow', '#F2CF5B')

# ---------------------------------------------------------------- light, ink, camera
sun = bpy.data.lights.new('key', 'SUN')
sun.energy = 3.0
so = bpy.data.objects.new('key', sun)
sc.collection.objects.link(so)
so.rotation_euler = (math.radians(50), 0, math.radians(-25))
world = bpy.data.worlds.new('w')
sc.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.04, 0.08, 1)

sc.render.engine = 'BLENDER_EEVEE'
sc.view_settings.view_transform = 'Standard'
sc.render.use_freestyle = True
sc.render.line_thickness_mode = 'ABSOLUTE'
sc.render.line_thickness = 1.6 * W / 1920
fs = bpy.context.view_layer.freestyle_settings
ls = fs.linesets[0] if fs.linesets else fs.linesets.new('ink')
ls.select_by_visibility = True
ls.select_silhouette = ls.select_border = ls.select_crease = True
if ls.linestyle is None:
    ls.linestyle = bpy.data.linestyles.new('ink')
ls.linestyle.color = (0.06, 0.05, 0.08)
ls.linestyle.thickness = 1.6
fs.crease_angle = math.radians(140)

cam = bpy.data.cameras.new('cam')
cam.lens = 30
co = bpy.data.objects.new('cam', cam)
sc.collection.objects.link(co)
sc.camera = co
sc.render.resolution_x, sc.render.resolution_y = W, H
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
FEET, HEAD = Vector((0, 0.15, 0.05)), Vector((0, 0.15, 1.75))
sx, sfoot, sheight = (float(v) for v in opts.get('--spot', '0.5,0.77,0.45').split(','))
# distance for the size (a few passes: the pitch changes it a little), then the lens shift for the place
dist = 5.4
for _ in range(6):
    co.location = (0, 0.15 - dist, 1.35)
    target = Vector((0, 0.6, 1.0))
    co.rotation_euler = (target - co.location).to_track_quat('-Z', 'Y').to_euler()
    cam.shift_x = cam.shift_y = 0.0
    bpy.context.view_layer.update()
    f, h = world_to_camera_view(sc, co, FEET), world_to_camera_view(sc, co, HEAD)
    dist *= (h.y - f.y) / sheight
aspect = max(W, H)
cam.shift_x = (f.x - sx) * W / aspect
cam.shift_y = (f.y - (1 - sfoot)) * H / aspect
bpy.context.view_layer.update()
sc.render.image_settings.file_format = 'JPEG'
sc.render.image_settings.quality = 92
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
# where the platform's centre and a 1.70 m figure land in the picture (the app's placement spot)
feet = world_to_camera_view(sc, co, FEET)
head = world_to_camera_view(sc, co, HEAD)
print('GYM spot x %.4f foot %.4f height %.4f' % (feet.x, 1 - feet.y, head.y - feet.y))
print('GYM', OUT)
