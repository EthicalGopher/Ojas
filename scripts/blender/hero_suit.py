"""The default hero in Veera's painted style: the same muscular, faceless figure (the user's anatomy sculpt, the
blank mask with the white eyes), now in a yellow costume with a gym athlete's kit, painted like Veera
(brawler_shape.py) instead of the flat toon look (hero_body.dress_skin).

build_fc1.py builds him this way when FC1_HERO=1 (HERO_TOON=1 keeps the old toon build). After
hero_body.sculpt_body:
- the kit (shells of the body, build_fc1.body_shell, so they bend with it): a fitted charcoal tank with gold
  piping, charcoal training shorts with gold side stripes and waistband, white trainers with charcoal trim on
  rigid soles, white tape round both wrists, a charcoal sweatband (gold edges) round the mask;
- the suit: the whole body (hands too) in one painted yellow map (brawler_shape.bake: brush-stroke tones,
  occlusion from the kit, a soft key light), through a Kuwahara filter, with the sculpt's muscle lines as gold
  panel seams and the sculpt's detail as a normal map (muscle under the fabric);
- the mask: the egg's face paint (hero_body.paint_face: white eyes, black outline, the centre line) on the
  suit's yellow, with painted tones.
Materials are gear_* (painted, no cloth sheen in the viewer); the catalog's look.paint gives the painted light.
World metres: the body faces -Y, his left is +X, feet at z = 0, 1.70 m tall.
"""
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_point_line

import brawler_shape as bs
import hero_body as hb
import hero_shape as hs

SUIT = '#F0BF32'      # the costume's golden yellow
SEAM = '#8E5F10'      # panel seams: a dark gold
bs.PALETTE.update({
    'gear_suit': SUIT, 'gear_tank': '#2A2E35', 'gear_gold': '#E9B12C', 'gear_shorts': '#25282E',
    'gear_shoe': '#CBD6E8', 'gear_shoetrim': '#17181C', 'gear_sole': '#1B1C1F', 'gear_band': '#2A2E35',
    'gear_midsole': '#F2F1EC', 'gear_lace': '#4E76C4',
    'gear_wraps': '#E6E1D4',
})
# (stretch, noise scale, tone spread, roughness, metallic, edge wear, rust)
bs.LOOK.update({
    'gear_suit': ((1, 1, 3), 9, 0.05, 0.8, 0.0, 0.0, 0.0),
    'gear_tank': ((1, 1, 5), 18, 0.07, 0.85, 0.0, 0.0, 0.0),
    'gear_gold': ((1, 1, 3), 22, 0.06, 0.6, 0.3, 0.0, 0.0),
    'gear_shorts': ((1, 1, 4), 16, 0.07, 0.88, 0.0, 0.0, 0.0),
    'gear_shoe': ((1, 1, 1), 30, 0.07, 0.7, 0.0, 0.1, 0.0),
    'gear_midsole': ((1, 1, 4), 30, 0.04, 0.6, 0.0, 0.0, 0.0),
    'gear_lace': ((1, 1, 1), 40, 0.04, 0.8, 0.0, 0.0, 0.0),
    'gear_shoetrim': ((1, 1, 1), 30, 0.12, 0.75, 0.0, 0.0, 0.0),
    'gear_band': ((4, 4, 1), 60, 0.12, 0.9, 0.0, 0.0, 0.0),
})

TANK_HEM = 0.91          # tucked well under the shorts
# the tank's upper edge seen from the front, (|x|, z): a scoop neck, straps over the traps, deep armholes
TANK_EDGE = [(0.0, 1.365), (0.045, 1.39), (0.068, 1.475), (0.118, 1.48), (0.128, 1.41), (0.145, 1.32),
             (0.165, 1.24), (0.33, 1.20)]
ARM_CLEAR = 0.092
ARMHOLE_X = 0.178        # the tank's sides stop here (a clean vertical cut under each arm)        # the armhole keeps this far from the upper arm's axis
SHORTS_WAIST, SHORTS_HEM = 0.975, 0.60
LEG_X = 0.10
STRIPE_DEG = 9           # half-width of the side stripe, in degrees round the thigh
SHOE_TOP = 0.105
SOLE_TOP = 0.014         # the shoe's own skin stops here: the sole covers the rest
TAPE = (-0.07, 0.012)    # wrist tape, metres along the forearm from the wrist
BAND = (0.034, 0.064)    # sweatband, metres above the eyes' top
PANEL = '#C9881A'     # darker gold side panels down the arms and legs, and the collar
PANEL_ANGLE = 0.5     # half-width of a side panel, radians round the limb
COLLAR = 0.02         # metres of collar below the mask
# the limbs' axes at rest (left side; the right mirrors x): shoulder, elbow, wrist; hip, knee, ankle
ARM_AXIS = [hb.SHOULDER, hb.ELBOW, hb.WRIST]
LEG_AXIS = [Vector((0.099, -0.002, 0.928)), hb.KNEE, Vector((0.122, 0.043, 0.097))]
SUIT_MAP = 2048
bs.SOFT.update({'gear_suit', 'gear_tank', 'gear_gold', 'gear_shorts', 'gear_shoe', 'gear_shoetrim', 'gear_band',
                'gear_midsole', 'gear_lace', 'gear_sole'})
EMBLEM = '#E9B12C'
EMBLEM_DARK = '#7A520E'
# the Ojas emblem (a ring round a lightning bolt), front view (x, z) metres: on the tank's chest, small on the
# shorts' left leg
BOLT = [(0.006, 0.034), (-0.016, -0.003), (-0.002, -0.003), (-0.008, -0.034), (0.016, 0.006), (0.002, 0.006)]
EMBLEMS = {'gear_tank': ((0.0, 1.265), 1.0), 'gear_shorts': ((0.115, 0.80), 0.55)}
# the Ojas mark: (centre (x, z), width of the logo's square canvas in metres)
LOGOS = {'gear_tank': ((0.008, 1.262), 0.215), 'gear_shorts': ((0.118, 0.80), 0.11)}
SUIT_KUWAHARA = 3
SEAM_WIDTH = 0.8         # x hero_body.LINE_W
NORMAL_STRENGTH = 0.6


