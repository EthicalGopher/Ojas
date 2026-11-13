"""Arjun improvement, stage 1: joint deformation. Runs in the same Blender session right after build_arjun.py,
so it sees the FBX's full skin weights (before the glTF exporter cuts them to 4) and the clips as NLA tracks.

    blender -b -P scripts/blender/build_arjun.py -P scripts/blender/arjun_improve/stage1_deform.py -- \
        <character.fbx> <textures dir> <clips.glb> <versions dir>/arjun_v0_build.glb <mixamo clips...>

build_arjun.py writes v0 (the unchanged build); this script writes arjun_v1_deform.glb / .blend next to it.
Nothing in the app assets is touched.

1. Helper bones. The Unreal skeleton skins the limbs to twist bones and corrective helpers (calf_kneeBack,
   upperarm_out, thigh_fwd, ...) that Unreal moves with a pose driver. Our clips only move the main bones,
   so the helpers followed their parent rigidly: pinched knees, collapsing armpits, candy-wrapper twists.
   Now, per frame of every clip (solve_helpers, mirrored at runtime by the app's live-pose code):
   - <limb>_correctiveRoot takes half the joint's bend and none of its roll (a half-angle joint), so the
     helpers under it (knee front/back, hip crease, armpit) sit between the two limb segments;
   - twist bones spread the roll along the limb: no roll at the shoulder / hip / knee / elbow, the full
     roll at the far end (for the forearm that includes the hand's roll).
2. Skin weights. three.js takes 4 influences per vertex; the source has up to 18. Instead of dropping the
   smallest (the exporter's way, losing up to 35% of a vertex's weight), each such vertex gets the 4 weights
   that best reproduce its full-weight position over sampled frames of every clip (non-negative, sum 1).
   The error of both methods is measured on held-out frames and printed.
"""
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT_DIR = os.path.dirname(os.path.abspath(argv[3]))
V1 = os.path.join(OUT_DIR, os.environ.get('ARJUN_STAGE1_NAME', 'arjun_v1_deform'))
FIT_WEIGHTS = os.environ.get('ARJUN_STAGE1_FIT', '1') != '0'  # 0: helper bones only (for diagnosis)

scene = bpy.context.scene
arm = bpy.data.objects['CC_rig']
bones, pbs = arm.data.bones, arm.pose.bones
I = Quaternion()

# ------------------------------------------------------------------ helper solver


def swing_twist(q):
    """q = swing @ twist, twist about the bone's own Y (its length). Returns swing, twist angle."""
    t = Quaternion((q.w, 0.0, q.y, 0.0))
    if t.magnitude < 1e-8:
        return q.copy(), 0.0
    t.normalize()
    ang = 2.0 * math.atan2(t.y, t.w)
    ang = (ang + math.pi) % (2 * math.pi) - math.pi
    s = q @ t.inverted()
    if s.w < 0:
        s.negate()
    return s, ang


def rest_rel(parent, child):
    """child's rest orientation in parent's rest frame"""
    return (bones[parent].matrix_local.to_3x3().inverted() @ bones[child].matrix_local.to_3x3()).to_quaternion()


def to_child(r, parent, child):
    """a rotation r in parent's frame, as the child's basis rotation"""
    c = rest_rel(parent, child)
    return c.inverted() @ r @ c


def fraction(bone, a, b):
    """how far bone's head lies along the segment from joint a to joint b (rest pose)"""
    pa, pb_, p = bones[a].head_local, bones[b].head_local, bones[bone].head_local
    d = pb_ - pa
    return max(0.0, min(1.0, (p - pa).dot(d) / d.length_squared))


def half_joint(main):
    """correctiveRoot basis: half the main bone's swing, none of its twist"""
    q = pbs[main].rotation_quaternion.normalized()
    s, _ = swing_twist(q)
    return q.inverted() @ I.slerp(s, 0.5)


def roll(angle):
    return Quaternion((0.0, 1.0, 0.0), angle)


