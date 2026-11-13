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
        inside = (0 <= t <= 1.05 and (c - q).length < 0.12) or (0 <= t2 <= 1.0 and (c - q2).length < 0.1)
        return -1.0 if inside and c.x > 0.05 else 1.0

    cuts = [(top, (e - a).normalized()), (w - (w - e).normalized() * 0.005, (w - e).normalized())]
    sleeve = body_shell(body, 'Hero_sleeve', {'skin_arm'}, cuts,
                        lambda m, c: sleeve_field(c) < 0, 2, 0.001, lambda p: 0.008,
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


# ---------------------------------------------------------------- body from the anatomy sculpt
# hero_sculpt_prep.py makes a 1.70 m male anatomy sculpt (facing -Y, feet at 0). The FC1 rig is posed into
# its stance (arms hang lower), that pose becomes the rest pose, and the body's surface is snapped onto
# the sculpt. Topology, UVs and skin weights stay the FC1 body's, so every clip still fits.

def _load_sculpt(path):
    before = set(bpy.data.objects)
    bpy.ops.wm.ply_import(filepath=path)
    o = next(o for o in bpy.data.objects if o not in before)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.transform(o.matrix_world)
    bvh = BVHTree.FromBMesh(bm)
    pts = [v.co.copy() for v in bm.verts]
    bm.free()
    bpy.data.objects.remove(o)
    return bvh, pts


def _wrist_targets(pts):
    """the sculpt's wrists: the middle of each arm's cross-section just above the fist"""
    out = {}
    for side, sx in (('L_', 1), ('R_', -1)):
        sl = [p for p in pts if 0.94 < p.z < 0.98 and sx * p.x > 0.2]
        out[side] = sum(sl, Vector()) / len(sl)
    return out


def _ankle_targets(pts):
    """the sculpt's ankles: the middle of each leg's cross-section just above the foot"""
    out = {}
    for side, sx in (('L_', 1), ('R_', -1)):
        sl = [p for p in pts if 0.085 < p.z < 0.11 and sx * p.x > 0.02 and p.y > -0.05]
        out[side] = sum(sl, Vector()) / len(sl)
    return out


def _pose_arms(rig, short, wrists, chain=('Upperarm', 'Forearm', 'Hand'), bend=Vector((0, 1, 0))):
    """two-bone solve: the upper arm and forearm (or thigh and calf) reach the sculpt's wrist (ankle),
    the elbow bending back (the knee forward)"""
    bones = {short(b.name): b.name for b in rig.data.bones}
    inv = rig.matrix_world.inverted()
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    for side, w in wrists.items():
        ua, fa, hd = (rig.pose.bones[bones[side + n]] for n in chain)
        mw = rig.matrix_world
        S, E0, H0 = (mw @ ua.bone.head_local, mw @ fa.bone.head_local, mw @ hd.bone.head_local)
        L1, L2 = (E0 - S).length, (H0 - E0).length
        d = (w - S).length
        u = (w - S).normalized()
        back = bend
        perp = (back - u * back.dot(u)).normalized()
        if d >= L1 + L2 - 1e-4:
            E = S + u * L1 * d / (L1 + L2)
        else:
            a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
            E = S + u * a + perp * math.sqrt(max(L1 * L1 - a * a, 0.0))
        for pb, rest_from, rest_to, new_from, new_to in ((ua, S, E0, S, E), (fa, E0, H0, E, w)):
            bpy.context.view_layer.update()
            q = (rest_to - rest_from).normalized().rotation_difference((new_to - new_from).normalized())
            rest = pb.bone.matrix_local                       # armature space
            rot_as = (inv.to_3x3().normalized() @ q.to_matrix() @ mw.to_3x3().normalized())
            m = (rot_as @ rest.to_3x3()).to_4x4()
            m.translation = inv @ new_from
            pb.matrix = m
        bpy.context.view_layer.update()
        print('HERO arm', side, 'wrist', tuple(round(c, 3) for c in w), 'reach', round((mw @ hd.head - w).length, 4))
    bpy.ops.object.mode_set(mode='OBJECT')


def _apply_pose_as_rest(rig, meshes):
    for o in meshes:
        mod = next(m for m in o.modifiers if m.type == 'ARMATURE')
        name = mod.name
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=name)
        new = o.modifiers.new(name, 'ARMATURE')
        new.object = rig
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def wrap_to_sculpt(body, rig, short, ply):
    bvh, pts = _load_sculpt(ply)
    # shoulders out to the sculpt's joints (bones and skin together), no other reshaping
    global SHOULDER_OUT, HIP_IN
    SHOULDER_OUT, HIP_IN = 0.03, 0.0
    deltas = _bone_deltas(rig, short)
    me, mw = body.data, body.matrix_world
    inv3 = mw.to_3x3().inverted()
    groups = {g.index: g.name for g in body.vertex_groups}
    for v in me.vertices:
        d = Vector()
        for g in v.groups:
            if groups.get(g.group) in deltas:
                d += deltas[groups[g.group]] * g.weight
        v.co += inv3 @ d
    me.update()
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    rinv = rig.matrix_world.to_3x3().inverted()
    for eb in rig.data.edit_bones:
        if eb.name in deltas:
            dl = rinv @ deltas[eb.name]
            eb.head += dl
            eb.tail += dl
    for eb in rig.data.edit_bones:
        if short(eb.name) in ('L_Clavicle', 'R_Clavicle'):
            ua = rig.data.edit_bones.get(eb.name.replace('Clavicle', 'Upperarm'))
            if ua:
                eb.tail = ua.head.copy()
    bpy.ops.object.mode_set(mode='OBJECT')

    _pose_arms(rig, short, _wrist_targets(pts))
    _pose_arms(rig, short, _ankle_targets(pts), ('Thigh', 'Calf', 'Foot'), Vector((0, -1, 0)))
    _apply_pose_as_rest(rig, [body])
    import os
    if os.environ.get('HERO_DEBUG_BLEND'):  # the posed body and the sculpt together, for checking the fit
        bpy.ops.wm.ply_import(filepath=ply)
        bpy.ops.wm.save_as_mainfile(filepath=os.environ['HERO_DEBUG_BLEND'], copy=True)
        bpy.data.objects.remove(bpy.context.selected_objects[0])

    # snap onto the sculpt, on welded positions (seam duplicates move together)
    me, mw = body.data, body.matrix_world
    inv3 = mw.to_3x3().inverted()
    nm = mw.to_3x3().inverted().transposed()
    key_of = [tuple(round(c, 3) for c in v.co) for v in me.vertices]
    kid, keys = [], {}
    for k in key_of:
        kid.append(keys.setdefault(k, len(keys)))
    n_keys = len(keys)
    pos = [None] * n_keys
    nrm = [Vector() for _ in range(n_keys)]
    hand_w = [0.0] * n_keys
    groups = {g.index: short(g.name) for g in body.vertex_groups}
    for i, v in enumerate(me.vertices):
        k = kid[i]
        pos[k] = mw @ v.co
        nrm[k] += nm @ v.normal
        for g in v.groups:
            gname = groups.get(g.group, '')
            if gname[2:].startswith(('Hand', 'Thumb', 'Index', 'Mid', 'Ring', 'Pinky')):
                hand_w[k] = max(hand_w[k], g.weight)
    disp = [Vector() for _ in range(n_keys)]
    mask = [0.0] * n_keys
    hits = 0
    for k, p in enumerate(pos):
        n = nrm[k].normalized()
        m = (1 - _smooth(0.2, 0.6, hand_w[k])) * _smooth(0.06, 0.1, p.z) * (1 - _smooth(NECK_CUT_Z - 0.04, NECK_CUT_Z, p.z))
        # the groin stays smooth (under the shorts)
        if abs(p.x) < 0.09 and 0.72 < p.z < 0.98 and p.y < 0.02:
            m *= _smooth(0.05, 0.09, abs(p.x))
        # armpits: where the arm meets the torso the nearest sculpt surface is often the wrong one
        if 1.12 < p.z < 1.4 and 0.12 < abs(p.x) < 0.24:
            m *= 1 - (_smooth(1.12, 1.18, p.z) * (1 - _smooth(1.34, 1.4, p.z))
                      * _smooth(0.12, 0.15, abs(p.x)) * (1 - _smooth(0.21, 0.24, abs(p.x))) * 0.85)
        if m <= 0:
            continue
        best = None
        for direction in (n, -n):
            hit, hn, _, dist = bvh.ray_cast(p + direction * 1e-4, direction, 0.06)
            # only a surface facing the same way (not the far side of a limb, not the torso under an arm)
            if hit is not None and hn.dot(n) > 0.4 and (best is None or dist < best[1]):
                best = (hit, dist)
        if best is None:
            q, hn, _, dist = bvh.find_nearest(p, 0.03)
            if q is not None and hn.dot(n) > 0.4:
                best = (q, dist)
        if best is None:
            continue
        disp[k] = best[0] - p
        mask[k] = m
        hits += 1
    # smooth the displacement field a little (sculpt noise, ray misses near the armpits)
    nb = [set() for _ in range(n_keys)]
    for e in me.edges:
        a, b = kid[e.vertices[0]], kid[e.vertices[1]]
        if a != b:
            nb[a].add(b)
            nb[b].add(a)
    # misses keep a zero displacement: let them take their neighbours' (filled in from the hits)
    for _ in range(12):
        nd, nm2 = list(disp), list(mask)
        for k in range(n_keys):
            if mask[k] == 0 and nb[k]:
                got = [j for j in nb[k] if mask[j] > 0]
                if got:
                    nd[k] = sum((disp[j] for j in got), Vector()) / len(got)
                    nm2[k] = 0.5 * sum(mask[j] for j in got) / len(got)
        disp, mask = nd, nm2
    for _ in range(8):
        disp = [disp[k].lerp(sum((disp[j] for j in nb[k]), Vector()) / len(nb[k]), 0.5) if nb[k] else disp[k]
                for k in range(n_keys)]
    # the chest's nipples are small sharp points that read as a bust in flat colour: smooth more there
    chest = [_smooth(1.17, 1.21, p.z) * (1 - _smooth(1.33, 1.37, p.z)) * (1 - _smooth(0.14, 0.18, abs(p.x)))
             * (1.0 if p.y < -0.05 else 0.0) for p in pos]
    for _ in range(14):
        disp = [disp[k].lerp(sum((disp[j] for j in nb[k]), Vector()) / len(nb[k]), 0.5 * chest[k]) if nb[k] and chest[k] > 0 else disp[k]
                for k in range(n_keys)]
    for i, v in enumerate(me.vertices):
        k = kid[i]
        v.co += inv3 @ (disp[k] * mask[k])
    me.update()
    # the chest: the sculpt's big pectorals came out as two rounded points at this mesh density; a smooth
    # chest surface with sculpted pectorals reads as a man's chest
    _smooth_chest(body)
    _sculpt_torso(body)
    chest_keys = [k for k in range(n_keys) if chest[k] > 0.5]
    print('HERO wrapped', hits, 'of', n_keys, 'points onto the sculpt; chest', sum(1 for k in chest_keys if mask[k] > 0), 'of', len(chest_keys))


