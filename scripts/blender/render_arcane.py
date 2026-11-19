"""Render a hero in a painted animated-film look, where the colour comes from the light: a warm key with cast
shadows (hair over the face), shadows that cool toward violet / blue, a warm red-orange band where skin turns
from light to shadow, crisp painted highlights, coloured fill and bounce lights, glowing props that spill their
colour onto what is near them (with bloom), coloured rims, a thin warm-dark line, and a soft, hazy background
with out-of-focus lights.

    blender -b -P scripts/blender/render_arcane.py -- <hero.glb> <out.png> [--clip C --frame F] [--yaw D]
        [--size WxH] [--shot full|bust] [--mood golden|night] [--samples N]

Eevee. Per material: the diffuse light (all lights, with shadows) through Shader to RGB gives a light level and
a light colour; the level is painted into bands (with a brushy edge), the colour tints them, so a warm key, a
cool fill and a teal glow each colour the parts they reach. A glossy pass the same way gives the highlights.
"""
import math
import random
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT = argv[0], argv[1]
opts = dict(zip(argv[2::2], argv[3::2]))
CLIP, FRAME = opts.get('--clip', 'hero_idle'), int(opts.get('--frame', '1'))
YAW = math.radians(float(opts.get('--yaw', '25')))
W, H = (int(x) for x in opts.get('--size', '1080x1350').split('x'))
SHOT = opts.get('--shot', 'full')
MOOD = opts.get('--mood', 'golden')

MOODS = {
    # golden hour through a window: amber key, lavender fill, warm bounce off the floor
    'golden': dict(key=(1.0, 0.74, 0.46), key_w=1500, fill=(0.55, 0.6, 1.0), fill_w=32, bounce=(1.0, 0.5, 0.42),
                   bounce_w=60, rim_a=(1.0, 0.62, 0.3), rim_b=(0.55, 0.6, 1.0), shadow=(0.42, 0.36, 0.58),
                   terminator=(1.0, 0.42, 0.28), sky=((0.16, 0.09, 0.05), (0.75, 0.45, 0.2)),
                   haze=(1.0, 0.78, 0.55), haze_d=0.018, bokeh=((1.0, 0.7, 0.35), (1.0, 0.85, 0.6), (0.9, 0.5, 0.3)),
                   lift=(0.96, 0.96, 1.06), gain=(1.08, 1.0, 0.9)),
    # night in the undercity: low warm key, deep blue-violet fill, magenta rim, neon haze
    'night': dict(key=(1.0, 0.6, 0.5), key_w=950, fill=(0.38, 0.32, 1.0), fill_w=70, bounce=(0.9, 0.3, 0.7),
                  bounce_w=90, rim_a=(1.0, 0.35, 0.65), rim_b=(0.35, 0.45, 1.0), shadow=(0.3, 0.28, 0.6),
                  terminator=(1.0, 0.35, 0.4), sky=((0.012, 0.01, 0.03), (0.08, 0.05, 0.16)),
                  haze=(0.6, 0.5, 1.0), haze_d=0.022, bokeh=((1.0, 0.35, 0.7), (0.4, 0.5, 1.0), (0.3, 0.95, 0.85)),
                  lift=(0.95, 0.94, 1.1), gain=(1.04, 0.97, 1.02)),
}
M = MOODS[MOOD]
GLOW_COL = (0.25, 0.95, 0.85)
GLOW = 12.0
LINE = (0.035, 0.018, 0.02, 1)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 24
bpy.ops.import_scene.gltf(filepath=GLB)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.parent != arm]:
    bpy.data.objects.remove(o)
ad = arm.animation_data
if ad:
    for t in ad.nla_tracks:
        t.mute = True
    if CLIP and CLIP in bpy.data.actions:
        ad.action = bpy.data.actions[CLIP]
sc.frame_set(FRAME)


def sock(sockets, name, kind='RGBA'):
    return next(s for s in sockets if s.name == name and s.type == kind)


