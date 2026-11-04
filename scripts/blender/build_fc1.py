"""Build the FC1 base character for the app from the ludovisions FC1 GLB.

    blender -b --python scripts/blender/build_fc1.py -- <fc1.glb> <clips.glb> <out.glb>

<fc1.glb>   the downloaded character (195 MB, CC-style rig, 102 bones)
<clips.glb> any Rocketbox avatar from web/avatars (carries squat / idle / rest / cheer / stand)
<out.glb>   phone-sized result with the five clips retargeted onto FC1's own skeleton

What it does:
- drops the helper sphere, the faint fly-away hair layers, the shape keys, the vertex colours, and decimates the
  densest hair cards and the shoes;
- names materials so the runtime recognises them (skin_*, hair_*, lash_opacity, shoes_*);
- removes the character's dress and dresses her in sportswear (tank top, shorts, leggings) made from
  shells of the body's skin;
- removes the skin under the sportswear (it poked through the cloth);
- shortens bone names to CC_<part> (L_Upperarm, R_Mid1, ...);
- retargets the Rocketbox clips onto FC1's own skeleton, with relaxed fingers (retarget_clips.py);
- shrinks textures (2048 for the face, 1024 for the rest) and writes WebP.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retarget_clips import import_glb, retarget_clips, parse_extra  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
FC1_PATH, CLIPS_PATH, OUT_PATH = argv[:3]
EXTRA = parse_extra(argv[3:])  # Mixamo clips: name=clip.fbx[,inplace][,xN] (retarget_clips.py)
PREFIX = 'ludovisions_FC1_'

# Hair layers by material: fly-aways and near-invisible wisps are dropped, big card layers decimated.
HAIR_DROP = {'mat_01', 'mat_20', 'mat_04', 'mat_16'}
HAIR_DECIMATE = 0.35
SHOES_DECIMATE = 0.22

MATERIAL_NAMES = {
    'mat_26': 'skin_head', 'mat_25': 'skin_body', 'mat_24': 'skin_arm', 'mat_27': 'skin_leg',
    'mat_23': 'skin_nails', 'mat_22': 'lash_opacity', 'mat_28': 'tongue',
    'mat_11': 'eye_r', 'mat_12': 'eye_l', 'mat_13': 'eye_cornea_r', 'mat_14': 'eye_cornea_l',
    'mat_18': 'teeth_upper', 'mat_29': 'teeth_lower',
    'mat_05': 'shoes_upper', 'mat_21': 'shoes_sole', 'mat_17': 'shoes_lace', 'mat_30': 'shoes_trim',
    'mat_02': 'hair_tail', 'mat_19': 'hair_bun', 'mat_15': 'hair_strand', 'mat_03': 'hair_wisp',
    'mat_07': 'hair_scalp',
}
# The character's own dress (and its lace); removed, she wears the sportswear made below.
DRESS = {'mat_08', 'mat_10', 'mat_09', 'mat_06'}


def short(name):
    return name[len(PREFIX):] if name.startswith(PREFIX) else name


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24

# ---------------------------------------------------------------- character

for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
fc1_objects = import_glb(FC1_PATH)
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
tgt = next(o for o in fc1_objects if o.type == 'ARMATURE')
if tgt.animation_data:
    tgt.animation_data_clear()
for o in list(fc1_objects):
    if o.type == 'EMPTY' or (o.type == 'MESH' and not o.parent):
        bpy.data.objects.remove(o)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']

for o in meshes:
    if o.data.shape_keys:
        o.shape_key_clear()
    # CC vertex colours are authoring data; three.js would multiply them into the textures.
    for attr in list(o.data.color_attributes):
        o.data.color_attributes.remove(attr)
    if all(m and short(m.name) in DRESS for m in o.data.materials):
        bpy.data.objects.remove(o)
        continue
    for slot in o.material_slots:
        m = slot.material
        if m and short(m.name) in MATERIAL_NAMES:
            m.name = MATERIAL_NAMES[short(m.name)]
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
assert not any(m and short(m.name) in DRESS for o in meshes for m in o.data.materials), 'dress shares a mesh'


def drop_faces(o, names):
    idx = {i for i, m in enumerate(o.data.materials) if m and short(m.name) in names}
    if not idx:
        return
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in idx], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(o.data)
    bm.free()


def decimate(o, ratio):
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new('decimate', 'DECIMATE')
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    mod.delimit = {'UV', 'MATERIAL', 'SEAM'}
    # The armature modifier must stay last, so the decimate runs on the rest mesh.
    while o.modifiers[0].name != 'decimate':
        bpy.ops.object.modifier_move_up(modifier='decimate')
    bpy.ops.object.modifier_apply(modifier='decimate')


for o in meshes:
    names = {m.name for m in o.data.materials if m}
    if names & {'hair_bun', 'hair_tail'}:
        drop_faces(o, HAIR_DROP)
        decimate(o, HAIR_DECIMATE)
    elif names & {'shoes_upper'}:
        decimate(o, SHOES_DECIMATE)
    part = next((p for p in ('skin', 'hair', 'eye', 'teeth', 'tongue', 'shoes') if any(n.startswith(p) for n in names)), 'mesh')
    o.name = 'FC1_' + ('body' if part == 'skin' else part)
    print('MESH', o.name, len(o.data.polygons), sorted(names))

# ---------------------------------------------------------------- sportswear

# Her outfit: tank top, training shorts over leggings (sport_* materials). The
# pieces are shells of the body's own skin, cut along clean planes, smoothed so the cloth spans the
# body's small dips and bumps, and pushed out along the normals. They carry the body's skin weights,
# so they follow it through every pose. Measurements are world metres, front is -Y.
SPORT_COLORS = {  # sRGB
    'sport_top': '#16161B', 'sport_shorts': '#1D1D23', 'sport_leggings': '#121215', 'sport_trim': '#E8458B',
}
WAISTBAND_Z = 1.03      # leggings and shorts come up to the navel
ANKLE_Z = 0.10          # leggings end just inside the shoe tops
SHORTS_HEM_Z = 0.64     # shorts stop above the knee
TANK_HEM_Z = 0.99       # the top's hem tucks under the shorts' waistband
# The top's upper edge seen from the front, as (|x|, z) points: scoop neck, straps, armholes.
TANK_EDGE = [(0.0, 1.27), (0.05, 1.30), (0.065, 1.47), (0.105, 1.47), (0.118, 1.36), (0.135, 1.26), (0.16, 1.20), (0.3, 1.18)]
TRIM = 0.012            # width of the pink bands
BUST_FRONT = (-0.115, 0.012)  # the top compresses the bust like a sports top: in front of this depth,
                              # depth d becomes 0.012 * tanh(d / 0.012), so the tip rounds off
STRIPE_Y = 0.012        # half width of the stripe down the outside of each leg
LEG_AXIS_X = 0.09


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def sport_material(name):
    h = SPORT_COLORS[name].lstrip('#')
    rgb = [srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.72
    return m


def edge_segments(points):
    """The polyline as world planes on both sides of the body: (point on it, normal pointing out of the cloth)."""
    planes = []
    for (x1, z1), (x2, z2) in zip(points, points[1:]):
        n = Vector((-(z2 - z1), 0.0, x2 - x1)).normalized()  # left of the direction of travel: up / outward
        for sx in (1, -1):
            planes.append((Vector((x1 * sx, 0.0, z1)), Vector((n.x * sx, 0.0, n.z))))
    return planes


def edge_z(points, ax):
    for (x1, z1), (x2, z2) in zip(points, points[1:]):
        if x1 <= ax <= x2:
            return z1 + (z2 - z1) * ((ax - x1) / (x2 - x1) if x2 > x1 else 1.0)
    return points[-1][1]


def body_shell(body, name, materials, cuts, keep, smooth, inward, offset, mats, trim, wrap=None, binding=None,
               press=None):
    """A garment from the body's faces in `materials`: cut along the world planes `cuts` (point, normal),
    kept where keep(material, world centroid) holds, smoothed `smooth` times along the normals (never
    more than `inward` metres into the body), pushed out by offset(world pos) metres. Faces where
    trim(world centroid on the body) holds take the last material. With `wrap` (a BVH of the body) the
    shell is relaxed in 3D instead, like stretched cloth, and only kept `offset - inward` off the body.
    press(world pos) -> world pos shapes the relaxed cloth further. Open edges where binding(world
    midpoint) holds get a TRIM-wide strip of the last material."""
    o = body.copy()
    o.data = body.data.copy()
    o.name = name
    body.users_collection[0].objects.link(o)
    mw = o.matrix_world
    inv = mw.inverted()
    me = o.data
    names = [m.name if m else '' for m in me.materials]
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if names[f.material_index] not in materials], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # skin materials are split at the hips and shoulders: weld so the shell is one surface
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.1)
    rot = mw.to_3x3().transposed()
    for co, no in cuts:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-4, plane_co=inv @ co, plane_no=(rot @ no).normalized())
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(names[f.material_index], mw @ f.calc_center_median())],
                     context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # the cuts leave slivers along the edge: merge edge points closer than 3 mm
    bmesh.ops.remove_doubles(bm, verts=[v for v in bm.verts if v.is_boundary], dist=0.003 / mw.to_scale().x)
    bm.normal_update()
    banded = {f for f in bm.faces if trim(mw @ f.calc_center_median())}
    nm = mw.to_3x3().inverted().transposed()
    world = {v: mw @ v.co for v in bm.verts}
    normal = {v: (nm @ v.normal).normalized() for v in bm.verts}
    rise = {v: 0.0 for v in bm.verts}
    inner = [v for v in bm.verts if not any(e.is_boundary for e in v.link_edges)]
    for _ in range(0 if wrap else smooth):
        step = {}
        for v in inner:
            nb = [e.other_vert(v) for e in v.link_edges]
            avg = sum((world[u] for u in nb), Vector()) / len(nb)
            step[v] = (avg - world[v]).dot(normal[v])
        for v, d in step.items():
            d = max(d, -inward - rise[v])
            rise[v] += d
            world[v] = world[v] + normal[v] * d
    for v in bm.verts:
        world[v] = world[v] + normal[v] * offset(world[v])
    if wrap:
        # near its edges the cloth keeps clear of the real body, so no skin shows over the edge
        hops, ring = {v: 0 for v in bm.verts if v.is_boundary}, [v for v in bm.verts if v.is_boundary]
        for k in range(1, 5):
            ring = [u for v in ring for e in v.link_edges for u in [e.other_vert(v)] if u not in hops]
            for u in ring:
                hops[u] = k
        real = BVHTree.FromBMesh(body_bm(body))
    for _ in range(smooth if wrap else 0):
        nxt = {}
        for v in inner:
            nb = [e.other_vert(v) for e in v.link_edges]
            p = world[v].lerp(sum((world[u] for u in nb), Vector()) / len(nb), 0.5)
            q, n, _, _ = (real if v in hops else wrap).find_nearest(p)
            gap = offset(p) - (0.0 if v in hops else inward)
            if q is not None and (p - q).dot(n) < gap:
                p = q + n * gap
            nxt[v] = press(p) if press else p
        world.update(nxt)
    for v in bm.verts:
        v.co = inv @ world[v]
    for f in bm.faces:
        f.material_index = len(mats) - 1 if f in banded else 0
        f.smooth = True
    if binding:
        bind_edges(bm, mw, [e for e in bm.edges if e.is_boundary and binding(mw @ ((e.verts[0].co + e.verts[1].co) / 2))],
                   len(mats) - 1)
    me.materials.clear()
    for m in mats:
        me.materials.append(m)
    bm.to_mesh(me)
    bm.free()
    # the body's custom normals and sharp edges no longer fit the moved surface
    for attr in [a.name for a in me.attributes if a.name == 'custom_normal' or a.name.startswith('sharp')]:
        me.attributes.remove(me.attributes[attr])
    print('SPORT', name, len(me.polygons), 'trim', sum(1 for p in me.polygons if p.material_index == len(mats) - 1))
    return o


def bind_edges(bm, mw, edges, material):
    """A binding strip along the open edges: TRIM wide, folded onto the cloth from its edge and lifted a
    little off it. Its vertices copy the edge's skin weights."""
    inv, rot = mw.inverted(), mw.to_3x3()
    bm.normal_update()
    cloth = BVHTree.FromBMesh(bm)
    inward = {}
    for e in edges:
        a, b = e.verts
        f = e.link_faces[0]
        d = (rot @ (b.co - a.co)).normalized()
        n = (rot @ f.normal).normalized()
        side = d.cross(n)
        if side.dot(rot @ (f.calc_center_median() - a.co)) < 0:
            side = -side
        for v in (a, b):
            inward[v] = inward.get(v, Vector()) + side
    # even out the direction along the edge, so the strip lies flat
    along = {v: [e.other_vert(v) for e in v.link_edges if e in set(edges)] for v in inward}
    for _ in range(4):
        inward = {v: side + sum((inward[u] for u in along[v]), Vector()) * 0.5 for v, side in inward.items()}
    strip = {}
    for v, side in inward.items():
        p = mw @ v.co
        n = (rot @ v.normal).normalized()
        side = (side - n * side.dot(n)).normalized()
        # the inner edge lies on the cloth
        q, qn, _, _ = cloth.find_nearest(inv @ (p + side * TRIM))
        inner = (mw @ q) + (rot @ qn).normalized() * 0.0012 if q is not None else p + side * TRIM + n * 0.0012
        strip[v] = (bm.verts.new(inv @ (p + n * 0.0008), v), bm.verts.new(inv @ inner, v))
    for e in edges:
        a, b = e.verts
        f = bm.faces.new((strip[a][0], strip[b][0], strip[b][1], strip[a][1]))
        f.material_index = material
        f.smooth = True
        f.normal_update()
        if (rot @ f.normal).dot(rot @ e.link_faces[0].normal) < 0:
            f.normal_flip()


