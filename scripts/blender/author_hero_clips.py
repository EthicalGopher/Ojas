"""Author each hero's own clips on the starters' Rocketbox rig, next to the shared ones.

    blender -b --python scripts/blender/author_hero_clips.py -- <ojas_female.glb> <meera|arjun> <out.glb>

<ojas_female.glb> the Rocketbox avatar that carries the shared clips (squat / idle / rest / cheer / stand)
<hero>            whose clips to add
<out.glb>         the same rig with the shared clips plus the hero's: hero_idle (the loop the hero plays
                  whenever they are on screen, so they never just stand), hero_move1 and hero_move2
                  (their signature moves), and hero_world for a hero whose world needs its own loop
                  (Arjun on the rock face). build_fc1.py / build_arjun.py retarget it onto the hero.

Poses are body targets, as in the instructor's author_poses.py: hip-centre position, torso lean, arm
directions (or a wrist target solved with arm IK), finger curl. Legs are solved with 2-bone IK onto
the feet; a foot can rise onto its ball (`heels`) or lift off the floor (`lift`). Arm settings take
{'L': ..., 'R': ...} for a different pose per side.

Armature space of this rig: centimetres, +Z up, +X forward, +Y the character's left; the pelvis is
at the origin. Frames are at 24 fps (the glTF importer's rate for the shared clips).
"""
import math
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, HERO, OUT = argv[:3]
assert HERO in ('meera', 'arjun'), HERO

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
bpy.ops.import_scene.gltf(filepath=SRC)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
bpy.context.view_layer.objects.active = arm
shared = list(bpy.data.actions)
P = arm.pose.bones
B = 'Bip01 '
REST = {b.name: b.head_local.copy() for b in arm.data.bones}
FWD, UPV = Vector((1, 0, 0)), Vector((0, 0, 1))
SIDES = {'L': 1, 'R': -1}  # +Y is the character's left


def upd():
    bpy.context.view_layer.update()


def reset():
    for pb in P:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    upd()


def aim(name, target, child=None):
    """Rotate bone `name` (armature space, minimal rotation) so it points along `target`."""
    pb = P[name]
    cur = (P[child].head - pb.head) if child else (pb.tail - pb.head)
    q = cur.normalized().rotation_difference(Vector(target).normalized())
    m = pb.matrix.copy()
    pb.matrix = Matrix.Translation(m.translation) @ q.to_matrix().to_4x4() @ m.to_3x3().to_4x4()
    upd()


def turn(name, q):
    pb = P[name]
    m = pb.matrix.copy()
    pb.matrix = Matrix.Translation(m.translation) @ q.to_matrix().to_4x4() @ m.to_3x3().to_4x4()
    upd()


def tilt(deg):
    a = math.radians(deg)
    return Vector((math.sin(a), 0.0, math.cos(a)))


def two_bone(T, A, L1, L2, hint):
    d = min((A - T).length, (L1 + L2) * 0.9995)
    axis = (A - T).normalized()
    along = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
    perp = math.sqrt(max(0.0, L1 * L1 - along * along))
    h = (hint - axis * hint.dot(axis)).normalized()
    return T + axis * along + h * perp


def side(v, s):
    return v[s] if isinstance(v, dict) else v


def mirror(v, s):
    return Vector((v[0], SIDES[s] * v[1], v[2]))


LEN = {s: ((REST[B + f'{s} Calf'] - REST[B + f'{s} Thigh']).length,
           (REST[B + f'{s} Foot'] - REST[B + f'{s} Calf']).length) for s in SIDES}
ARM_LEN = {s: ((REST[B + f'{s} Forearm'] - REST[B + f'{s} UpperArm']).length,
               (REST[B + f'{s} Hand'] - REST[B + f'{s} Forearm']).length) for s in SIDES}
STANCE = {'meera': 4.0, 'arjun': 7.0}[HERO]  # cm wider than the rest stance, each side
ANKLE = {s: REST[B + f'{s} Foot'] + Vector((0, SIDES[s] * STANCE, 0)) for s in SIDES}
BALL = {s: REST[B + f'{s} Toe0'] + Vector((0, SIDES[s] * STANCE, 0)) for s in SIDES}
TOE_DIR = {s: REST[B + f'{s} Toe0'] - REST[B + f'{s} Foot'] for s in SIDES}
FINGERS = ['Finger1', 'Finger2', 'Finger3', 'Finger4']