def mix(nt, a, b, blend='MULTIPLY', fac=1.0):
    m = nt.nodes.new('ShaderNodeMix')
    m.data_type = 'RGBA'
    m.blend_type = blend
    if isinstance(fac, (int, float)):
        m.inputs[0].default_value = fac
    else:
        nt.links.new(fac, m.inputs[0])
    for s, v in (('A', a), ('B', b)):
        if isinstance(v, tuple):
            sock(m.inputs, s).default_value = (*v[:3], 1)
        else:
            nt.links.new(v, sock(m.inputs, s))
    return sock(m.outputs, 'Result')


def ramp(nt, src, stops, interp='LINEAR'):
    r = nt.nodes.new('ShaderNodeValToRGB')
    r.color_ramp.interpolation = interp
    els = r.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
    els[1].position, els[1].color = stops[1][0], (*stops[1][1], 1)
    for p, c in stops[2:]:
        e = els.new(p)
        e.color = (*c, 1)
    nt.links.new(src, r.inputs['Fac'])
    return r.outputs['Color']


def bw(nt, col):
    n = nt.nodes.new('ShaderNodeRGBToBW')
    nt.links.new(col, n.inputs['Color'])
    return n.outputs['Val']


def math_node(nt, op, a, b=None, c=None):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    for i, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs['Value']


def light_pass(nt, shader_type, nrm, rough=None):
    """(light level, light colour normalised to level 1) of one shader through Shader to RGB"""
    sh = nt.nodes.new(shader_type)
    if rough is not None:
        sh.inputs['Roughness'].default_value = rough
    if nrm:
        nt.links.new(nrm, sh.inputs['Normal'])
    s2r = nt.nodes.new('ShaderNodeShaderToRGB')
    nt.links.new(sh.outputs[0], s2r.inputs['Shader'])
    level = bw(nt, s2r.outputs['Color'])
    # hue: colour / level (the colour of whatever light reaches here), toward neutral where it is dark
    div = nt.nodes.new('ShaderNodeVectorMath')
    div.operation = 'DIVIDE'
    nt.links.new(s2r.outputs['Color'], div.inputs[0])
    safe = math_node(nt, 'MAXIMUM', level, 0.02)
    cmb = nt.nodes.new('ShaderNodeCombineXYZ')
    for i in range(3):
        nt.links.new(safe, cmb.inputs[i])
    nt.links.new(cmb.outputs['Vector'], div.inputs[1])
    hue = mix(nt, (1, 1, 1), div.outputs['Vector'], 'MIX',
              math_node(nt, 'MINIMUM', math_node(nt, 'MULTIPLY', level, 12.0), 1.0))
    return level, hue


