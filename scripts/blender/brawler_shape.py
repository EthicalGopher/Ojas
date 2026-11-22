"""The brawler: a scrappy street fighter on FC1's body and rig, in a hand-painted look, built to match the
concept sheet (assets/concepts/brawler_concept_full.jpg). build_fc1.py builds her when FC1_BRAWLER=1, so she has
every clip the other heroes have.

The concept: black undercut (her left side shaved) with the long top swept over to her right and falling to the
jaw, lime streaks; tan skin, amber eyes, heavy brows, scratch marks on her right cheek, dark eye make-up; a
slate crew-neck tank under a leather harness (straps over both shoulders, one across the chest, one diagonal,
brass buckles); a wide belt, a slung belt and a strap round the right thigh; baggy olive cargo trousers with big
flap pockets and riveted iron knee pads on straps, tucked into tall lace-up boots; her right hand and forearm
wrapped; her LEFT arm mechanical: a clamp on the upper arm, a copper pipe from the shoulder, rusted iron segments
down the forearm with copper pipes and two glowing chemtech vials, an iron hand.

World metres throughout: the body faces -Y, her left is +X, feet at z = 0, 1.70 m tall; FC1's rest pose is a
T-pose (arms out along +-X, palms down).
- strip: FC1's long hair goes;
- dress: the clothes, straps and armour are shells of the body's skin (build_fc1.body_shell), so they follow
  it through every pose; buckles, knee pads, the arm's hardware and the hair are rigid pieces on one bone each;
- paint: every new piece gets its own UV map and a baked brush-stroke colour map (stroke bands, painted
  shadows in the folds, rust on the iron, a soft key light from above); the skin maps are tanned and go through
  a Kuwahara filter (flat paint dabs); the face gets its brows, lids, scratches and the shaved side's stubble.
Materials are gear_* (plain PBR in the viewer: the cloth sheen would grey the painted colours) and hair_*.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_point_line

PALETTE = {  # sRGB
    'gear_top': '#2D3338', 'gear_pants': '#3F3D26', 'gear_pocket': '#3A3722', 'gear_leather': '#4B3121',
    'gear_brass': '#9C7A3C', 'gear_boots': '#271D17', 'gear_sole': '#141110', 'gear_wraps': '#CFC6B4',
    'gear_iron': '#3A3C40', 'gear_copper': '#A35A2E', 'gear_glow': '#36F1CD', 'hair_buzz': '#17191B',
    'hair_locks': '#141618', 'hair_lime': '#B9D53C',
}
HAIR_SHEEN = '#34404A'
HEAD_C = Vector((0.0, -0.02, 1.585))      # middle of the skull
WAIST = 1.005
BELT_W = 0.052
TOP_HEM = 0.975                            # tucked under the belt
# crew neck: the top's upper edge seen from the front, (|x|, z)
TOP_EDGE = [(0.0, 1.405), (0.045, 1.425), (0.062, 1.47), (0.10, 1.47), (0.115, 1.36), (0.135, 1.26), (0.16, 1.20),
            (0.3, 1.18)]
BOOT_TOP, BOOT_BOTTOM = 0.37, 0.085
PANTS_HEM = 0.30                           # tucked into the boots
POCKET_Z = (0.55, 0.78)
LEG_X = 0.09
BUST_FRONT = (-0.115, 0.012)
SHOULDER_STRAP_X = 0.098
STRAP_HALF = 0.017


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def placeholder(name):
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)


def smooth01(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def strip(meshes, short):
    """FC1's long hair (her bun, tail and strands) goes: the brawler has her own."""
    keep = []
    for o in meshes:
        names = {short(m.name) if m else '' for m in o.data.materials}
        if any(n.startswith('hair_') for n in names):
            bpy.data.objects.remove(o)
            continue
        keep.append(o)
    return keep


def _bones(rig, short):
    bones = {short(b.name): b for b in rig.data.bones}

    def head(n):
        return rig.matrix_world @ bones[n].head_local
    return head


def _bone_name(rig, short, n):
    return next(b.name for b in rig.data.bones if short(b.name) == n)


def seg_dist(p, a, b):
    """distance from p to the segment a-b, in the x-z plane (straps drawn on the front view)"""
    ax, az, bx, bz = a[0], a[1], b[0], b[1]
    vx, vz = bx - ax, bz - az
    t = max(0.0, min(1.0, ((p.x - ax) * vx + (p.z - az) * vz) / (vx * vx + vz * vz)))
    return math.hypot(p.x - (ax + t * vx), p.z - (az + t * vz))


# ---------------------------------------------------------------- rigid pieces (world-space bmesh builders)

def frame(a, b, up=Vector((0, 0, 1))):
    """an orthonormal frame along a->b: u along, v as close to `up` as possible, w = u x v"""
    u = (b - a).normalized()
    v = up - u * up.dot(u)
    v = v.normalized() if v.length > 1e-6 else Vector((0, 1, 0))
    return u, v, u.cross(v)


def _merge(dst, src, mat):
    for f in src.faces:
        f.material_index = mat
        f.smooth = True
    me = bpy.data.meshes.new('tmp')
    src.to_mesh(me)
    src.free()
    dst.from_mesh(me)
    bpy.data.meshes.remove(me)


def add_cylinder(dst, a, b, r, mat, seg=18, r2=None, cap=True):
    u, v, w = frame(a, b)
    bm = bmesh.new()
    rings = []
    for end, rad in ((a, r), (b, r2 if r2 is not None else r)):
        rings.append([bm.verts.new(end + (v * math.cos(2 * math.pi * k / seg) + w * math.sin(2 * math.pi * k / seg)) * rad)
                      for k in range(seg)])
    for k in range(seg):
        bm.faces.new((rings[0][k], rings[0][(k + 1) % seg], rings[1][(k + 1) % seg], rings[1][k]))
    if cap:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _merge(dst, bm, mat)


def add_tube(dst, pts, r, mat, seg=8):
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        tan = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector((0, 0, 1)) if abs(tan.z) < 0.9 else Vector((0, 1, 0))
        v = (up - tan * up.dot(tan)).normalized()
        w = tan.cross(v)
        rings.append([bm.verts.new(p + (v * math.cos(2 * math.pi * k / seg) + w * math.sin(2 * math.pi * k / seg)) * r)
                      for k in range(seg)])
    for i in range(len(pts) - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _merge(dst, bm, mat)


def add_box(dst, c, axes, size, mat, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    u, v, w = axes
    m = Matrix((u * size[0], v * size[1], w * size[2])).transposed()
    for vert in bm.verts:
        vert.co = c + m @ vert.co
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=1, affect='EDGES')
    _merge(dst, bm, mat)


def add_frame_buckle(dst, c, n, up, w, h, mat, bar=0.005, depth=0.004):
    """a buckle: a rectangular frame of four bars, facing along n, `up` its long side"""
    n = n.normalized()
    up = (up - n * up.dot(n)).normalized()
    side = up.cross(n)
    for off, ax, length in ((up * (h / 2), side, w), (-up * (h / 2), side, w),
                            (side * (w / 2), up, h), (-side * (w / 2), up, h)):
        a2 = ax.cross(n)
        add_box(dst, c + off, (ax, a2, n), (length + bar, bar, depth), mat)
    # the prong
    add_box(dst, c, (up, side, n), (h, bar * 0.6, depth * 0.8), mat)


def add_cap(dst, c, axes, radii, mat, keep=-0.25, thick=0.005, rivets=0, rivet_mat=None):
    """a domed plate: the +w half (beyond `keep`) of an ellipsoid, made solid; optional rivets round its rim"""
    u, v, w = axes
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=1.0)
    bmesh.ops.delete(bm, geom=[x for x in bm.verts if x.co.z < keep], context='VERTS')
    m = Matrix((u * radii[0], v * radii[1], w * radii[2])).transposed()
    for x in bm.verts:
        x.co = c + m @ x.co
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=-thick)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _merge(dst, bm, mat)
    for k in range(rivets):
        a = 2 * math.pi * (k + 0.5) / rivets
        z = keep + 0.18
        rr = math.sqrt(max(0.0, 1 - z * z))
        p = c + m @ Vector((math.cos(a) * rr * 0.86, math.sin(a) * rr * 0.86, z + 0.05))
        s = bmesh.new()
        bmesh.ops.create_uvsphere(s, u_segments=8, v_segments=6, radius=0.0042)
        for x in s.verts:
            x.co += p
        _merge(dst, s, rivet_mat if rivet_mat is not None else mat)


def rigid(name, bm, rig, short, bone, mats):
    """a rigid piece from a world-space bmesh, skinned 100% to one bone"""
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    rig.users_collection[0].objects.link(o)
    o.parent = rig
    o.matrix_parent_inverse = rig.matrix_world.inverted()
    vg = o.vertex_groups.new(name=_bone_name(rig, short, bone))
    vg.add(range(len(me.vertices)), 1.0, 'REPLACE')
    o.modifiers.new('Armature', 'ARMATURE').object = rig
    for m in mats:
        me.materials.append(m)
    print('RIGID', name, bone, len(me.polygons))
    return o


def surface_point(bvh, p, d):
    """where a ray from p along d meets the surface, and its normal"""
    hit, n, _, _ = bvh.ray_cast(p, d)
    if hit is None:
        hit, n, _, _ = bvh.find_nearest(p)
    return hit, n.normalized()


# ---------------------------------------------------------------- an athletic build

def _bump(t, a, b):
    """0 outside a..b, a smooth hump inside"""
    if t <= a or t >= b:
        return 0.0
    return math.sin(math.pi * (t - a) / (b - a)) ** 1.5