SPEC = []  # (helper, kind, data) -- the same table drives the runtime port
for s in 'lr':
    S = s.upper()
    U, F, H = f'CC_{S}_Upperarm', f'CC_{S}_Forearm', f'CC_{S}_Hand'
    T, K, Ft = f'CC_{S}_Thigh', f'CC_{S}_Calf', f'CC_{S}_Foot'
    SPEC += [
        (f'upperarm_correctiveRoot_{s}', 'half', U),
        (f'lowerarm_correctiveRoot_{s}', 'half', F),
        (f'thigh_correctiveRoot_{s}', 'half', T),
        (f'calf_correctiveRoot_{s}', 'half', K),
    ]
    for i in (1, 2):
        SPEC += [
            (f'upperarm_twist_0{i}_{s}', 'twist', (U, None, fraction(f'upperarm_twist_0{i}_{s}', U, F))),
            (f'lowerarm_twist_0{i}_{s}', 'twist', (F, H, fraction(f'lowerarm_twist_0{i}_{s}', F, H))),
            (f'thigh_twist_0{i}_{s}', 'twist', (T, None, fraction(f'thigh_twist_0{i}_{s}', T, K))),
            (f'calf_twist_0{i}_{s}', 'twist', (K, None, fraction(f'calf_twist_0{i}_{s}', K, Ft))),
        ]
SPEC = [x for x in SPEC if x[0] in bones]
for name, _, _ in SPEC:
    pbs[name].rotation_mode = 'QUATERNION'


def solve_helpers():
    for name, kind, data in SPEC:
        parent = bones[name].parent.name
        if kind == 'half':
            r = half_joint(data)
        else:
            main, child, f = data
            _, own = swing_twist(pbs[main].rotation_quaternion.normalized())
            total = own
            if child:  # the hand's roll, seen about the forearm's axis
                c = rest_rel(main, child)
                qc = c @ pbs[child].rotation_quaternion.normalized() @ c.inverted()
                total += swing_twist(qc)[1]
            r = roll(f * total - own)
        pbs[name].rotation_quaternion = to_child(r, parent, name)


def fcurves(act):
    if hasattr(act, 'fcurves'):
        return act.fcurves
    return act.layers[0].strips[0].channelbag(act.slots[0]).fcurves


def key_times(act):
    fc = next(f for f in fcurves(act) if f.data_path == 'pose.bones["CC_Hip"].rotation_quaternion')
    return [k.co.x for k in fc.keyframe_points]


def set_time(t):
    scene.frame_set(int(math.floor(t)), subframe=t - math.floor(t))


ad = arm.animation_data
clips = [(tr, tr.strips[0].action) for tr in ad.nla_tracks]
t0 = time.time()
for tr, act in clips:
    ad.action = act
    if act.slots and not ad.action_slot:
        ad.action_slot = act.slots[0]
    for t in key_times(act):
        set_time(t)
        solve_helpers()
        for name, _, _ in SPEC:
            pbs[name].keyframe_insert('rotation_quaternion', frame=t)
    ad.action = None
    print('HELPERS', act.name, len(key_times(act)))
print(f'helpers baked into {len(clips)} clips, {len(SPEC)} bones, {time.time() - t0:.0f}s')

# ------------------------------------------------------------------ skin weight fit

bone_names = [b.name for b in bones]
bidx = {n: i for i, n in enumerate(bone_names)}
rest_inv = [b.matrix_local.inverted() for b in bones]


def pose_mats():
    return np.array([np.array(pbs[n].matrix @ rest_inv[i]) for i, n in enumerate(bone_names)])  # B,4,4


samples = []  # all clip key frames, every 3rd
for tr, act in clips:
    ad.action = act
    if act.slots and not ad.action_slot:
        ad.action_slot = act.slots[0]
    for t in key_times(act)[::3]:
        set_time(t)
        samples.append(pose_mats())
    ad.action = None
M = np.stack(samples)  # P,B,4,4
train, test = M[0::2], M[1::2]
print(f'weight fit: {len(train)} training poses, {len(test)} test poses')


def solve(A, t):
    """min |A w - t|, w >= 0, sum w = 1. A: (3P, k). Returns weights, residual."""
    idx = list(range(A.shape[1]))
    while True:
        if len(idx) == 1:
            w = np.array([1.0])
        else:
            last = A[:, idx[-1]]
            D = A[:, idx[:-1]] - last[:, None]
            z = np.linalg.lstsq(D, t - last, rcond=None)[0]
            w = np.append(z, 1.0 - z.sum())
        if (w >= -1e-9).all():
            full = np.zeros(A.shape[1])
            full[idx] = np.clip(w, 0, None)
            full /= full.sum()
            return full, np.linalg.norm(A @ full - t)
        idx.pop(int(np.argmin(w)))