def paint(m):
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if not bsdf or not out:
        return
    if any(k in m.name.lower() for k in ('eye', 'cornea', 'teeth', 'tongue')):
        return   # eyes and mouth keep their own shading
    base = bsdf.inputs['Base Color']
    col = base.links[0].from_socket if base.links else tuple(base.default_value)
    if m.name.startswith('gear_glow'):
        e = nt.nodes.new('ShaderNodeEmission')
        e.inputs['Color'].default_value = (*GLOW_COL, 1)
        e.inputs['Strength'].default_value = GLOW
        nt.links.new(e.outputs['Emission'], out.inputs['Surface'])
        return
    skin = m.name.startswith('skin')
    hair = m.name.startswith('hair')
    metal = bsdf.inputs['Metallic'].default_value > 0.3
    alpha = bsdf.inputs['Alpha'].links[0].from_socket if bsdf.inputs['Alpha'].links else None
    nrm = bsdf.inputs['Normal'].links[0].from_socket if bsdf.inputs['Normal'].links else None

    level, hue = light_pass(nt, 'ShaderNodeBsdfDiffuse', nrm)
    if opts.get('--debug') == 'level':   # the raw light level / 4, to calibrate the bands
        e = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(math_node(nt, 'MULTIPLY', level, 0.25), e.inputs['Color'])
        nt.links.new(e.outputs['Emission'], out.inputs['Surface'])
        return
    # a brushy edge: the level wobbles with stroke-shaped noise before it is banded
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1, 1, 3)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 9.0
    nz.inputs['Detail'].default_value = 4.0
    nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    wob = math_node(nt, 'MULTIPLY_ADD', nz.outputs['Fac'], 0.16, -0.08)
    # measured: fill-only shadow ~0.1-0.3, the key's light ~1-2 -> scale so the key's edge falls mid-ramp
    lv = math_node(nt, 'ADD', math_node(nt, 'MULTIPLY', level, 0.8), wob)
    # painted bands: shadow (cool) -> the warm terminator (skin glows red-orange there) -> mid -> lit
    term = M['terminator'] if skin else tuple(0.5 + 0.5 * c for c in M['terminator'])
    sh_c = tuple(c * 0.62 for c in M['shadow'])   # deep shadows, like the film's
    bands = ramp(nt, lv, [(0.12, sh_c), (0.2, tuple(0.5 * a + 0.5 * b for a, b in zip(sh_c, term))),
                          (0.27, tuple(0.62 * c + 0.2 for c in term) if skin else (0.72, 0.68, 0.7)),
                          (0.36, (0.95, 0.93, 0.95)), (0.55, (1.1, 1.08, 1.06)), (0.68, (1.7, 1.62, 1.48))])
    # the light's own colour on top of the bands (key warm, fill cool, glow teal where each reaches)
    lit = mix(nt, bands, mix(nt, (1, 1, 1), hue, 'MIX', 0.45 if skin else 0.75))   # skin: peach, not orange
    shaded = mix(nt, col, lit)
    # in deep shadow the colour also loses some saturation toward the shadow tone
    deep = ramp(nt, lv, [(0.1, (0.4, 0.4, 0.4)), (0.22, (0, 0, 0))])
    shaded = mix(nt, shaded, mix(nt, bw(nt, shaded), sh_c), 'MIX', bw(nt, deep))
    # painted highlights: a glossy pass cut into a crisp shape, in the light's colour
    spec_lv, spec_hue = light_pass(nt, 'ShaderNodeBsdfGlossy', nrm, 0.22 if (metal or hair) else 0.32)
    strength = 0.5 if metal else (0.22 if skin else (0.4 if hair else 0.1))
    # only the hot core of the glossy light becomes a highlight (small, crisp shapes)
    spec = ramp(nt, math_node(nt, 'MULTIPLY', spec_lv, 0.06), [(0.55, (0, 0, 0)), (0.7, (strength,) * 3)])
    final = mix(nt, shaded, mix(nt, spec, spec_hue), 'ADD', 1.0)
    # rims: fresnel, one colour where the surface turns to the camera's left, another to its right
    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.3
    if nrm:
        nt.links.new(nrm, lw.inputs['Normal'])
    rim = ramp(nt, lw.outputs['Facing'], [(0.64, (0, 0, 0)), (0.78, (0.8, 0.8, 0.8))])
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    vt = nt.nodes.new('ShaderNodeVectorTransform')
    vt.vector_type = 'NORMAL'
    vt.convert_from, vt.convert_to = 'WORLD', 'CAMERA'
    nt.links.new(geo.outputs['Normal'], vt.inputs['Vector'])
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(vt.outputs['Vector'], sep.inputs['Vector'])
    side = nt.nodes.new('ShaderNodeMapRange')
    side.inputs['From Min'].default_value, side.inputs['From Max'].default_value = -0.3, 0.3
    nt.links.new(sep.outputs['X'], side.inputs['Value'])
    rim_col = mix(nt, M['rim_b'], M['rim_a'], 'MIX', side.outputs['Result'])
    final = mix(nt, final, mix(nt, rim, rim_col), 'ADD', 1.1)
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(final, em.inputs['Color'])
    surf = em.outputs['Emission']
    if alpha:
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(alpha, mx.inputs['Fac'])
        nt.links.new(tr.outputs['BSDF'], mx.inputs[1])
        nt.links.new(em.outputs['Emission'], mx.inputs[2])
        surf = mx.outputs['Shader']
    nt.links.new(surf, out.inputs['Surface'])


line = bpy.data.materials.new('line')
line.use_nodes = True
line.use_backface_culling = True
ln = line.node_tree
for n in list(ln.nodes):
    if n.type != 'OUTPUT_MATERIAL':
        ln.nodes.remove(n)
le = ln.nodes.new('ShaderNodeEmission')
le.inputs['Color'].default_value = LINE
ln.links.new(le.outputs['Emission'], ln.nodes['Material Output'].inputs['Surface'])