def muscle_up(body, rig, short):
    """FC1's slim body made athletic, like the concept: rounder deltoids, bigger biceps / triceps and
    forearms, raised traps, wider lats, a thicker neck, fuller quads and calves. Every bulge pushes along
    the direction away from a bone axis (or a joint centre), a function of position only, so vertices split at
    the material seams move together and no cracks open. Runs before any clothes are made."""
    head = _bones(rig, short)
    me, mw = body.data, body.matrix_world
    inv = mw.inverted()
    hand_idx = set()
    segs = {}
    for s, sx in (('L', 1), ('R', -1)):
        segs[s] = dict(sh=head(f'{s}_Upperarm'), el=head(f'{s}_Forearm'), wr=head(f'{s}_Hand'),
                       hip=head(f'{s}_Thigh'), kn=head(f'{s}_Calf'), an=head(f'{s}_Foot'), sx=sx)
    neck_a, neck_b = head('NeckTwist01'), head('Head')

    def radial(p, a, b):
        q, t = intersect_point_line(p, a, b)
        d = p - q
        return t, (d.normalized() if d.length > 1e-6 else Vector((0, 0, 1))), d.length

    moved = 0
    for v in me.vertices:
        p = mw @ v.co
        off = Vector()
        for s, g in segs.items():
            sx = g['sx']
            if sx * p.x < 0.02:
                continue
            # deltoid: round the shoulder cap, out and up from the joint
            d = p - g['sh']
            if d.length < 0.11 and sx * p.x > sx * g['sh'].x - 0.035:
                k = smooth01(0.11, 0.03, d.length)
                off += d.normalized() * (0.015 * k)
            # upper arm: biceps in front (-Y in the T-pose, palms down), triceps behind
            t, r, dist = radial(p, g['sh'], g['el'])
            if 0.0 < t < 1.0 and dist < 0.08:
                front = max(0.0, -r.y)
                back = max(0.0, r.y)
                off += r * (_bump(t, 0.2, 0.92) * (0.006 + 0.013 * front ** 1.5 + 0.009 * back ** 1.5))
            # forearm: thick near the elbow, tapering to the wrist
            t, r, dist = radial(p, g['el'], g['wr'])
            if 0.0 < t < 1.0 and dist < 0.07:
                off += r * (_bump(t, -0.1, 0.75) * (0.006 + 0.005 * max(0.0, r.z)))
            # thigh: quads in front and outside, a little all round
            t, r, dist = radial(p, g['hip'], g['kn'])
            if 0.05 < t < 1.0 and dist < 0.11:
                quad = max(0.0, -r.y) + 0.6 * max(0.0, sx * r.x)
                off += r * (_bump(t, 0.05, 0.95) * (0.003 + 0.006 * min(1.0, quad)))
            # calf: the back of the lower leg
            t, r, dist = radial(p, g['kn'], g['an'])
            if 0.0 < t < 1.0 and dist < 0.08:
                off += r * (_bump(t, 0.05, 0.6) * (0.002 + 0.008 * max(0.0, r.y) ** 1.2))
            # traps: the slope from the neck to the shoulder, up
            ax = sx * p.x
            if 0.035 < ax < 0.15 and 1.36 < p.z < 1.50 and p.y > -0.06:
                k = _bump(ax, 0.035, 0.15) * _bump(p.z, 1.36, 1.50)
                off += Vector((0.25 * sx, 0.1, 1.0)).normalized() * (0.013 * k)
            # lats: the back below the shoulder blades, out to the side
            if 0.06 < ax < 0.17 and 1.12 < p.z < 1.36 and p.y > -0.02:
                k = _bump(p.z, 1.12, 1.36) * smooth01(0.06, 0.13, ax)
                off += Vector((sx, 0.3, 0)).normalized() * (0.010 * k)
        # neck: a touch thicker
        t, r, dist = radial(p, neck_a, neck_b)
        if 0.0 < t < 1.0 and dist < 0.07 and p.z < 1.53:
            off += Vector((r.x, r.y, 0)).normalized() * (0.004 * _bump(t, -0.2, 1.0)) if (r.x or r.y) else Vector()
        if off.length > 1e-6:
            v.co = inv @ (p + off)
            moved += 1
    me.update()
    print('MUSCLE', moved, 'vertices')


# ---------------------------------------------------------------- clothes

def make_clothes(body, rig, short, h):
    """trousers, pockets, belts and thigh strap, tank top, harness, boots"""
    body_shell = h['body_shell']
    up = Vector((0, 0, 1))
    head = _bones(rig, short)

    def horizontal(z):
        return (Vector((0, 0, z)), up)

    legs = {'skin_leg', 'skin_body'}
    out = []

    def pants_off(p):
        """baggy: fuller over the thighs and knees, bloused over the boot tops, tucked in below"""
        base = 0.015 + 0.012 * smooth01(0.97, 0.80, p.z)
        blouse = 0.012 * smooth01(BOOT_TOP - 0.02, BOOT_TOP + 0.05, p.z) * smooth01(BOOT_TOP + 0.16, BOOT_TOP + 0.07, p.z)
        tuck = 0.012 * smooth01(BOOT_TOP + 0.01, BOOT_TOP - 0.04, p.z)
        return base + blouse - tuck

    out.append(body_shell(body, 'Brawler_pants', legs, [horizontal(WAIST), horizontal(PANTS_HEM)],
                          lambda m, c: PANTS_HEM < c.z < WAIST, 20, 0.003, pants_off,
                          [placeholder('gear_pants'), placeholder('gear_pants')], lambda c: False))

    # big flap pockets on the outer front of each thigh
    def pocket_where(c):
        sx = 1 if c.x > 0 else -1
        a = math.degrees(math.atan2(-c.y, sx * c.x - LEG_X))   # 0 = straight out, 90 = straight to the front
        return POCKET_Z[0] < c.z < POCKET_Z[1] and -15 < a < 70

    def pocket_field(c):
        sx = 1 if c.x > 0 else -1
        a = math.degrees(math.atan2(-c.y, sx * c.x - LEG_X))
        return min(a + 15, 70 - a) * 0.002
    out.append(body_shell(body, 'Brawler_pockets', legs, [horizontal(POCKET_Z[0]), horizontal(POCKET_Z[1])],
                          lambda m, c: pocket_where(c), 20, 0.003, lambda p: pants_off(p) + 0.012,
                          [placeholder('gear_pocket'), placeholder('gear_pocket')],
                          lambda c: c.z > POCKET_Z[1] - 0.032, fields=[pocket_field]))

    # belts: the wide one at the waist; a slung one from her right hip down across to her left thigh;
    # a strap round the right thigh
    slung = ((-0.15, 0.975), (0.13, 0.83))

    def slung_field(c):
        return seg_dist(c, *slung) - 0.016

    out.append(body_shell(body, 'Brawler_belt', legs, [horizontal(WAIST - BELT_W), horizontal(WAIST + 0.006)],
                          lambda m, c: WAIST - BELT_W < c.z < WAIST + 0.006, 20, 0.003,
                          lambda p: pants_off(Vector((p.x, p.y, WAIST - 0.02))) + 0.010,
                          [placeholder('gear_leather'), placeholder('gear_leather')], lambda c: False))
    out.append(body_shell(body, 'Brawler_slung', legs, [], lambda m, c: slung_field(c) < 0 and c.y < 0.04, 20, 0.003,
                          lambda p: pants_off(p) + 0.016,
                          [placeholder('gear_leather'), placeholder('gear_leather')], lambda c: False,
                          fields=[slung_field]))
    out.append(body_shell(body, 'Brawler_thighstrap', {'skin_leg'}, [horizontal(0.62), horizontal(0.645)],
                          lambda m, c: 0.62 < c.z < 0.645 and c.x < 0,
                          6, 0.002, lambda p: pants_off(p) + 0.014,
                          [placeholder('gear_leather'), placeholder('gear_leather')], lambda c: False))
    # knee pad straps above and below each knee
    for i, (z0, z1) in enumerate(((0.405, 0.428), (0.565, 0.588))):
        out.append(body_shell(body, f'Brawler_kneestrap{i}', {'skin_leg'}, [horizontal(z0), horizontal(z1)],
                              lambda m, c, z0=z0, z1=z1: z0 < c.z < z1, 6, 0.002, lambda p: pants_off(p) + 0.007,
                              [placeholder('gear_leather'), placeholder('gear_leather')], lambda c: False))

    # tank top: stretched over a smoothed body, crew neck, tucked under the belt
    arms = [(head(f'{s}_Upperarm'), head(f'{s}_Forearm')) for s in 'LR']

    def arm_field(c):
        d = 1e9
        for a, b in arms:
            q, t = intersect_point_line(c, a, b)
            d = min(d, ((c - q) if t > 0 else (c - a)).length)
        return d - 0.055

    def top_part(m, c):
        return TOP_HEM < c.z < h['edge_z'](TOP_EDGE, abs(c.x)) and arm_field(c) >= 0 and abs(c.x) < 0.32

    def compress_bust(p):
        y0, depth = BUST_FRONT
        if p.y >= y0:
            return p
        return Vector((p.x, y0 - depth * math.tanh((y0 - p.y) / depth), p.z))

    smooth_torso = h['smoothed_body'](body)
    out.append(body_shell(body, 'Brawler_top', {'skin_body', 'skin_arm', 'skin_head'},
                          [horizontal(TOP_HEM)] + h['edge_segments'](TOP_EDGE),
                          top_part, 150, 0.003, lambda p: 0.005,
                          [placeholder('gear_top'), placeholder('gear_top')], lambda c: False,
                          smooth_torso, None, compress_bust, fields=[arm_field]))

    # harness: over both shoulders (front and back), across the chest, and from her left shoulder down to her
    # right hip (front only)
    def shoulder_field(c):
        return abs(abs(c.x) - SHOULDER_STRAP_X) - STRAP_HALF if c.z > 1.16 else 1.0

    def chest_field(c):
        return max(abs(c.z - 1.322) - STRAP_HALF, abs(c.x) - 0.165, c.y + 0.02)

    diag = ((SHOULDER_STRAP_X, 1.33), (-0.16, 1.02))

    def diag_field(c):
        return max(seg_dist(c, *diag) - STRAP_HALF, c.y + 0.02)

    def harness_field(c):
        return min(shoulder_field(c), chest_field(c), diag_field(c))

    out.append(body_shell(body, 'Brawler_harness', {'skin_body', 'skin_arm', 'skin_head'}, [horizontal(1.02)],
                          lambda m, c: harness_field(c) < 0 and c.z > 1.02 and arm_field(c) >= -0.01 and
                          c.z < h['edge_z'](TOP_EDGE, abs(c.x)) + 0.012,
                          150, 0.003, lambda p: 0.0115,
                          [placeholder('gear_leather'), placeholder('gear_leather')], lambda c: False,
                          smooth_torso, None, compress_bust, fields=[shoulder_field, chest_field, diag_field]))

    # boots: tall shafts over the trouser hems (FC1's shoes below become their feet)
    out.append(body_shell(body, 'Brawler_boots', {'skin_leg'}, [horizontal(BOOT_BOTTOM), horizontal(BOOT_TOP)],
                          lambda m, c: BOOT_BOTTOM < c.z < BOOT_TOP, 10, 0.003,
                          lambda p: 0.024 + 0.012 * smooth01(0.12, BOOT_TOP, p.z),
                          [placeholder('gear_boots'), placeholder('gear_boots')], lambda c: False))
    return out, smooth_torso


