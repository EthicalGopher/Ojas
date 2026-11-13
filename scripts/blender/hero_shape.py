"""The default hero (the player's own athlete): a muscular, faceless, yellow toon figure in grey shorts with a
grey sleeve on his left arm, from the player-supplied concept art. Built on the FC1 body and rig by
build_fc1.py when FC1_HERO=1, so he has every clip the other heroes have.

All shaping happens in the bind pose (world metres, the body faces -Y, his left is +X):
- the arm chains move out (broad shoulders) and the leg chains in (narrow hips); every skin vertex moves
  with its bones by its skin weights, so the rig still fits;
- the chest is flattened, the hips narrowed, and muscle is added along the normals by bone (shoulders,
  chest, arms, thighs, calves, neck);
- the head above the neck is replaced by a smooth egg on the head bone, with two white slit eyes and a
  forehead crease; hair, eyes, lashes, teeth and tongue go;
- grey shorts and a left-arm sleeve are shells of the body (build_fc1.body_shell), skin under them culled.
Materials are named toon_* for the viewer's toon shading and outline (avatarViewerHtml.ts).
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

YELLOW = '#F2CF5B'
GREY = '#7C7C80'
SLEEVE = '#77777C'
SHOE = '#3A3A40'

SHOULDER_OUT = 0.05   # each arm chain moves out (and a little up)
SHOULDER_UP = 0.008
HIP_IN = 0.012         # each leg chain moves in
# muscle, metres along the normal per unit of skin weight
BULK = {'Clavicle': 0.026, 'Upperarm': 0.03, 'Forearm': 0.02, 'Spine02': 0.02, 'Spine01': 0.012,
        'NeckTwist01': 0.03, 'NeckTwist02': 0.026, 'Thigh': 0.03, 'Calf': 0.02, 'Waist': 0.008}
NECK_CUT_Z = 1.465     # the old head goes above this
EGG = dict(center=(0.0, -0.008, 1.578), rx=0.086, ry=0.1, rz=0.127)


def _srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def toon_material(name, hexcol):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*_srgb(hexcol), 1.0)
    b.inputs['Roughness'].default_value = 0.85
    return m


def _smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def strip(meshes, short):
    """Drop what a faceless figure doesn't have; returns the meshes left."""
    keep = []
    for o in meshes:
        names = {short(m.name) if m else '' for m in o.data.materials}
        if names & {'hair_bun', 'hair_tail', 'eye_r', 'eye_l', 'teeth_upper', 'teeth_lower', 'tongue'} \
                or any(n.startswith(('hair_', 'eye_', 'teeth_', 'shoes_')) for n in names):
            bpy.data.objects.remove(o)
            continue
        keep.append(o)
    return keep


def _bone_deltas(rig, short):
    """world displacement per deform bone: arm chains out, leg chains in"""
    deltas = {}
    for b in rig.data.bones:
        n = short(b.name)
        for side, sx in (('L_', 1), ('R_', -1)):
            if not n.startswith(side):
                continue
            chain = n[2:]
            arm_root = rig.data.bones.get(b.name.replace(n, side + 'Upperarm'))
            leg_root = rig.data.bones.get(b.name.replace(n, side + 'Thigh'))
            if arm_root and (b == arm_root or arm_root in b.parent_recursive):
                deltas[b.name] = Vector((sx * SHOULDER_OUT, 0, SHOULDER_UP))
            elif leg_root and (b == leg_root or leg_root in b.parent_recursive):
                deltas[b.name] = Vector((-sx * HIP_IN, 0, 0))
            elif chain == 'Clavicle':
                deltas[b.name] = Vector((sx * SHOULDER_OUT * 0.5, 0, SHOULDER_UP * 0.5))
    return deltas