done = set()
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    for slot in o.material_slots:
        m = slot.material
        if m and m.use_nodes and m.name not in done:
            paint(m)
            m.use_backface_culling = True
            done.add(m.name)
    if any(s.material and s.material.name.startswith(('skin', 'gear', 'hair', 'shoes')) for s in o.material_slots):
        o.data.materials.append(line)
        sol = o.modifiers.new('line', 'SOLIDIFY')
        sol.thickness = 0.0026 / o.matrix_world.to_scale().x
        sol.offset = 1.0
        sol.use_flip_normals = True
        sol.use_rim = False
        sol.material_offset = len(o.material_slots) - 1

# ---------------------------------------------------------------- the scene

engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
ee = sc.eevee
ee.taa_render_samples = int(opts.get('--samples', '64'))
for k, v in (('use_shadows', True), ('volumetric_tile_size', '4'), ('volumetric_samples', 48),
             ('volumetric_end', 30.0), ('use_volumetric_shadows', True), ('volumetric_shadow_samples', 32),
             ('shadow_ray_count', 2), ('shadow_step_count', 8)):
    if hasattr(ee, k):
        try:
            setattr(ee, k, v)
        except TypeError:
            pass
sc.view_settings.view_transform = 'AgX'
sc.view_settings.exposure = float(opts.get('--exposure', '0.95'))
try:
    sc.view_settings.look = 'AgX - Punchy'
except TypeError:
    pass

# world: seen as a dusky gradient behind; lights nothing (the light comes from the lamps)
world = bpy.data.worlds.new('w')
sc.world = world
world.use_nodes = True
wt = world.node_tree
bg = wt.nodes['Background']
lp = wt.nodes.new('ShaderNodeLightPath')
gtc = wt.nodes.new('ShaderNodeTexCoord')
sepw = wt.nodes.new('ShaderNodeSeparateXYZ')
wt.links.new(gtc.outputs['Generated'], sepw.inputs['Vector'])
sky = wt.nodes.new('ShaderNodeValToRGB')
sky.color_ramp.elements[0].position, sky.color_ramp.elements[0].color = 0.45, (*M['sky'][0], 1)
sky.color_ramp.elements[1].position, sky.color_ramp.elements[1].color = 0.62, (*M['sky'][1], 1)
wt.links.new(sepw.outputs['Z'], sky.inputs['Fac'])
wm = wt.nodes.new('ShaderNodeMix')
wm.data_type = 'RGBA'
wt.links.new(lp.outputs['Is Camera Ray'], wm.inputs[0])
sock(wm.inputs, 'A').default_value = (0, 0, 0, 1)
wt.links.new(sky.outputs['Color'], sock(wm.inputs, 'B'))
wt.links.new(sock(wm.outputs, 'Result'), bg.inputs['Color'])
vol = wt.nodes.new('ShaderNodeVolumePrincipled')
vol.inputs['Density'].default_value = M['haze_d']
vol.inputs['Color'].default_value = (*M['haze'], 1)
wt.links.new(vol.outputs['Volume'], wt.nodes['World Output'].inputs['Volume'])


def light(name, kind, loc, aim, energy, color, size=0.5, spot=None, shadow=False):
    ld = bpy.data.lights.new(name, kind)
    # only the key casts shadows: soft shadows from the big fills came out as grain once banded
    ld.use_shadow = shadow
    for k, v in (('shadow_maximum_resolution', 0.0004), ('shadow_filter_radius', 2.5), ('use_shadow_jitter', False)):
        if hasattr(ld, k):
            setattr(ld, k, v)
    # only the shaft lights the haze: the key and fills in the fog laid a milky veil over her
    ld.volume_factor = 1.0 if name == 'shaft' else 0.0
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.size = size
    else:
        ld.shadow_soft_size = size
    if kind == 'SPOT':
        ld.spot_size = math.radians(spot or 35)
        ld.spot_blend = 0.5
    o = bpy.data.objects.new(name, ld)
    sc.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o


