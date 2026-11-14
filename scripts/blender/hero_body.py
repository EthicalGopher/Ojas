"""The default hero's body: the user's male anatomy sculpt itself, rigged to the FC1 skeleton, in the concept
art's toon look.

build_fc1.py (FC1_HERO=1, HERO_SCULPT) first puts FC1's rig in the sculpt's stance (hero_shape.wrap_to_sculpt).
Then, here:
- fit_joints: shoulders, elbows, wrists and knees onto the sculpt's own joints (FC1's limbs are longer);
- sculpt_body: the 34k-triangle game mesh (hero_sculpt_prep.py: male_body_lo.ply) becomes the body, with bone
  heat weights on the main bones; its fists are swapped for FC1's hands (posable fingers, bigger and thicker,
  the cuff narrowed to the sculpt's wrist) and its head for a smooth egg sized on its skull (make_head). Its
  faces are named skin_body / skin_arm / skin_leg by their bones, for hero_shape.make_kit;
- dress_skin: one UV atlas; the sculpt's detail baked as a normal map; the concept's ink lines (authored,
  snapped into the sculpt's grooves) drawn into the colour map; the face painted on the egg (paint_face);
- thumbs_up_clip: hero_idle, the concept's thumbs-up, after the clips are retargeted.

World metres throughout: the body faces -Y, his left is +X, feet at z = 0, 1.70 m tall.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_point_line

# The sculpt's joints (left side; the right mirrors x), measured from its cross-sections: the wrist where the
# forearm is narrowest above the fist, the knee where the leg is narrowest (centred front to back), the elbow
# 54% of the way from shoulder to wrist (the usual upper arm : forearm ratio), behind the line like the sculpt's.
SHOULDER = Vector((0.205, 0.030, 1.395))
ELBOW = Vector((0.276, 0.050, 1.125))
WRIST = Vector((0.341, -0.005, 0.885))
KNEE = Vector((0.100, 0.000, 0.490))
# bones folded into others: the face's (one rigid head), the CC female breast helpers
FOLD = {'FacialBone': 'Head', 'JawRoot': 'Head', 'UpperJaw': 'Head', 'L_Eye': 'Head', 'R_Eye': 'Head',
        'Tongue01': 'Head', 'Tongue02': 'Head', 'Tongue03': 'Head', 'Teeth01': 'Head', 'Teeth02': 'Head',
        'L_Breast': 'Spine02', 'R_Breast': 'Spine02', 'L_RibsTwist': 'Spine02', 'R_RibsTwist': 'Spine02'}
HAND_SCALE = 1.25   # x FC1's hand
TAPER = 0.03
YELLOW = '#F2CF5B'
INK = '#141418'


def _srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def _smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _bones(rig, short):
    return {short(b.name): b.name for b in rig.data.bones}


# ---------------------------------------------------------------- joints

def _segment_map(h0, t0, h1, t1, stretch=True):
    """the map taking segment h0-t0 onto h1-t1: turned, moved, and stretched along its length"""
    d0, d1 = t0 - h0, t1 - h1
    u0 = d0.normalized()
    rot = u0.rotation_difference(d1.normalized()).to_matrix()
    s = d1.length / d0.length if stretch else 1.0

    def f(p):
        q = p - h0
        along = q.dot(u0)
        return h1 + rot @ (u0 * along * s + (q - u0 * along))
    return f


def fit_joints(rig, short, body):
    """Shoulders, elbows, wrists and knees onto the sculpt's joints. Each limb segment's bones (twist and
    share bones too) and the skin they carry move with the segment; the hand (with its fingers) follows the
    forearm rigidly; hips, ankles and feet stay. The FC1 body is only the source of skin weights, so it must
    follow the bones exactly, or the sculpt's forearm would take the hand's weights."""
    names = _bones(rig, short)
    mw = rig.matrix_world
    inv = mw.inverted()
    world_head = {short(b.name): mw @ b.head_local for b in rig.data.bones}
    seg_of, maps = {}, {}
    for side, sx in (('L_', 1), ('R_', -1)):
        m = Vector((sx, 1, 1))
        for chain, new_top, new_mid, new_end, end_follows in (
                (('Upperarm', 'Forearm', 'Hand'), SHOULDER * m, ELBOW * m, WRIST * m, True),
                (('Thigh', 'Calf', 'Foot'), None, KNEE * m, None, False)):
            A0, B0, C0 = (world_head[side + n] for n in chain)
            A1 = new_top if new_top is not None else A0
            B1 = new_mid
            C1 = new_end if new_end is not None else C0
            upper, lower = side + chain[0], side + chain[1]
            maps[upper] = _segment_map(A0, B0, A1, B1)
            maps[lower] = _segment_map(B0, C0, B1, C1)
            # the hand turns with the forearm and goes to the new wrist; the foot stays
            end = (_segment_map(B0, C0, B1, C1, stretch=False) if end_follows else (lambda p: p))
            maps[side + chain[2]] = (lambda f, c0, c1: (lambda p: f(p) - f(c0) + c1))(end, C0, C1) if end_follows else end
            for b in rig.data.bones:
                n = short(b.name)
                if not n.startswith(side):
                    continue
                if n == chain[2] or n.startswith(side + chain[2]) or (rig.data.bones[names[side + chain[2]]] in b.parent_recursive):
                    seg_of[b.name] = side + chain[2]
                elif n.startswith(upper):
                    seg_of[b.name] = upper
                elif n.startswith(lower) or n in (side + 'ElbowShareBone', side + 'KneeShareBone'):
                    seg_of[b.name] = lower
            print('HERO joints', side + chain[0], tuple(round(x, 3) for x in A1), tuple(round(x, 3) for x in B1),
                  tuple(round(x, 3) for x in C1))
    # the skin: every vertex moves by its bones' maps, blended by its weights
    groups = {g.index: g.name for g in body.vertex_groups}
    me, bw = body.data, body.matrix_world
    binv = bw.inverted()
    for v in me.vertices:
        p = bw @ v.co
        acc, tot = Vector(), 0.0
        for g in v.groups:
            name = groups.get(g.group)
            seg = seg_of.get(name)
            acc += (maps[seg](p) if seg else p) * g.weight
            tot += g.weight
        if tot > 1e-6:
            v.co = binv @ (acc / tot)
    me.update()
    # the bones
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for e in rig.data.edit_bones:
        seg = seg_of.get(e.name)
        if seg:
            f = maps[seg]
            e.head, e.tail = inv @ f(mw @ e.head), inv @ f(mw @ e.tail)
    for side in ('L_', 'R_'):
        cl = rig.data.edit_bones.get(names.get(side + 'Clavicle', ''))
        if cl:
            cl.tail = rig.data.edit_bones[names[side + 'Upperarm']].head.copy()
    bpy.ops.object.mode_set(mode='OBJECT')


# ---------------------------------------------------------------- the body

def _load_ply(path, like):
    """a PLY in world metres, as an object set up exactly like `like` (same parent, same local units)"""
    before = set(bpy.data.objects)
    bpy.ops.wm.ply_import(filepath=path)
    o = next(o for o in bpy.data.objects if o not in before)
    o.data.transform(o.matrix_world)
    o.matrix_world = like.matrix_world.copy()
    o.data.transform(like.matrix_world.inverted())
    o.parent = like.parent
    o.matrix_parent_inverse = like.matrix_parent_inverse.copy()
    o.matrix_basis = like.matrix_basis.copy()
    if o.name not in like.users_collection[0].objects:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        like.users_collection[0].objects.link(o)
    return o


# bones that take no skin on the sculpt: helpers (twist, share), the CC face and breast bones, fingers and toes
# (the sculpt's fists go; FC1's hands bring their own finger weights)
NO_SKIN = ('Twist', 'Share', 'Breast', 'Button', 'Facial', 'Jaw', 'Tongue', 'Teeth', 'Eye', 'Thumb', 'Index',
           'Mid', 'Ring', 'Pinky', 'Toe1', 'Toe2', 'BoneRoot', 'Hip')
# For the heat solve each skinned bone spans its real segment (CC bones' tails point anywhere): the tail goes to
# the next joint, or along a direction (metres) for the ends of chains.
SPAN = {'Pelvis': Vector((0, 0, -0.1)), 'Waist': 'Spine01', 'Spine01': 'Spine02', 'Spine02': 'NeckTwist01',
        'NeckTwist01': 'NeckTwist02', 'NeckTwist02': 'Head', 'Head': Vector((0, 0, 0.18)),
        'Clavicle': 'Upperarm', 'Upperarm': 'Forearm', 'Forearm': 'Hand', 'Hand': 0.09,
        'Thigh': 'Calf', 'Calf': 'Foot', 'Foot': 'ToeBase', 'ToeBase': Vector((0, -0.06, 0))}


def _heat_weights(body, rig, short):
    """Blender's bone heat weights on the main bones. (Copying FC1's weights by nearest surface failed: the
    sculpt's inner arms touch its lats, and FC1's torso had been snapped onto them, so raised arms tore.)"""
    saved = {b.name: b.use_deform for b in rig.data.bones}
    for b in rig.data.bones:
        n = short(b.name)
        b.use_deform = b.use_deform and (n.startswith('NeckTwist') or not any(k in n for k in NO_SKIN))
    # bones span their segments for the solve (restored after, exactly: head, tail and roll)
    mw = rig.matrix_world
    inv = mw.inverted()
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    by_short = {short(e.name): e for e in eb}
    kept = {e.name: (e.head.copy(), e.tail.copy(), e.roll) for e in eb}
    for e in eb:
        n = short(e.name)
        side, part = (n[:2], n[2:]) if n[:2] in ('L_', 'R_') else ('', n)
        span = SPAN.get(part)
        if span is None or not rig.data.bones[e.name].use_deform:
            continue
        h = mw @ e.head
        if isinstance(span, str):
            t = mw @ by_short[side + span].head
        elif isinstance(span, float):  # the hand: on along the forearm
            fa = by_short[side + 'Forearm']
            t = h + ((mw @ e.head) - (mw @ fa.head)).normalized() * span
        else:
            t = h + span
        e.tail = inv @ t
    bpy.ops.object.mode_set(mode='OBJECT')
    # heat weighting fails outright at this rig's scale (centimetres x 0.01): solve it 100x larger
    rig_mw = rig.matrix_world.copy()
    rig.matrix_world = Matrix.Scale(100, 4) @ rig_mw
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO', keep_transform=True)
    rig.matrix_world = rig_mw
    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for _ in range(2):  # twice: a connected child's head is its parent's tail
        for e in rig.data.edit_bones:
            e.head, e.tail, e.roll = kept[e.name]
    bpy.ops.object.mode_set(mode='OBJECT')
    for b in rig.data.bones:
        b.use_deform = saved[b.name]
    empty = sum(1 for v in body.data.vertices if not v.groups)
    print('HERO heat weights', len(body.vertex_groups), 'groups,', empty, 'vertices without weights')


def _clean_weights(o, short):
    """face and breast helpers folded into the head and chest; a light smoothing (the decimated mesh is uneven);
    at most four bones per vertex (glTF), normalised"""
    by_short = {short(g.name): g for g in o.vertex_groups}
    me = o.data
    for src, dst in FOLD.items():
        g, t = by_short.get(src), by_short.get(dst)
        if not g or not t:
            continue
        for v in me.vertices:
            for e in v.groups:
                if e.group == g.index and e.weight > 0:
                    t.add([v.index], e.weight, 'ADD')
        o.vertex_groups.remove(g)
    # FC1's hands keep their own weights (smoothing them into the hand bone stiffened the knuckles)
    hand_mat = {i for i, m in enumerate(me.materials) if m and m.name == 'toon_hand'}
    hand_v = {v for p in me.polygons if p.material_index in hand_mat for v in p.vertices}
    kept = {i: [(g.group, g.weight) for g in me.vertices[i].groups] for i in hand_v}
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=0.5, repeat=2)
    bpy.ops.object.mode_set(mode='OBJECT')
    for i, gw in kept.items():
        for g in list(me.vertices[i].groups):
            o.vertex_groups[g.group].remove([i])
        for gi, w in gw:
            o.vertex_groups[gi].add([i], w, 'REPLACE')
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_clean(group_select_mode='ALL', limit=0.01)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')


ARM_PARTS = ('Hand', 'Thumb', 'Index', 'Mid', 'Ring', 'Pinky', 'Forearm', 'ElbowShare')


def _arm_groups(o, short, side):
    """vertex group indices of one side's forearm and hand bones"""
    return {g.index for g in o.vertex_groups
            if short(g.name).startswith(tuple(side + k for k in ARM_PARTS)) and 'Toe' not in g.name}


