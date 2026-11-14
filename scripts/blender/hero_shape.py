"""The default hero (the player's own athlete): a muscular, faceless, yellow toon figure in grey shorts with a
grey sleeve on his left arm, from the player-supplied concept art. build_fc1.py builds him when FC1_HERO=1 on
FC1's rig, so he has every clip the other heroes have; his body is the user's anatomy sculpt (hero_body.py).

Here (world metres, the body faces -Y, his left is +X):
- wrap_to_sculpt: FC1's rig into the sculpt's stance;
- make_kit: loose grey shorts and a left-arm sleeve, shells of the body (build_fc1.body_shell); no skin is
  culled under them;
- finish_materials: the remaining FC1 skin becomes toon_skin.
Materials are named toon_* for the viewer's toon shading and outline (avatarViewerHtml.ts).
"""
import math

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

YELLOW = '#F2CF5B'
GREY = '#7C7C80'
SLEEVE = '#77777C'
SHOE = '#3A3A40'

SHOULDER_OUT = 0.05   # each arm chain moves out (and a little up)
SHOULDER_UP = 0.008
HIP_IN = 0.012         # each leg chain moves in


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


def make_kit(body, rig, short, body_shell, sport_trim_unused=None):
    """grey shorts (mid-thigh) and a sleeve on his left arm"""
    from mathutils.geometry import intersect_point_line
    up = Vector((0, 0, 1))
    shorts_mat = toon_material('toon_shorts', GREY)
    sleeve_mat = toon_material('toon_sleeve', SLEEVE)
    # loose shorts, like the concept's: from the hips to above the knee, a shell of the skin (so they bend
    # exactly with it, squats included) smoothed over its dips, standing off further toward the hems
    WAIST, HEM = 0.975, 0.60
    shorts = body_shell(body, 'Hero_shorts', {'skin_leg', 'skin_body'},
                        [(Vector((0, 0, WAIST)), up), (Vector((0, 0, HEM)), up)],
                        lambda m, c: HEM < c.z < WAIST, 24, 0.004,
                        lambda p: 0.013 + 0.02 * max(0.0, min(1.0, (0.86 - p.z) / (0.86 - HEM))) ** 1.3,
                        [shorts_mat, shorts_mat], lambda c: False)
    _even_hems(shorts)
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
                        lambda m, c: sleeve_field(c) < 0, 6, 0.001, lambda p: 0.014,
                        [sleeve_mat, sleeve_mat], lambda c: False)
    _even_hems(sleeve)
    _arm_only(sleeve, short, 'L_')
    return [shorts, sleeve]


def _arm_only(o, short, side):
    """a sleeve hangs on the arm's bones only (the body's torso weights near its top tore it when the arm rose)"""
    arm = {g.index for g in o.vertex_groups if short(g.name).startswith(tuple(side + k for k in ('Upperarm', 'Forearm', 'Hand')))}
    upper = next(g for g in o.vertex_groups if short(g.name) == side + 'Upperarm')
    for v in o.data.vertices:
        keep = [(g.group, g.weight) for g in v.groups if g.group in arm]
        tot = sum(w for _, w in keep)
        for g in list(v.groups):
            if g.group not in arm:
                o.vertex_groups[g.group].remove([v.index])
        if tot <= 1e-6:
            upper.add([v.index], 1.0, 'REPLACE')
        else:
            for gi, w in keep:
                o.vertex_groups[gi].add([v.index], w / tot, 'REPLACE')


def _even_hems(o, iterations=6):
    """open edges (waistband, leg hems) relaxed along themselves: the cut through the triangulated sculpt and
    the push along uneven normals left them ragged"""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    rim = [v for v in bm.verts if v.is_boundary]
    for _ in range(iterations):
        new = []
        for v in rim:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                new.append((v, v.co.lerp((nb[0].co + nb[1].co) / 2, 0.5)))
        for v, c in new:
            v.co = c
    bm.to_mesh(o.data)
    bm.free()


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
    """FC1's rig into the sculpt's stance: shoulders out to the sculpt's, arms down to its wrists and legs to its
    ankles, made the rest pose (hero_body.fit_joints then places elbows and knees). The FC1 body follows; it
    only gives the hero its hands now."""
    _bvh, pts = _load_sculpt(ply)
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