yaw_v = Vector((math.sin(YAW), -math.cos(YAW), 0))
right = Vector((math.cos(YAW), math.sin(YAW), 0))
# key: high and to the camera's right, small and hard enough for the hair to cast shadows on the face
light('key', 'SPOT', Vector((0, 0, 2.7)) + yaw_v * 0.9 + right * 2.6, (0, 0, 1.2), M['key_w'] * 6, M['key'], 0.03, 38, shadow=True)
# fill: the other side, soft, the shadows' colour
light('fill', 'AREA', Vector((0, 0, 1.6)) + yaw_v * 1.4 - right * 2.4, (0, 0, 1.2), M['fill_w'], M['fill'], 2.5)
# bounce: from low in front, warm (golden) or magenta (night)
light('bounce', 'AREA', Vector((0, 0, 0.15)) + yaw_v * 1.4, (0, 0, 1.0), M['bounce_w'], M['bounce'], 2.0)
# a shaft through the haze behind her
light('shaft', 'SPOT', Vector((0, 0, 4.4)) - yaw_v * 2.6 + right * 1.0, (-0.3, 0, 0), 5000, M['key'], 0.05, 20)

# glow spill: the glowing parts light what is near them
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    glow_idx = {i for i, s in enumerate(o.material_slots) if s.material and s.material.name.startswith('gear_glow')}
    if not glow_idx:
        continue
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    pts = [o.matrix_world @ p.center for p in me.polygons if p.material_index in glow_idx]
    ev.to_mesh_clear()
    if pts:
        c = sum(pts, Vector()) / len(pts)
        light('glow_' + o.name, 'POINT', c, c + Vector((0, 0, -1)), 40, GLOW_COL, 0.04)

# floor
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
floor = bpy.context.active_object
fm = bpy.data.materials.new('floor')
fm.use_nodes = True
fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.06, 0.055, 0.05, 1)
floor.data.materials.append(fm)
paint(fm)
for n in fm.node_tree.nodes:
    if n.type == 'LAYER_WEIGHT':
        n.inputs['Blend'].default_value = 0.0
    if n.type == 'MATH' and n.operation == 'MULTIPLY_ADD':
        n.inputs[1].default_value, n.inputs[2].default_value = 0.0, 0.0