def _arm_faces(bm, deform, groups):
    """faces whose every vertex hangs mostly on the forearm and hand"""
    on_arm = lambda v: sum(w for gi, w in v[deform].items() if gi in groups) > 0.5
    return [f for f in bm.faces if all(on_arm(v) for v in f.verts)]


def _hand_piece(fc1_body, short, side, wrist, axis, back):
    """FC1's hand (world space bmesh, with its skin weights): the part past the plane `back` metres up the
    forearm from the wrist"""
    bm = bmesh.new()
    bm.from_mesh(fc1_body.data)
    bm.transform(fc1_body.matrix_world)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)  # CC skin parts are split at material seams
    deform = bm.verts.layers.deform.verify()
    arm = set(_arm_faces(bm, deform, _arm_groups(fc1_body, short, side)))
    # (the nails stay: CC fingers have no skin under them; they take the hand's plain colour)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in arm], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    plane = wrist - axis * back
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=plane, plane_no=axis)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if (f.calc_center_median() - plane).dot(axis) < 0], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    return bm


FINGER_THICKEN = 1.0   # (thickening around each bone crumpled the fingers where two bones share them)
FINGER_CLOSE = 0.8     # FC1's fingers are spread apart in its bind pose; they close this far toward the middle one


def _close_fingers(rig, body, short):
    """the hands' bind pose with the fingers together (FC1's are splayed, so every clip showed a claw): each
    finger's base turns toward the middle finger, about the palm's normal; that pose becomes the rest pose"""
    import hero_shape
    mw = rig.matrix_world
    P = {short(pb.name): pb for pb in rig.pose.bones}
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    for side in ('L_', 'R_'):
        head = lambda n: mw @ P[side + n].head
        if not all(side + n in P for n in ('Index1', 'Mid1', 'Ring1', 'Pinky1', 'Mid2')):
            continue
        mid = (head('Mid2') - head('Mid1')).normalized()
        across = (head('Pinky1') - head('Index1')).normalized()
        palm = across.cross(mid).normalized()
        for n in ('Index', 'Ring', 'Pinky'):
            b, nxt = P[side + n + '1'], P.get(side + n + '2')
            if not nxt:
                continue
            h = head(n + '1')
            d = ((mw @ nxt.head) - h)
            d -= palm * d.dot(palm)
            m = mid - palm * mid.dot(palm)
            ang = d.normalized().angle(m.normalized())
            sign = 1 if d.cross(m).dot(palm) > 0 else -1
            R = Matrix.Rotation(sign * ang * FINGER_CLOSE, 4, palm)
            M = mw @ b.matrix
            b.matrix = mw.inverted() @ (Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ M)
            bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode='OBJECT')
    hero_shape._apply_pose_as_rest(rig, [body])