def make_buckles(body, rig, short, smooth_torso):
    """brass buckles on the harness and belts (rigid on the chest and hip bones)"""
    torso = bmesh.new()
    hips = bmesh.new()
    brass = 0
    for x, z in ((SHOULDER_STRAP_X, 1.36), (-SHOULDER_STRAP_X, 1.36), (0.02, 1.322)):
        p, n = surface_point(smooth_torso, Vector((x, -0.4, z)), Vector((0, 1, 0)))
        if p is not None:
            add_frame_buckle(torso, p + n * 0.016, n, Vector((0, 0, 1)) if abs(x) > 0.05 else Vector((1, 0, 0)),
                             0.032, 0.040, brass)
    belt_bvh = smooth_torso
    for (x, z, upv) in ((0.0, WAIST - BELT_W / 2, Vector((1, 0, 0))), (-0.11, 0.955, Vector((1, 0, -0.52)))):
        p, n = surface_point(belt_bvh, Vector((x, -0.4, z)), Vector((0, 1, 0)))
        if p is not None:
            add_frame_buckle(hips, p + n * 0.034, n, upv, 0.040, 0.050, brass)
    return [rigid('Brawler_buckles_chest', torso, rig, short, 'Spine02', [placeholder('gear_brass')]),
            rigid('Brawler_buckles_hip', hips, rig, short, 'Hip', [placeholder('gear_brass')])]


def make_kneepads(rig, short):
    """riveted iron knee pads, rigid on the shins"""
    head = _bones(rig, short)
    pads = []
    for s in 'LR':
        knee = head(f'{s}_Calf')
        c = Vector((knee.x, -0.055, knee.z + 0.005))
        bm = bmesh.new()
        axes = (Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0)))
        add_cap(bm, c + Vector((0, 0.002, 0)), axes, (0.057, 0.072, 0.024), 2, keep=-0.05, thick=0.008)
        add_cap(bm, c + Vector((0, -0.006, 0)), axes, (0.05, 0.064, 0.022), 0, keep=-0.05, thick=0.006,
                rivets=8, rivet_mat=1)
        pads.append(rigid(f'Brawler_kneepad_{s}', bm, rig, short, f'{s}_Calf',
                          [placeholder('gear_iron'), placeholder('gear_brass'), placeholder('gear_leather')]))
    return pads


def make_wraps(body, rig, short, body_shell):
    """Her right hand and forearm wrapped: from 13 cm up the forearm over the knuckles to the first finger
    joints; the thumb wrapped to its first joint."""
    head = _bones(rig, short)
    hands, cuts = [], []
    for s in 'R':
        wrist, knuckle = head(f'{s}_Hand'), head(f'{s}_Mid1')
        axis = (knuckle - wrist).normalized()
        reach = min((head(f'{s}_{f}2') - wrist).dot(axis) for f in ('Index', 'Mid', 'Ring', 'Pinky')) - 0.008
        t2, t3 = head(f'{s}_Thumb2'), head(f'{s}_Thumb3')
        thumb = (t3 - t2).normalized()
        hands.append((wrist, axis, reach, t2, t3, thumb))
        cuts += [(wrist - axis * 0.13, -axis), (wrist + axis * reach, axis), (t2, thumb)]

    def thumb_field(c):
        d = 1e9
        for wrist, axis, reach, t2, t3, thumb in hands:
            tq, _ = intersect_point_line(c, t2, t3)
            d = min(d, max((c - tq).length - 0.03, -(c - t2).dot(thumb)))
        return d

    def inside(c):
        for wrist, axis, reach, t2, t3, thumb in hands:
            t = (c - wrist).dot(axis)
            q, _ = intersect_point_line(c, wrist, wrist + axis)
            if -0.13 < t < reach and (c - q).length < 0.08:
                return thumb_field(c) >= 0
        return False

    m = placeholder('gear_wraps')
    return body_shell(body, 'Brawler_wraps', {'skin_arm'}, cuts, lambda mm, c: inside(c), 2, 0.0015,
                      lambda p: 0.0045, [m, m], lambda c: False, fields=[thumb_field])


def make_mech_arm(body, rig, short, body_shell):
    """Her left arm (+X): an iron hand (a shell of the hand, fingers and all), and rigid hardware: a clamp on
    the upper arm and a copper pipe from the back of the shoulder; rusted iron segments down the forearm,
    copper pipes along it, two glowing vials on its outer side (the T-pose's top), bolts."""
    head = _bones(rig, short)
    shoulder, elbow, wrist = head('L_Upperarm'), head('L_Forearm'), head('L_Hand')
    iron, copper, glow, brass = 0, 1, 2, 3
    mats = [placeholder('gear_iron'), placeholder('gear_copper'), placeholder('gear_glow'), placeholder('gear_brass')]

    # the iron hand
    knuckle = head('L_Mid1')
    axis = (knuckle - wrist).normalized()
    hand = body_shell(body, 'Brawler_ironhand', {'skin_arm', 'skin_nails'}, [(wrist - axis * 0.012, -axis)],
                      lambda m, c: (c - wrist).dot(axis) > -0.012 and (c - wrist).length < 0.25,
                      2, 0.001, lambda p: 0.0042, [mats[iron], mats[iron]], lambda c: False)

    # forearm hardware: a chunky iron housing, much wider than the arm (the concept's silhouette)
    fa = bmesh.new()
    u, v, w = frame(elbow, wrist)
    L = (wrist - elbow).length

    def at(t, dv=0.0, dw=0.0):
        return elbow + u * (L * t) + v * dv + w * dw

    # three blocky iron sections (square-ish, bevelled) with rims, gaps showing piston rods between them
    blocks = [(-0.03, 0.22, 0.066), (0.30, 0.58, 0.062), (0.66, 0.93, 0.058)]
    for t0, t1, half in blocks:
        add_box(fa, at((t0 + t1) / 2), (u, v, w), (L * (t1 - t0), half * 2, half * 2), iron, bevel=0.008)
        for t in (t0 + 0.015, t1 - 0.015):
            add_box(fa, at(t), (u, v, w), (0.016, half * 2 + 0.012, half * 2 + 0.012), iron, bevel=0.003)
        for a in (0.785, 2.356, 3.927, 5.498):      # corner bolts
            d = v * math.cos(a) + w * math.sin(a)
            add_cylinder(fa, at(t0 + 0.04) + d * (half * 1.25), at(t0 + 0.04) + d * (half * 1.25 + 0.006), 0.005, brass, seg=8)
    for dv, dw in ((0.03, 0.045), (-0.03, 0.045), (0.03, -0.045), (-0.03, -0.045)):   # piston rods across the gaps
        add_cylinder(fa, at(0.2, dv, dw), at(0.70, dv, dw), 0.0065, iron, seg=10)
    # the round gear housing at the elbow, on the outside
    add_cylinder(fa, at(0.08, 0.0, -0.07), at(0.08, 0.0, 0.07), 0.045, iron)
    add_cylinder(fa, at(0.08, 0.0, -0.078), at(0.08, 0.0, 0.078), 0.022, brass)
    # copper pipes along the top
    for side in (-1, 1):
        pts = [at(t, 0.074 + 0.004 * math.sin(math.pi * t), side * 0.03) for t in np.linspace(0.0, 0.92, 10)]
        add_tube(fa, pts, 0.007, copper)
    # vials of glowing chemtech in iron cages on the outer side (the T-pose's top)
    for t0, t1, dw in ((0.06, 0.27, 0.0), (0.38, 0.56, 0.0), (0.70, 0.88, 0.0)):
        add_cylinder(fa, at(t0, 0.09, dw), at(t1, 0.09, dw), 0.014, glow)
        for t in (t0 - 0.012, t1 + 0.012):
            add_cylinder(fa, at(t - 0.01, 0.09, dw), at(t + 0.01, 0.09, dw), 0.018, copper)
        for a in (0.0, 2.1, 4.2):
            d = v * math.cos(a) * 0.019 + w * math.sin(a) * 0.019
            add_cylinder(fa, at(t0, 0.09) + d, at(t1, 0.09) + d, 0.0025, iron, seg=6)
        add_box(fa, at((t0 + t1) / 2, 0.072, 0), (u, v, w), (L * (t1 - t0) * 0.3, 0.02, 0.02), iron)
    # a canister standing up off the elbow block
    add_cylinder(fa, at(0.12, 0.07, 0.035), at(0.12, 0.13, 0.035), 0.012, glow)
    add_cylinder(fa, at(0.12, 0.13, 0.035), at(0.12, 0.142, 0.035), 0.015, copper)
    add_cylinder(fa, at(0.12, 0.058, 0.035), at(0.12, 0.07, 0.035), 0.016, iron)
    forearm = rigid('Brawler_mech_forearm', fa, rig, short, 'L_Forearm', mats)

    # upper arm: a thick clamp, and a copper pipe from the back of the shoulder arcing down to the elbow block
    ua_bm = bmesh.new()
    u2, v2, w2 = frame(shoulder, elbow)
    L2 = (elbow - shoulder).length

    def at2(t, dv=0.0, dw=0.0):
        return shoulder + u2 * (L2 * t) + v2 * dv + w2 * dw
    add_box(ua_bm, at2(0.6), (u2, v2, w2), (0.06, 0.122, 0.122), iron, bevel=0.01)
    add_box(ua_bm, at2(0.6, 0.068, 0), (u2, v2, w2), (0.04, 0.02, 0.05), iron, bevel=0.003)
    for dw in (-0.016, 0.016):
        add_cylinder(ua_bm, at2(0.6, 0.078, dw), at2(0.6, 0.084, dw), 0.006, brass, seg=8)
    pipe = [at2(0.02, 0.045, -0.035), at2(0.1, 0.085, -0.04), at2(0.3, 0.092, -0.02), at2(0.55, 0.085, 0.0),
            at2(0.8, 0.08, 0.01), at2(1.0, 0.085, 0.03)]
    add_tube(ua_bm, pipe, 0.0085, copper)
    upper = rigid('Brawler_mech_upperarm', ua_bm, rig, short, 'L_Upperarm', mats)
    return [hand, forearm, upper]


# ---------------------------------------------------------------- hair