def body_bm(body):
    """The body's skin in world space, as a bmesh."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    skin = {i for i, m in enumerate(body.data.materials) if m and m.name.startswith('skin_')}
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index not in skin], context='FACES')
    bm.transform(body.matrix_world)
    return bm


def smoothed_body(body, iterations=12):
    """A BVH of the body's skin with small features (nipples, navel, ribs) smoothed away. It shrinks a
    little, which the cloth may follow: the skin under the top is removed."""
    from mathutils.bvhtree import BVHTree
    me, mw = body.data, body.matrix_world
    skin = {i for i, m in enumerate(me.materials) if m and m.name.startswith('skin_')}
    polys = [list(p.vertices) for p in me.polygons if p.material_index in skin]
    pos = [mw @ v.co for v in me.vertices]
    nb = [set() for _ in pos]
    for e in me.edges:
        a, b = e.vertices
        nb[a].add(b)
        nb[b].add(a)
    for _ in range(iterations):
        pos = [p.lerp(sum((pos[j] for j in n), Vector()) / len(n), 0.5) if n else p for p, n in zip(pos, nb)]
    return BVHTree.FromPolygons(pos, polys)


def make_sportswear(body):
    up, down = Vector((0, 0, 1)), Vector((0, 0, -1))

    def horizontal(z):
        return (Vector((0, 0, z)), up)

    stripe_cuts = [(Vector((0, y, 0)), Vector((0, 1, 0))) for y in (-STRIPE_Y, STRIPE_Y)]

    def outer_side(c):
        return abs(c.y) < STRIPE_Y and abs(c.x) > LEG_AXIS_X

    legs = {'skin_leg', 'skin_body'}
    trim = sport_material('sport_trim')
    leggings = body_shell(body, 'FC1_sport_leggings', legs,
                          [horizontal(WAISTBAND_Z), horizontal(ANKLE_Z)] + stripe_cuts,
                          lambda m, c: ANKLE_Z < c.z < WAISTBAND_Z, 2, 0.0015, lambda p: 0.0035,
                          [sport_material('sport_leggings'), trim],
                          lambda c: outer_side(c) and c.z < SHORTS_HEM_Z)
    shorts = body_shell(body, 'FC1_sport_shorts', legs,
                        [horizontal(WAISTBAND_Z), horizontal(SHORTS_HEM_Z), horizontal(SHORTS_HEM_Z + TRIM)] + stripe_cuts,
                        lambda m, c: SHORTS_HEM_Z < c.z < WAISTBAND_Z, 15, 0.002,
                        lambda p: 0.008 + 0.006 * max(0.0, min(1.0, (0.95 - p.z) / (0.95 - SHORTS_HEM_Z))),
                        [sport_material('sport_shorts'), trim],
                        lambda c: c.z < SHORTS_HEM_Z + TRIM or (outer_side(c) and c.z < 0.92))

    from mathutils.geometry import intersect_point_line
    rig = body.parent
    bones = {short(b.name): b for b in rig.data.bones}
    arms = [(rig.matrix_world @ bones[f'{s}_Upperarm'].head_local, rig.matrix_world @ bones[f'{s}_Forearm'].head_local)
            for s in 'LR']

    def on_arm(c):
        for a, b in arms:
            q, t = intersect_point_line(c, a, b)
            if t > 0 and (c - q).length < 0.055:
                return True
        return False

    def top_part(mat, c):
        # the straps run on over the shoulders, which belong to the arm and head skin
        return TANK_HEM_Z < c.z < edge_z(TANK_EDGE, abs(c.x)) and not on_arm(c)

    def compress_bust(p):
        y0, depth = BUST_FRONT
        if p.y >= y0:
            return p
        return Vector((p.x, y0 - depth * math.tanh((y0 - p.y) / depth), p.z))

    # The top is relaxed like stretched cloth over a smoothed body: it spans the cleavage, the navel and
    # the nipples instead of following them. The skin under it is removed, so it may sit close. Its neck
    # and armholes get a pink binding.
    top = body_shell(body, 'FC1_sport_top', {'skin_body', 'skin_arm', 'skin_head'},
                     [horizontal(TANK_HEM_Z)] + edge_segments(TANK_EDGE),
                     top_part, 150, 0.003, lambda p: 0.005,
                     [sport_material('sport_top'), trim], lambda c: False,
                     smoothed_body(body), lambda c: c.z > TANK_HEM_Z + 0.03,
                     compress_bust)
    return [leggings, shorts, top]


# Skin under the clothes: CC bodies keep their whole skin under clothes, and it pokes through the cloth
# as soon as the body bends. A skin vertex counts as covered when a short ray along its normal (out,
# or in for skin that already pokes out) hits the sportswear; faces with every vertex covered go.
CULL = {'skin_body', 'skin_leg', 'skin_arm'}


def covered_skin(body, cloths):
    verts, polys = [], []
    for o in cloths:
        mw, me = o.matrix_world, o.data
        base = len(verts)
        verts += [mw @ v.co for v in me.vertices]
        polys += [[base + i for i in p.vertices] for p in me.polygons]
    bvh = BVHTree.FromPolygons(verts, polys)

    def hit(origin, direction, dist):
        return bvh.ray_cast(origin, direction, dist)[0] is not None

    me, mw = body.data, body.matrix_world
    nm = mw.to_3x3().inverted().transposed()
    cull_idx = {i for i, m in enumerate(me.materials) if m and m.name in CULL}
    wanted = {v for p in me.polygons if p.material_index in cull_idx for v in p.vertices}
    covered = set()
    for i in wanted:
        v = me.vertices[i]
        pos, n = mw @ v.co, (nm @ v.normal).normalized()
        if hit(pos + n * 0.002, n, 0.08) or hit(pos + n * 0.002, -n, 0.025):
            covered.add(i)
    return covered


def cull_covered_skin(body, cloths):
    covered = covered_skin(body, cloths)
    me = body.data
    cull_idx = {i for i, m in enumerate(me.materials) if m and m.name in CULL}
    bm = bmesh.new()
    bm.from_mesh(me)
    gone = [f for f in bm.faces if f.material_index in cull_idx and all(v.index in covered for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(me)
    bm.free()
    print('CULL', len(gone), 'skin faces under the sportswear')


fc1_body = next(o for o in meshes if o.name == 'FC1_body')
cull_covered_skin(fc1_body, make_sportswear(fc1_body))

# Short bone names (vertex groups follow the rename).
for b in tgt.data.bones:
    b.name = 'CC_' + short(b.name)
tgt.name = 'CC_rig'

# ---------------------------------------------------------------- clips

retarget_clips(tgt, CLIPS_PATH, EXTRA)

# ---------------------------------------------------------------- textures and export

for img in bpy.data.images:
    if not img.size[0]:
        continue
    users = [m.name for m in bpy.data.materials
             if m.use_nodes and any(n.type == 'TEX_IMAGE' and n.image == img for n in m.node_tree.nodes)]
    face = any(u == 'skin_head' for u in users)
    size = 2048 if face else 1024
    if img.size[0] > size:
        img.scale(size, size)
        img.pack()

bpy.ops.object.select_all(action='DESELECT')
tgt.select_set(True)
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT_PATH,
    use_selection=True,
    export_format='GLB',
    export_image_format='WEBP',
    export_image_quality=82,
    export_animation_mode='NLA_TRACKS',
    export_morph=False,
    export_skins=True,
    export_extras=False,
    export_yup=True,
)
print('WROTE', OUT_PATH)