def _thicken_fingers(hb, fc1_body, rig, short, side, xf):
    """every finger point moves away from its bone's axis (head -> child's head), by its finger weight"""
    mw = rig.matrix_world
    names = {g.index: short(g.name) for g in fc1_body.vertex_groups}
    seg = {}
    for b in rig.data.bones:
        n = short(b.name)
        if n.startswith(tuple(side + k for k in ('Thumb', 'Index', 'Mid', 'Ring', 'Pinky'))) and 'Toe' not in n:
            h = xf(mw @ b.head_local)
            kid = b.children[0] if b.children else None
            t = xf(mw @ kid.head_local) if kid else h + (h - xf(mw @ b.parent.head_local)) * 0.8
            seg[n] = (h, t)
    deform = hb.verts.layers.deform.verify()
    for v in hb.verts:
        push, tot = Vector(), 0.0
        for gi, w in v[deform].items():
            n = names.get(gi)
            if n in seg:
                h, t = seg[n]
                q, _ = intersect_point_line(v.co, h, t)
                push += (v.co - q) * (FINGER_THICKEN - 1) * w
                tot += w
        if tot > 0:
            v.co += push


def _loop(bm_verts, centre, axis):
    """boundary vertices ordered by angle around `axis`"""
    ref = axis.orthogonal().normalized()
    ref2 = axis.cross(ref)
    return sorted(bm_verts, key=lambda v: math.atan2((v.co - centre).dot(ref2), (v.co - centre).dot(ref)))


def _zip(bm, a, b, centre, axis):
    """triangles between two closed loops (each sorted by angle), walking both by angle"""
    ref = axis.orthogonal().normalized()
    ref2 = axis.cross(ref)
    ang = lambda v: math.atan2((v.co - centre).dot(ref2), (v.co - centre).dot(ref))
    aa, ba = [ang(v) for v in a], [ang(v) for v in b]
    i = j = 0
    faces = []
    na, nb = len(a), len(b)
    while i < na or j < nb:
        an = aa[(i + 1) % na] + (2 * math.pi if i + 1 >= na else 0)
        bn = ba[(j + 1) % nb] + (2 * math.pi if j + 1 >= nb else 0)
        if j >= nb or (i < na and an <= bn):
            tri = (a[i % na], a[(i + 1) % na], b[j % nb])
            i += 1
        else:
            tri = (a[i % na], b[(j + 1) % nb], b[j % nb])
            j += 1
        if len(set(tri)) == 3:
            try:
                faces.append(bm.faces.new(tri))
            except ValueError:
                pass
    return faces


def sculpt_body(fc1_body, rig, short, lo_path):
    """the sculpt's game mesh, rigged, with FC1's hands; FC1's body is removed. Returns the new body."""
    fit_joints(rig, short, fc1_body)
    body = _load_ply(lo_path, fc1_body)
    body.name = 'Hero_body'
    _heat_weights(body, rig, short)
    names = _bones(rig, short)
    mw = rig.matrix_world
    skin = bpy.data.materials.get('skin_body') or bpy.data.materials.new('skin_body')
    hand_mat = bpy.data.materials.new('toon_hand')
    hand_mat.use_nodes = True
    hand_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*_srgb(YELLOW), 1.0)
    hand_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.85
    body.data.materials.append(skin)
    body.data.materials.append(hand_mat)

    # ---- hands: the sculpt's fists go, FC1's open hands (scaled to the sculpt's wrists) are stitched on
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bw = body.matrix_world
    bm.transform(bw)
    deform = bm.verts.layers.deform.verify()
    for side, sx in (('L_', 1), ('R_', -1)):
        wrist = mw @ rig.data.bones[names[side + 'Hand']].head_local
        elbow = mw @ rig.data.bones[names[side + 'Forearm']].head_local
        axis = (wrist - elbow).normalized()
        cut = wrist - axis * 0.025          # the sculpt ends 2.5 cm above the wrist ...
        start = wrist - axis * 0.012        # ... FC1's hand starts 1.2 cm above it; the gap is bridged
        arm = _arm_faces(bm, deform, _arm_groups(body, short, side))
        geom = list({e for f in arm for e in f.edges}) + list({v for f in arm for v in f.verts}) + arm
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=cut, plane_no=axis)
        arm = _arm_faces(bm, deform, _arm_groups(body, short, side))
        bmesh.ops.delete(bm, geom=[f for f in arm if (f.calc_center_median() - cut).dot(axis) > 0], context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        rim = [v for v in bm.verts if v.is_boundary and abs((v.co - cut).dot(axis)) < 1e-3 and (v.co - cut).length < 0.1]
        rim_c = sum((v.co for v in rim), Vector()) / len(rim)
        rim_r = sum(((v.co - rim_c) - axis * (v.co - rim_c).dot(axis)).length for v in rim) / len(rim)
        hb = _hand_piece(fc1_body, short, side, wrist, axis, 0.012)
        hrim = [v for v in hb.verts if v.is_boundary and abs((v.co - start).dot(axis)) < 1e-3]
        hc = sum((v.co for v in hrim), Vector()) / len(hrim)
        hr = sum(((v.co - hc) - axis * (v.co - hc).dot(axis)).length for v in hrim) / len(hrim)
        # the hand is HAND_SCALE x FC1's (the concept's hands are big); only its cuff narrows to the sculpt's
        # wrist, over the first TAPER metres
        rim_scale = rim_r / hr
        target = rim_c + axis * (start - cut).dot(axis)

        def xf(p, s_rim=rim_scale, hc=hc, target=target, axis=axis):
            q = p - hc
            t = q.dot(axis)
            k = s_rim + (HAND_SCALE - s_rim) * _smooth(0.0, TAPER, t)
            return target + axis * (t * HAND_SCALE) + (q - axis * t) * k
        for v in hb.verts:
            v.co = xf(v.co)
        _thicken_fingers(hb, fc1_body, rig, short, side, xf)
        # the hand's bones go with it
        hand_bones = [b for b in rig.data.bones if b.name == names[side + 'Hand'] or rig.data.bones[names[side + 'Hand']] in b.parent_recursive]
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode='EDIT')
        inv = mw.inverted()
        for b in hand_bones:
            e = rig.data.edit_bones[b.name]
            e.head, e.tail = inv @ xf(mw @ e.head), inv @ xf(mw @ e.tail)
        bpy.ops.object.mode_set(mode='OBJECT')
        print('HERO hand', side, 'cuff scale', round(rim_scale, 3), 'rim', len(rim), len(hrim), 'radius', round(rim_r, 4))
        # copy the hand into the body (weights by group name; finger groups made as needed), and stitch the rims
        hdeform = hb.verts.layers.deform.verify()
        src_names = {g.index: g.name for g in fc1_body.vertex_groups}
        vmap = {}
        for v in hb.verts:
            nv = bm.verts.new(v.co)
            for gi, w in v[hdeform].items():
                n = src_names.get(gi)
                if not n or w <= 0:
                    continue
                n = next((b.name for b in rig.data.bones if short(b.name) == FOLD.get(short(n), short(n))), n)
                g = body.vertex_groups.get(n) or body.vertex_groups.new(name=n)
                nv[deform][g.index] = nv[deform].get(g.index, 0.0) + w
            vmap[v] = nv
        for f in hb.faces:
            try:
                nf = bm.faces.new([vmap[v] for v in f.verts])
                nf.material_index = 1
                nf.smooth = True
            except ValueError:
                pass
        hb.free()
        new_rim = _loop([vmap[v] for v in hrim], target, axis)
        for nf in _zip(bm, _loop(rim, rim_c, axis), new_rim, rim_c, axis):
            nf.material_index = 1
            nf.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.transform(bw.inverted())
    bm.to_mesh(body.data)
    bm.free()
    for p in body.data.polygons:
        p.use_smooth = True

    _clean_weights(body, short)
    _close_fingers(rig, body, short)
    _smooth_groin(body)
    head = make_head(body, rig, short)
    region_materials(body, short)
    bpy.data.objects.remove(fc1_body)
    print('HERO body', len(body.data.vertices), 'vertices', len(body.data.polygons), 'faces')
    return body, head