def _theta(p):
    return math.atan2(p.x - HEAD_C.x, -(p.y - HEAD_C.y))


def _interp(table, x):
    for (x1, y1), (x2, y2) in zip(table, table[1:]):
        if x1 <= x <= x2:
            return y1 + (y2 - y1) * (x - x1) / (x2 - x1)
    return table[-1][1]


# where the hair starts, by the angle round the head (0 = the forehead, pi = the nape): the shaved sides are
# painted on the skin (paint_head) from here up
HAIRLINE = [(0.0, 1.648), (0.6, 1.642), (1.0, 1.622), (1.25, 1.612), (1.75, 1.605), (2.3, 1.565), (3.15, 1.53)]


def hairline_field(p):
    return p.z - _interp(HAIRLINE, abs(_theta(p)))


def make_hair(body, rig, short, body_shell):
    # the shaved sides and the scalp under the long top: a matte layer just off the scalp, starting a little
    # inside the painted stubble (paint_head), so its edge is soft
    buzz = body_shell(body, 'Brawler_buzz', {'skin_head'}, [], lambda m, c: hairline_field(c) > 0.004, 0, 0.0,
                      lambda p: 0.0012 + 0.0008 * smooth01(0.004, 0.012, hairline_field(p)),
                      [placeholder('hair_buzz'), placeholder('hair_buzz')], lambda c: False,
                      fields=[lambda p: hairline_field(p) - 0.004])
    return [buzz, make_locks(body, rig, short)]


PART_X = 0.038           # the side parting, on her left


def make_locks(body, rig, short, seed=5):
    """The long top: chunky locks of painted hair. Each starts on the crown right of the parting, runs over the
    scalp toward her right (-X) and down that side, standing off the head more as it goes, and ends below the
    ear by the jaw; the front ones sweep forward over her right brow first. Her left of the parting is the
    shaved side. Lens-shaped cross sections, tapering to a point. UV v runs root (0) to tip (1). Some locks,
    mostly at the front, are lime."""
    rng = np.random.default_rng(seed)
    src = bmesh.new()
    src.from_mesh(body.data)
    head_idx = {i for i, m in enumerate(body.data.materials) if m and m.name == 'skin_head'}
    bmesh.ops.delete(src, geom=[f for f in src.faces if f.material_index not in head_idx], context='FACES')
    src.transform(body.matrix_world)
    bvh = BVHTree.FromBMesh(src)
    roots = []
    for y in np.arange(-0.108, 0.075, 0.013):
        for x in np.arange(-0.06, PART_X + 0.001, 0.012):
            jx, jy = rng.uniform(-0.005, 0.005, 2)
            hit, n = surface_point(bvh, Vector((x + jx, y + jy, 1.9)), Vector((0, 0, -1)))
            if hit is not None and hairline_field(hit) > 0.004 and hit.z > 1.60:
                roots.append(hit)
    out = bmesh.new()
    uv = out.loops.layers.uv.new('UVMap')
    steps, sides = 22, 8
    lime_count = 0
    for root in roots:
        front = smooth01(0.02, -0.10, root.y)           # 1 at the hairline, 0 at the back
        back = smooth01(0.0, 0.06, root.y)
        across = smooth01(-0.06, PART_X, root.x)        # 1 at the parting, 0 already on the right side
        length = (0.10 + 0.13 * across) * (1 - 0.45 * back) * rng.uniform(0.88, 1.12)
        hmax = (0.016 + 0.026 * across) * (0.7 + 0.5 * front) * rng.uniform(0.5, 1.5)
        width = rng.uniform(0.03, 0.044)
        flow = Vector((-1.0, -0.35 * front + 0.5 * back + rng.uniform(-0.3, 0.3), rng.uniform(-0.35, 0.15))).normalized()
        lime = front > 0.75 and -0.02 < root.x < 0.025 and rng.random() < 0.6
        lime_count += lime
        s = root
        rings = []
        for i in range(steps):
            t = i / (steps - 1)
            q, nrm, _, _ = bvh.find_nearest(s)
            nrm = nrm.normalized()
            # once over the side of the head the lock hangs: the flow turns down
            fl = (flow + Vector((0, 0, -1.6)) * smooth01(1.64, 1.58, q.z)).normalized()
            tan = fl - nrm * fl.dot(nrm)
            tan = tan.normalized() if tan.length > 1e-6 else Vector((0, 0, -1))
            h = 0.0015 + hmax * smooth01(0.0, 0.3, t) + 0.012 * smooth01(1.6, 1.52, q.z)
            p = q + nrm * h
            side = tan.cross(nrm).normalized()
            wd = width * (1 - t) ** 0.65 + 0.001
            th = wd * 0.45
            ring = []
            for k in range(sides):
                a = 2 * math.pi * k / sides
                lift = math.sin(a) * th * (0.5 if math.sin(a) > 0 else 0.3)
                ring.append(out.verts.new(p + side * (math.cos(a) * wd * 0.5) + nrm * lift))
            rings.append(ring)
            s = q + tan * (length / (steps - 1))
        for i in range(steps - 1):
            for k in range(sides):
                f = out.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides],
                                   rings[i + 1][k]))
                f.material_index = 1 if lime else 0
                f.smooth = True
                for loop, (kk, ii) in zip(f.loops, ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))):
                    loop[uv].uv = (kk / sides, ii / (steps - 1))
    src.free()
    bmesh.ops.recalc_face_normals(out, faces=out.faces)
    print('HAIR', len(roots), 'locks,', lime_count, 'lime')
    return rigid('Brawler_locks', out, rig, short, 'Head', [placeholder('hair_locks'), placeholder('hair_lime')])


# ---------------------------------------------------------------- painting

# stroke look per material: stroke stretch (x, y, z), stroke scale, tone spread, roughness, metallic,
# edge wear (pointiness highlight)
LOOK = {
    'gear_top': ((1, 1, 5), 26, 0.16, 0.85, 0.0, 0.0, 0.0),
    'gear_pants': ((1, 1, 4), 22, 0.2, 0.9, 0.0, 0.0, 0.0),
    'gear_pocket': ((1, 1, 4), 22, 0.2, 0.9, 0.0, 0.15, 0.0),
    'gear_leather': ((6, 6, 1), 30, 0.24, 0.72, 0.0, 0.35, 0.0),
    'gear_brass': ((1, 1, 1), 40, 0.18, 0.38, 0.75, 0.35, 0.25),
    'gear_boots': ((1, 1, 3), 26, 0.24, 0.78, 0.0, 0.35, 0.0),
    'gear_sole': ((1, 1, 1), 30, 0.12, 0.9, 0.0, 0.0, 0.0),
    'gear_wraps': ((4, 4, 1), 60, 0.16, 0.9, 0.0, 0.0, 0.0),
    'gear_iron': ((1, 1, 2), 24, 0.18, 0.62, 0.35, 0.5, 0.08),
    'gear_copper': ((1, 1, 4), 30, 0.22, 0.38, 0.8, 0.4, 0.2),
    'gear_glow': ((1, 1, 1), 10, 0.05, 0.4, 0.0, 0.0, 0.0),
    'hair_buzz': ((1, 1, 1), 160, 0.22, 0.97, 0.0, 0.0, 0.0),
}
RUST = '#7A3B1F'
# materials baked with smooth tones, occlusion and light (no hard paint bands): the default hero's suit and kit
# (hero_suit.py), where hard bands broke into blotches over his big muscles and read as torn cloth
SOFT = set()
BAKE_SAMPLES = 24      # Cycles samples for bake(); the hero raises it (cleaner occlusion)

KEY = Vector((0.35, -0.45, 0.82)).normalized()


def _cycles_gpu(scene):
    scene.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = kind
                prefs.get_devices()
                if any(d.type == kind for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type == kind
                    scene.cycles.device = 'GPU'
                    break
            except TypeError:
                continue
    except KeyError:
        pass


def _ramp(nodes, links, src, stops, constant=False):
    r = nodes.new('ShaderNodeValToRGB')
    r.color_ramp.interpolation = 'CONSTANT' if constant else 'LINEAR'
    els = r.color_ramp.elements
    while len(els) > 1:
        els.remove(els[-1])
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1.0)
    for pos, col in stops[1:]:
        e = els.new(pos)
        e.color = (*col, 1.0)
    links.new(src, r.inputs['Fac'])
    return r


def _mul(nodes, links, a, b):
    m = nodes.new('ShaderNodeMix')
    m.data_type = 'RGBA'
    m.blend_type = 'MULTIPLY'
    m.inputs[0].default_value = 1.0
    links.new(a, _sock(m.inputs, 'A'))
    links.new(b, _sock(m.inputs, 'B'))
    return _sock(m.outputs, 'Result')


def _sock(sockets, name):
    """the colour socket of a Mix node (its float, vector and colour sockets share names)"""
    return next(s for s in sockets if s.name == name and s.type == 'RGBA')


def _shift(rgb, k, warm):
    """a tone of the colour: k brighter or darker, lights warmer and shadows cooler, like paint"""
    r, g, b = rgb
    if warm > 0:
        return [r * k * 1.04, g * k, b * k * 0.93]
    return [r * k * 0.92, g * k * 0.98, b * k * 1.08]