def mesh_report(o):
    me = o.data
    vg = {g.index: g.name for g in o.vertex_groups}
    to_arm = arm.matrix_world.inverted() @ o.matrix_world
    stats = {'n': 0, 'base': [], 'fit': [], 'base_max': 0.0, 'fit_max': 0.0}
    for v in me.vertices:
        inf = [(bidx[vg[g.group]], g.weight) for g in v.groups if g.weight > 1e-4 and vg[g.group] in bidx]
        if len(inf) <= 4:
            continue
        stats['n'] += 1
        inf.sort(key=lambda x: -x[1])
        b = np.array([i for i, _ in inf])
        w = np.array([x for _, x in inf])
        w /= w.sum()
        p = np.append(np.array(to_arm @ v.co), 1.0)
        Gtr = np.einsum('pbij,j->pbi', train[:, b], p)[..., :3]  # P,n,3
        Gte = np.einsum('pbij,j->pbi', test[:, b], p)[..., :3]
        ttr = np.einsum('pni,n->pi', Gtr, w)
        tte = np.einsum('pni,n->pi', Gte, w)
        # baseline: what the exporter does (top 4, renormalised)
        wb = np.zeros_like(w)
        wb[:4] = w[:4] / w[:4].sum()
        eb = np.linalg.norm(np.einsum('pni,n->pi', Gte, wb) - tte, axis=1)
        # fit: top 3 plus the best 4th, weights by constrained least squares
        best = None
        for j in range(3, len(b)):
            S = [0, 1, 2, j]
            A = Gtr[:, S].transpose(0, 2, 1).reshape(-1, 4)
            ws, res = solve(A, ttr.reshape(-1))
            if best is None or res < best[1]:
                best = (S, res, ws)
        S, _, ws = best
        wf = np.zeros_like(w)
        wf[S] = ws
        ef = np.linalg.norm(np.einsum('pni,n->pi', Gte, wf) - tte, axis=1)
        if ef.mean() > eb.mean():  # never worse than the baseline on held-out poses
            wf, ef = wb, eb
        stats['base'].append(eb.mean())
        stats['fit'].append(ef.mean())
        stats['base_max'] = max(stats['base_max'], eb.max())
        stats['fit_max'] = max(stats['fit_max'], ef.max())
        # write: exactly the chosen influences
        keep = {int(b[k]): float(wf[k]) for k in range(len(b)) if wf[k] > 1e-4}
        for g in list(v.groups):
            name = vg[g.group]
            if name in bidx and bidx[name] not in keep:
                o.vertex_groups[g.group].remove([v.index])
        for bi, wt in keep.items():
            o.vertex_groups[bone_names[bi]].add([v.index], wt, 'REPLACE')
    if stats['n']:
        k = 1000 * arm.matrix_world.to_scale()[0]  # armature units -> mm
        mm = lambda a: k * float(np.mean(a))
        print(f"WEIGHTS {o.name}: {stats['n']} verts had >4 influences | mean error exporter-cut "
              f"{mm(stats['base']):.2f} mm -> fitted {mm(stats['fit']):.2f} mm | worst vertex "
              f"{k * stats['base_max']:.1f} mm -> {k * stats['fit_max']:.1f} mm")


t0 = time.time()
for o in [o for o in bpy.data.objects if o.type == 'MESH' and FIT_WEIGHTS]:
    mesh_report(o)
print(f'weights fitted in {time.time() - t0:.0f}s')

# ------------------------------------------------------------------ save the version

scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=V1 + '.blend', compress=True, copy=True)
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=V1 + '.glb', use_selection=True, export_format='GLB', export_image_format='WEBP',
    export_image_quality=88, export_animation_mode='NLA_TRACKS', export_morph=False, export_skins=True,
    export_extras=False, export_yup=True,
)
print('WROTE', V1 + '.glb')