# ---------------------------------------------------------------- the face: the concept art's blank mask

def _head_fit(dirs, r, w=None, degree=4):
    """least-squares radius as a polynomial in the unit direction (x^a y^b z^c, a+b+c <= degree)"""
    terms = [(a, b, c) for a in range(degree + 1) for b in range(degree + 1 - a) for c in range(degree + 1 - a - b)]
    A = np.stack([dirs[:, 0] ** a * dirs[:, 1] ** b * dirs[:, 2] ** c for a, b, c in terms], 1)
    if w is None:
        w = np.ones(len(r))
    coef, *_ = np.linalg.lstsq(A * w[:, None], r * w, rcond=None)
    return lambda d: np.stack([d[:, 0] ** a * d[:, 1] ** b * d[:, 2] ** c for a, b, c in terms], 1) @ coef


# The head: a smooth egg on the sculpt's skull, sitting on the neck like the concept art's (its jaw line is the
# outline where the egg meets the neck). The sculpt's head is cut off above a plane under the chin and the
# neck capped; the egg (a separate skinned mesh on the head bone) covers the cap.
NECK_CUT = (Vector((0.0, -0.06, 1.485)), Vector((0.0, -0.34, 1.0)).normalized())  # point, normal (up)
EGG_RINGS, EGG_SEGMENTS = 40, 64
EGG_CHIN_Z = 1.462   # the sculpt's chin
EGG_JAW = 0.22
NECK_TAPER = (0.035, 0.22)   # over the last 3.5 cm, up to 22% narrower


def _egg_radius(c, pts):
    """r(d) around c: the concept's egg, sized on the sculpt's skull. The skull's half extents (nose, ears and
    lips left out: points far above a smooth fit count less) give an ellipsoid; below the centre it narrows
    toward the jaw, and the crown is a touch fuller."""
    P = np.array([p - c for p in pts])
    r = np.linalg.norm(P, axis=1)
    d = P / r[:, None]
    w = np.ones(len(r))
    for _ in range(4):
        f = _head_fit(d, r, w, degree=2)
        res = r - f(d)
        w = 1.0 / (1.0 + (np.maximum(res, 0) / 0.002) ** 2)
    inl = P[w > 0.5]
    rx = np.ptp(inl[:, 0]) / 2
    ry = (np.percentile(inl[:, 1], 99) - np.percentile(inl[:, 1], 1)) / 2
    rz_top = inl[:, 2].max()
    rz_bot = EGG_CHIN_Z - c.z
    print('HERO egg radii', round(float(rx), 3), round(float(ry), 3), round(float(rz_top), 3), round(float(rz_bot), 3))

    def radius(dd):
        x, y, z = dd[:, 0], dd[:, 1], dd[:, 2]
        low = np.clip(-z, 0, 1)
        jaw = 1.0 - EGG_JAW * low ** 1.4          # narrower toward the chin
        rz = np.where(z > 0, rz_top, -rz_bot)
        return 1.0 / np.sqrt((x / (rx * jaw)) ** 2 + (y / (ry * jaw)) ** 2 + (z / rz) ** 2)
    return radius


def egg_direction(u, v):
    """the egg's UV -> unit direction (front of the face at u = 0.5, seam at the back, v = 0 at the bottom)"""
    th = (u - 0.5) * 2 * math.pi
    ph = (v - 0.5) * math.pi
    return np.stack([np.sin(th) * np.cos(ph), -np.cos(th) * np.cos(ph), np.sin(ph) * np.ones_like(th)], -1)


def make_head(body, rig, short):
    head_bone = next(b.name for b in rig.data.bones if short(b.name) == 'Head')
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bw = body.matrix_world
    bm.transform(bw)
    pc, pn = NECK_CUT
    skull = [v.co.copy() for v in bm.verts if (v.co - pc).dot(pn) > 0.02 and abs(v.co.x) < 0.12]
    # the head's centre: middle of the skull's bounding box, a little low (the crown is the egg's wide end)
    xs, ys, zs = zip(*skull)
    # y: halfway between the back of the skull and the brow (the nose would pull it forward)
    brow = sorted(ys)[int(len(ys) * 0.03)]
    c = Vector(((min(xs) + max(xs)) / 2, (brow + max(ys)) / 2, (min(zs) + max(zs)) / 2 - 0.01))
    radius = _egg_radius(c, skull)
    # the sculpt's head goes; the neck is capped
    near = [f for f in bm.faces if f.calc_center_median().z > 1.38]
    geom = list({e for f in near for e in f.edges}) + list({v for f in near for v in f.verts}) + near
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=pc, plane_no=pn)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if (f.calc_center_median() - pc).dot(pn) > 0], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    rim = [e for e in bm.edges if e.is_boundary and all(abs((v.co - pc).dot(pn)) < 1e-3 for v in e.verts)]
    # the neck narrows into the egg over its last few centimetres, so the cut stays inside the head
    rv = {v for e in rim for v in e.verts}
    nc = sum((v.co for v in rv), Vector()) / len(rv)
    for v in bm.verts:
        h = (v.co - pc).dot(pn)
        if -NECK_TAPER[0] < h <= 1e-4 and (v.co - nc).length < 0.15:
            k = NECK_TAPER[1] * _smooth(-NECK_TAPER[0], 0.0, h)
            q = v.co - nc
            q -= pn * q.dot(pn)
            v.co -= q * k
    cap = bmesh.ops.holes_fill(bm, edges=rim, sides=0)['faces']
    bmesh.ops.triangulate(bm, faces=cap)
    for f in cap:
        f.smooth = True
    bm.transform(bw.inverted())
    bm.to_mesh(body.data)
    bm.free()

    # the egg, with its own UVs (u around, v up) for the face's paint
    eb = bmesh.new()
    uvl = eb.loops.layers.uv.new('UVMap')
    grid, radii = [], []
    for i in range(EGG_RINGS + 1):
        row = []
        for j in range(EGG_SEGMENTS + 1):
            u, v = j / EGG_SEGMENTS, i / EGG_RINGS
            d = egg_direction(np.array([u]), np.array([v]))
            r = radius(d)[0]
            radii.append(float(r))
            row.append(eb.verts.new(c + Vector(d[0]) * r))
        grid.append(row)
    for i in range(EGG_RINGS):
        for j in range(EGG_SEGMENTS):
            quad = (grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j])
            uvs = ((j, i), (j + 1, i), (j + 1, i + 1), (j, i + 1))
            f = eb.faces.new(quad)
            f.smooth = True
            for loop, (a, b) in zip(f.loops, uvs):
                loop[uvl].uv = (a / EGG_SEGMENTS, b / EGG_RINGS)
    # weld the seam and the poles (UVs stay per corner)
    bmesh.ops.remove_doubles(eb, verts=eb.verts, dist=1e-6)
    bmesh.ops.dissolve_degenerate(eb, edges=eb.edges, dist=1e-7)
    bmesh.ops.recalc_face_normals(eb, faces=eb.faces)
    me = bpy.data.meshes.new('Hero_head')
    eb.to_mesh(me)
    eb.free()
    head = bpy.data.objects.new('Hero_head', me)
    body.users_collection[0].objects.link(head)
    head.parent = body.parent
    head.matrix_parent_inverse = body.matrix_parent_inverse.copy()
    head.matrix_basis = body.matrix_basis.copy()
    me.transform(body.matrix_world.inverted())
    g = head.vertex_groups.new(name=head_bone)
    g.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    mod = head.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    head['egg_centre'] = list(c)
    head['egg_radius'] = radii   # (EGG_RINGS + 1) x (EGG_SEGMENTS + 1), for paint_face
    print('HERO head egg', len(me.polygons), 'faces, centre', tuple(round(x, 3) for x in c))
    return head