def _bake_material(name, target):
    """an emission-only copy of the look, for baking into `target`"""
    stretch, scale, spread, _, _, wear, rust = LOOK.get(name, LOOK['gear_top'])
    base = srgb(PALETTE[name])
    m = bpy.data.materials.new('bake_' + name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    nodes.clear()
    geo = nodes.new('ShaderNodeNewGeometry')
    mp = nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = stretch
    links.new(geo.outputs['Position'], mp.inputs['Vector'])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = 3.0
    noise.inputs['Distortion'].default_value = 0.7
    links.new(mp.outputs['Vector'], noise.inputs['Vector'])
    tones = _ramp(nodes, links, noise.outputs['Fac'], [
        (0.0, _shift(base, 1 - spread * 1.3, -1)), (0.38, base), (0.58, _shift(base, 1 + spread, 1)),
        (0.74, _shift(base, 1 + spread * 1.8, 1))], constant=name not in SOFT)
    col = tones.outputs['Color']
    if rust:
        # rust and grime in blotches
        rn = nodes.new('ShaderNodeTexNoise')
        rn.inputs['Scale'].default_value = 34.0
        rn.inputs['Detail'].default_value = 6.0
        rn.inputs['Roughness'].default_value = 0.7
        links.new(geo.outputs['Position'], rn.inputs['Vector'])
        rmask = _ramp(nodes, links, rn.outputs['Fac'], [(0.0, (0, 0, 0)), (0.62 - rust * 0.2, (0, 0, 0)),
                                                       (0.7 - rust * 0.2, (1, 1, 1))])
        rmix = nodes.new('ShaderNodeMix')
        rmix.data_type = 'RGBA'
        links.new(rmask.outputs['Color'], rmix.inputs[0])
        links.new(col, _sock(rmix.inputs, 'A'))
        _sock(rmix.inputs, 'B').default_value = (*srgb(RUST), 1.0)
        col = _sock(rmix.outputs, 'Result')
    if name == 'gear_top':
        # stitched seams: down the front each side, round the collar (a ribbed band) and the armholes
        sep = nodes.new('ShaderNodeSeparateXYZ')
        links.new(geo.outputs['Position'], sep.inputs['Vector'])
        ax = nodes.new('ShaderNodeMath')
        ax.operation = 'ABSOLUTE'
        links.new(sep.outputs['X'], ax.inputs[0])
        seam = nodes.new('ShaderNodeMath')
        seam.operation = 'SUBTRACT'
        seam.inputs[1].default_value = 0.072
        links.new(ax.outputs['Value'], seam.inputs[0])
        sa = nodes.new('ShaderNodeMath')
        sa.operation = 'ABSOLUTE'
        links.new(seam.outputs['Value'], sa.inputs[0])
        line = _ramp(nodes, links, sa.outputs['Value'], [(0.0, (0.55, 0.55, 0.6)), (0.0016, (0.55, 0.55, 0.6)),
                                                        (0.003, (1, 1, 1))])
        col = _mul(nodes, links, col, line.outputs['Color'])
        rib = nodes.new('ShaderNodeTexWave')
        rib.wave_type = 'BANDS'
        rib.inputs['Scale'].default_value = 140.0
        links.new(geo.outputs['Position'], rib.inputs['Vector'])
        rib_t = _ramp(nodes, links, rib.outputs['Fac'], [(0.0, (0.82, 0.82, 0.86)), (0.5, (1, 1, 1))])
        collar = _ramp(nodes, links, sep.outputs['Z'], [(0.0, (0, 0, 0)), (0.6, (0, 0, 0)), (0.63, (1, 1, 1))])
        zmap = nodes.new('ShaderNodeMapRange')
        zmap.inputs['From Min'].default_value, zmap.inputs['From Max'].default_value = 1.30, 1.45
        links.new(sep.outputs['Z'], zmap.inputs['Value'])
        links.new(zmap.outputs['Result'], collar.inputs['Fac'])
        rmix = nodes.new('ShaderNodeMix')
        rmix.data_type = 'RGBA'
        links.new(collar.outputs['Color'], rmix.inputs[0])
        _sock(rmix.inputs, 'A').default_value = (1, 1, 1, 1)
        links.new(rib_t.outputs['Color'], _sock(rmix.inputs, 'B'))
        col = _mul(nodes, links, col, _sock(rmix.outputs, 'Result'))
    if name in ('gear_pants', 'gear_pocket', 'gear_boots'):
        # dirt and grime, heavier low down and round the knees
        sep = nodes.new('ShaderNodeSeparateXYZ')
        links.new(geo.outputs['Position'], sep.inputs['Vector'])
        low = nodes.new('ShaderNodeMapRange')
        low.inputs['From Min'].default_value, low.inputs['From Max'].default_value = 0.75, 0.1
        links.new(sep.outputs['Z'], low.inputs['Value'])
        dn = nodes.new('ShaderNodeTexNoise')
        dn.inputs['Scale'].default_value = 14.0
        dn.inputs['Detail'].default_value = 6.0
        links.new(geo.outputs['Position'], dn.inputs['Vector'])
        dm = nodes.new('ShaderNodeMath')
        dm.operation = 'MULTIPLY'
        links.new(dn.outputs['Fac'], dm.inputs[0])
        links.new(low.outputs['Result'], dm.inputs[1])
        dirt = _ramp(nodes, links, dm.outputs['Value'], [(0.0, (1, 1, 1)), (0.3, (1, 1, 1)), (0.5, (0.72, 0.66, 0.58))])
        col = _mul(nodes, links, col, dirt.outputs['Color'])
        if name == 'gear_pants':
            # the outer leg seam
            ay = nodes.new('ShaderNodeMath')
            ay.operation = 'ABSOLUTE'
            links.new(sep.outputs['Y'], ay.inputs[0])
            sl = _ramp(nodes, links, ay.outputs['Value'], [(0.0, (0.6, 0.6, 0.55)), (0.0018, (0.6, 0.6, 0.55)),
                                                          (0.0035, (1, 1, 1))])
            col = _mul(nodes, links, col, sl.outputs['Color'])
    if name == 'gear_wraps':
        # bandage turns: thin darker lines on a diagonal, overlapping edges
        wv = nodes.new('ShaderNodeTexWave')
        wv.wave_type = 'BANDS'
        wv.bands_direction = 'DIAGONAL'
        wv.inputs['Scale'].default_value = 26.0
        wv.inputs['Distortion'].default_value = 1.5
        links.new(geo.outputs['Position'], wv.inputs['Vector'])
        lines = _ramp(nodes, links, wv.outputs['Fac'], [(0.0, (0.72, 0.68, 0.62)), (0.12, (1, 1, 1)),
                                                       (0.85, (0.94, 0.92, 0.88)), (0.95, (0.7, 0.66, 0.6))])
        col = _mul(nodes, links, col, lines.outputs['Color'])
    if False:
        # the ends of the swept hair go teal
        sep = nodes.new('ShaderNodeSeparateXYZ')
        links.new(geo.outputs['Position'], sep.inputs['Vector'])
        tip = _ramp(nodes, links, sep.outputs['Y'], [(0.0, (0, 0, 0)), (1.0, (1, 1, 1))])
        mapr = nodes.new('ShaderNodeMapRange')
        mapr.inputs['From Min'].default_value, mapr.inputs['From Max'].default_value = -0.03, 0.07
        links.new(sep.outputs['Y'], mapr.inputs['Value'])
        links.new(mapr.outputs['Result'], tip.inputs['Fac'])
        mix = nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        links.new(tip.outputs['Color'], mix.inputs[0])
        links.new(col, _sock(mix.inputs, 'A'))
        _sock(mix.inputs, 'B').default_value = (*srgb(TEAL_TIP), 1.0)
        col = _sock(mix.outputs, 'Result')
    ao = nodes.new('ShaderNodeAmbientOcclusion')
    ao.samples = 16
    ao.inputs['Distance'].default_value = 0.06
    shade = _ramp(nodes, links, ao.outputs['AO'], [(0.0, (0.5, 0.52, 0.6)), (0.55, (0.72, 0.74, 0.8)),
                                                  (0.9, (1, 1, 1))], constant=name not in SOFT)
    col = _mul(nodes, links, col, shade.outputs['Color'])
    dot = nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    dot.inputs[1].default_value = KEY
    links.new(geo.outputs['Normal'], dot.inputs[0])
    light = _ramp(nodes, links, dot.outputs['Value'], [(0.0, (0.86, 0.87, 0.93)), (0.55, (1, 1, 1)),
                                                      (0.8, (1.1, 1.07, 1.0))], constant=name not in SOFT)
    # the ramp's factor is clamped to 0..1: map the dot product from -1..1
    mr = nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -1.0
    links.new(dot.outputs['Value'], mr.inputs['Value'])
    links.new(mr.outputs['Result'], light.inputs['Fac'])
    col = _mul(nodes, links, col, light.outputs['Color'])
    if wear:
        edge = _ramp(nodes, links, geo.outputs['Pointiness'], [(0.0, (1, 1, 1)), (0.53, (1, 1, 1)),
                                                             (0.6, (1 + wear * 1.5,) * 3)], constant=True)
        col = _mul(nodes, links, col, edge.outputs['Color'])
    em = nodes.new('ShaderNodeEmission')
    links.new(col, em.inputs['Color'])
    out = nodes.new('ShaderNodeOutputMaterial')
    links.new(em.outputs['Emission'], out.inputs['Surface'])
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = target
    nodes.active = tex
    return m


def final_material(name, image):
    _, _, _, rough, metal, _, _ = LOOK.get(name, LOOK['gear_top'])
    m = bpy.data.materials.new(name)   # one per object (each has its own map); Blender suffixes repeats
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    nodes.clear()
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    out = nodes.new('ShaderNodeOutputMaterial')
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in bsdf.inputs and metal < 0.3:
        bsdf.inputs['Specular IOR Level'].default_value = 0.25   # painted cloth and leather: no glossy sheen
    if name == 'gear_glow':
        c = srgb(PALETTE[name])
        bsdf.inputs['Base Color'].default_value = (*c, 1)
        bsdf.inputs['Emission Color'].default_value = (*c, 1)
        bsdf.inputs['Emission Strength'].default_value = 4.0
        return m
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def _only_uv(o, project=True):
    me = o.data
    for uv in list(me.uv_layers):
        me.uv_layers.remove(uv)
    me.uv_layers.new(name='UVMap')
    if not project:
        return
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake(o, size):
    """o's own UV map and one painted colour map for all its materials"""
    scene = bpy.context.scene
    _only_uv(o)
    names = [s.material.name for s in o.material_slots]
    img = bpy.data.images.new(o.name + '_paint', size, size)
    for s, n in zip(o.material_slots, names):
        s.material = _bake_material(n, img)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    scene.cycles.samples = BAKE_SAMPLES
    scene.render.bake.margin = 6
    bpy.ops.object.bake(type='EMIT')
    img.pack()
    for s, n in zip(o.material_slots, names):
        tmp = s.material
        s.material = final_material(n, img)
        bpy.data.materials.remove(tmp)
    print('PAINT', o.name, size, names)


def locks_image(name, base_hex, tip_hex, start, size=(64, 512)):
    """painted strands along a lock (UV v = root to tip): base colour at the root to tip colour, a light streak
    down the middle of each face pair, darker edges, a few lighter strands"""
    w, h = size
    rng = np.random.default_rng(len(name))
    v = np.linspace(0, 1, h)[:, None]
    base, tip = np.array(srgb(base_hex)), np.array(srgb(tip_hex))
    k = np.clip((v - start) / max(1e-3, 0.9 - start), 0, 1) ** 0.9
    col = base * (1 - k) + tip * k
    streak = rng.normal(0, 1, w)
    streak = np.convolve(np.tile(streak, 3), np.ones(3) / 3, 'same')[w:2 * w]
    u = (np.arange(w) + 0.5) / w
    across = np.abs(((u * 2) % 1.0) - 0.5) * 2
    shade = np.where(across < 0.3, 1.5, np.where(across > 0.8, 0.7, 1.0))
    bands = np.where(streak > 0.7, 1.3, np.where(streak < -0.7, 0.8, 1.0)) * shade
    col = to_srgb(col[:, None, :] * bands[None, :, None] * (0.8 + 0.2 * v)[..., None])
    img = bpy.data.images.new(name, w, h)
    px = np.ones((h, w, 4), np.float32)
    px[..., :3] = col
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def to_srgb(c):
    """linear -> the sRGB-encoded values an 8-bit image stores (image.pixels)"""
    c = np.clip(np.asarray(c, np.float32), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055).astype(np.float32)


def hex_px(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def kuwahara(px, r):
    """Kuwahara filter on an HxWx4 float image: each pixel takes the mean of the calmest of the four
    (r+1)x(r+1) windows touching it; flat paint dabs with crisp edges."""
    rgb = px[..., :3].astype(np.float64)   # float64: the integral images lose float32's precision
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    H, W = lum.shape

    def integral(a):
        a = np.pad(a, ((r + 1, r + 1), (r + 1, r + 1)) + ((0, 0),) * (a.ndim - 2), mode='edge')
        s = a.cumsum(0).cumsum(1)
        return np.pad(s, ((1, 0), (1, 0)) + ((0, 0),) * (a.ndim - 2))

    S, S2, C = integral(lum), integral(lum * lum), integral(rgb)
    n = (r + 1) ** 2
    best_var = np.full((H, W), np.inf)
    out = np.zeros_like(rgb)
    ys, xs = np.arange(H) + r + 1, np.arange(W) + r + 1
    for dy in (-r, 0):
        for dx in (-r, 0):
            y0, x0 = ys + dy, xs + dx
            y1, x1 = y0 + r + 1, x0 + r + 1

            def box(T):
                return T[y1][:, x1] - T[y0][:, x1] - T[y1][:, x0] + T[y0][:, x0]

            mean = box(S) / n
            var = box(S2) / n - mean * mean
            pick = var < best_var
            best_var = np.where(pick, var, best_var)
            out = np.where(pick[..., None], box(C) / n, out)
    res = px.copy()
    res[..., :3] = out.astype(np.float32)
    return res


def _image_px(img):
    px = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(img.size[1], img.size[0], 4)


def _color_image(m):
    """the colour map (feeding Base Color, directly or through the vertex-colour Mix), not the normal map"""
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and any(
                l.to_node.type in ('MIX', 'MIX_RGB') or l.to_socket.name == 'Base Color'
                for l in n.outputs['Color'].links):
            return n.image
    return None


def bake_positions(body, mat_name, size):
    """world position per texel of one skin material's UV space (Non-Color float map; alpha 0 = unused)"""
    img = bpy.data.images.new('pos_' + mat_name, size, size, float_buffer=True, alpha=True)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.zeros(size * size * 4, np.float32))
    dummy = bpy.data.images.new('pos_dummy', 8, 8)
    saved = [s.material for s in body.material_slots]
    temps = []
    for s in body.material_slots:
        m = bpy.data.materials.new('pos_bake')
        m.use_nodes = True
        nodes, links = m.node_tree.nodes, m.node_tree.links
        nodes.clear()
        geo = nodes.new('ShaderNodeNewGeometry')
        add = nodes.new('ShaderNodeVectorMath')
        add.operation = 'ADD'
        add.inputs[1].default_value = (2.0, 2.0, 0.0)   # keep the values positive
        links.new(geo.outputs['Position'], add.inputs[0])
        em = nodes.new('ShaderNodeEmission')
        links.new(add.outputs['Vector'], em.inputs['Color'])
        out = nodes.new('ShaderNodeOutputMaterial')
        links.new(em.outputs['Emission'], out.inputs['Surface'])
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = img if s.material and s.material.name == mat_name else dummy
        nodes.active = tex
        s.material = m
        temps.append(m)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    sc = bpy.context.scene
    sc.cycles.samples = 1
    sc.render.bake.margin = 4
    bpy.ops.object.bake(type='EMIT')
    for s, m in zip(body.material_slots, saved):
        s.material = m
    for m in temps:
        bpy.data.materials.remove(m)
    px = _image_px(img)
    bpy.data.images.remove(img)
    bpy.data.images.remove(dummy)
    pos = px[..., :3] - np.array([2.0, 2.0, 0.0], np.float32)
    return pos, px[..., 3] > 0.5


def _smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# the face: scratch marks across her right cheek (-X) and one over the bridge of the nose (world metres)
SCRATCHES = [((-0.058, -0.103, 1.566), (-0.030, -0.118, 1.572)), ((-0.056, -0.103, 1.556), (-0.031, -0.117, 1.561)),
             ((-0.052, -0.104, 1.546), (-0.034, -0.114, 1.550)), ((-0.012, -0.128, 1.580), (0.006, -0.128, 1.583))]
SCRATCH_COLOR = hex_px('#5A2A24')
SCRATCH_WIDTH = 0.0012
LID_COLOR = hex_px('#3B2830')
BROW_COLOR = hex_px('#1E1715')
SKIN_TAN = np.array([0.88, 0.76, 0.64], np.float32)     # multiplies FC1's pale skin (sRGB values) to a tan
AMBER = hex_px('#B0611C')


def _segments_dist(p, segs, axes=(0, 2)):
    """distance in the front (x-z) plane from each texel's position to the nearest segment, and how far along"""
    d = np.full(p.shape[:2], 1e9, np.float32)
    k = np.zeros(p.shape[:2], np.float32)
    for a, b in segs:
        a, b = np.array(a, np.float32), np.array(b, np.float32)
        v = b - a
        pa = p - a
        t = np.clip((pa[..., axes[0]] * v[axes[0]] + pa[..., axes[1]] * v[axes[1]]) /
                    (v[axes[0]] ** 2 + v[axes[1]] ** 2), 0, 1)
        q = a + t[..., None] * v
        dd = np.hypot(p[..., axes[0]] - q[..., axes[0]], p[..., axes[1]] - q[..., axes[1]])
        nearer = dd < d
        d = np.where(nearer, dd, d)
        k = np.where(nearer, t, k)
    return d, k


def paint_head(body, px, eyes):
    """on the face's colour map, by each texel's world position: the shaved side's stubble (soft edge), heavy
    dark brows, dark painted lids round the eyes, the cheek scratches"""
    H, W = px.shape[:2]
    pos, used = bake_positions(body, 'skin_head', W)
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    theta = np.abs(np.arctan2(x - HEAD_C.x, -(y - HEAD_C.y)))
    hz = np.interp(theta, [a for a, _ in HAIRLINE], [b for _, b in HAIRLINE])
    rng = np.random.default_rng(3)
    speck = rng.normal(0, 1, (H, W)).astype(np.float32)
    stub = _smooth(-0.004, 0.004, z - hz) * used * (0.86 + 0.08 * np.clip(speck, -1, 1))
    rgb = px[..., :3]
    rgb[:] = rgb * (1 - stub[..., None]) + hex_px(PALETTE['hair_buzz']) * stub[..., None]
    front = used * (y < -0.07)
    for e in eyes:
        sx = 1 if e.x > 0 else -1
        # brows: a thick arc over each eye, heavier toward the nose, frowning (inner end lower)
        bx = (x - e.x) * sx                       # + toward the temple
        arc = e.z + 0.019 + 0.004 * np.clip(bx / 0.02, -1.2, 1.2) - 0.0035 * (bx / 0.02) ** 2
        thick = 0.0042 - 0.0012 * np.clip(bx / 0.02, -1, 1)
        brow = _smooth(1.0, 0.55, np.abs(z - arc) / thick) * _smooth(-0.019, -0.012, bx) * _smooth(0.03, 0.022, bx) * front
        rgb[:] = rgb * (1 - 0.88 * brow[..., None]) + BROW_COLOR * 0.88 * brow[..., None]
        # lids: smoky, heavier round the upper lid and out to the corner
        d = np.sqrt(((x - e.x) / 0.025) ** 2 + ((y - e.y) / 0.03) ** 2 + ((z - e.z - 0.002) / 0.012) ** 2)
        lid = _smooth(1.0, 0.5, d) * front * 0.75
        rgb[:] = rgb * (1 - lid[..., None]) + (rgb * LID_COLOR / 0.45) * lid[..., None]
    d, k = _segments_dist(pos, SCRATCHES)
    w = SCRATCH_WIDTH * (0.3 + 0.7 * np.sin(np.pi * k))
    scr = np.clip(1.4 - d / w, 0, 1) * front * 0.9
    rgb[:] = rgb * (1 - scr[..., None]) + SCRATCH_COLOR * scr[..., None]
    print('HEAD paint: stubble', int((stub > 0.5).sum()), 'scratches', int((scr > 0.4).sum()))
    return px


SKIN_TONE = np.array([0.52, 0.31, 0.232], np.float32)   # every skin map's median skin colour (sRGB values)


def tan_skin(px):
    """tan FC1's pale skin"""
    px[..., :3] *= SKIN_TAN
    return px


def match_tone(px):
    """scale the map so its median skin colour is SKIN_TONE: the face, neck, arms and hands are separate maps
    (FC1's head map is lighter than the rest, and each gets different painting), and must read as one skin"""
    rgb = px[..., :3]
    skin = rgb[(rgb[..., 0] > 0.2) & (rgb[..., 0] > rgb[..., 2] * 1.2)]
    if len(skin) > 1000:
        gain = np.clip(SKIN_TONE / np.maximum(np.median(skin, 0), 1e-3), 0.5, 1.6)
        rgb *= gain
        print('SKIN tone gain', gain.round(3))
    return px


# FC1's eye maps: two eyeball discs, centred at these fractions of the map (x, y from the bottom); the iris is
# the ring between the pupil and IRIS_R (fractions of the map's width), the rest is the (pinkish) eye white
EYE_DISCS = ((0.25, 0.75), (0.75, 0.75))
PUPIL_R, IRIS_R = 0.042, 0.112


def amber_eyes(meshes):
    """the iris goes amber, with a darker ring at its rim; the eye white and the pupil stay FC1's own. (A first
    version recoloured everything that wasn't bright white, and FC1's eye white is pinkish: whole orange eyes.)"""
    for o in meshes:
        for s in o.material_slots:
            m = s.material
            if not m or not m.use_nodes or m.name not in ('eye_l', 'eye_r'):
                continue
            img = next((n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
            if not img or img.get('amber'):
                continue
            px = _image_px(img)
            H, W = px.shape[:2]
            yy, xx = np.mgrid[0:H, 0:W]
            d = np.min([np.hypot(xx / W - cx, (yy / H - cy) * H / W) for cx, cy in EYE_DISCS], axis=0)
            iris = _smooth(IRIS_R + 0.004, IRIS_R - 0.006, d) * _smooth(PUPIL_R - 0.004, PUPIL_R + 0.006, d)
            rgb = px[..., :3]
            lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
            amber = np.clip(AMBER * (0.35 + 0.9 * lum[..., None]), 0, 1)
            limbal = _smooth(IRIS_R - 0.03, IRIS_R, d)[..., None]
            amber = amber * (1 - 0.55 * limbal)
            rgb[:] = rgb * (1 - iris[..., None]) + amber * iris[..., None]
            img.pixels.foreach_set(px.ravel())
            img.pack()
            img['amber'] = True
            print('EYE amber iris', img.name)


def paint_skin(body, eyes):
    """the skin's colour maps tanned and as paint (Kuwahara); the face first gets its brows, lids, scratches and
    stubble"""
    done = set()
    for m in body.data.materials:
        if not m or not m.name.startswith('skin_') or not m.use_nodes:
            continue
        img = _color_image(m)
        if not img or img.name in done or not img.size[0]:
            continue
        done.add(img.name)
        px = tan_skin(_image_px(img))
        if m.name in ('skin_head', 'skin_body', 'skin_arm', 'skin_leg'):
            px = paint_body(body, m.name, px)
        if m.name == 'skin_head':
            px = paint_head(body, px, eyes)
        px = match_tone(px)
        px = kuwahara(px, 4 if m.name == 'skin_head' else 8)   # face: smaller dabs keep the eyes and lips crisp
        img.pixels.foreach_set(px.ravel())
        img.pack()
        print('SKIN', m.name, img.name, img.size[:])



# ---------------------------------------------------------------- details

# her scowl, from FC1's own face shapes, frozen into the face before the shapes are dropped
EXPRESSION = {'Brow_Drop_L': 0.75, 'Brow_Drop_R': 0.75, 'Brow_Compress_L': 0.9, 'Brow_Compress_R': 0.9,
              'Eye_Squint_L': 0.4, 'Eye_Squint_R': 0.4, 'Nose_Sneer_L': 0.18, 'Nose_Sneer_R': 0.12,
              'Mouth_Press_L': 0.35, 'Mouth_Press_R': 0.35, 'Mouth_Frown_L': 0.3, 'Mouth_Frown_R': 0.3,
              'Cheek_Raise_L': 0.15, 'Cheek_Raise_R': 0.15}


def apply_expression(o):
    """bake EXPRESSION into the mesh's own vertex positions (call before its shape keys are cleared)"""
    keys = o.data.shape_keys
    if not keys:
        return
    blocks = keys.key_blocks
    if not any(k in blocks for k in EXPRESSION):
        return
    n = len(o.data.vertices)
    basis = np.empty(n * 3, np.float32)
    blocks[0].data.foreach_get('co', basis)
    pos = basis.copy()
    for name, wgt in EXPRESSION.items():
        if name in blocks:
            k = np.empty(n * 3, np.float32)
            blocks[name].data.foreach_get('co', k)
            pos += (k - basis) * wgt
    o.shape_key_clear()
    o.data.vertices.foreach_set('co', pos)
    o.data.update()
    print('EXPRESSION', o.name)


def rigid_multi(name, parts, rig, short, mats):
    """one rigid object from several (bmesh, bone) parts: each part's vertices on its own bone"""
    me = bpy.data.meshes.new(name)
    full = bmesh.new()
    groups = []
    for bm, bone in parts:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        start = len(full.verts)
        tmp = bpy.data.meshes.new('tmp')
        bm.to_mesh(tmp)
        bm.free()
        full.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        full.verts.ensure_lookup_table()
        groups.append((bone, range(start, len(full.verts))))
    full.to_mesh(me)
    full.free()
    o = bpy.data.objects.new(name, me)
    rig.users_collection[0].objects.link(o)
    o.parent = rig
    o.matrix_parent_inverse = rig.matrix_world.inverted()
    for bone, idx in groups:
        vg = o.vertex_groups.get(_bone_name(rig, short, bone)) or o.vertex_groups.new(name=_bone_name(rig, short, bone))
        vg.add(list(idx), 1.0, 'REPLACE')
    o.modifiers.new('Armature', 'ARMATURE').object = rig
    for m in mats:
        me.materials.append(m)
    print('RIGID', name, len(groups), 'parts', len(me.polygons))
    return o


def make_hand_plates(rig, short):
    """the iron hand's armour: a knuckle plate over the back of the hand, a plate on each finger and thumb
    joint, a wrist cuff (palms face down in the rest pose, so the back of the hand is +Z)"""
    bones = {short(b.name): b for b in rig.data.bones}

    def head(n):
        return rig.matrix_world @ bones[n].head_local

    def tail(n):
        return rig.matrix_world @ bones[n].tail_local

    up = Vector((0, 0, 1))
    parts = []
    iron, brass = 0, 1
    wrist, mid1 = head('L_Hand'), head('L_Mid1')
    bm = bmesh.new()
    u, v, w = frame(wrist, mid1, up)
    add_box(bm, (wrist + mid1) / 2 + v * 0.022, (u, v, w), ((mid1 - wrist).length * 0.95, 0.012, 0.084), iron, bevel=0.003)
    for dw in (-0.025, 0.0, 0.025):
        add_cylinder(bm, (wrist + mid1) / 2 + v * 0.028 + w * dw - u * 0.02, (wrist + mid1) / 2 + v * 0.032 + w * dw - u * 0.02,
                     0.004, brass, seg=8)
    add_cylinder(bm, wrist - u * 0.015, wrist + u * 0.012, 0.042, iron)
    parts.append((bm, 'L_Hand'))
    for f in ('Thumb', 'Index', 'Mid', 'Ring', 'Pinky'):
        for j in (1, 2, 3):
            n = f'L_{f}{j}'
            if n not in bones:
                continue
            a = head(n)
            nxt = f'L_{f}{j + 1}'
            b = head(nxt) if nxt in bones else a + (tail(n) - a).normalized() * ((a - head(f'L_{f}{j - 1}')).length * 0.8)
            if f == 'Thumb' and j == 1:
                continue
            seg = bmesh.new()
            u, v, w = frame(a, b, up)
            ln = (b - a).length
            add_box(seg, a.lerp(b, 0.5) + v * 0.0115, (u, v, w), (ln * 0.86, 0.006, 0.019 if f != 'Pinky' else 0.016),
                    iron, bevel=0.0015)
            parts.append((seg, n))
    return rigid_multi('Brawler_hand_plates', parts, rig, short, [placeholder('gear_iron'), placeholder('gear_brass')])


def make_rivets(rig, short, smooth_torso, pockets):
    """brass rivets along the harness and the belt, buttons on the pocket flaps"""
    chest, hips, thighs = bmesh.new(), bmesh.new(), {'L': bmesh.new(), 'R': bmesh.new()}

    def stud(bm, p, n, r=0.0042):
        add_cylinder(bm, p - n * 0.002, p + n * 0.003, r, 0, seg=8)

    def surface_point(bvh, p, d):   # rays only: a miss must not snap a rivet to the nearest skin (the lips)
        hit, n, _, _ = bvh.ray_cast(p, d)
        return (hit, n.normalized()) if hit is not None and hit.z < 1.43 else (None, None)

    for sx in (1, -1):
        for z in np.arange(1.21, 1.47, 0.045):
            for side in (-1, 1):
                x = sx * SHOULDER_STRAP_X + side * 0.011
                p, n = surface_point(smooth_torso, Vector((x, -0.4, z)), Vector((0, 1, 0)))
                if p is not None and abs(z - 1.36) > 0.03 and abs(z - 1.322) > 0.025:
                    stud(chest, p + n * 0.017, n)
    (x0, z0), (x1, z1) = (SHOULDER_STRAP_X, 1.33), (-0.16, 1.02)
    for t in np.linspace(0.1, 0.9, 8):
        x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
        p, n = surface_point(smooth_torso, Vector((x, -0.4, z)), Vector((0, 1, 0)))
        if p is not None:
            stud(chest, p + n * 0.017, n)
    for x in np.arange(-0.17, 0.171, 0.03):
        if abs(x) < 0.04:
            continue
        p, n = surface_point(smooth_torso, Vector((x, -0.4, WAIST - BELT_W / 2)), Vector((0, 1, 0)))
        if p is not None:
            stud(hips, p + n * 0.031, n, 0.005)
    # pocket flap buttons: cast in toward each leg's axis onto the pocket
    bm_p = bmesh.new()
    bm_p.from_mesh(pockets.data)
    bm_p.transform(pockets.matrix_world)
    pbvh = BVHTree.FromBMesh(bm_p)
    for s, sx in (('L', 1), ('R', -1)):
        a = math.radians(27)
        d = Vector((sx * math.cos(a), -math.sin(a), 0))
        start = Vector((sx * LEG_X, 0, POCKET_Z[1] - 0.018)) + d * 0.3
        hit, n, _, _ = pbvh.ray_cast(start, -d)
        if hit is not None:
            stud(thighs[s], hit + n.normalized() * 0.003, n.normalized(), 0.007)
    bm_p.free()
    return rigid_multi('Brawler_rivets', [(chest, 'Spine02'), (hips, 'Hip'), (thighs['L'], 'L_Thigh'),
                                         (thighs['R'], 'R_Thigh')], rig, short, [placeholder('gear_brass')])


# the scar on her left shoulder where the pipe goes in (world metres, T-pose)
SHOULDER_SCARS = [((0.175, -0.035, 1.425), (0.215, -0.03, 1.405)), ((0.18, -0.04, 1.41), (0.205, -0.035, 1.395)),
                  ((0.19, -0.02, 1.44), (0.225, -0.015, 1.425))]


def paint_body(body, mat_name, px):
    """painted form shadows on a skin map (occlusion from the body and its gear, a soft key light), the
    shoulder scar on the arms' map"""
    H, W = px.shape[:2]
    shade, used = bake_shading(body, mat_name, W)
    k = (_smooth(0.35, 1.0, shade) * used + (1 - used))[..., None]
    rgb = px[..., :3]
    tint = np.array([0.74, 0.66, 0.68], np.float32)
    rgb[:] = rgb * (tint + (1 - tint) * k)
    if mat_name == 'skin_arm':
        pos, used2 = bake_positions(body, mat_name, W)
        d = np.full((H, W), 1e9, np.float32)
        for a, b in SHOULDER_SCARS:
            a, b = np.array(a, np.float32), np.array(b, np.float32)
            v = b - a
            t = np.clip(((pos - a) @ v) / (v @ v), 0, 1)
            d = np.minimum(d, np.linalg.norm(pos - (a + t[..., None] * v), axis=-1) / (0.0016 * (0.4 + 0.6 * np.sin(np.pi * t))))
        scar = np.clip(1.4 - d, 0, 1) * used2 * 0.9
        rgb[:] = rgb * (1 - scar[..., None]) + hex_px('#7A3A30') * scar[..., None]
    return px


def bake_shading(body, mat_name, size):
    """occlusion x a soft banded key light per texel of one skin material's UV space (1 = fully lit)"""
    img = bpy.data.images.new('shade_' + mat_name, size, size, float_buffer=True, alpha=True)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.zeros(size * size * 4, np.float32))
    dummy = bpy.data.images.new('shade_dummy', 8, 8)
    saved = [s.material for s in body.material_slots]
    temps = []
    for s in body.material_slots:
        m = bpy.data.materials.new('shade_bake')
        m.use_nodes = True
        nodes, links = m.node_tree.nodes, m.node_tree.links
        nodes.clear()
        ao = nodes.new('ShaderNodeAmbientOcclusion')
        ao.samples = 32
        ao.inputs['Distance'].default_value = 0.08
        geo = nodes.new('ShaderNodeNewGeometry')
        dot = nodes.new('ShaderNodeVectorMath')
        dot.operation = 'DOT_PRODUCT'
        dot.inputs[1].default_value = KEY
        links.new(geo.outputs['Normal'], dot.inputs[0])
        lit = nodes.new('ShaderNodeMapRange')
        lit.inputs['From Min'].default_value, lit.inputs['From Max'].default_value = -0.3, 0.5
        lit.inputs['To Min'].default_value = 0.72
        links.new(dot.outputs['Value'], lit.inputs['Value'])
        mul = nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        links.new(ao.outputs['AO'], mul.inputs[0])
        mul.inputs[1].default_value = 1.0   # occlusion only: a baked key light darkened the T-pose's arms and hands
        em = nodes.new('ShaderNodeEmission')
        links.new(mul.outputs['Value'], em.inputs['Color'])
        out = nodes.new('ShaderNodeOutputMaterial')
        links.new(em.outputs['Emission'], out.inputs['Surface'])
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = img if s.material and s.material.name == mat_name else dummy
        nodes.active = tex
        s.material = m
        temps.append(m)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    sc = bpy.context.scene
    sc.cycles.samples = 32
    sc.render.bake.margin = 4
    bpy.ops.object.bake(type='EMIT')
    for s, m in zip(body.material_slots, saved):
        s.material = m
    for m in temps:
        bpy.data.materials.remove(m)
    px = _image_px(img)
    bpy.data.images.remove(img)
    bpy.data.images.remove(dummy)
    return np.clip(px[..., 0], 0, 1), (px[..., 3] > 0.5).astype(np.float32)


# ---------------------------------------------------------------- shoes to boots

def boot_feet(meshes):
    """FC1's sneakers become the boots' feet: upper and laces in the boot leather, soles dark"""
    shoes = []
    for o in meshes:
        for s in o.material_slots:
            n = s.material.name if s.material else ''
            if n.startswith('shoes_'):
                s.material = placeholder('gear_sole' if n == 'shoes_sole' else 'gear_boots')
                if o not in shoes:
                    shoes.append(o)
    # chunkier, like combat boots: wider round each foot's own centre line, a little taller
    for o in shoes:
        mw, inv = o.matrix_world, o.matrix_world.inverted()
        for v in o.data.vertices:
            p = mw @ v.co
            cx = 0.085 if p.x > 0 else -0.085
            # the sole spreads into a thick welt
            welt = 1.0 + 0.09 * smooth01(0.035, 0.012, p.z)
            v.co = inv @ Vector((cx + (p.x - cx) * 1.14 * welt, p.y * 1.05 * (1 + 0.3 * (welt - 1)), p.z * 1.12))
    return shoes


def make_laces(rig, short, boots):
    """criss-cross laces up the front of each boot shaft (rigid on the shins)"""
    head = _bones(rig, short)
    bm_b = bmesh.new()
    bm_b.from_mesh(boots.data)
    bm_b.transform(boots.matrix_world)
    bvh = BVHTree.FromBMesh(bm_b)
    out = []
    for s in 'LR':
        x0 = head(f'{s}_Calf').x
        bm = bmesh.new()
        zs = np.linspace(0.13, BOOT_TOP - 0.025, 9)
        pts = {}
        for z in zs:
            for side in (-1, 1):
                p, n = surface_point(bvh, Vector((x0 + side * 0.016, -0.4, z)), Vector((0, 1, 0)))
                if p is not None:
                    pts[(z, side)] = p + n * 0.002
        for i in range(len(zs) - 1):
            for side in (-1, 1):
                a, b = pts.get((zs[i], side)), pts.get((zs[i + 1], -side))
                if a and b:
                    add_tube(bm, [a, (a + b) / 2 + Vector((0, -0.002, 0)), b], 0.0018, 0, seg=5)
        for (z, side), p in pts.items():
            add_cylinder(bm, p - Vector((0, -0.001, 0)), p + Vector((0, -0.003, 0)), 0.0035, 1, seg=8)
        out.append(rigid(f'Brawler_laces_{s}', bm, rig, short, f'{s}_Calf',
                         [placeholder('gear_leather'), placeholder('gear_brass')]))
    bm_b.free()
    return out


def make_soles(rig, short, shoes):
    """chunky combat-boot soles: a thick welt round each foot's own sole, heel block on the foot bone, the
    forefoot on the toe bone so it bends, tread lugs round the edge"""
    head = _bones(rig, short)
    pts = [o.matrix_world @ v.co for o in shoes for v in o.data.vertices]
    parts = []
    for s, sx in (('L', 1), ('R', -1)):
        side = [p for p in pts if p.x * sx > 0]
        x0, x1 = min(p.x for p in side), max(p.x for p in side)
        y0, y1 = min(p.y for p in side), max(p.y for p in side)   # y0 = toe tip (front is -Y), y1 = heel
        toe_y = head(f'{s}_ToeBase').y
        cx = (x0 + x1) / 2
        hw = (x1 - x0) / 2 + 0.007
        ax = (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
        for (ya, yb, bone) in ((toe_y, y1 + 0.006, f'{s}_Foot'), (y0 - 0.006, toe_y, f'{s}_ToeBase')):
            bm = bmesh.new()
            add_box(bm, Vector((cx, (ya + yb) / 2, 0.013)), ax, (hw * 2, abs(yb - ya), 0.026), 0, bevel=0.004)
            # lugs along both sides and the ends
            for y in np.arange(min(ya, yb) + 0.01, max(ya, yb) - 0.006, 0.016):
                for e in (-1, 1):
                    add_box(bm, Vector((cx + e * (hw + 0.0015), y, 0.009)), ax, (0.004, 0.009, 0.014), 0)
            parts.append((bm, bone))
    return rigid_multi('Brawler_soles', parts, rig, short, [placeholder('gear_sole')])


# ---------------------------------------------------------------- all of it

SIZES = {'Brawler_top': 1024, 'Brawler_pants': 1024, 'Brawler_mech_forearm': 1024, 'Brawler_harness': 1024,
         'Brawler_buzz': 512, 'Brawler_boots': 512, 'Brawler_belt': 512, 'Brawler_pockets': 512,
         'Brawler_wraps': 512, 'Brawler_ironhand': 512, 'Brawler_mech_upperarm': 512}


def dress(body, rig, short, helpers, meshes):
    body_shell = helpers['body_shell']
    muscle_up(body, rig, short)
    clothes, smooth_torso = make_clothes(body, rig, short, helpers)
    wraps = make_wraps(body, rig, short, body_shell)
    arm = make_mech_arm(body, rig, short, body_shell)
    helpers['cull'](body, clothes + [wraps, arm[0]])
    boots = next(o for o in clothes if o.name == 'Brawler_boots')
    pockets = next(o for o in clothes if o.name == 'Brawler_pockets')
    hardware = (make_buckles(body, rig, short, smooth_torso) + make_kneepads(rig, short) +
                make_laces(rig, short, boots) + [make_hand_plates(rig, short), make_rivets(rig, short, smooth_torso, pockets)])
    hair = make_hair(body, rig, short, body_shell)
    shoes = boot_feet(meshes)
    _cycles_gpu(bpy.context.scene)
    for o in clothes + [wraps] + arm + hardware + hair[:1] + shoes:
        bake(o, SIZES.get(o.name, 256 if o.name.startswith(('Brawler_buckles', 'Brawler_laces', 'Brawler_rivets', 'Brawler_soles')) else 512))
    locks = hair[1]
    locks.material_slots[0].material = final_material('hair_locks', locks_image('Brawler_locks_paint', PALETTE['hair_locks'], HAIR_SHEEN, 0.5))
    locks.material_slots[1].material = final_material('hair_lime', locks_image('Brawler_lime_paint', PALETTE['hair_locks'], PALETTE['hair_lime'], 0.3))
    for m in [m for m in bpy.data.materials if m.users == 0]:
        bpy.data.materials.remove(m)   # the placeholders
    eye = next(o for o in meshes if o.name.startswith('FC1_eye'))
    ev = [eye.matrix_world @ v.co for v in eye.data.vertices]
    eyes = [sum((v for v in ev if (v.x > 0) == left), Vector()) / max(1, sum(1 for v in ev if (v.x > 0) == left))
            for left in (True, False)]
    amber_eyes(meshes)
    paint_skin(body, eyes)
    return clothes + [wraps] + arm + hardware + hair