# trims painted per pixel after baking (crisp, even, anti-aliased; face-level trims came out jagged)
PIPES = {}     # object name -> (width m, where(edge point)): piping along its open edges
STRIPES = {}   # object name -> True: gold side stripes (the shorts)
SHOES = {}     # object name -> (toe y, heel y, sections, tops, centres x, half widths): a trainer's panels
GOLD = '#E9B12C'
SHOE_TRIM = '#17181C'
OUTSOLE = '#1B1C1F'
LACE_PANEL = '#EEF1F6'
# the running shoe (the user's reference): pale speckled knit, a deep-blue cage with rib fingers up to the laces,
# a light-blue padded collar with orange lining, white foam midsole with a blue wave, orange outsole
KNIT_SPECK = '#A3B4D3'
CAGE = '#3E64B8'
COLLAR_BLUE = '#86B4E8'
LINING = '#F07A2A'
WAVE = '#5D8FD0'
WAVE_RIM = '#7FA6DE'
OUTSOLE_ORANGE = '#F28A2E'
AA = 0.0007    # metres of soft edge on every painted trim


def _h(z):
    return (Vector((0, 0, z)), Vector((0, 0, 1)))


def _shell(h, *args, trim=None, **kw):
    """build_fc1.body_shell with its binding width (TRIM, a module global there) set for this piece"""
    g = h['body_shell'].__globals__
    old = g['TRIM']
    if trim:
        g['TRIM'] = trim
    try:
        return h['body_shell'](*args, **kw)
    finally:
        g['TRIM'] = old


def _head(rig, short):
    bones = {short(b.name): b for b in rig.data.bones}
    return lambda n: rig.matrix_world @ bones[n].head_local


# ---------------------------------------------------------------- the kit

def _tidy(o, keep_main=True, relax=24):
    """a garment's open edges made clean: scraps cut off from the main piece go, and every open edge is
    relaxed along itself (the cut through the dense sculpt left them sawtoothed)"""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    if keep_main:
        seen, islands = set(), []
        for f in bm.faces:
            if f in seen:
                continue
            stack, isl = [f], []
            seen.add(f)
            while stack:
                g = stack.pop()
                isl.append(g)
                for e in g.edges:
                    for h2 in e.link_faces:
                        if h2 not in seen:
                            seen.add(h2)
                            stack.append(h2)
            islands.append(isl)
        islands.sort(key=len, reverse=True)
        # the tank is one piece; the shorts two legs joined at the seat: keep pieces over 3% of the largest
        gone = [f for isl in islands[1:] if len(isl) < 0.03 * len(islands[0]) for f in isl]
        bmesh.ops.delete(bm, geom=gone, context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    rim = [v for v in bm.verts if v.is_boundary]
    for _ in range(relax):
        new = []
        for v in rim:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                new.append((v, v.co.lerp((nb[0].co + nb[1].co) / 2, 0.5)))
        for v, c in new:
            v.co = c
    bm.to_mesh(o.data)
    bm.free()


def _pipe(o, width, where):
    """piping: the cloth within `width` of an open edge (where where(edge point) holds) takes material 1"""
    from mathutils.kdtree import KDTree
    mw = o.matrix_world
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    pts = []
    for e in bm.edges:
        if e.is_boundary:
            a, b = (mw @ v.co for v in e.verts)
            if where((a + b) / 2):
                n = max(1, int((b - a).length / 0.001))
                pts += [a.lerp(b, i / n) for i in range(n + 1)]
    if pts:
        kd = KDTree(len(pts))
        for i, q in enumerate(pts):
            kd.insert(q, i)
        kd.balance()
        for f in bm.faces:
            if kd.find(mw @ f.calc_center_median())[2] < width:
                f.material_index = 1
    bm.to_mesh(me)
    bm.free()


def _body_bvh(body):
    """the real body's surface (world space): stretched cloth is kept clear of this, not of a shrunken copy"""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.transform(body.matrix_world)
    bvh = BVHTree.FromBMesh(bm)
    bm.free()
    return bvh


def make_neckband(body, h):
    """a charcoal neck band (gold piping) where the mask meets the suit, like the sweatband"""
    pc, pn = hb.NECK_CUT
    lo = 0.034
    o = _shell(h, body, 'Hero_neckband', {'skin_body'}, [(pc - pn * lo, pn), (pc - pn * 0.001, pn)],
               lambda m, c: -lo < (c - pc).dot(pn) < -0.001, 4, 0.002, lambda p: 0.006,
               [bs.placeholder('gear_band')], lambda c: False)
    _tidy(o, relax=6)
    PIPES[o.name] = (0.0045, lambda p: True)
    return o


def make_tank(body, rig, short, h):
    head = _head(rig, short)
    arms = [(head(f'{s}_Upperarm'), head(f'{s}_Forearm')) for s in 'LR']

    def arm_field(c):
        d = 1e9
        for a, b in arms:
            q, t = intersect_point_line(c, a, b)
            d = min(d, ((c - q) if t > 0 else (c - a)).length)
        return d - ARM_CLEAR

    def keep(m, c):
        return TANK_HEM < c.z < h['edge_z'](TANK_EDGE, abs(c.x)) and arm_field(c) >= 0 and abs(c.x) < ARMHOLE_X

    tank = bs.placeholder('gear_tank')
    # relaxed like stretched cloth over the real body (6 mm clear): it bridges the abs and the spine's groove
    sides = [(Vector((sx * ARMHOLE_X, 0, 0)), Vector((sx, 0, 0))) for sx in (1, -1)]
    o = _shell(h, body, 'Hero_tank', {'skin_body', 'skin_leg', 'skin_arm'},
               [_h(TANK_HEM)] + h['edge_segments'](TANK_EDGE) + sides,
               keep, 120, 0.003, lambda p: 0.009, [tank], lambda c: False, _body_bvh(body),
               fields=[arm_field])
    _tidy(o, relax=10)
    PIPES[o.name] = (0.0075, lambda p: p.z > TANK_HEM + 0.03)
    return o


def make_shorts(body, h):
    def stripe(c):
        sx = 1 if c.x > 0 else -1
        a = math.degrees(math.atan2(-c.y, sx * c.x - LEG_X))   # 0 = straight out from the thigh
        return abs(a) < STRIPE_DEG and c.z < SHORTS_WAIST - 0.03

    def stripe_field(c):
        sx = 1 if c.x > 0 else -1
        a = math.degrees(math.atan2(-c.y, sx * c.x - LEG_X))
        return (abs(a) - STRIPE_DEG) * 0.002 if sx * c.x > LEG_X else 1.0

    o = h['body_shell'](body, 'Hero_shorts', {'skin_leg', 'skin_body'}, [_h(SHORTS_WAIST), _h(SHORTS_HEM)],
                        lambda m, c: SHORTS_HEM < c.z < SHORTS_WAIST, 120, 0.004,
                        lambda p: 0.016 + 0.018 * max(0.0, min(1.0, (0.86 - p.z) / (0.86 - SHORTS_HEM))) ** 1.3,
                        [bs.placeholder('gear_shorts')], lambda c: False,
                        _body_bvh(body))   # relaxed as cloth over the real body: no creases folding into it
    _tidy(o, relax=14)
    PIPES[o.name] = (0.011, lambda p: True)                     # piped waistband and leg hems
    STRIPES[o.name] = True
    return o


def make_tape(body, rig, short, h):
    head = _head(rig, short)
    cuts, hands = [], []
    for s in 'LR':
        wrist, knuckle = head(f'{s}_Hand'), head(f'{s}_Mid1')
        axis = (knuckle - wrist).normalized()
        hands.append((wrist, axis))
        cuts += [(wrist + axis * TAPE[0], -axis), (wrist + axis * TAPE[1], axis)]

    def inside(m, c):
        for wrist, axis in hands:
            t = (c - wrist).dot(axis)
            q, _ = intersect_point_line(c, wrist, wrist + axis)
            if TAPE[0] < t < TAPE[1] and (c - q).length < 0.08:
                return True
        return False

    w = bs.placeholder('gear_wraps')
    hand = next(m.name for m in body.data.materials if m and m.name.startswith('toon_hand'))
    return h['body_shell'](body, 'Hero_tape', {'skin_arm', hand}, cuts, inside, 2, 0.0015, lambda p: 0.0042,
                           [w, w], lambda c: False)


def _foot_weights(o, rig, short, side, toe_y):
    """heel and arch on the foot bone, the front on the toe bone (blended over 3 cm), so the shoe bends"""
    names = {short(b.name): b.name for b in rig.data.bones}
    gf = o.vertex_groups.new(name=names[f'{side}_Foot'])
    gt = o.vertex_groups.new(name=names[f'{side}_ToeBase'])
    for v in o.data.vertices:
        t = bs.smooth01(toe_y + 0.012, toe_y - 0.018, v.co.y)   # the front is -Y (the mesh is in world space)
        if t < 1:
            gf.add([v.index], 1 - t, 'REPLACE')
        if t > 0:
            gt.add([v.index], t, 'REPLACE')


def _superellipse(n, e):
    """n points round a unit superellipse (exponent e: 2 = ellipse, larger = boxier), from the bottom centre"""
    out = []
    for k in range(n):
        a = -math.pi / 2 + 2 * math.pi * k / n
        c, s = math.cos(a), math.sin(a)
        out.append((math.copysign(abs(c) ** (2 / e), c), math.copysign(abs(s) ** (2 / e), s)))
    return out


def _loft(bm, rings, mats):
    """faces between consecutive rings (lists of verts); both ends closed with a fan"""
    for r0, r1 in zip(rings, rings[1:]):
        n = len(r0)
        for k in range(n):
            f = bm.faces.new((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]))
            f.material_index = mats(f)
            f.smooth = True
    # both ends closed with a rounded cap (two inset rings, then a small fan): a flat fan pinched the shading
    # into a dark dot at its pole
    for r, nxt in ((rings[0], rings[1]), (rings[-1], rings[-2])):
        c0 = sum((v.co for v in r), Vector()) / len(r)
        out = (c0 - sum((v.co for v in nxt), Vector()) / len(nxt)).normalized()
        prev = r
        for scale, push in ((0.75, 0.0025), (0.4, 0.0045)):
            ring = [bm.verts.new(c0 + (v.co - c0) * scale + out * push) for v in r]
            for k in range(len(r)):
                f = bm.faces.new((prev[k], prev[(k + 1) % len(r)], ring[(k + 1) % len(r)], ring[k]))
                f.material_index = mats(f)
                f.smooth = True
            prev = ring
        c = bm.verts.new(c0 + out * 0.0055)
        for k in range(len(r)):
            f = bm.faces.new((prev[k], prev[(k + 1) % len(r)], c))
            f.material_index = mats(f)
            f.smooth = True