def region_materials(body, short):
    """skin faces named by their bones: skin_arm (upper arm down), skin_leg (thigh down), skin_body"""
    mats = {m.name: i for i, m in enumerate(body.data.materials)}
    for n in ('skin_arm', 'skin_leg'):
        if n not in mats:
            body.data.materials.append(bpy.data.materials.get(n) or bpy.data.materials.new(n))
            mats[n] = len(body.data.materials) - 1
    kind = {}
    for g in body.vertex_groups:
        n = short(g.name)[2:]
        if n.startswith(('Upperarm', 'Forearm', 'Elbow', 'Hand', 'Thumb', 'Index', 'Mid', 'Ring', 'Pinky')) and 'Toe' not in n:
            kind[g.index] = 'arm'
        elif n.startswith(('Thigh', 'Calf', 'Knee', 'Foot', 'ToeBase')) or 'Toe' in n:
            kind[g.index] = 'leg'
    me = body.data
    share = []
    for v in me.vertices:
        a = sum(g.weight for g in v.groups if kind.get(g.group) == 'arm')
        l = sum(g.weight for g in v.groups if kind.get(g.group) == 'leg')
        share.append((a, l))
    for p in me.polygons:
        if p.material_index != mats['skin_body']:
            continue
        a = sum(share[i][0] for i in p.vertices) / len(p.vertices)
        l = sum(share[i][1] for i in p.vertices) / len(p.vertices)
        if a > 0.5:
            p.material_index = mats['skin_arm']
        elif l > 0.5:
            p.material_index = mats['skin_leg']


def _smooth_groin(body, iterations=40):
    """the sculpt's groin, smoothed flat (it sits under the shorts, which would take its shape)"""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bw = body.matrix_world
    bm.transform(bw)
    def k(p):
        return (1 - _smooth(0.05, 0.09, abs(p.x))) * _smooth(0.66, 0.72, p.z) * (1 - _smooth(0.86, 0.92, p.z)) \
            * (1 - _smooth(-0.02, 0.03, p.y))
    zone = [(v, k(v.co)) for v in bm.verts]
    zone = [(v, w) for v, w in zone if w > 0]
    for _ in range(iterations):
        new = [(v, v.co.lerp(sum((e.other_vert(v).co for e in v.link_edges), Vector()) / len(v.link_edges), 0.5 * w))
               for v, w in zone if v.link_edges]
        for v, c in new:
            v.co = c
    bm.transform(bw.inverted())
    bm.to_mesh(body.data)
    bm.free()


# ---------------------------------------------------------------- skin: the sculpt's detail and the concept's ink

MAP = 2048
NORMAL_STRENGTH = 0.45   # stronger turned the fine detail into blotches under the toon ramp


def _mesh_arrays(me):
    n = len(me.vertices)
    co = np.empty(n * 3, np.float64)
    me.vertices.foreach_get('co', co)
    me.calc_loop_triangles()
    tri = np.empty(len(me.loop_triangles) * 3, np.int64)
    me.loop_triangles.foreach_get('vertices', tri)
    nrm = np.empty(n * 3, np.float64)
    me.vertices.foreach_get('normal', nrm)
    return co.reshape(-1, 3), tri.reshape(-1, 3), nrm.reshape(-1, 3)


def groove_field(co, tri, nrm, fine, coarse):
    """how far each point's neighbourhood lies below (negative) or above a wider neighbourhood, along its normal
    (metres): a band-pass of the surface (`fine` smoothing passes remove pores and veins, `coarse` passes give
    the broad form). The ink lines snap into its minima."""
    a, b = np.concatenate([tri[:, 0], tri[:, 1], tri[:, 2]]), np.concatenate([tri[:, 1], tri[:, 2], tri[:, 0]])
    i, j = np.concatenate([a, b]), np.concatenate([b, a])
    deg = np.maximum(np.bincount(i, minlength=len(co)).astype(np.float64), 1)
    p = co.copy()
    near = None
    for k in range(coarse):
        avg = np.stack([np.bincount(i, weights=p[j, c], minlength=len(co)) for c in range(3)], 1) / deg[:, None]
        p = 0.5 * p + 0.5 * avg
        if k + 1 == fine:
            near = p.copy()
    return ((near - p) * nrm).sum(1)


def _bake(obj, img, kind, sources=()):
    """bake `kind` into img through obj's single material (selected-to-active from sources when given)"""
    m = obj.data.materials[0]
    node = m.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = img
    for n in m.node_tree.nodes:
        n.select = False
    node.select = True
    m.node_tree.nodes.active = node
    bpy.ops.object.select_all(action='DESELECT')
    for s in sources:
        s.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    unit = obj.matrix_world.to_scale().x
    kw = dict(type=kind, margin=12, use_selected_to_active=bool(sources))
    if sources:
        kw.update(cage_extrusion=0.012 / unit, max_ray_distance=0.03 / unit)
    if kind == 'NORMAL':
        kw.update(normal_space='TANGENT')
    bpy.ops.object.bake(**kw)
    m.node_tree.nodes.remove(node)


def _emit_material(name, attr):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    a = nt.nodes.new('ShaderNodeAttribute')
    a.attribute_name = attr
    e = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(a.outputs['Color'], e.inputs['Color'])
    nt.links.new(e.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
    return m


def _srgb_image(name, linear):
    """an 8-bit sRGB colour image from linear RGB (h, w, 3): what the glTF exporter writes as is"""
    h, w = linear.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = 'sRGB'
    c = np.clip(linear, 0, 1)
    enc = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)
    # byte images take display values through .pixels as floats 0..1
    img.pixels[:] = np.dstack([enc, np.ones((h, w))]).astype(np.float32).ravel()
    return img


