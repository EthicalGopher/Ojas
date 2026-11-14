"""Render a toon hero (materials named toon_*) the way the app draws it: three flat tones and a black outline.

    blender -b -P scripts/blender/render_toon.py -- <hero.glb> <out.png> [--clip C --frame F] [--yaw D]
        [--size WxH] [--transparent 1] [--hide mesh,mesh] [--backdrop plate.jpg --crop X --cx PX]

The app (avatarViewerHtml.ts) uses MeshToonMaterial with a 3-step ramp (110/190/255) and a back-face hull
pushed out 6 mm, black. Here: diffuse lighting -> Shader to RGB -> constant ramp, times the material's colour
map (and its normal map), plus a Solidify hull with flipped normals in black.

--backdrop: the hero over a photo (the VS screen's scene): the photo's columns from --crop, --size wide; the hero
centred on column --cx, with a soft contact shadow; written as JPEG.
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT = argv[0], argv[1]
opts = dict(zip(argv[2::2], argv[3::2]))
CLIP, FRAME = opts.get('--clip'), int(opts.get('--frame', '1'))
YAW = math.radians(float(opts.get('--yaw', '0')))
W, H = (int(x) for x in opts.get('--size', '720x1080').split('x'))
TONES = (110 / 255, 190 / 255, 1.0)
OUTLINE = 0.006

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 24
bpy.ops.import_scene.gltf(filepath=GLB)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.parent != arm]:
    bpy.data.objects.remove(o)
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.name in opts.get('--hide', '').split(',')]:
    bpy.data.objects.remove(o)
ad = arm.animation_data
if ad:
    for t in ad.nla_tracks:
        t.mute = True
    if CLIP:
        ad.action = bpy.data.actions[CLIP]
sc.frame_set(FRAME)


def toonify(m):
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    base = bsdf.inputs['Base Color']
    col_src = base.links[0].from_socket if base.links else None
    col_val = tuple(base.default_value)
    nrm_src = bsdf.inputs['Normal'].links[0].from_socket if bsdf.inputs['Normal'].links else None
    diff = nt.nodes.new('ShaderNodeBsdfDiffuse')
    diff.inputs['Color'].default_value = (1, 1, 1, 1)
    if nrm_src:
        nt.links.new(nrm_src, diff.inputs['Normal'])
    s2r = nt.nodes.new('ShaderNodeShaderToRGB')
    nt.links.new(diff.outputs['BSDF'], s2r.inputs['Shader'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (TONES[0],) * 3 + (1,)
    els[1].position, els[1].color = 0.33, (TONES[1],) * 3 + (1,)
    e = els.new(0.66)
    e.color = (TONES[2],) * 3 + (1,)
    bw = nt.nodes.new('ShaderNodeRGBToBW')
    nt.links.new(s2r.outputs['Color'], bw.inputs['Color'])
    nt.links.new(bw.outputs['Val'], ramp.inputs['Fac'])
    mul = nt.nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    nt.links.new(ramp.outputs['Color'], mul.inputs['A'])
    if col_src:
        nt.links.new(col_src, mul.inputs['B'])
    else:
        mul.inputs['B'].default_value = col_val
    emit = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(mul.outputs['Result'], emit.inputs['Color'])
    nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])


ink = bpy.data.materials.new('outline_ink')
ink.use_nodes = True
ink.use_backface_culling = True
nt = ink.node_tree
for n in list(nt.nodes):
    if n.type != 'OUTPUT_MATERIAL':
        nt.nodes.remove(n)
em = nt.nodes.new('ShaderNodeEmission')
em.inputs['Color'].default_value = (0.008, 0.008, 0.01, 1)
nt.links.new(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    outlined = False
    for slot in o.material_slots:
        m = slot.material
        if m and m.name.startswith('toon_') and m.use_nodes:
            toonify(m)
            m.use_backface_culling = True
            outlined = outlined or not m.name.startswith(('toon_eye', 'toon_ink'))
    if outlined:
        o.data.materials.append(ink)
        sol = o.modifiers.new('outline', 'SOLIDIFY')
        sol.thickness = OUTLINE / o.matrix_world.to_scale().x
        sol.offset = 1.0
        sol.use_flip_normals = True
        sol.use_rim = False
        sol.material_offset = len(o.material_slots) - 1

sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.view_settings.view_transform = 'Standard'
sc.render.film_transparent = opts.get('--transparent') == '1'
world = bpy.data.worlds.new('w')
sc.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.86, 0.8, 0.96, 1)   # the concept's lilac
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0 if False else 1.0
sun = bpy.data.lights.new('key', 'SUN')
sun.energy = 3.2
so = bpy.data.objects.new('key', sun)
sc.collection.objects.link(so)
so.rotation_euler = (math.radians(55), 0, math.radians(-35))
# frame the posed body
bpy.context.view_layer.update()
pts = []
for o in bpy.data.objects:
    if o.type == 'MESH':
        dg = bpy.context.evaluated_depsgraph_get()
        me = o.evaluated_get(dg).to_mesh()
        pts += [o.matrix_world @ v.co for v in me.vertices]
        o.evaluated_get(dg).to_mesh_clear()
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
c = (lo + hi) / 2
size = max(hi.z - lo.z, (hi.x - lo.x) * H / W) * 1.08
cam = bpy.data.cameras.new('cam')
cam.type = 'ORTHO'
cam.ortho_scale = size if W <= H else size * W / H
co = bpy.data.objects.new('cam', cam)
sc.collection.objects.link(co)
sc.camera = co
co.location = (c.x + 5 * math.sin(YAW), c.y - 5 * math.cos(YAW), c.z)
co.rotation_euler = (math.radians(90), 0, YAW)
sc.render.resolution_x, sc.render.resolution_y = W, H
BACKDROP = opts.get('--backdrop')
if BACKDROP:
    sc.render.film_transparent = True
    # the figure's centre goes to column --cx: shift the camera sideways
    cx = float(opts.get('--cx', W / 2))
    co.location.x -= (cx - W / 2) / W * cam.ortho_scale * (1 if W >= H else W / H)
sc.render.filepath = OUT + '.png' if BACKDROP else OUT
bpy.ops.render.render(write_still=True)
if BACKDROP:
    import numpy as np
    fig = bpy.data.images.load(OUT + '.png')
    F = np.array(fig.pixels[:], np.float32).reshape(H, W, 4)
    plate = bpy.data.images.load(BACKDROP)
    pw, ph = plate.size
    P = np.array(plate.pixels[:], np.float32).reshape(ph, pw, 4)
    x0 = int(opts.get('--crop', '0'))
    B = P[:H, x0:x0 + W, :3].copy()
    # contact shadow: a soft dark ellipse under the feet (rows are bottom-up in Blender images)
    rows = np.where(F[..., 3].max(1) > 0.5)[0]
    foot = rows.min() if len(rows) else 0
    yy, xx = np.mgrid[0:H, 0:W]
    e = ((xx - cx) / (W * 0.16)) ** 2 + ((yy - foot - 4) / (H * 0.02)) ** 2
    B *= (1 - 0.45 * np.exp(-e * 2.0))[..., None]
    a = F[..., 3:4]
    C = F[..., :3] * a + B * (1 - a)    # straight alpha; both images' pixels are sRGB values (8-bit files)
    out = bpy.data.images.new('vs', W, H, alpha=False)
    out.pixels[:] = np.concatenate([C, np.ones((H, W, 1), np.float32)], -1).ravel()
    out.filepath_raw = OUT
    out.file_format = 'JPEG'
    out.save(quality=90)
    import os
    os.remove(OUT + '.png')
print('TOON', OUT)