SHOE_RING, SHOE_SECTIONS = 64, 56


def _smooth_list(xs, passes=4):
    for _ in range(passes):
        xs = [xs[0]] + [(xs[i - 1] + 2 * xs[i] + xs[i + 1]) / 4 for i in range(1, len(xs) - 1)] + [xs[-1]]
    return xs


MIDSOLE = 0.026        # (toe) midsole height; the heel's is MIDSOLE + HEEL_STACK
HEEL_STACK = 0.017
TOE_SPRING = 0.009
HEEL_RISE = 0.004
UPPER_SINK = 0.012     # the upper's rounded bottom sits this deep in the midsole (no gap for the foot to show)


def _sole_profile(t):
    """(bottom, top) of the midsole at t (0 toe .. 1 heel): a rocker (toe and heel lift off the floor) and a
    thick heel stack"""
    bottom = TOE_SPRING * np.clip(1 - t / 0.24, 0, None) ** 2 + HEEL_RISE * np.clip((t - 0.86) / 0.14, 0, None) ** 2
    top = bottom + MIDSOLE + HEEL_STACK * bs.smooth01(0.25, 0.85, float(t)) if np.isscalar(t) else \
        bottom + MIDSOLE + HEEL_STACK * np.clip((t - 0.25) / 0.6, 0, 1) ** 2 * (3 - 2 * np.clip((t - 0.25) / 0.6, 0, 1))
    return bottom, top