def dress_skin(body, head, short, hi_path, out_dir):
    """body skin -> toon_skin (inked colour map + the sculpt's normal map), head -> toon_head (painted face)"""
    import os
    os.makedirs(out_dir, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 1
    skin_idx = {i for i, m in enumerate(body.data.materials) if m and m.name.startswith('toon_skin')}
    # UVs: one atlas over the skin (the hands keep a plain colour)
    if not body.data.uv_layers:
        body.data.uv_layers.new(name='UVMap')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    for p in body.data.polygons:
        p.select = p.material_index in skin_idx
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.003, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    # a copy of the skin alone (and without the rig) to bake onto
    bake = body.copy()
    bake.data = body.data.copy()
    body.users_collection[0].objects.link(bake)
    bake.modifiers.clear()
    bm = bmesh.new()
    bm.from_mesh(bake.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index not in skin_idx], context='FACES')
    bm.to_mesh(bake.data)
    bm.free()
    # each texel's position on the body (for the ink lines), as a colour: (p + 1) / 3 stays positive
    bpy.context.view_layer.objects.active = bake
    pc = bake.data.color_attributes.new('pos', 'FLOAT_COLOR', 'POINT')
    bw = bake.matrix_world
    pcols = np.ones((len(bake.data.vertices), 4), np.float32)
    pcols[:, :3] = [(tuple((bw @ v.co + Vector((1, 1, 1))) / 3)) for v in bake.data.vertices]
    pc.data.foreach_set('color', pcols.ravel())
    bake.data.materials.clear()
    bake.data.materials.append(_emit_material('bake_pos', 'pos'))
    # the sculpt
    before = set(bpy.data.objects)
    bpy.ops.wm.ply_import(filepath=hi_path)
    hi = next(o for o in bpy.data.objects if o not in before)
    hi.data.materials.append(_emit_material('bake_none', 'none'))

    def image(name, color=True, fill=(0, 0, 0, 1)):
        img = bpy.data.images.new(name, MAP, MAP, alpha=False, float_buffer=True)
        img.colorspace_settings.name = 'Linear Rec.709' if color else 'Non-Color'   # float pixels are linear
        img.generated_color = fill
        return img

    nmap = image('hero_skin_normal', False, (0.5, 0.5, 1, 1))
    posmap = image('hero_position', False)
    _bake(bake, posmap, 'EMIT')
    _bake(bake, nmap, 'NORMAL', [hi])
    bpy.data.objects.remove(bake)
    px = lambda img: np.array(img.pixels[:], dtype=np.float32).reshape(MAP, MAP, 4)
    pos = px(posmap)
    valid = pos[..., :3].sum(-1) > 0.01
    pos = pos[..., :3] * 3 - 1
    # the ink lines, snapped into the sculpt's grooves
    from mathutils.kdtree import KDTree
    co, tri, nrm = _mesh_arrays(hi.data)
    groove = groove_field(co, tri, nrm, *SNAP_BAND)
    kd = KDTree(len(co))
    for k, p in enumerate(co):
        kd.insert(p, k)
    kd.balance()
    bm = bmesh.new()
    bm.from_mesh(hi.data)
    hi_bvh = BVHTree.FromBMesh(bm)
    bm.free()
    lines = ink_polylines(hi_bvh, kd, groove)
    bpy.data.objects.remove(hi)
    ink = paint_lines(pos, valid, lines)
    print('HERO ink lines', len(lines), 'cover', round(float(ink.mean()) * 100, 3), '% of the skin map')
    yellow = np.array(_srgb(YELLOW), np.float32)
    inkc = np.array(_srgb(INK), np.float32)
    col = yellow * (1 - ink[..., None]) + inkc * ink[..., None]
    cmap = _srgb_image('hero_skin_color', col)
    for img in (cmap, nmap):
        img.filepath_raw = os.path.join(out_dir, img.name + '.png')
        img.file_format = 'PNG'
        img.save()
        img.pack()
    # the material
    t = bpy.data.materials.new('toon_skin_body')
    t.use_nodes = True
    nt = t.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.85
    c = nt.nodes.new('ShaderNodeTexImage')
    c.image = cmap
    nt.links.new(c.outputs['Color'], bsdf.inputs['Base Color'])
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = nmap
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = NORMAL_STRENGTH
    nt.links.new(n.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    for i in skin_idx:
        body.data.materials[i] = t
    paint_face(head, out_dir)
    sc.render.engine = 'BLENDER_EEVEE'


# ---------------------------------------------------------------- the face, painted on the egg
# In the concept: two white half-moon slits with a heavy black outline (flat top edge, rounded underside, the inner
# ends lower: a stern look), and one line from between the eyes down to the chin with a small kink. Front-view
# coordinates (x, z) in metres; the shapes are mirrored for the left eye.
FACE_MAP = 1024
EYE = dict(x_in=0.012, x_out=0.064, z_in=1.565, z_out=1.576, depth=0.015, outline=0.0036)   # bold: reads at phone size
FACE_LINE = [(-0.004, 1.565), (-0.009, 1.536), (-0.012, 1.527), (-0.007, 1.521), (-0.011, 1.47)]
FACE_LINE_WIDTH = 0.0032
EYE_WHITE = '#FBFAF4'


def _seg_dist(P, A, B):
    """distance from points P (n,2) to segment A-B, and the parameter along it"""
    AB = B - A
    t = np.clip(((P - A) @ AB) / max(float(AB @ AB), 1e-14), 0, 1)
    return np.linalg.norm(P - (A + t[:, None] * AB), axis=1), t


def _poly_sdf(P, poly):
    """signed distance to a closed polygon (negative inside)"""
    d = np.full(len(P), np.inf)
    inside = np.zeros(len(P), bool)
    for a, b in zip(poly, np.roll(poly, -1, 0)):
        d = np.minimum(d, _seg_dist(P, a, b)[0])
        cross = ((a[1] > P[:, 1]) != (b[1] > P[:, 1])) & \
            (P[:, 0] < (b[0] - a[0]) * (P[:, 1] - a[1]) / (b[1] - a[1] + 1e-12) + a[0])
        inside ^= cross
    return np.where(inside, -d, d)


def eye_polygon(sx):
    e = EYE
    s = np.linspace(0, 1, 24)
    x = sx * (e['x_in'] + (e['x_out'] - e['x_in']) * s)
    top = e['z_in'] + (e['z_out'] - e['z_in']) * s
    # the underside: deepest a little toward the inner end, sharp corners
    bot = top - e['depth'] * np.sin(np.pi * s) ** 0.8 * (1.0 - 0.25 * s)
    return np.concatenate([np.stack([x, top], 1), np.stack([x, bot], 1)[::-1]])


def paint_face(head, out_dir):
    import os
    c = np.array(head['egg_centre'])
    R = np.array(head['egg_radius']).reshape(EGG_RINGS + 1, EGG_SEGMENTS + 1)
    n = FACE_MAP
    u, v = np.meshgrid((np.arange(n) + 0.5) / n, (np.arange(n) + 0.5) / n)
    d = egg_direction(u.ravel(), v.ravel())
    # the radius at each texel, bilinear over the egg's grid
    fi, fj = v.ravel() * EGG_RINGS, u.ravel() * EGG_SEGMENTS
    i0, j0 = np.clip(fi.astype(int), 0, EGG_RINGS - 1), np.clip(fj.astype(int), 0, EGG_SEGMENTS - 1)
    ti, tj = fi - i0, fj - j0
    r = (R[i0, j0] * (1 - ti) * (1 - tj) + R[i0, j0 + 1] * (1 - ti) * tj + R[i0 + 1, j0] * ti * (1 - tj)
         + R[i0 + 1, j0 + 1] * ti * tj)
    P3 = c + d * r[:, None]
    front = d[:, 1] < -0.15
    P = P3[:, [0, 2]]
    ink = np.zeros(len(P))
    white = np.zeros(len(P))
    aa = 0.0004   # anti-aliasing width (m)
    for sx in (1, -1):
        sd = np.full(len(P), np.inf)
        sd[front] = _poly_sdf(P[front], eye_polygon(sx))
        white = np.maximum(white, np.clip(0.5 - sd / aa, 0, 1))
        ink = np.maximum(ink, np.clip(0.5 - (np.abs(sd) - EYE['outline'] / 2) / aa, 0, 1))
    line = np.array(FACE_LINE)
    dl = np.full(len(P), np.inf)
    tl = np.zeros(len(P))
    cum = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(line, axis=0), axis=1))])
    for k, (a, b) in enumerate(zip(line[:-1], line[1:])):
        dd, t = _seg_dist(P[front], a, b)
        better = dd < dl[front]
        idx = np.where(front)[0][better]
        dl[idx] = dd[better]
        tl[idx] = (cum[k] + t[better] * (cum[k + 1] - cum[k])) / cum[-1]
    width = FACE_LINE_WIDTH * np.clip(np.minimum(tl / 0.12, (1 - tl) / 0.2), 0.25, 1)
    ink = np.maximum(ink, np.clip(0.5 - (dl - width / 2) / aa, 0, 1))
    yellow = np.array(_srgb(YELLOW))
    col = yellow * (1 - white[:, None]) + np.array(_srgb(EYE_WHITE)) * white[:, None]
    col = col * (1 - ink[:, None]) + np.array(_srgb(INK)) * ink[:, None]
    img = _srgb_image('hero_face_color', col.reshape(n, n, 3))
    img.filepath_raw = os.path.join(out_dir, 'hero_face_color.png')
    img.file_format = 'PNG'
    img.save()
    img.pack()
    t = bpy.data.materials.new('toon_head')
    t.use_nodes = True
    nt = t.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.85
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    head.data.materials.clear()
    head.data.materials.append(t)
    print('HERO face painted: ink', round(float(ink.mean()) * 100, 2), '% white', round(float(white.mean()) * 100, 2), '%')