# ---------------------------------------------------------------- the sculpt's detail as maps, and ink lines
# The body's 15k points hold the sculpt's big forms; its fine anatomy (abs, the chest's and shoulders'
# lines, the legs' grooves) is baked as tangent-space normal maps, one per skin material (the CC body's
# materials each use the whole UV square). The deepest grooves in those maps become ink lines, drawn
# into each skin part's colour map (yellow with black lines), like the concept art's inked muscles.

SKIN_PARTS = ('skin_body', 'skin_arm', 'skin_leg')
MAP_SIZE = 1024


def bake_detail(body, ply, out_dir):
    import os
    import numpy as np
    os.makedirs(out_dir, exist_ok=True)
    before = set(bpy.data.objects)
    bpy.ops.wm.ply_import(filepath=ply)
    hi = next(o for o in bpy.data.objects if o not in before)
    # CC bodies lay each skin part out on its own UV tile (head 0-1, body 1-2, arm 2-3, leg 3-4): bring every
    # part into 0-1, where its own image is (each part has its own map, so nothing overlaps)
    uv = body.data.uv_layers.active.data
    for poly in body.data.polygons:
        shift = math.floor(sum(uv[l].uv.x for l in poly.loop_indices) / poly.loop_total)
        for li in poly.loop_indices:
            uv[li].uv.x -= shift
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 1
    images = {}
    for m in body.data.materials:
        if not m or m.name not in SKIN_PARTS:
            continue
        img = bpy.data.images.new(m.name + '_detail', MAP_SIZE, MAP_SIZE, alpha=True, float_buffer=False)
        img.colorspace_settings.name = 'Non-Color'
        img.generated_color = (0, 0, 0, 0)  # unbaked pixels stay transparent (island mask)
        node = m.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = img
        for n in m.node_tree.nodes:
            n.select = False
        node.select = True
        m.node_tree.nodes.active = node
        images[m.name] = img
    bpy.ops.object.select_all(action='DESELECT')
    hi.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    unit = body.matrix_world.to_scale().x  # the body is stored in centimetres (scale 0.01)
    print('HERO bake unit', unit)
    bpy.ops.object.bake(type='NORMAL', use_selected_to_active=True, cage_extrusion=0.012 / unit,
                        max_ray_distance=0.03 / unit, normal_space='TANGENT', margin=8)
    bpy.data.objects.remove(hi)
    masks = _detail_masks(body, images)
    out = {}
    for name, img in images.items():
        px = np.array(img.pixels[:], dtype=np.float32).reshape(MAP_SIZE, MAP_SIZE, 4)
        normal = px[..., :3]
        # the real detail is fine (grooves a few pixels wide); large smooth tilts are rays that caught the
        # wrong surface (armpits, between the thighs): keep the fine detail only
        def gblur(a, sigma):
            r = int(sigma * 3)
            k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
            k /= k.sum()
            a = np.apply_along_axis(lambda row: np.convolve(np.pad(row, r, mode='edge'), k, mode='valid'), 1, a)
            return np.apply_along_axis(lambda col: np.convolve(np.pad(col, r, mode='edge'), k, mode='valid'), 0, a)
        xy = normal[..., :2] * 2 - 1
        xy = xy - np.dstack([gblur(xy[..., 0], 14), gblur(xy[..., 1], 14)])
        xy *= masks[name][..., None]
        z = np.sqrt(np.clip(1 - (xy ** 2).sum(-1), 0, 1))
        normal = np.dstack([xy * 0.5 + 0.5, z * 0.5 + 0.5]).astype(np.float32)
        baked = px[..., 3] > 0.5
        dev = np.abs(px[..., :2] - 0.5).sum(-1)
        print('HERO bake', name, 'pixels baked', int(baked.sum()), 'mean deviation', round(float(dev[baked].mean()) if baked.any() else -1, 4),
              'alpha values', np.unique(np.round(px[..., 3], 2))[:5])
        normal[~baked] = (0.5, 0.5, 1.0)
        # ink: concave creases, where the normal field converges (negative divergence of its x, y)
        nx, ny = normal[..., 0] * 2 - 1, normal[..., 1] * 2 - 1
        div = np.gradient(nx, axis=1) + np.gradient(ny, axis=0)
        k = np.exp(-0.5 * (np.arange(-3, 4) / 1.2) ** 2)
        k /= k.sum()
        div = np.apply_along_axis(lambda r: np.convolve(r, k, mode='same'), 1, div)
        div = np.apply_along_axis(lambda c: np.convolve(c, k, mode='same'), 0, div)
        # the torso's lines (abs, chest, collarbones) are the concept's; arms and legs only keep their
        # strongest grooves, and specks (isolated short marks) go
        cut = 0.05 if name == 'skin_body' else 0.085
        ink = np.clip((-div - cut) / 0.03, 0, 1) * baked * masks[name]
        support = gblur(ink, 3.0)
        ink = ink * (support > (0.16 if name == 'skin_body' else 0.22))
        # island borders are UV seams, not creases: no ink within a few pixels of them
        inside = baked.astype(np.float32)
        for _ in range(4):
            inside = np.minimum.reduce([inside, np.roll(inside, 1, 0), np.roll(inside, -1, 0), np.roll(inside, 1, 1), np.roll(inside, -1, 1)])
        ink *= inside
        # byte images hold display (sRGB) values
        yellow = np.array([int(YELLOW[i:i + 2], 16) / 255 for i in (1, 3, 5)], dtype=np.float32)
        ink_col = np.array([0x14, 0x14, 0x18], dtype=np.float32) / 255
        col = yellow[None, None, :] * (1 - ink[..., None]) + ink_col[None, None, :] * ink[..., None]
        color = bpy.data.images.new(name + '_color', MAP_SIZE, MAP_SIZE, alpha=False)
        color.pixels[:] = np.dstack([col, np.ones((MAP_SIZE, MAP_SIZE), np.float32)]).ravel()
        img.pixels[:] = np.dstack([normal, np.ones((MAP_SIZE, MAP_SIZE), np.float32)]).ravel()
        for im, suffix in ((img, 'normal'), (color, 'color')):
            im.filepath_raw = os.path.join(out_dir, f'{name}_{suffix}.png')
            im.file_format = 'PNG'
            im.save()
            im.pack()
        out[name] = (color, img)
        print('HERO baked', name, 'ink', round(float(ink.mean()) * 100, 2), '% of the map')
    sc.render.engine = 'BLENDER_EEVEE'
    return out