def _palm_local(s):
    a, b, c = (REST[B + f'{s} Finger2{k}'] for k in ('', '1', '2'))
    d1, d2 = (b - a).normalized(), (c - b).normalized()
    n = d2 - d1
    n = (n - d1 * n.dot(d1)).normalized()
    return arm.data.bones[B + f'{s} Hand'].matrix_local.to_3x3().inverted() @ n


PALM_LOCAL = {s: _palm_local(s) for s in SIDES}


def hip_mid():
    return (P[B + 'L Thigh'].head + P[B + 'R Thigh'].head) / 2


def pose(hip, lean, neck, head, upper=None, fore=None, hand=None, curl=8.0, thumb=8.0, pelvis_lean=None,
         sway=0.0, look=0.0, wrist=None, elbow=None, heels=None, lift=None, feet=None):
    """hip: hip-joint centre (fwd, up) in cm; lean: torso degrees forward of vertical; neck/head: degrees
    forward of vertical / extra head pitch (+ looks down); upper/fore/hand: arm directions (fwd, out, up),
    `out` mirrored per side; wrist: wrist target (fwd, out, up) from the hip centre, solved with arm IK
    toward the `elbow` hint; curl/thumb: finger curl in degrees; sway: hips to the left in cm; look: head
    turn to the left in degrees; heels: {side: cm} up onto the ball of the foot; lift: {side: (fwd, up)}
    cm, the ankle off the floor with the toes pointing a little down; feet: {side: (fwd, up, pitch)}, the
    ankle moved by (fwd, up) cm with the toes pitched down `pitch` degrees (a gait frame). Arm keys may
    be {'L':, 'R':}."""
    reset()
    heels, lift, feet = heels or {}, lift or {}, feet or {}
    pel = B + 'Pelvis'
    target = Vector((hip[0], sway, hip[1]))
    for _ in range(4):  # place the pelvis so the hip joints land on the target after the spine tilts
        for n in ('Pelvis', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'):
            P[B + n].rotation_quaternion = Quaternion()
        upd()
        aim(pel, tilt(lean if pelvis_lean is None else pelvis_lean), B + 'Spine')
        aim(B + 'Spine', tilt(lean), B + 'Spine1')
        aim(B + 'Spine1', tilt(lean * 0.95), B + 'Spine2')
        aim(B + 'Spine2', tilt(lean * 0.9), B + 'Neck')
        aim(B + 'Neck', tilt(neck), B + 'Head')
        if head:
            turn(B + 'Head', Quaternion(Vector((0, 1, 0)), math.radians(head)))
        if look:
            turn(B + 'Head', Quaternion(UPV, math.radians(look)))
        err = target - hip_mid()
        if err.length < 0.05:
            break
        m = P[pel].matrix.copy()
        m.translation += err
        P[pel].matrix = m
        upd()
    for s, sg in SIDES.items():
        T = P[B + f'{s} Thigh'].head.copy()
        A = ANKLE[s].copy()
        toe = TOE_DIR[s].copy()
        if s in feet:
            A += Vector((feet[s][0], 0, feet[s][1]))
            toe = Quaternion(Vector((0, 1, 0)), math.radians(feet[s][2])) @ toe
        elif s in lift:
            A += Vector((lift[s][0], 0, lift[s][1]))
            toe = Quaternion(Vector((0, 1, 0)), math.radians(30)) @ toe  # toes a little down
        elif heels.get(s):
            A += Vector((0, 0, heels[s]))
            toe = BALL[s] - A  # the ball stays on the floor
        flat = TOE_DIR[s].copy()
        flat.z = 0
        hint = (flat.normalized() + Vector((0, sg * 0.15, 0))).normalized()  # knees over the toes
        K = two_bone(T, A, *LEN[s], hint)
        aim(B + f'{s} Thigh', K - T, B + f'{s} Calf')
        aim(B + f'{s} Calf', A - P[B + f'{s} Calf'].head, B + f'{s} Foot')
        aim(B + f'{s} Foot', toe, B + f'{s} Toe0')

        w = side(wrist, s)
        if w:
            S_ = P[B + f'{s} UpperArm'].head.copy()
            W = hip_mid() + mirror(w, s)
            E = two_bone(S_, W, *ARM_LEN[s], mirror(side(elbow, s), s))
            aim(B + f'{s} UpperArm', E - S_, B + f'{s} Forearm')
            aim(B + f'{s} Forearm', W - P[B + f'{s} Forearm'].head, B + f'{s} Hand')
        else:
            aim(B + f'{s} UpperArm', mirror(side(upper, s), s), B + f'{s} Forearm')
            aim(B + f'{s} Forearm', mirror(side(fore, s), s), B + f'{s} Hand')
        aim(B + f'{s} Hand', mirror(side(hand, s), s), B + f'{s} Finger2')
        palm = (P[B + f'{s} Hand'].matrix.to_3x3() @ PALM_LOCAL[s]).normalized()
        c = side(curl, s)
        for f in FINGERS:
            chain = [B + f'{s} {f}', B + f'{s} {f}1', B + f'{s} {f}2']
            for i, n in enumerate(chain):
                child = chain[i + 1] if i + 1 < len(chain) else None
                cur = ((P[child].head - P[n].head) if child else (P[n].tail - P[n].head)).normalized()
                aim(n, Quaternion(cur.cross(palm).normalized(), math.radians(c * (0.75, 1.0, 0.7)[i])) @ cur, child)
        th = side(thumb, s)
        tchain = [B + f'{s} Finger0', B + f'{s} Finger01', B + f'{s} Finger02']
        for i, n in enumerate(tchain):
            child = tchain[i + 1] if i + 1 < len(tchain) else None
            cur = ((P[child].head - P[n].head) if child else (P[n].tail - P[n].head)).normalized()
            aim(n, Quaternion(cur.cross(palm).normalized(), math.radians(th * (0.5, 0.35, 0.3)[i])) @ cur, child)


def with_(base, **kw):
    out = dict(base)
    out.update(kw)
    return out


# ---------------------------------------------------------------- gaits

def ground_up(s, pitch):
    """How far the ankle rises when the foot pitches toes-down `pitch` degrees with its ball on the floor."""
    toe = Quaternion(Vector((0, 1, 0)), math.radians(pitch)) @ TOE_DIR[s]
    return max(0.0, -TOE_DIR[s].z + toe.z) if pitch > 0 else 0.0


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def gait(phi, g, look=0.0):
    """One frame of a treadmill gait at cycle phase `phi` (0 = left foot landing in front): the body stays
    over the spot while the feet travel under it, so a loop reads as running or walking without moving
    off the stage. g: stride (cm, foot travel during stance), front (share of it ahead of the hips), stance
    (share of the cycle a foot is down: < 0.5 runs, with a flight phase), lift (swing height), kick (heel
    tuck toward the seat early in the swing), land / push (toe pitch at landing / toe-off), hip (base
    height), bob (+ highest at mid-stance, a walk; - lowest, a run), lean, arm (swing degrees; bias tips
    the whole swing back), elbow
    (bend), out (arms from the body), curl."""
    feet, upper, fore, hand = {}, {}, {}, {}
    for s, off in (('L', 0.0), ('R', 0.5)):
        q = (phi + off) % 1.0
        st = g['stance']
        if q < st:  # foot down, sliding back under the body
            u = q / st
            x = g['stride'] * (g['front'] - u)
            pitch = g['land'] + (g['push'] - g['land']) * smooth((u - 0.55) / 0.45)
            up = ground_up(s, pitch)
        else:  # swing: heel tucks up behind, the knee drives through, the foot reaches forward
            u = (q - st) / (1 - st)
            x = g['stride'] * (g['front'] - 1 + (1 - math.cos(math.pi * u)) / 2)
            z = g['lift'] * math.sin(math.pi * min(1.0, u * 1.15)) + g['kick'] * math.sin(math.pi * min(1.0, u * 1.8))
            x -= g['kick'] * 0.6 * math.sin(math.pi * min(1.0, u * 1.8))
            pitch = g['push'] + (g['land'] - g['push']) * smooth(u * 1.3)
            up = ground_up(s, pitch) + max(0.0, z)
        feet[s] = (x, up, pitch)
        # arms swing against the legs: the right arm forward as the left foot lands
        a = math.radians(g.get('bias', 0.0) + g['arm'] * math.cos(2 * math.pi * (phi + off + 0.5)))
        e = math.radians(g['elbow'])
        upper[s] = (math.sin(a), g['out'], -math.cos(a))
        fore[s] = (math.sin(a + e), g['out'] * 0.4, -math.cos(a + e))
        hand[s] = (math.sin(a + e + 0.15), 0.0, -math.cos(a + e + 0.15))
    st = g['stance']
    hz = g['hip'] + g['bob'] * math.cos(4 * math.pi * (phi - st / 2))
    return dict(hip=(0.0, hz), lean=g['lean'], neck=g['lean'] + 6.0, head=4.0 - g['lean'] * 0.3, look=look,
                feet=feet, upper=upper, fore=fore, hand=hand, curl=g['curl'], thumb=20.0)


def blend_gait(a, b, k):
    return {key: a[key] + (b[key] - a[key]) * k for key in a}


def run_gait(keys, start, gaits, frames, phase=0.0, look=lambda f: 0.0):
    """Key a gait every frame from `start` for `frames` frames; gaits(t) gives the gait and its cycle
    length in frames at t (0..1), so speed and stride can change smoothly. Returns the end phase."""
    for i in range(frames + 1):
        g, period = gaits(i / frames)
        keys.append((start + i, gait(phase, g, look(i))))
        phase += 1.0 / period
    return phase - 1.0 / period


# ---------------------------------------------------------------- shared pieces

STAND = dict(hip=(0.0, -1.2), lean=2.0, neck=12.0, head=10.0,
             upper=(0.10, 0.11, -1.0), fore=(0.28, 0.02, -1.0), hand=(0.22, -0.04, -1.0), curl=7.0, thumb=6.0)
HIPS = dict(STAND, hip=(0.0, -1.5), lean=3.0, neck=16.0, head=10.0, wrist=(1.0, 19.0, 6.0),
            elbow=(-0.55, 1.0, -0.1), hand=(0.35, -0.45, -0.75), curl=8.0, thumb=30.0)
FISTS_UP = dict(STAND, hip=(0.0, -1.0), lean=-3.0, neck=2.0, head=-14.0, upper=(0.12, 0.42, 0.9),
                fore=(0.05, 0.22, 1.0), hand=(0.08, 0.2, 1.0), curl=100.0, thumb=70.0)
FISTS_PUMP = dict(FISTS_UP, hip=(-1.5, -5.0), lean=1.0, head=-8.0, upper=(0.15, 0.62, 0.55), fore=(0.1, -0.15, 1.0))

# ---------------------------------------------------------------- Meera: the comeback sprinter

if HERO == 'meera':
    # Her loop is a run: an easy jog, forefoot landings, arms driving at 90 degrees.
    JOG = dict(stride=44.0, front=0.42, stance=0.35, lift=12.0, kick=20.0, land=14.0, push=40.0, hip=-7.0,
               bob=-1.8, lean=11.0, arm=44.0, elbow=88.0, out=0.14, curl=40.0)
    # Flat out: longer strides, higher knees and heel recovery, a deeper lean, big arm drive.
    SPRINT = dict(stride=58.0, front=0.38, stance=0.3, lift=16.0, kick=24.0, land=18.0, push=48.0, hip=-10.0,
                  bob=-2.4, lean=16.0, arm=58.0, elbow=92.0, out=0.1, curl=20.0)
    JOG_T, SPRINT_T = 16.0, 11.0  # frames per cycle (two steps)

    IDLE = []
    run_gait(IDLE, 0, lambda t: (JOG, JOG_T), 64, look=lambda f: 14.0 * math.sin(2 * math.pi * f / 64))

    # Full Sprint: from her jog she winds up to a flat-out sprint, holds it, and eases back down.
    def speed(t):
        k = smooth(t / 0.25) * (1 - smooth((t - 0.75) / 0.25))
        return blend_gait(JOG, SPRINT, k), JOG_T + (SPRINT_T - JOG_T) * k
    MOVE1 = []
    run_gait(MOVE1, 0, speed, 132)

    # Finish Line: sprint to the line, dip at the tape, arms up in a V, then one fist to the sky.
    DIP = with_(STAND, hip=(-7.0, -8.0), lean=30.0, pelvis_lean=20.0, neck=26.0, head=-6.0,
                feet={'L': (24.0, 0.0, 0.0), 'R': (-26.0, ground_up('R', 40.0), 40.0)},
                upper=(-0.55, 0.22, -0.8), fore=(-0.5, 0.15, -0.85), hand=(-0.45, 0.1, -0.88), curl=20.0)
    V = with_(STAND, hip=(0.0, -0.8), lean=-4.0, neck=0.0, head=-16.0, upper=(0.12, 0.6, 0.8),
              fore=(0.05, 0.5, 0.86), hand=(0.05, 0.45, 0.9), curl=10.0, thumb=8.0)
    V_BOUNCE = with_(V, hip=(0.0, 1.8), heels={'L': 3.0, 'R': 3.0})
    POINT = with_(STAND, hip=(0.0, -1.0), lean=-2.0, neck=4.0, head=-12.0, look=-10.0,
                  upper={'L': (0.1, 0.14, -1.0), 'R': (0.25, 0.2, 0.95)}, fore={'L': (0.3, 0.02, -1.0), 'R': (0.15, 0.08, 1.0)},
                  hand={'L': (0.2, -0.04, -1.0), 'R': (0.1, 0.05, 1.0)}, curl={'L': 10.0, 'R': 95.0}, thumb={'L': 8.0, 'R': 60.0})
    MOVE2 = []
    run_gait(MOVE2, 0, lambda t: (blend_gait(JOG, SPRINT, smooth(t / 0.4)), JOG_T + (SPRINT_T - JOG_T) * smooth(t / 0.4)), 44)
    MOVE2 += [(52, DIP), (62, DIP), (78, V), (85, V_BOUNCE), (92, V), (99, V_BOUNCE), (106, V), (118, POINT), (140, POINT)]

# ---------------------------------------------------------------- Arjun: the mountain trekker

else:
    # His loop is the trail: a steady uphill hike, high flat-footed steps, leaning into the slope.
    HIKE = dict(stride=40.0, front=0.48, stance=0.6, lift=24.0, kick=6.0, land=0.0, push=30.0, hip=-6.0,
                bob=1.4, lean=13.0, arm=26.0, bias=-14.0, elbow=24.0, out=0.16, curl=55.0)
    PUSH = dict(HIKE, stride=46.0, lift=22.0, lean=17.0, arm=34.0, hip=-7.0)  # the last push to the top
    HIKE_T = 28.0
    BASE = with_(STAND, hip=(0.0, -2.2), lean=1.0, curl=16.0, thumb=12.0)
    HIPS_A = with_(HIPS, hip=(0.0, -2.4), wrist=(1.5, 21.0, 6.0))
    # A hand over his brow, scanning the ridge; the other hand on his hip.
    SHADE = with_(HIPS_A, lean=0.0, neck=6.0, head=-6.0,
                  wrist={'L': (1.5, 21.0, 6.0), 'R': (17.0, 13.0, 73.0)},
                  elbow={'L': (-0.55, 1.0, -0.1), 'R': (0.35, 1.0, -0.2)},
                  hand={'L': (0.35, -0.45, -0.75), 'R': (0.45, -0.9, 0.12)}, curl={'L': 8.0, 'R': 4.0},
                  thumb={'L': 30.0, 'R': 6.0})
    SHADE_L = with_(SHADE, look=30.0)
    SHADE_R = with_(SHADE, look=-24.0)

    # Hike four cycles, stop to scan the ridge, and set off again (the loop ends where it starts).
    IDLE = []
    run_gait(IDLE, 0, lambda t: (HIKE, HIKE_T), 112, look=lambda f: 10.0 * math.sin(2 * math.pi * f / 112))
    IDLE += [(124, SHADE), (138, SHADE_L), (156, SHADE_L), (172, SHADE_R), (190, SHADE_R), (204, SHADE)]
    IDLE += [(216, IDLE[0][1])]

    # Rock Scramble: up a steep face, a hand reaching high for the next hold as the opposite knee drives up,
    # then pulling down as that foot pushes the body up.
    def scramble(reach):
        o = 'R' if reach == 'L' else 'L'
        return with_(BASE, hip=(2.0, -9.0), lean=24.0, neck=18.0, head=-14.0,
                     feet={o: (16.0, 30.0, 10.0), reach: (-8.0, ground_up(reach, 25.0), 25.0)},
                     upper={reach: (0.45, 0.2, 0.87), o: (0.35, 0.3, -0.55)},
                     fore={reach: (0.35, 0.12, 0.93), o: (0.85, -0.1, 0.35)},
                     hand={reach: (0.3, 0.05, 0.95), o: (0.8, -0.2, 0.5)},
                     curl={reach: 30.0, o: 85.0}, thumb={reach: 20.0, o: 60.0})
    def pull(side_):
        o = 'R' if side_ == 'L' else 'L'
        return with_(BASE, hip=(1.0, -4.0), lean=20.0, neck=16.0, head=-10.0,
                     feet={o: (8.0, 6.0, 5.0)},
                     upper={side_: (0.5, 0.25, -0.2), o: (0.4, 0.22, 0.2)},
                     fore={side_: (0.75, -0.1, 0.6), o: (0.6, -0.05, 0.75)},
                     hand={side_: (0.7, -0.2, 0.6), o: (0.5, -0.1, 0.85)}, curl=85.0, thumb=60.0)
    MOVE1 = []
    run_gait(MOVE1, 0, lambda t: (HIKE, HIKE_T), 14)
    f = 26
    for i in range(6):
        side_ = 'L' if i % 2 == 0 else 'R'
        MOVE1 += [(f, scramble(side_)), (f + 9, pull(side_))]
        f += 16
    MOVE1 += [(f + 8, IDLE[0][1])]
    # On the rock face (his world in the app): the scramble as a loop, reach and pull, left then right.
    # A stand-in until a mocap climb replaces it (Makefile ARJUN_MIXAMO hero_world=...).
    WORLD = [(0, scramble('L')), (10, pull('L')), (18, scramble('R')), (28, pull('R')), (36, scramble('L'))]

    # Peak Reached: the last hard steps to the top, a long look across the valley, then both fists up.
    MOVE2 = []
    run_gait(MOVE2, 0, lambda t: (blend_gait(HIKE, PUSH, smooth(t / 0.3)), HIKE_T - 4 * smooth(t / 0.3)), 72)
    MOVE2 += [(86, SHADE), (100, SHADE_L), (114, SHADE), (126, FISTS_UP), (133, FISTS_PUMP), (140, FISTS_UP),
              (147, FISTS_PUMP), (154, FISTS_UP), (168, FISTS_UP), (182, HIPS_A)]

CLIPS = {'hero_idle': IDLE, 'hero_move1': MOVE1, 'hero_move2': MOVE2}
if HERO == 'arjun':
    CLIPS['hero_world'] = WORLD

# ---------------------------------------------------------------- write

new = []
arm.animation_data_create()
for name, keys in CLIPS.items():
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    for frame, p in keys:
        pose(**p)
        for pb in P:
            pb.keyframe_insert('rotation_quaternion', frame=frame)
            pb.keyframe_insert('location', frame=frame)
    new.append(act)
    print('AUTHORED', name, keys[-1][0], 'frames')
arm.animation_data.action = None

# every clip as its own NLA track, so the exporter writes each as an animation
for tr in list(arm.animation_data.nla_tracks):
    arm.animation_data.nla_tracks.remove(tr)
for act in shared + new:
    tr = arm.animation_data.nla_tracks.new()
    tr.name = act.name
    tr.strips.new(act.name, int(act.frame_range[0]), act)
reset()
scene.frame_start, scene.frame_end = 0, max(int(a.frame_range[1]) for a in shared + new)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animation_mode='NLA_TRACKS',
                          export_force_sampling=True, export_morph=False, export_image_format='AUTO')
print('WROTE', OUT)