# ---------------------------------------------------------------- the concept's ink lines
# The concept inks the main muscle borders with clean lines. They are authored here in front (or back) view
# coordinates (x, z metres; read off a gridded render of the sculpt), mirrored to both sides, projected onto
# the sculpt and snapped into its own grooves (the deepest point of a fine band-pass within SNAP metres), then
# drawn into the skin map with a constant width that tapers at the ends.
SNAP = 0.012
SNAP_BAND = (3, 25)
LINE_W = 0.0026
INK_LINES = [
    # (view, width factor, points) -- right side (x < 0) or centre; every off-centre line is mirrored
    ('front', 1.0, [(-0.1825, 1.265), (-0.135, 1.235), (-0.075, 1.229), (-0.03, 1.24), (-0.0075, 1.255)]),  # pec
    ('front', 1.0, [(0.0, 1.39), (0.0, 1.2625)]),                                                         # sternum
    ('front', 0.8, [(-0.0075, 1.405), (-0.06, 1.404), (-0.11, 1.41), (-0.15, 1.419)]),                     # collarbone
    ('front', 0.8, [(-0.0425, 1.468), (-0.02, 1.43), (-0.0075, 1.41)]),                                   # neck cord
    ('front', 0.85, [(-0.1475, 1.40), (-0.165, 1.34), (-0.1775, 1.2775)]),                                # deltoid / pec
    ('front', 1.0, [(0.0, 1.25), (0.0, 1.0125)]),                                                         # linea alba
    ('front', 0.9, [(-0.0525, 1.20), (-0.025, 1.194), (0.0, 1.194)]),                                     # abs, row 1
    ('front', 0.9, [(-0.06, 1.15), (-0.0275, 1.147), (0.0, 1.15)]),                                       # abs, row 2
    ('front', 0.9, [(-0.0525, 1.1025), (-0.025, 1.10), (0.0, 1.1035)]),                                   # abs, row 3
    ('front', 0.9, [(-0.065, 1.225), (-0.071, 1.17), (-0.065, 1.11), (-0.0475, 1.055), (-0.025, 1.02)]),   # abs, side
    ('front', 0.75, [(-0.15, 1.21), (-0.125, 1.20)]),                                                     # serratus
    ('front', 0.75, [(-0.15, 1.1775), (-0.1225, 1.1675)]),
    ('front', 0.75, [(-0.145, 1.145), (-0.1175, 1.135)]),
    ('front', 0.8, [(-0.135, 1.12), (-0.1275, 1.07), (-0.11, 1.01)]),                                      # flank
    ('front', 0.75, [(-0.215, 1.31), (-0.26, 1.24)]),                                                     # deltoid
    ('front', 0.7, [(-0.25, 1.12), (-0.285, 1.13)]),                                                      # elbow
    ('front', 0.7, [(-0.29, 1.10), (-0.31, 1.03), (-0.325, 0.96)]),                                       # forearm
    ('front', 0.7, [(-0.06, 0.62), (-0.065, 0.55), (-0.08, 0.52)]),                                       # knee, inner
    ('front', 0.7, [(-0.135, 0.60), (-0.13, 0.52)]),                                                      # knee, outer
    ('front', 0.6, [(-0.115, 0.42), (-0.118, 0.30), (-0.12, 0.20)]),                                      # shin
    ('back', 1.0, [(0.0, 1.45), (0.0, 1.0)]),                                                             # spine
    ('back', 0.8, [(-0.07, 1.38), (-0.08, 1.25), (-0.11, 1.17)]),                                         # shoulder blade
]


def _resample(pts, step=0.002):
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        n = max(1, int((b - a).length / step))
        out += [a.lerp(b, k / n) for k in range(1, n + 1)]
    return out


def ink_polylines(hi_bvh, kd, groove):
    """the authored lines on the sculpt's surface (lists of world points), snapped into its grooves"""
    lines = []
    for view, wf, pts in INK_LINES:
        sides = [1] if all(abs(x) < 1e-6 for x, _ in pts) else [1, -1]
        for sx in sides:
            origin_y, ray = (-1.0, Vector((0, 1, 0))) if view == 'front' else (1.0, Vector((0, -1, 0)))
            on = []
            for x, z in pts:
                hit = hi_bvh.ray_cast(Vector((x * sx, origin_y, z)), ray, 2.0)[0]
                if hit is not None:
                    on.append(hit)
            if len(on) < 2:
                continue
            # the control points into the sculpt's grooves, then a smooth curve through them, on the surface
            ctrl = []
            for p in on:
                near = kd.find_range(p, SNAP)
                if near:
                    near.sort(key=lambda h: groove[h[1]])
                    best = near[:12]
                    q = sum((h[0] for h in best), Vector()) / len(best)
                    ctrl.append(p.lerp(q, 0.7))
                else:
                    ctrl.append(p)
            snapped = []
            ext = [ctrl[0] * 2 - ctrl[1]] + ctrl + [ctrl[-1] * 2 - ctrl[-2]]
            for k in range(1, len(ext) - 2):
                p0, p1, p2, p3 = ext[k - 1], ext[k], ext[k + 1], ext[k + 2]
                n = max(2, int((p2 - p1).length / 0.002))
                for m in range(n):
                    t = m / n
                    snapped.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                                          + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
            snapped.append(ctrl[-1])
            snapped = [hi_bvh.find_nearest(p)[0] or p for p in snapped]
            lines.append((wf, snapped))
    return lines


def paint_lines(pos, valid, lines, texel=0.0008):
    """ink (MAP x MAP, 0..1) for the polylines, from the skin's baked position map"""
    from mathutils.kdtree import KDTree
    idx = np.flatnonzero(valid)
    P = pos.reshape(-1, 3)[idx]
    kd = KDTree(len(idx))
    for k, p in enumerate(P):
        kd.insert(p, k)
    kd.balance()
    ink = np.zeros(pos.shape[0] * pos.shape[1])
    for wf, pts in lines:
        L = np.array([tuple(p) for p in pts])
        seg = np.linalg.norm(np.diff(L, axis=0), axis=1)
        cum = np.concatenate([[0], np.cumsum(seg)])
        total = cum[-1] or 1.0
        for k in range(len(L) - 1):
            a, b = L[k], L[k + 1]
            reach = LINE_W * wf
            cand = {h[1] for h in kd.find_range(Vector(tuple((a + b) / 2)), seg[k] / 2 + reach)}
            if not cand:
                continue
            cand = np.fromiter(cand, int)
            Q = P[cand]
            ab = b - a
            t = np.clip(((Q - a) @ ab) / max(float(ab @ ab), 1e-14), 0, 1)
            d = np.linalg.norm(Q - (a + t[:, None] * ab), axis=1)
            u = (cum[k] + t * seg[k]) / total
            w = LINE_W * wf * np.clip(np.minimum(u / 0.15, (1 - u) / 0.15), 0.2, 1.0)
            val = np.clip(0.5 - (d - w / 2) / texel, 0, 1)
            np.maximum.at(ink, idx[cand], val)
    return ink.reshape(pos.shape[:2])