def _detail_masks(body, images):
    """per skin map: 1 where the sculpt's detail belongs, 0 on the hands and feet (the sculpt has fists and
    other feet), soft at the edge"""
    import numpy as np
    me = body.data
    groups = {g.index: g.name for g in body.vertex_groups}
    extremity = []
    for v in me.vertices:
        w = 0.0
        for g in v.groups:
            n = groups.get(g.group, '')
            if any(k in n for k in ('Hand', 'Thumb', 'Index', 'Mid', 'Ring', 'Pinky', 'Foot', 'Toe')):
                w += g.weight
        extremity.append(w)
    masks = {name: np.ones((MAP_SIZE, MAP_SIZE), np.float32) for name in images}
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        name = me.materials[poly.material_index].name if me.materials[poly.material_index] else ''
        if name not in masks:
            continue
        c = body.matrix_world @ poly.center
        armpit = 1.1 < c.z < 1.42 and 0.11 < abs(c.x) < 0.25 and -0.08 < c.y < 0.1
        if max(extremity[i] for i in poly.vertices) < 0.3 and not armpit:
            continue
        us = [uv[l].uv.x % 1.0 for l in poly.loop_indices]
        vs = [uv[l].uv.y for l in poly.loop_indices]
        x0, x1 = int(min(us) * MAP_SIZE) - 2, int(max(us) * MAP_SIZE) + 3
        y0, y1 = int(min(vs) * MAP_SIZE) - 2, int(max(vs) * MAP_SIZE) + 3
        masks[name][max(y0, 0):y1, max(x0, 0):x1] = 0.0
    for name in masks:
        m = masks[name]
        for _ in range(6):
            m = (m + np.roll(m, 1, 0) + np.roll(m, -1, 0) + np.roll(m, 1, 1) + np.roll(m, -1, 1)) / 5
        masks[name] = m
    return masks


def detail_materials(body, maps):
    """skin parts become toon_skin_<part>: the inked colour map and the baked normal map"""
    for i, m in enumerate(body.data.materials):
        if not m or m.name not in maps:
            continue
        color, normal = maps[m.name]
        t = bpy.data.materials.new('toon_' + m.name)
        t.use_nodes = True
        nt = t.node_tree
        bsdf = nt.nodes['Principled BSDF']
        bsdf.inputs['Roughness'].default_value = 0.85
        c = nt.nodes.new('ShaderNodeTexImage')
        c.image = color
        nt.links.new(c.outputs['Color'], bsdf.inputs['Base Color'])
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = normal
        n.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(n.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        body.data.materials[i] = t