def reshape(body, rig, short):
    deltas = _bone_deltas(rig, short)
    me, mw = body.data, body.matrix_world
    inv3 = mw.to_3x3().inverted()
    nm = mw.to_3x3().inverted().transposed()
    groups = {g.index: g.name for g in body.vertex_groups}
    bulk_by_group = {}
    for i, name in groups.items():
        part = short(name)
        for k, v in BULK.items():
            if part.endswith(k) and 'Twist' not in part[:-len(k)]:
                bulk_by_group[i] = v
        if 'Twist' in part:  # twist bones carry arm / leg skin too
            for k in ('Upperarm', 'Forearm', 'Thigh', 'Calf'):
                if k in part:
                    bulk_by_group[i] = BULK[k]
    # skin pieces meet at material seams with duplicated vertices: give every copy the same normal, or
    # the bulk pushes them apart and the skin cracks open
    shared = {}
    for v in me.vertices:
        key = tuple(round(c, 3) for c in v.co)  # armature units (cm): 0.01 mm
        shared[key] = shared.get(key, Vector()) + v.normal
    for v in me.vertices:
        p = mw @ v.co
        n = (nm @ shared[tuple(round(c, 3) for c in v.co)]).normalized()
        d = Vector()
        bulk = 0.0
        for g in v.groups:
            name = groups.get(g.group)
            if name in deltas:
                d += deltas[name] * g.weight
            bulk += bulk_by_group.get(g.group, 0.0) * g.weight
        # muscle on the outside of the limbs and the chest, less on the inner thighs
        if abs(p.x) < 0.06 and p.z < 0.95:
            bulk *= 0.6
        d += n * bulk
        # flat chest: after the muscle, whatever stands in front of the chest wall is pressed back to it
        q = p + d
        y0 = -0.1
        if 1.15 < p.z < 1.40 and abs(p.x) < 0.18 and q.y < y0:
            w = _smooth(1.15, 1.21, p.z) * (1 - _smooth(1.35, 1.40, p.z))
            depth = 0.012
            flat = y0 - depth * math.tanh((y0 - q.y) / depth)
            d.y += (flat - q.y) * w
        # narrower hips, straighter waist
        hips = _smooth(0.78, 0.86, p.z) * (1 - _smooth(0.98, 1.06, p.z))
        waist = _smooth(0.98, 1.04, p.z) * (1 - _smooth(1.12, 1.20, p.z))
        d.x += -p.x * 0.08 * hips + p.x * 0.07 * waist
        v.co += inv3 @ d
    me.update()
    _smooth_chest(body)
    _sculpt_torso(body)
    # the bones follow (armature space; the rig is scaled 0.01)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    rinv = rig.matrix_world.to_3x3().inverted()
    for eb in rig.data.edit_bones:
        if eb.name in deltas:
            dl = rinv @ deltas[eb.name]
            eb.head += dl
            eb.tail += dl
    # clavicles reach the moved shoulders
    for eb in rig.data.edit_bones:
        if short(eb.name) in ('L_Clavicle', 'R_Clavicle'):
            ua = rig.data.edit_bones.get(eb.name.replace('Clavicle', 'Upperarm'))
            if ua:
                eb.tail = ua.head.copy()
    bpy.ops.object.mode_set(mode='OBJECT')
    print('HERO reshaped', len(me.vertices), 'vertices,', len(deltas), 'bones moved')


def _smooth_chest(body):
    """The chest front (bust, nipples) rebuilt as a smooth surface: its depth sampled on a 1 cm grid over
    the front of the torso, blurred by a few centimetres, and every chest vertex set onto it (blending
    out toward the shoulders, the sides and the belly). Position-only, so seam duplicates move together."""
    import numpy as np
    me, mw = body.data, body.matrix_world
    inv3 = mw.to_3x3().inverted()
    X0, X1, Z0, Z1, STEP = -0.22, 0.22, 1.05, 1.48, 0.01
    nx, nz = int(round((X1 - X0) / STEP)) + 1, int(round((Z1 - Z0) / STEP)) + 1
    grid = np.full((nz, nx), np.nan)
    pts = [mw @ v.co for v in me.vertices]
    for p in pts:
        if p.y > -0.02 or not (X0 <= p.x <= X1 and Z0 <= p.z <= Z1):
            continue
        i, j = int(round((p.z - Z0) / STEP)), int(round((p.x - X0) / STEP))
        if np.isnan(grid[i, j]) or p.y < grid[i, j]:
            grid[i, j] = p.y
    # fill gaps from neighbours, then blur (separable gaussian, sigma 3 cm), edges held by renormalising
    for _ in range(20):
        nan = np.isnan(grid)
        if not nan.any():
            break
        pad = np.pad(grid, 1, constant_values=np.nan)
        neigh = np.stack([pad[:-2, 1:-1], pad[2:, 1:-1], pad[1:-1, :-2], pad[1:-1, 2:]])
        fill = np.nanmean(np.where(np.isnan(neigh), np.nan, neigh), axis=0)
        grid = np.where(nan, fill, grid)
    grid = np.nan_to_num(grid, nan=-0.08)
    k = np.exp(-0.5 * (np.arange(-9, 10) / 3.0) ** 2)
    k /= k.sum()
    def blur(a):
        a = np.apply_along_axis(lambda r: np.convolve(np.pad(r, 9, mode='edge'), k, mode='valid'), 1, a)
        return np.apply_along_axis(lambda c: np.convolve(np.pad(c, 9, mode='edge'), k, mode='valid'), 0, a)
    smooth = blur(grid)

    def at(x, z):
        fx, fz = (x - X0) / STEP, (z - Z0) / STEP
        j, i = int(np.clip(np.floor(fx), 0, nx - 2)), int(np.clip(np.floor(fz), 0, nz - 2))
        tx, tz = min(max(fx - j, 0), 1), min(max(fz - i, 0), 1)
        top = smooth[i, j] * (1 - tx) + smooth[i, j + 1] * tx
        bot = smooth[i + 1, j] * (1 - tx) + smooth[i + 1, j + 1] * tx
        return top * (1 - tz) + bot * tz

    for v, p in zip(me.vertices, pts):
        if p.y > -0.03:
            continue
        w = _smooth(1.1, 1.18, p.z) * (1 - _smooth(1.38, 1.44, p.z)) * (1 - _smooth(0.14, 0.2, abs(p.x)))
        if w <= 0:
            continue
        v.co += inv3 @ Vector((0, (at(p.x, p.z) - p.y) * w, 0))
    me.update()