def make_shoes(body, rig, short):
    """running shoes round each foot, built along it (t: 0 toe, 1 heel), after the user's reference: a thick
    sculpted midsole (heel higher than toe, rocker toe and heel) under a knit upper that rises from a low toe box
    over the instep to a high padded heel collar, open at the ankle; crossed rope laces over the tongue; a pull
    tab on the heel. Colours (knit speckle, the blue cage and its rib fingers, collar and lining, the midsole's
    wave and the orange outsole) are painted per pixel by paint_trims. The foot bone carries the heel, the toe
    bone the front."""
    head = _head(rig, short)
    mw = body.matrix_world
    me = body.data
    leg = {i for i, m in enumerate(me.materials) if m and m.name == 'skin_leg'}
    low = set()
    for p in me.polygons:
        if p.material_index in leg:
            low.update(p.vertices)
    names = ['gear_shoe', 'gear_midsole', 'gear_lace']
    mats = [bs.placeholder(n) for n in names]
    UPPER, MID, LACE = range(3)
    out = []
    for s, sx in (('L', 1), ('R', -1)):
        foot = [q for q in (mw @ me.vertices[i].co for i in low) if q.z < SHOE_TOP + 0.02 and q.x * sx > 0]
        y_toe = min(q.y for q in foot) - 0.014
        y_heel = max(q.y for q in foot if q.z < 0.06) + 0.014
        n = SHOE_SECTIONS
        ys = [y_toe + (y_heel - y_toe) * i / n for i in range(n + 1)]
        cxs, hws, tops = [], [], []
        for i, y in enumerate(ys):
            # the front is sized on the foot alone (low and slim); toward the heel the shoe wraps the ankle too
            zmax = 0.085 + 0.045 * bs.smooth01(0.3, 0.56, i / n)   # the instep climbs to cover the shin's front
            sl = [q for q in foot if abs(q.y - y) < 0.015 and q.z < zmax] or foot
            cxs.append((min(q.x for q in sl) + max(q.x for q in sl)) / 2)
            hws.append((max(q.x for q in sl) - min(q.x for q in sl)) / 2 + 0.008)
            tops.append(max(q.z for q in sl) + 0.006)
        cxs, hws, tops = _smooth_list(cxs), _smooth_list(hws, 6), _smooth_list(tops, 6)
        bm = bmesh.new()
        upper, sole, info = [], [], []
        ring = _superellipse(SHOE_RING, 2.25)
        sring = _superellipse(32, 6)
        for i, y in enumerate(ys):
            t = i / n
            u = 2 * t - 1
            p_ = 2.4 if u < 0 else 4.0      # a rounded toe, a rounded-square heel
            ends = (1 - abs(u) ** p_) ** (1 / p_)
            s_bot, s_top = _sole_profile(t)
            # the upper: low over the toes, up over the instep, a high collar at the heel
            prof = 0.036 + 0.052 * bs.smooth01(0.12, 0.6, t) + 0.03 * bs.smooth01(0.66, 0.95, t)
            zb = s_top - UPPER_SINK
            top = min(max(tops[i], prof + s_bot), 0.13)
            hgt = (top - zb) * (0.3 + 0.7 * ends)
            hw = hws[i] * (0.22 + 0.78 * ends)
            cx = cxs[i]
            info.append((zb, zb + hgt, cx, hw, s_bot, s_top))
            upper.append([bm.verts.new(Vector((cx + uu * hw, y, zb + (vv * 0.5 + 0.5) * hgt))) for uu, vv in ring])
            # the midsole: wider than the upper, flaring out at the bottom
            shw = hw + 0.009 * (0.4 + 0.6 * ends)
            mid_z, half = (s_bot + s_top) / 2, (s_top - s_bot) / 2
            sole.append([bm.verts.new(Vector((cx + uu * shw * (1.0 + 0.06 * max(0.0, -vv)), y, mid_z + vv * half *
                                              (0.6 + 0.4 * ends)))) for uu, vv in sring])
        zbs_a, tops_a, cxs_a, hws_a, sbot_a, stop_a = (np.array([i_[k] for i_ in info]) for k in range(6))
        SHOES[f'Hero_shoe_{s}'] = (y_toe, y_heel, n, tops_a, cxs_a, hws_a, zbs_a, sbot_a, stop_a)
        _loft(bm, upper, lambda f: UPPER)
        _loft(bm, sole, lambda f: MID)
        # no ankle opening: the closed top meets the leg in one clean line (an opening left a notch where the
        # leg showed through in front)
        opening = []
        # crossed rope laces over the tongue, eyelet to eyelet, and a bar at the top
        eyes = []
        for k in range(6):
            i = int(round((0.3 + 0.058 * k) * n))
            zb, top, cx, hw = info[i][:4]
            eyes.append([Vector((cx + sgn * 0.4 * hws[i], ys[i], top - 0.002)) for sgn in (-1, 1)])
        for k in range(len(eyes) - 1):
            for a_, b_ in ((eyes[k][0], eyes[k + 1][1]), (eyes[k][1], eyes[k + 1][0])):
                mid = (a_ + b_) / 2 + Vector((0, 0, 0.0035))
                bs.add_tube(bm, [a_, mid, b_], 0.0029, LACE, seg=8)
        bs.add_tube(bm, [eyes[0][0], (eyes[0][0] + eyes[0][1]) / 2 + Vector((0, 0, 0.003)), eyes[0][1]], 0.0029,
                    LACE, seg=8)
        # the tongue: a padded flap following the instep, then standing up in front of the ankle opening
        strip = []
        for j in range(9):
            tj = 0.5 + 0.2 * j / 8
            i = int(round(tj * n))
            zb_, top_, cx_, hw_ = info[i][:4]
            lift = 0.026 * bs.smooth01(0.58, 0.7, tj)
            w_ = 0.42 * hws[i]
            zt = top_ - 0.001 + lift if tj < 0.6 else tops_a[int(round(0.6 * n))] - 0.001 + lift
            back = 0.008 * bs.smooth01(0.6, 0.7, tj) - 0.006 * bs.smooth01(0.55, 0.62, tj)
            strip.append((Vector((cx_ - w_, ys[i] + back, zt)), Vector((cx_ + w_, ys[i] + back, zt))))
        tb = bmesh.new()
        vs = [(tb.verts.new(a_), tb.verts.new(b_)) for a_, b_ in strip]
        for (a0, b0), (a1, b1) in zip(vs, vs[1:]):
            tb.faces.new((a0, b0, b1, a1))
        bmesh.ops.solidify(tb, geom=tb.faces[:], thickness=0.005)
        bmesh.ops.recalc_face_normals(tb, faces=tb.faces)
        bs._merge(bm, tb, UPPER)
        # the heel pull tab: a flat loop standing up off the back of the collar
        zb, top, cx, hw = info[-3][:4]
        yb = ys[-3]
        bs.add_tube(bm, [Vector((cx, yb + 0.004, top - 0.018)), Vector((cx, yb + 0.012, top - 0.002)),
                         Vector((cx, yb + 0.009, top + 0.016)), Vector((cx, yb + 0.002, top + 0.012))],
                    0.0045, LACE, seg=6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        name = f'Hero_shoe_{s}'
        me2 = bpy.data.meshes.new(name)
        bm.to_mesh(me2)
        bm.free()
        o = bpy.data.objects.new(name, me2)
        rig.users_collection[0].objects.link(o)
        for m in mats:
            me2.materials.append(m)
        _foot_weights(o, rig, short, s, head(f'{s}_ToeBase').y)
        # parented like the body, in the body's units: the rig's world matrix carries the 1/100 scale
        o.parent = rig
        me2.transform(rig.matrix_world.inverted())
        o.matrix_parent_inverse.identity()
        o.matrix_basis.identity()
        o.modifiers.new('Armature', 'ARMATURE').object = rig
        print('SHOE', name, len(me2.polygons), 'length', round(y_heel - y_toe, 3), 'opening', len(opening))
        out.append(o)
    return out


def make_band(head_obj, h):
    """the sweatband: a shell of the mask, BAND above the eyes, gold piping along both edges"""
    z0 = hb.EYE['z_out'] + BAND[0]
    z1 = hb.EYE['z_out'] + BAND[1]
    mat = head_obj.data.materials[0].name
    o = h['body_shell'](head_obj, 'Hero_band', {mat}, [_h(z0), _h(z1)], lambda m, c: z0 < c.z < z1, 0, 0.0,
                        lambda p: 0.0055, [bs.placeholder('gear_band')], lambda c: False)
    PIPES[o.name] = (0.0045, lambda p: True)
    return o


def _edge_distance(o, where, pos, used):
    """per texel: the distance (metres, along the surface's world positions) to the nearest open edge of o
    where where(edge midpoint) holds; inf where there is none"""
    from mathutils.kdtree import KDTree
    mw = o.matrix_world
    bm = bmesh.new()
    bm.from_mesh(o.data)
    pts = []
    for e in bm.edges:
        if e.is_boundary:
            a, b = (mw @ v.co for v in e.verts)
            if where((a + b) / 2):
                k = max(1, int((b - a).length / 0.0005))
                pts += [a.lerp(b, i / k) for i in range(k + 1)]
    bm.free()
    d = np.full(pos.shape[:2], np.inf, np.float32)
    if not pts:
        return d
    kd = KDTree(len(pts))
    for i, q in enumerate(pts):
        kd.insert(q, i)
    kd.balance()
    flat = d.reshape(-1)
    P = pos.reshape(-1, 3)
    find = kd.find
    for i in np.flatnonzero(used.reshape(-1)):
        flat[i] = find(P[i])[2]
    return d


def _over(px, mask, hexc, base_hex):
    """paint hexc where mask (0..1), keeping the baked shading: the colour times the texel's shade relative
    to the material's own colour"""
    base = bs.hex_px(base_hex)
    shade = np.clip(px[..., :3].mean(-1, keepdims=True) / max(float(base.mean()), 1e-3), 0.55, 1.25)
    col = np.clip(bs.hex_px(hexc) * shade, 0, 1)
    px[..., :3] = px[..., :3] * (1 - mask[..., None]) + col * mask[..., None]


def _positions(o, mat_name, W):
    """brawler_shape.bake_positions, with the texels that belong to mat_name told by the position itself
    (its alpha test passed every texel here): unbaked texels keep the -2 offset"""
    pos, _ = bs.bake_positions(o, mat_name, W)
    return pos, pos[..., 0] > -1.5


def _soft(x):
    """inside (x < 0) -> 1, outside -> 0, over AA metres"""
    return np.clip(0.5 - x / AA, 0, 1)


def paint_trims(o):
    """piping, stripes and a trainer's panels painted into o's colour map, per pixel"""
    m = o.material_slots[0].material
    base = m.name.split('.')[0]
    img = next(nd.image for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE')
    W = img.size[0]
    pos, used = _positions(o, m.name, W)
    px = bs._image_px(img)
    base_hex = bs.PALETTE[base]
    if o.name in PIPES:
        width, where = PIPES[o.name]
        d = _edge_distance(o, where, pos, used)
        _over(px, _soft(d - width) * used, GOLD, base_hex)
    if o.name in STRIPES:
        sx = np.where(pos[..., 0] > 0, 1.0, -1.0)
        r = np.hypot(sx * pos[..., 0] - LEG_X, pos[..., 1])
        a = np.abs(np.arctan2(-pos[..., 1], sx * pos[..., 0] - LEG_X))     # 0 = straight out from the thigh
        dist = (a - math.radians(STRIPE_DEG)) * r                           # metres round the leg
        mask = _soft(dist) * used * (pos[..., 2] < SHORTS_WAIST - 0.03) * (sx * pos[..., 0] > LEG_X - 0.02)
        _over(px, mask, GOLD, base_hex)
    if o.name in SHOES:
        y_toe, y_heel, n, tops, cxs, hws, zbs, sbots, stops = SHOES[o.name]
        L = y_heel - y_toe
        grid = np.linspace(0, 1, n + 1)

        def section(P):
            t = (P[..., 1] - y_toe) / L
            tc = np.clip(t, 0, 1)
            return (t,) + tuple(np.interp(tc, grid, a_) for a_ in (tops, cxs, hws, zbs, sbots, stops))
        t, top, cx, hw, zb, _, _ = section(pos)
        z = pos[..., 2]
        side = np.abs(pos[..., 0] - cx)
        u = used.astype(np.float32)
        frac = (z - zb) / np.maximum(top - zb, 1e-3)
        # knit speckle: a fine random fleck on a 1.2 mm grid
        cell = np.floor(pos / 0.0012)
        h_ = np.sin(cell[..., 0] * 12.9898 + cell[..., 1] * 78.233 + cell[..., 2] * 37.719) * 43758.5453
        speck = ((h_ - np.floor(h_)) > 0.72).astype(np.float32)
        _over(px, speck * 0.65 * u, KNIT_SPECK, base_hex)
        # the tongue panel under the laces: a lighter knit
        tongue = _soft(np.maximum.reduce([(0.28 - t) * L, (t - 0.74) * L, side - 0.45 * hw, (top - 0.022) - z]))
        _over(px, tongue * u, LACE_PANEL, base_hex)
        # the cage: a deep-blue band wrapping the lower upper, the heel counter, and rib fingers rising diagonally
        # from the band to the eyelets along the midfoot
        band = _soft((frac - 0.3) * (top - zb))
        # the heel counter rises from the band toward the heel in one smooth curve
        rise = np.clip((t - 0.68) / 0.26, 0, 1)
        counter = _soft((frac - (0.3 + 0.38 * rise * rise * (3 - 2 * rise))) * (top - zb))
        # the cage's fingers: they fan out from the band, curving back as they rise toward the eyelets, each
        # narrowing to a rounded tip (a cage, like the reference, not parallel stripes)
        rise_ = np.clip((frac - 0.28) / 0.5, 0, 1)
        q = t * L + (z - zb) * (0.25 + 1.1 * rise_)
        spacing = 0.034
        rib_phase = (q / spacing) % 1.0
        half = 0.26 - 0.12 * rise_                           # wide at the root, narrow at the tip
        tip = (frac - (0.74 + 0.06 * np.sin(q / spacing * 2.1))) * (top - zb)
        rib = _soft((np.abs(rib_phase - 0.5) - half) * spacing) * \
            _soft(np.maximum.reduce([(0.26 - t) * L, (t - 0.7) * L, tip, 0.55 * hw - side]))
        _over(px, np.maximum.reduce([band, counter, rib]) * u, CAGE, base_hex)
        # the padded collar (light blue), its orange lining along the opening
        collar = _soft(np.maximum((0.62 - t) * L, (top - 0.018) - z))
        lining = _soft(np.maximum((0.62 - t) * L, (top - 0.006) - z))
        _over(px, collar * u, COLLAR_BLUE, base_hex)
        _over(px, lining * u, LINING, base_hex)
        # the midsole (same image): orange outsole at the bottom, a blue wave through the white foam, a blue rim
        mid = next((s_.material for s_ in o.material_slots if s_.material.name.startswith('gear_midsole')), None)
        if mid is not None:
            pos2, used2 = _positions(o, mid.name, W)
            t2, _, _, _, _, sb, st = section(pos2)
            zz = (pos2[..., 2] - sb) / np.maximum(st - sb, 1e-3)
            hh = st - sb
            wave_c = 0.5 + 0.13 * np.sin(2 * np.pi * (t2 * 2.3 + 0.15))
            wave = _soft((np.abs(zz - wave_c) - 0.17) * hh) * _soft(np.maximum((0.1 - t2) * L, (t2 - 0.95) * L))
            u2 = used2.astype(np.float32)
            base2 = bs.PALETTE['gear_midsole']
            _over(px, wave * u2, WAVE, base2)
            _over(px, _soft((0.9 - zz) * hh) * u2, WAVE_RIM, base2)
            _over(px, _soft((zz - 0.26) * hh) * u2, OUTSOLE_ORANGE, base2)
        # the laces and pull tab are their own blue material
    _set_pixels(img, px)
    print('TRIMS', o.name, W)


# ---------------------------------------------------------------- the suit

def _set_pixels(img, px):
    img.pixels.foreach_set(np.ascontiguousarray(px, np.float32).ravel())
    img.pack()


def _limb_panel(P, axis, zmin, zmax):
    """(edge distance in radians from the panel's border, inside mask) for points P (n,3) on the left limb's
    outer side; the right limb mirrors"""
    Q = P.copy()
    Q[:, 0] = np.abs(Q[:, 0])
    A = [np.array(tuple(a)) for a in axis]
    best_d = np.full(len(Q), np.inf)
    best_ang = np.full(len(Q), np.inf)
    for a, b in zip(A, A[1:]):
        ab = b - a
        t = np.clip(((Q - a) @ ab) / (ab @ ab), 0, 1)
        foot = a + t[:, None] * ab
        r = Q - foot
        d = np.linalg.norm(r, axis=1)
        u = ab / np.linalg.norm(ab)
        out = np.array([1.0, 0.0, 0.0]) - u * u[0]
        out /= np.linalg.norm(out)
        ang = np.arccos(np.clip((r @ out) / np.maximum(d, 1e-9), -1, 1))
        better = d < best_d
        best_d = np.where(better, d, best_d)
        best_ang = np.where(better, ang, best_ang)
    inside = (best_d < 0.13) & (P[:, 2] > zmin) & (P[:, 2] < zmax)
    return best_ang - PANEL_ANGLE, inside


def suit_panels(pos, valid):
    """(panel 0..1, seam 0..1) per texel: darker side panels down the arms (below the shoulder) and the legs
    (below the shorts), and the collar under the mask; seams along the panels' edges"""
    H, W = valid.shape
    idx = np.flatnonzero(valid)
    P = pos.reshape(-1, 3)[idx].astype(np.float64)
    panel = np.zeros(len(P))
    edge = np.full(len(P), np.inf)
    for axis, zmin, zmax in ((ARM_AXIS, hb.WRIST.z + 0.03, hb.SHOULDER.z + 0.12),
                             (LEG_AXIS, 0.13, SHORTS_HEM - 0.02)):
        e, inside = _limb_panel(P, axis, zmin, zmax)
        panel = np.maximum(panel, np.where(inside, np.clip(0.5 - e / 0.02, 0, 1), 0))
        edge = np.where(inside, np.minimum(edge, np.abs(e)), edge)
    pc, pn = hb.NECK_CUT
    h = (P - np.array(tuple(pc))) @ np.array(tuple(pn))
    collar = np.clip((h + COLLAR) / 0.002, 0, 1)
    panel = np.maximum(panel, collar)
    seam_w = np.clip(1.5 - np.abs(h + COLLAR) / 0.0012, 0, 1)
    seam = np.maximum(np.clip(1.5 - edge / 0.012, 0, 1) * 0.8, seam_w)
    out_p, out_s = np.zeros(H * W), np.zeros(H * W)
    out_p[idx], out_s[idx] = panel, seam
    return out_p.reshape(H, W), out_s.reshape(H, W)


def paint_suit(body, short, hi_path, out_dir):
    """the body (hands too) becomes one painted gear_suit: Veera's brush-stroke bake, Kuwahara, the sculpt's
    muscle lines as gold seams, the sculpt's detail as a normal map"""
    me = body.data
    skin_idx = {i for i, m in enumerate(me.materials) if m and m.name.startswith('skin_')}
    skin_faces = np.array([p.material_index in skin_idx for p in me.polygons])
    me.materials.clear()
    me.materials.append(bs.placeholder('gear_suit'))
    for p in me.polygons:
        p.material_index = 0
    bs.bake(body, SUIT_MAP)           # body's own UVs (smart project) and the painted colour map
    suit = body.material_slots[0].material
    cimg = next(n.image for n in suit.node_tree.nodes if n.type == 'TEX_IMAGE')
    cimg.name = 'hero_suit_color'

    # a copy of the skin alone (no rig, no hands) to bake positions and the sculpt's normals onto
    cp = body.copy()
    cp.data = me.copy()
    body.users_collection[0].objects.link(cp)
    cp.modifiers.clear()
    bm = bmesh.new()
    bm.from_mesh(cp.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not skin_faces[f.index]], context='FACES')
    bm.to_mesh(cp.data)
    bm.free()
    pc = cp.data.color_attributes.new('pos', 'FLOAT_COLOR', 'POINT')
    cw = cp.matrix_world
    cols = np.ones((len(cp.data.vertices), 4), np.float32)
    cols[:, :3] = [tuple((cw @ v.co + Vector((1, 1, 1))) / 3) for v in cp.data.vertices]
    pc.data.foreach_set('color', cols.ravel())
    cp.data.materials.clear()
    cp.data.materials.append(hb._emit_material('bake_pos', 'pos'))

    def image(name, fill):
        img = bpy.data.images.new(name, SUIT_MAP, SUIT_MAP, alpha=False, float_buffer=True)
        img.colorspace_settings.name = 'Non-Color'
        img.generated_color = fill
        return img

    posmap = image('hero_position', (0, 0, 0, 1))
    nmap = image('hero_suit_normal', (0.5, 0.5, 1, 1))
    sc = bpy.context.scene
    sc.cycles.samples = 1
    hb._bake(cp, posmap, 'EMIT')
    before = set(bpy.data.objects)
    bpy.ops.wm.ply_import(filepath=hi_path)
    hi = next(o for o in bpy.data.objects if o not in before)
    hi.data.materials.append(hb._emit_material('bake_none', 'none'))
    hb._bake(cp, nmap, 'NORMAL', [hi])
    bpy.data.objects.remove(cp)

    n = SUIT_MAP
    pos = np.array(posmap.pixels[:], np.float32).reshape(n, n, 4)
    valid = pos[..., :3].sum(-1) > 0.01
    pos = pos[..., :3] * 3 - 1
    from mathutils.kdtree import KDTree
    co, tri, nrm = hb._mesh_arrays(hi.data)
    groove = hb.groove_field(co, tri, nrm, *hb.SNAP_BAND)
    kd = KDTree(len(co))
    for k, p in enumerate(co):
        kd.insert(p, k)
    kd.balance()
    hbm = bmesh.new()
    hbm.from_mesh(hi.data)
    hi_bvh = BVHTree.FromBMesh(hbm)
    hbm.free()
    lines = hb.ink_polylines(hi_bvh, kd, groove)
    bpy.data.objects.remove(hi)
    saved = hb.LINE_W
    hb.LINE_W = saved * SEAM_WIDTH
    seam = hb.paint_lines(pos, valid, lines)
    hb.LINE_W = saved
    bpy.data.images.remove(posmap)

    panel, pseam = suit_panels(pos, valid)
    px = bs._image_px(cimg)
    px = bs.kuwahara(px, SUIT_KUWAHARA)
    # panels: the painted tones kept, shifted to the panel colour
    k = bs.hex_px(PANEL) / bs.hex_px(SUIT)
    px[..., :3] = px[..., :3] * (1 - panel[..., None]) + np.clip(px[..., :3] * k, 0, 1) * panel[..., None]
    seam = np.maximum(seam, pseam)
    sc_ = bs.hex_px(SEAM)
    px[..., :3] = px[..., :3] * (1 - seam[..., None]) + sc_ * seam[..., None]
    _set_pixels(cimg, px)
    nmap.pack()
    print('HERO suit seams', len(lines), 'cover', round(float(seam.mean()) * 100, 3), '%')

    nt = suit.node_tree
    bsdf = next(nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED')
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = nmap
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = NORMAL_STRENGTH
    nt.links.new(t.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    for img, name in ((cimg, 'hero_suit_color'), (nmap, 'hero_suit_normal')):
        img.filepath_raw = os.path.join(out_dir, name + '.png')
        img.file_format = 'PNG'
        img.save()
        img.pack()


def paint_mask(head, out_dir):
    """the egg's face (hero_body.paint_face) on the suit's yellow, then painted tones: soft brush noise on the
    yellow, a Kuwahara pass; the material becomes gear_mask"""
    hb.YELLOW = SUIT
    hb.paint_face(head, out_dir)
    m = head.data.materials[0]
    m.name = 'gear_mask'
    img = next(nd.image for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE')
    px = bs._image_px(img)
    H, W = px.shape[:2]
    yellow = bs.hex_px(SUIT)
    base = np.linalg.norm(px[..., :3] - yellow, axis=-1) < 0.08
    rng = np.random.default_rng(7)
    noise = rng.normal(0, 1, (H // 16 + 2, W // 16 + 2)).astype(np.float32)
    noise = np.kron(noise, np.ones((16, 16), np.float32))[:H, :W]
    k = np.ones(9, np.float32) / 9
    for axis in (0, 1):
        noise = np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), axis, noise)
    tone = 1 + 0.03 * np.clip(noise, -2, 2)
    px[..., :3] = np.where(base[..., None], px[..., :3] * tone[..., None], px[..., :3])
    px = bs.kuwahara(px, 3)
    _set_pixels(img, px)
    bsdf = next(nd for nd in m.node_tree.nodes if nd.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.8
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.25


def paint_emblem(o):
    """the Ojas emblem painted into a front-facing garment's colour map: a gold ring with a dark edge round a
    gold bolt"""
    m = o.material_slots[0].material
    base = m.name.split('.')[0]
    if base not in EMBLEMS:
        return
    (cx, cz), k = EMBLEMS[base]
    img = next(nd.image for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE')
    W = img.size[0]
    pos, used = _positions(o, m.name, W)
    front = used & (pos[..., 1] < -0.02)
    P = np.stack([pos[..., 0] - cx, pos[..., 2] - cz], -1).reshape(-1, 2) / k
    r = np.linalg.norm(P, axis=1)
    aa = 0.0012
    ring = np.clip(0.5 - (np.abs(r - 0.047) - 0.0065) / aa, 0, 1)
    edge = np.clip(0.5 - np.abs(np.abs(r - 0.047) - 0.0065) / (aa * 0.8), 0, 1)
    bolt = np.clip(0.5 - hb._poly_sdf(P, np.array(BOLT)) / aa, 0, 1)
    mask = np.maximum(ring, bolt).reshape(W, W) * front
    edge = edge.reshape(W, W) * front
    px = bs._image_px(img)
    gold, dark = bs.hex_px(EMBLEM), bs.hex_px(EMBLEM_DARK)
    # a soft painted highlight across the emblem, lighter at the top
    shade = np.clip(0.9 + 1.5 * (pos[..., 2] - cz) / k, 0.8, 1.15)[..., None]
    px[..., :3] = px[..., :3] * (1 - mask[..., None]) + np.clip(gold * shade, 0, 1) * mask[..., None]
    px[..., :3] = px[..., :3] * (1 - edge[..., None] * 0.7) + dark * edge[..., None] * 0.7
    _set_pixels(img, px)
    print('EMBLEM', o.name, round(float(mask.mean()) * 100, 3), '%')


SHOULDER_DROP = 11.0   # degrees the clavicles come down in his idle (the mocap shrugged on his big traps)


def _keys_of(fcurves, path):
    return sorted([fc for fc in fcurves if fc.data_path == path], key=lambda fc: fc.array_index)


def _action_fcurves(act):
    """an action's F-curves (Blender 5 keeps them in layered channelbags)"""
    if hasattr(act, 'fcurves') and len(act.fcurves):
        return act.fcurves
    out = []
    for layer in getattr(act, 'layers', []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


ARMS_OUT = 12.0   # degrees the upper arms swing out in his idle: hanging close, his hands sank into his hips


def _turn_bone_keys(rig, act, bone, deg):
    """every rotation key of `bone` in `act` turned by deg about the front-back axis (bone-local)"""
    from mathutils import Quaternion
    fcs = _action_fcurves(act)
    path = f'pose.bones["{bone.name}"].rotation_quaternion'
    curves = _keys_of(fcs, path)
    if len(curves) != 4:
        print('POSE no keys for', bone.name)
        return 0
    to_arm = rig.matrix_world.to_3x3().normalized().inverted()
    axis = (bone.matrix_local.to_3x3().inverted() @ (to_arm @ Vector((0, 1, 0)))).normalized()
    off = Quaternion(axis, math.radians(deg))
    frames = sorted({round(k.co.x, 3) for k in curves[0].keyframe_points})
    for f in frames:
        q = Quaternion([c.evaluate(f) for c in curves])
        nq = off @ q
        for i, c in enumerate(curves):
            for k in c.keyframe_points:
                if abs(k.co.x - f) < 1e-3:
                    k.co.y = nq[i]
                    k.handle_left.y = k.handle_right.y = nq[i]
    for c in curves:
        c.update()
    return len(frames)


def lower_shoulders(rig, clip='hero_idle', deg=SHOULDER_DROP, arms_out=ARMS_OUT):
    """his idle: both clavicles turned down by deg (his shoulders drop, his neck shows) and both upper arms
    swung out by arms_out (his hands clear his hips and thighs)"""
    act = bpy.data.actions.get(clip)
    if act is None:
        print('SHOULDERS no', clip)
        return
    for side, sign in (('L', 1), ('R', -1)):
        for part, d in (('Clavicle', deg * sign), ('Upperarm', -arms_out * sign)):
            bone = next((b for b in rig.data.bones if b.name.endswith(f'{side}_{part}')), None)
            if bone is not None:
                n_ = _turn_bone_keys(rig, act, bone, d)
                print('POSE', bone.name, n_, 'keys, turned', round(d, 1))


def paint_logo(o, logo_path):
    """the Ojas mark (assets/logo-mark.svg, rasterised by make hero) painted in gold on a front-facing
    garment"""
    m = o.material_slots[0].material
    base = m.name.split('.')[0]
    if base not in LOGOS or not logo_path or not os.path.exists(logo_path):
        print('LOGO skipped', o.name)
        return
    (cx, cz), size = LOGOS[base]
    logo = bpy.data.images.load(logo_path)
    lw, lh = logo.size
    la = np.array(logo.pixels[:], np.float32).reshape(lh, lw, 4)[..., 3]   # row 0 = the bottom
    img = next(nd.image for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE')
    W = img.size[0]
    pos, used = _positions(o, m.name, W)
    front = used & (pos[..., 1] < -0.02)
    u = 0.5 + (pos[..., 0] - cx) / size
    v = 0.5 + (pos[..., 2] - cz) / size
    inside = front & (u >= 0) & (u < 1) & (v >= 0) & (v < 1)
    fx, fy = np.clip(u * (lw - 1), 0, lw - 1.001), np.clip(v * (lh - 1), 0, lh - 1.001)
    x0, y0 = fx.astype(int), fy.astype(int)
    tx, ty = fx - x0, fy - y0
    a = (la[y0, x0] * (1 - tx) * (1 - ty) + la[y0, x0 + 1] * tx * (1 - ty) + la[y0 + 1, x0] * (1 - tx) * ty
         + la[y0 + 1, x0 + 1] * tx * ty)
    mask = np.where(inside, a, 0.0)
    px = bs._image_px(img)
    gold = bs.hex_px(EMBLEM)
    shade = np.clip(0.92 + 1.2 * (pos[..., 2] - cz) / size, 0.85, 1.12)[..., None]
    px[..., :3] = px[..., :3] * (1 - mask[..., None]) + np.clip(gold * shade, 0, 1) * mask[..., None]
    _set_pixels(img, px)
    bpy.data.images.remove(logo)
    print('LOGO', o.name, round(float(mask.mean()) * 100, 3), '%')


# ---------------------------------------------------------------- all of it

SIZES = {'Hero_neckband': 1024, 'Hero_tank': 2048, 'Hero_shorts': 2048, 'Hero_shoe_L': 2048, 'Hero_shoe_R': 2048,
         'Hero_tape': 512, 'Hero_band': 1024}
bs.BAKE_SAMPLES = 128


def weld_seams(body, dist=0.002):
    """the sculpt's open seams (down the back's centre line) closed: open-edge points closer than dist metres
    merge, so garments cut from the body are one piece there instead of splitting open"""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    rim = [v for v in bm.verts if v.is_boundary]
    n0 = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=rim, dist=dist / body.matrix_world.to_scale().x)
    bm.to_mesh(body.data)
    bm.free()
    print('HERO welded', n0 - len(body.data.vertices), 'seam points')


def dress(body, head, rig, short, helpers, hi_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    weld_seams(body)
    tank = make_tank(body, rig, short, helpers)
    shorts = make_shorts(body, helpers)
    tape = make_tape(body, rig, short, helpers)
    neck = make_neckband(body, helpers)
    shoes = make_shoes(body, rig, short)
    # nothing is culled: the tank stands clear of the body everywhere (culled skin left holes at its edges)
    bs._cycles_gpu(bpy.context.scene)
    paint_mask(head, out_dir)
    bpy.context.view_layer.update()   # the egg was made with bpy.data: its world matrix is stale until now
    band = make_band(head, helpers)
    for o in [tank, shorts, tape, band, neck] + shoes:
        bs.bake(o, SIZES.get(o.name, 512))
    for o in [tank, shorts, band, neck] + shoes:
        paint_trims(o)
    logo = os.path.join(os.path.dirname(hi_path), 'ojas_logo.png')
    paint_logo(tank, logo)
    paint_logo(shorts, logo)
    paint_suit(body, short, hi_path, out_dir)
    for m in [m for m in bpy.data.materials if m.users == 0]:
        bpy.data.materials.remove(m)
    bpy.context.scene.render.engine = 'BLENDER_EEVEE'
    return [tank, shorts, tape, band, neck] + shoes