# ---------------------------------------------------------------- the concept's pose: thumbs up
# hero_idle (the loop a hero plays wherever they are on screen: lobby, shop, hero page): the stand clip's pose
# with the right fist raised in front of the shoulder, knuckles to the viewer, thumb up; a slow breath.
THUMB_WRIST = Vector((-0.04, -0.34, -0.06))   # the wrist, from the right shoulder (metres, world)
THUMB_POLE = Vector((-0.4, 0.2, -1.0))          # the elbow bends down and out
FIST = {1: 1.55, 2: 1.75, 3: 1.15}              # finger curl (radians) per joint: a closed fist
IDLE_FRAMES = 72


def _set_world(rig, pb, M):
    pb.matrix = rig.matrix_world.inverted() @ M
    bpy.context.view_layer.update()


def _aim(rig, pb, target, child_head=None):
    """turn bone pb (about its head) so that its child's head (or tail) points at target"""
    mw = rig.matrix_world
    M = mw @ pb.matrix
    head = M.translation
    tip = mw @ (child_head() if child_head else pb.tail)
    q = (tip - head).normalized().rotation_difference((target - head).normalized())
    R = q.to_matrix().to_4x4()
    _set_world(rig, pb, Matrix.Translation(head) @ R @ Matrix.Translation(-head) @ M)


def thumbs_up_clip(rig, base='stand'):
    ad = rig.animation_data
    mw = rig.matrix_world
    sc = bpy.context.scene
    for t in list(ad.nla_tracks):
        if t.name == 'hero_idle':
            ad.nla_tracks.remove(t)
    old = bpy.data.actions.get('hero_idle')
    if old:
        bpy.data.actions.remove(old)
    ad.action = bpy.data.actions[base]
    sc.frame_set(1)
    pose = {pb.name: (pb.rotation_quaternion.copy(), pb.location.copy()) for pb in rig.pose.bones}
    act = bpy.data.actions.new('hero_idle')
    act.use_fake_user = True
    ad.action = act
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion, pb.location = pose[pb.name]
    bpy.context.view_layer.update()
    P = {pb.name: pb for pb in rig.pose.bones}
    head = lambda n: mw @ P[n].head
    # the right arm: two-bone solve to the wrist target, elbow toward the pole
    S = head('CC_R_Upperarm')
    W = S + THUMB_WRIST
    L1 = (head('CC_R_Forearm') - S).length
    L2 = (head('CC_R_Hand') - head('CC_R_Forearm')).length
    d = min((W - S).length, L1 + L2 - 1e-4)
    u = (W - S).normalized()
    perp = (THUMB_POLE - u * THUMB_POLE.dot(u)).normalized()
    a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
    E = S + u * a + perp * math.sqrt(max(L1 * L1 - a * a, 0.0))
    _aim(rig, P['CC_R_Upperarm'], E, lambda: P['CC_R_Forearm'].head)
    _aim(rig, P['CC_R_Forearm'], W, lambda: P['CC_R_Hand'].head)
    # the fist: knuckles toward the viewer and across the body, the index on top
    hand = P['CC_R_Hand']
    fwd0 = (head('CC_R_Mid1') - head('CC_R_Hand')).normalized()
    across0 = (head('CC_R_Pinky1') - head('CC_R_Index1')).normalized()
    fwd1 = Vector((0.55, -0.45, 0.55)).normalized()
    across1 = Vector((0.15, 0.1, -1.0))
    across1 = (across1 - fwd1 * across1.dot(fwd1)).normalized()

    def frame(f, a):
        a = (a - f * a.dot(f)).normalized()
        return Matrix((f, a, f.cross(a))).transposed()
    R = (frame(fwd1, across1) @ frame(fwd0, across0).inverted()).to_4x4()
    Mh = mw @ hand.matrix
    h0 = Mh.translation.copy()
    _set_world(rig, hand, Matrix.Translation(h0) @ R @ Matrix.Translation(-h0) @ Mh)
    # fingers curl into the palm (each joint about the finger's own side axis); the thumb stands up
    across = (head('CC_R_Pinky1') - head('CC_R_Index1')).normalized()
    fwd = (head('CC_R_Mid1') - head('CC_R_Hand')).normalized()
    palm = fwd.cross(across).normalized()
    for name in ('Index', 'Mid', 'Ring', 'Pinky'):
        if f'CC_R_{name}2' not in P:
            continue
        # one hinge for the whole finger, from its straight direction (worked out per joint, it collapsed once
        # the knuckle had bent toward the palm, and the middle and tip joints turned about nothing in particular)
        axis = (head(f'CC_R_{name}2') - head(f'CC_R_{name}1')).normalized().cross(palm).normalized()
        for i in (1, 2, 3):
            bn = f'CC_R_{name}{i}'
            if bn not in P:
                continue
            hd = head(bn)
            M = mw @ P[bn].matrix
            Rq = Matrix.Rotation(FIST[i], 4, axis)
            _set_world(rig, P[bn], Matrix.Translation(hd) @ Rq @ Matrix.Translation(-hd) @ M)
    up = Vector((0.1, -0.25, 1.0)).normalized()
    if 'CC_R_Thumb1' in P and 'CC_R_Thumb2' in P:
        _aim(rig, P['CC_R_Thumb1'], head('CC_R_Thumb1') + up, lambda: P['CC_R_Thumb2'].head)
    if 'CC_R_Thumb2' in P and 'CC_R_Thumb3' in P:
        _aim(rig, P['CC_R_Thumb2'], head('CC_R_Thumb2') + up, lambda: P['CC_R_Thumb3'].head)
    # the head a little down, like the concept's look
    hb = P.get('CC_Head')
    if hb:
        M = mw @ hb.matrix
        hd = M.translation.copy()
        _set_world(rig, hb, Matrix.Translation(hd) @ Matrix.Rotation(math.radians(8), 4, Vector((1, 0, 0))) @ Matrix.Translation(-hd) @ M)
    # key it, with a breath (the chest rises a touch) halfway
    keyed = {pb.name: pb.rotation_quaternion.copy() for pb in rig.pose.bones}
    for f in (0, IDLE_FRAMES):
        for pb in rig.pose.bones:
            pb.rotation_quaternion = keyed[pb.name]
            pb.keyframe_insert('rotation_quaternion', frame=f)
            if pb.name == 'CC_Hip':
                pb.keyframe_insert('location', frame=f)
    chest = P.get('CC_Spine02')
    if chest:
        chest.rotation_quaternion = keyed['CC_Spine02'] @ Quaternion((1, 0, 0), math.radians(-1.5))
        chest.keyframe_insert('rotation_quaternion', frame=IDLE_FRAMES // 2)
    track = ad.nla_tracks.new()
    track.name = 'hero_idle'
    track.strips.new('hero_idle', 0, act)
    track.mute = True
    ad.action = None
    print('HERO clip hero_idle (thumbs up)', IDLE_FRAMES, 'frames')