def _sculpt_torso(body):
    """a male athlete's torso: flat belly, two pectorals with a defined lower edge, lats that widen the
    back into a V. Position-only, so seam duplicates move together."""
    me, mw = body.data, body.matrix_world
    inv3 = mw.to_3x3().inverted()
    for v in me.vertices:
        p = mw @ v.co
        d = Vector()
        # belly: no further forward than the chest wall
        if p.y < -0.06:
            wb = _smooth(0.96, 1.02, p.z) * (1 - _smooth(1.16, 1.22, p.z)) * (1 - _smooth(0.12, 0.17, abs(p.x)))
            yb = -0.108
            if p.y < yb:
                d.y += (yb - 0.006 * math.tanh((yb - p.y) / 0.006) - p.y) * wb
        # pectorals: a mass each side of the breastbone, sharpest at its lower edge
        if p.y < -0.03:
            ax = abs(p.x)
            across = _smooth(0.012, 0.04, ax) * (1 - _smooth(0.13, 0.175, ax))
            down_edge = _smooth(1.2, 1.25, p.z)
            up_fade = 1 - _smooth(1.32, 1.39, p.z)
            d.y -= 0.016 * across * down_edge * up_fade
        # lats: the upper back widens under the arms
        if abs(p.x) > 0.09 and -0.06 < p.y < 0.09:
            wl = _smooth(1.1, 1.18, p.z) * (1 - _smooth(1.3, 1.36, p.z))
            d.x += math.copysign(0.014, p.x) * wl
        v.co += inv3 @ d
    me.update()


def _delete_faces(o, pred):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    mw = o.matrix_world
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if pred(f, mw @ f.calc_center_median())], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(o.data)
    bm.free()


def _skinned(name, bm, rig, bone, material, body):
    """a mesh made in world space, set up exactly like the body (same parent, same local units)"""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    body.users_collection[0].objects.link(o)
    o.parent = rig
    o.matrix_parent_inverse = body.matrix_parent_inverse.copy()
    o.matrix_basis = body.matrix_basis.copy()
    me.transform(body.matrix_world.inverted())  # world -> the body's local space
    o.data.materials.append(material)
    g = o.vertex_groups.new(name=bone)
    g.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    mod = o.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    for p in me.polygons:
        p.use_smooth = True
    return o


c_neck_y = -0.005