# out-of-focus lights far behind
random.seed(4)
for i in range(18):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=random.uniform(0.015, 0.04), segments=12, ring_count=8)
    b = bpy.context.active_object
    b.location = -yaw_v * random.uniform(5, 9) + right * random.uniform(-4, 4) + Vector((0, 0, random.uniform(0.4, 3.4)))
    bmat = bpy.data.materials.new('bokeh')
    bmat.use_nodes = True
    nt = bmat.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (*random.choice(M['bokeh']), 1)
    e.inputs['Strength'].default_value = random.uniform(6, 14)
    nt.links.new(e.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
    b.data.materials.append(bmat)

# ---------------------------------------------------------------- camera

pts = []
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent == arm:
        me = o.evaluated_get(dg).to_mesh()
        pts += [o.matrix_world @ v.co for v in list(me.vertices)[::7]]
        o.evaluated_get(dg).to_mesh_clear()
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
cam = bpy.data.cameras.new('cam')
co = bpy.data.objects.new('cam', cam)
sc.collection.objects.link(co)
sc.camera = co
cam.sensor_fit = 'VERTICAL' if W < H else 'HORIZONTAL'
if SHOT == 'bust':
    target = arm.matrix_world @ arm.pose.bones['CC_Head'].head
    cam.lens = 85
    co.location = target + yaw_v * 1.35 + Vector((0, 0, 0.03))
    cam.dof.aperture_fstop = 2.8   # the whole face sharp, the background still soft
else:
    target = (lo + hi) / 2
    cam.lens = 45
    # plates leave room round the hero (the app's backdrops put them at ~2/3 of the height)
    dist = (hi.z - lo.z) / (2 * math.tan(cam.angle_y / 2)) * (1.8 if opts.get('--plate') == '1' else 1.12)
    co.location = target + yaw_v * dist + Vector((0, 0, -0.12))
    cam.dof.aperture_fstop = 4.0
# focus on the eyes (the head bone's pivot sits in the neck, ~10 cm behind the face: the face went soft)
eye_pts = []
for o in bpy.data.objects:
    if o.type == 'MESH' and any(s_.material and s_.material.name in ('eye_l', 'eye_r') for s_ in o.material_slots):
        me = o.evaluated_get(dg).to_mesh()
        eye_pts += [o.matrix_world @ v.co for v in me.vertices]
        o.evaluated_get(dg).to_mesh_clear()
focus = sum(eye_pts, Vector()) / len(eye_pts) if eye_pts else target
cam.dof.use_dof = True
cam.dof.focus_distance = (focus - co.location).dot((target - co.location).normalized())
co.rotation_euler = (target - co.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.film_transparent = False

# --plate 1: the world without the hero (the app's HERO_BACKDROPS): the hero is hidden, the camera can be
# shifted so they stand at --spot-x of the width, and their spot (feet centre, feet line, head-to-feet, as
# fractions of the picture) is printed for HeroScreen.
if opts.get('--plate') == '1':
    from bpy_extras.object_utils import world_to_camera_view
    cam.shift_x = 0.5 - float(opts.get('--spot-x', '0.5'))
    cam.dof.use_dof = False
    bpy.context.view_layer.update()
    feet = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    top = Vector((feet.x, feet.y, hi.z))
    a, b = world_to_camera_view(sc, co, feet), world_to_camera_view(sc, co, top)
    print('SPOT', {'x': round(a.x, 4), 'foot': round(1 - a.y, 4), 'height': round(b.y - a.y, 4), 'yaw': 0})
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.parent == arm:
            o.hide_render = True
        if o.type == 'LIGHT' and o.name.startswith('glow_'):
            bpy.data.objects.remove(o)

# ---------------------------------------------------------------- bloom and grade

tree = bpy.data.node_groups.new('comp', 'CompositorNodeTree')
sc.compositing_node_group = tree
rl = tree.nodes.new('CompositorNodeRLayers')
gl = tree.nodes.new('CompositorNodeGlare')
out = tree.nodes.new('NodeGroupOutput')
tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
for k, v in (('Type', 'Bloom'), ('Quality', 'High'), ('Threshold', 0.9), ('Strength', 0.8), ('Size', 0.6)):
    if k in gl.inputs:
        try:
            gl.inputs[k].default_value = v
        except TypeError:
            pass
tree.links.new(rl.outputs['Image'], gl.inputs['Image'])
last = gl.outputs['Image']
if opts.get('--grade') == '1':   # Blender 5's colour balance inputs differ; it turned the golden mood navy
  try:
    cb = tree.nodes.new('CompositorNodeColorBalance')
    tree.links.new(last, cb.inputs['Image'])
    for k, v in (('Lift', M['lift']), ('Gain', M['gain'])):
        for s in cb.inputs:
            if s.name.startswith(k) and s.type == 'RGBA':
                s.default_value = (*v, 1)
    last = cb.outputs['Image']
  except (RuntimeError, KeyError):
    pass
# contrast: an S-curve (darker darks, brighter lights)
try:
    cv = tree.nodes.new('CompositorNodeCurveRGB')
    c = cv.mapping.curves[3]
    c.points[0].location = (0.0, 0.0)
    c.points[1].location = (1.0, 1.0)
    c.points.new(0.22, 0.13)
    c.points.new(0.72, 0.84)
    cv.mapping.update()
    img_in = next(s_ for s_ in cv.inputs if s_.name == 'Image')
    tree.links.new(last, img_in)
    last = next(s_ for s_ in cv.outputs if s_.name == 'Image')
except (RuntimeError, KeyError, StopIteration, AttributeError) as e:
    print('CURVE skipped', e)
tree.links.new(last, out.inputs[0])

sc.render.filepath = OUT
if OUT.lower().endswith(('.jpg', '.jpeg')):
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 88
if opts.get('--debug'):
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.compositing_node_group = None
    ee.use_volumetric_shadows = False if hasattr(ee, 'use_volumetric_shadows') else None
    world.node_tree.links.remove(world.node_tree.nodes['World Output'].inputs['Volume'].links[0])
    cam.dof.use_dof = False
bpy.ops.render.render(write_still=True)
print('ARCANE', MOOD, OUT)