def make_head(body, rig, short, skin_mat, eye_mat, ink_mat):
    head_bone = next(b.name for b in rig.data.bones if short(b.name) == 'Head')
    # the old head (and ears) above the neck go; the egg covers the cut
    names = [m.name if m else '' for m in body.data.materials]
    _delete_faces(body, lambda f, c: c.z > NECK_CUT_Z and names[f.material_index] in ('skin_head', 'lash_opacity'))
    # the neck narrows a little into the head, so its cut edge stays inside the egg
    me, mw = body.data, body.matrix_world
    inv3 = mw.to_3x3().inverted()
    for v in me.vertices:
        p = mw @ v.co
        if p.z > NECK_CUT_Z - 0.07:
            k = 0.18 * _smooth(NECK_CUT_Z - 0.07, NECK_CUT_Z, p.z)
            v.co += inv3 @ Vector((-p.x * k, -(p.y - c_neck_y) * k, 0))
    me.update()
    c = Vector(EGG['center'])
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        # egg: fuller at the crown, a narrower jaw, a flatter back
        jaw = 1.0 - 0.08 * max(0.0, -z) ** 1.5
        # a blunter underside (round, not pointed) so the egg sits over the neck
        r = math.hypot(x, y)
        if z < 0 and r > 1e-6:
            r2 = (1 - abs(z) ** 3) ** (1 / 3)
            x, y = x / r * r2, y / r * r2
        v.co = Vector((x * EGG['rx'] * jaw, y * EGG['ry'] * (0.92 if y > 0 else 1.0) * jaw, z * EGG['rz'])) + c
    egg_bvh = BVHTree.FromBMesh(bm)
    egg = _skinned('Hero_head', bm, rig, head_bone, skin_mat, body)

    def on_egg(x, z):
        hit, n, _, _ = egg_bvh.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
        return hit, n

    def decal(name, pts, width, lift, mat):
        """a flat strip through pts (x, z) on the egg's front, width wide, lift above the surface"""
        bm = bmesh.new()
        rows = []
        for i, (x, z) in enumerate(pts):
            hit, n = on_egg(x, z)
            a = pts[min(i + 1, len(pts) - 1)]
            b = pts[max(i - 1, 0)]
            along = Vector((a[0] - b[0], 0, a[1] - b[1])).normalized()
            side = n.cross(along).normalized()
            w = width(i / (len(pts) - 1)) / 2
            rows.append((bm.verts.new(hit + n * lift + side * w), bm.verts.new(hit + n * lift - side * w)))
        for (a1, b1), (a2, b2) in zip(rows, rows[1:]):
            bm.faces.new((a1, b1, b2, a2))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return _skinned(name, bm, rig, head_bone, mat, body)

    eye_z = c.z + 0.012
    parts = [egg]
    for sx in (1, -1):
        # a narrow slit, its inner end lower (the drawing's stern look)
        pts = [(sx * (0.012 + 0.024 * t), eye_z - 0.004 + 0.007 * t) for t in [i / 8 for i in range(9)]]
        parts.append(decal(f'Hero_eye_{"L" if sx > 0 else "R"}', pts, lambda t: 0.0075 * math.sin(math.pi * (0.08 + 0.84 * t)),
                           0.0015, eye_mat))
    crease = [(0.002 * math.sin(t * 7), eye_z + 0.012 + 0.04 * t) for t in [i / 10 for i in range(11)]]
    parts.append(decal('Hero_crease', crease, lambda t: 0.0028 * (1 - 0.6 * t), 0.0012, ink_mat))
    print('HERO head', [p.name for p in parts])
    return parts


def make_kit(body, rig, short, body_shell, sport_trim_unused=None):
    """grey shorts (mid-thigh) and a sleeve on his left arm"""
    from mathutils.geometry import intersect_point_line
    up = Vector((0, 0, 1))
    shorts_mat = toon_material('toon_shorts', GREY)
    sleeve_mat = toon_material('toon_sleeve', SLEEVE)
    WAIST, HEM = 1.02, 0.66
    shorts = body_shell(body, 'Hero_shorts', {'skin_leg', 'skin_body'},
                        [(Vector((0, 0, WAIST)), up), (Vector((0, 0, HEM)), up)],
                        lambda m, c: HEM < c.z < WAIST, 12, 0.002,
                        lambda p: 0.012 + 0.012 * max(0.0, min(1.0, (0.92 - p.z) / (0.92 - HEM))),
                        [shorts_mat, shorts_mat], lambda c: False)
    bones = {short(b.name): b for b in rig.data.bones}
    mwr = rig.matrix_world
    a, e, w = (mwr @ bones['L_Upperarm'].head_local, mwr @ bones['L_Forearm'].head_local, mwr @ bones['L_Hand'].head_local)
    top = a.lerp(e, 0.3)

    def sleeve_field(c):
        """negative inside the sleeve: from 30% down the upper arm to the wrist"""
        q, t = intersect_point_line(c, top, e)
        q2, t2 = intersect_point_line(c, e, w)
        inside = (0 <= t <= 1.05 and (c - q).length < 0.08) or (0 <= t2 <= 1.0 and (c - q2).length < 0.07)
        return -1.0 if inside and c.x > 0.05 else 1.0

    cuts = [(top, (e - a).normalized()), (w - (w - e).normalized() * 0.005, (w - e).normalized())]
    sleeve = body_shell(body, 'Hero_sleeve', {'skin_arm'}, cuts,
                        lambda m, c: sleeve_field(c) < 0, 2, 0.001, lambda p: 0.004,
                        [sleeve_mat, sleeve_mat], lambda c: False)
    return [shorts, sleeve]


def finish_materials(meshes, short):
    """skin and nails become the yellow toon skin; shoes dark grey"""
    skin = bpy.data.materials.get('toon_skin') or toon_material('toon_skin', YELLOW)
    shoe = toon_material('toon_shoes', SHOE)
    for o in meshes:
        for slot in o.material_slots:
            n = short(slot.material.name) if slot.material else ''
            if n.startswith('skin_') or n == 'lash_opacity':
                slot.material = skin
            elif n.startswith('shoes_'):
                slot.material = shoe
    return skin
