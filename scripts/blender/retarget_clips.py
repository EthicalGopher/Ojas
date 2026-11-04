"""Retarget the starters' Rocketbox clips, and Mixamo clips, onto a CC-named rig.

Shared by build_fc1.py (Meera's base body) and build_arjun.py (Arjun). The target rig uses CC bone
names (CC_Hip, CC_Waist, CC_Spine01, CC_L_Upperarm, CC_L_Mid1, ...); bones a rig does not have
(Arjun has no CC_Pelvis) are skipped.

Each Rocketbox clip is retargeted in world space: every mapped bone gets the source bone's rotation
away from its rest pose, applied to the target bone after lining its rest direction up with the
source's (the rigs stand in different A-poses), and the hips follow the source pelvis, scaled by leg
length. Fingers get a relaxed curl, baked into every clip. Clips land as muted NLA tracks named
squat / idle / rest / cheer / stand (plus a hero's own hero_idle / hero_move1 / hero_move2, from
author_hero_clips.py), for an export with export_animation_mode='NLA_TRACKS'.

`extra` adds Mixamo FBX clips ({'cheer': 'Cheering.fbx'}), retargeted the same way from the mixamorig
skeleton; one named like a Rocketbox or hero clip replaces it. They are sampled at their own frame rate,
so the timing holds in the 24 fps scene. Spec 'path.fbx,inplace,x6': inplace removes the hips' forward
travel (a run becomes a treadmill run, the app slides the world instead), still removes the upward
travel too (a climb stays at one height, the rock slides down), x6 loops the cycle six times, from=60 and
to=112 keep only those source frames (one clean cycle of a longer take).
On the command line: clip=spec (parse_extra).
"""
import bpy
from mathutils import Matrix, Quaternion


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


# Target CC bone -> its child, for lining up rest directions (None: takes its parent's alignment).
CHAIN = [('Hip', None), ('Pelvis', None), ('Waist', 'Spine01'), ('Spine01', 'Spine02'), ('Spine02', 'NeckTwist01'),
         ('NeckTwist01', 'Head'), ('NeckTwist02', None), ('Head', None)]
for _s in 'LR':
    CHAIN += [(f'{_s}_Clavicle', f'{_s}_Upperarm'), (f'{_s}_Upperarm', f'{_s}_Forearm'), (f'{_s}_Forearm', f'{_s}_Hand'),
              (f'{_s}_Hand', f'{_s}_Mid1'), (f'{_s}_Thigh', f'{_s}_Calf'), (f'{_s}_Calf', f'{_s}_Foot'),
              (f'{_s}_Foot', f'{_s}_ToeBase'), (f'{_s}_Mid1', None), (f'{_s}_ToeBase', None)]

# Source skeletons: CC part -> source bone
ROCKETBOX = {'Hip': 'Bip01 Pelvis', 'Pelvis': 'Bip01 Pelvis', 'Waist': 'Bip01 Spine', 'Spine01': 'Bip01 Spine1',
             'Spine02': 'Bip01 Spine2', 'NeckTwist01': 'Bip01 Neck', 'NeckTwist02': 'Bip01 Neck', 'Head': 'Bip01 Head'}
MIXAMO = {'Hip': 'mixamorig:Hips', 'Pelvis': 'mixamorig:Hips', 'Waist': 'mixamorig:Spine', 'Spine01': 'mixamorig:Spine1',
          'Spine02': 'mixamorig:Spine2', 'NeckTwist01': 'mixamorig:Neck', 'NeckTwist02': 'mixamorig:Neck',
          'Head': 'mixamorig:Head'}
for _s, _side in (('L', 'Left'), ('R', 'Right')):
    ROCKETBOX.update({f'{_s}_Clavicle': f'Bip01 {_s} Clavicle', f'{_s}_Upperarm': f'Bip01 {_s} UpperArm',
                      f'{_s}_Forearm': f'Bip01 {_s} Forearm', f'{_s}_Hand': f'Bip01 {_s} Hand',
                      f'{_s}_Mid1': f'Bip01 {_s} Finger2', f'{_s}_Thigh': f'Bip01 {_s} Thigh',
                      f'{_s}_Calf': f'Bip01 {_s} Calf', f'{_s}_Foot': f'Bip01 {_s} Foot', f'{_s}_ToeBase': f'Bip01 {_s} Toe0'})
    MIXAMO.update({f'{_s}_Clavicle': f'mixamorig:{_side}Shoulder', f'{_s}_Upperarm': f'mixamorig:{_side}Arm',
                   f'{_s}_Forearm': f'mixamorig:{_side}ForeArm', f'{_s}_Hand': f'mixamorig:{_side}Hand',
                   f'{_s}_Mid1': f'mixamorig:{_side}HandMiddle1', f'{_s}_Thigh': f'mixamorig:{_side}UpLeg',
                   f'{_s}_Calf': f'mixamorig:{_side}Leg', f'{_s}_Foot': f'mixamorig:{_side}Foot',
                   f'{_s}_ToeBase': f'mixamorig:{_side}ToeBase'})
# bones only used to aim a parent, not posed themselves
AIM_ONLY = {'L_Mid1', 'R_Mid1', 'L_ToeBase', 'R_ToeBase'}


def import_fbx_clip(path):
    """A Mixamo FBX (animation only): its armature and action, the scene kept at its own frame rate."""
    scene = bpy.context.scene
    fps = scene.render.fps
    before = set(bpy.data.objects)
    actions_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path)
    src_fps = scene.render.fps  # the importer switches the scene to the file's rate
    scene.render.fps = fps
    objs = [o for o in bpy.data.objects if o not in before]
    for o in objs:
        if o.type == 'MESH':
            bpy.data.objects.remove(o)
    arm = next(o for o in objs if o.type == 'ARMATURE')
    action = next(a for a in bpy.data.actions if a not in actions_before)
    return arm, action, src_fps / fps


def parse_extra(args):
    """['cheer=Cheering.fbx', 'hero_move1=Run.fbx,inplace,x6'] -> {'cheer': ('Cheering.fbx', False, 1), ...}"""
    out = {}
    for a in args:
        name, spec = a.split('=', 1)
        parts = spec.split(',')
        repeat = next((int(p[1:]) for p in parts[1:] if p.startswith('x')), 1)
        mode = 'still' if 'still' in parts[1:] else 'inplace' if 'inplace' in parts[1:] else None
        rng = tuple(next((float(p.split('=')[1]) for p in parts[1:] if p.startswith(k + '=')), None) for k in ('from', 'to'))
        out[name] = (parts[0], mode, repeat, rng)
    return out


def retarget_clips(tgt, clips_path, extra=None):
    scene = bpy.context.scene
    src_objects = import_glb(clips_path)
    src = next(o for o in src_objects if o.type == 'ARMATURE')
    for o in src_objects:
        if o.type == 'MESH':
            bpy.data.objects.remove(o)
    extra = extra or {}
    for a in [a for a in bpy.data.actions if a.name.lower() in extra]:
        bpy.data.actions.remove(a)  # replaced by a Mixamo clip
    clips = [a for a in bpy.data.actions
             if (a.name.lower() in ('squat', 'idle', 'rest', 'cheer', 'stand') or a.name.startswith('hero_'))
             and a.name.lower() not in extra]
    for a in clips:
        a.name = 'src_' + a.name.lower()
    print('CLIPS', [a.name for a in clips])
    _bake(tgt, src, clips, ROCKETBOX, 1.0)
    bpy.data.objects.remove(src)
    for a in clips:
        bpy.data.actions.remove(a)
    for name, (path, inplace, repeat, rng) in extra.items():
        arm, action, rate = import_fbx_clip(path)
        action['range'] = [v if v is not None else d for v, d in zip(rng, action.frame_range)]
        action.name = 'src_' + name
        print('MIXAMO', name, path, 'rate', rate, 'inplace', inplace, 'x', repeat)
        _bake(tgt, arm, [action], MIXAMO, rate, inplace, repeat)
        bpy.data.objects.remove(arm)
        bpy.data.actions.remove(action)
    for pb in tgt.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)


def _bake(tgt, src, clips, names, rate, inplace=False, repeat=1):
    """Bake each source clip onto tgt as a muted NLA track. rate: source frames per target frame;
    inplace: cancel the hips' horizontal travel over the clip; repeat: loop the cycle this many times."""
    scene = bpy.context.scene
    # target bone, source bone, (target child, source child) for the rest-direction alignment
    MAP = {}
    for t, child in CHAIN:
        if t in AIM_ONLY or t not in names:
            continue
        d = (('CC_' + child, names[child]) if child and child in names else None)
        MAP['CC_' + t] = (names[t], d)
    MAP = {t: (sname, d if d and d[0] in tgt.data.bones and d[1] in src.data.bones else None)
           for t, (sname, d) in MAP.items() if t in tgt.data.bones and sname in src.data.bones}
    S_W, T_W = src.matrix_world.copy(), tgt.matrix_world.copy()
    T_Wq = T_W.to_3x3().normalized().to_quaternion()


    def rest_world(arm, W, name):
        return W @ arm.data.bones[name].matrix_local


    def world_rot(m):
        return m.to_3x3().normalized().to_quaternion()


    # Rest alignment per mapped bone: turns the target rest direction onto the source rest direction.
    align = {}
    for tname, (sname, dirs) in MAP.items():
        if dirs:
            vt = rest_world(tgt, T_W, dirs[0]).translation - rest_world(tgt, T_W, tname).translation
            vs = rest_world(src, S_W, dirs[1]).translation - rest_world(src, S_W, sname).translation
            align[tname] = vt.rotation_difference(vs)
    for tname in MAP:  # undirected bones take their nearest mapped ancestor's alignment
        if tname not in align:
            b = tgt.data.bones[tname].parent
            while b and b.name not in align:
                b = b.parent
            align[tname] = align[b.name].copy() if b else Quaternion()

    src_rest_q = {sname: world_rot(rest_world(src, S_W, sname)) for sname, _ in MAP.values()}
    tgt_rest_q = {t: world_rot(rest_world(tgt, T_W, t)) for t in MAP}
    hip_src_rest = rest_world(src, S_W, names['Hip']).translation
    hip_tgt_rest = rest_world(tgt, T_W, 'CC_Hip').translation
    leg_ratio = hip_tgt_rest.z / hip_src_rest.z

    order = []


    def walk(b):
        order.append(b)
        for c in b.children:
            walk(c)


    for b in tgt.data.bones:
        if not b.parent:
            walk(b)

    if not tgt.animation_data:
        tgt.animation_data_create()
    for pb in tgt.pose.bones:
        pb.rotation_mode = 'QUATERNION'

    # Relaxed hands, baked into every clip so any page that plays them (the duel and AI views too) gets
    # natural fingers. Same curl as the app's runtime (avatarViewerHtml.ts collectCcFingers): each joint
    # bends across the finger toward the palm; the palm normal comes from the knuckles and the hand.
    CURL = {1: 0.3, 2: 0.5, 3: 0.32}
    THUMB_CURL = {1: 0.0, 2: 0.22, 3: 0.18}
    FINGERS = {'Thumb': 0, 'Index': 1, 'Mid': 2, 'Ring': 3, 'Pinky': 4}


    def finger_curls():
        def head(n):
            return T_W @ tgt.data.bones[n].head_local
        curls = {}
        for s in 'LR':
            across = (head(f'CC_{s}_Pinky1') - head(f'CC_{s}_Index1')).normalized()
            fwd = (head(f'CC_{s}_Mid1') - head(f'CC_{s}_Hand')).normalized()
            palm = (across.cross(fwd) if s == 'L' else fwd.cross(across)).normalized()
            thumb_toward = (palm * 0.5 + across).normalized()
            for name, finger in FINGERS.items():
                direction = None
                for i in (1, 2, 3):
                    bn = f'CC_{s}_{name}{i}'
                    if bn not in tgt.data.bones:
                        continue
                    nxt = f'CC_{s}_{name}{i + 1}'
                    if nxt in tgt.data.bones:
                        direction = (head(nxt) - head(bn)).normalized()
                    if direction is None:
                        continue
                    axis = direction.cross(thumb_toward if finger == 0 else palm).normalized()
                    rest = (T_W.to_3x3() @ tgt.data.bones[bn].matrix_local.to_3x3()).normalized()
                    local = (rest.inverted() @ axis).normalized()
                    angle = THUMB_CURL[i] if finger == 0 else CURL[i] + (0.12 if finger == 4 else 0.06 if finger == 3 else 0)
                    curls[bn] = Quaternion(local, angle)
        return curls


    FINGER_CURL = finger_curls()

    for clip in clips:
        src.animation_data.action = clip
        if clip.slots and not src.animation_data.action_slot:
            src.animation_data.action_slot = clip.slots[0]
        out = bpy.data.actions.new(clip.name[len('src_'):])
        out.use_fake_user = True
        tgt.animation_data.action = out
        start, end = clip.get('range', clip.frame_range)
        cycle = (end - start) / rate  # target frames per cycle
        length = cycle * repeat
        frames = [float(f) for f in range(0, int(length) + 1)]
        if length - frames[-1] > 1e-3:
            frames.append(length)
        travel = None
        if inplace:
            hb = names['Hip']
            scene.frame_set(int(start))
            a = (S_W @ src.pose.bones[hb].matrix).translation.copy()
            scene.frame_set(int(end))
            travel = (S_W @ src.pose.bones[hb].matrix).translation - a
            if inplace != 'still':
                travel.z = 0.0
            # and the hips start over the feet's spot, wherever the cycle was cut from the take
            offset = a - hip_src_rest
            offset.z = 0.0
        prev = {}
        for f in frames:
            u = (f % cycle) / cycle if f < length else 1.0
            sf = start + u * (end - start)
            scene.frame_set(int(sf), subframe=sf - int(sf))
            P = {}
            for b in order:
                rest_rel = (b.parent.matrix_local.inverted() @ b.matrix_local) if b.parent else b.matrix_local
                parent_P = P[b.parent.name] if b.parent else Matrix.Identity(4)
                pose = parent_P @ rest_rel
                if b.name in MAP:
                    sname = MAP[b.name][0]
                    s_now = S_W @ src.pose.bones[sname].matrix
                    delta = world_rot(s_now) @ src_rest_q[sname].inverted()
                    q = T_Wq.inverted() @ delta @ align[b.name] @ tgt_rest_q[b.name]
                    loc = pose.translation
                    if b.name == 'CC_Hip':
                        here = s_now.translation - (travel * u + offset if travel is not None else 0 * s_now.translation)
                        moved = hip_tgt_rest + (here - hip_src_rest) * leg_ratio
                        loc = T_W.inverted() @ moved
                    pose = Matrix.Translation(loc) @ q.to_matrix().to_4x4()
                P[b.name] = pose
                if b.name not in MAP:
                    continue
                basis = rest_rel.inverted() @ parent_P.inverted() @ pose
                pb = tgt.pose.bones[b.name]
                rq = basis.to_quaternion()
                if b.name in prev:
                    rq.make_compatible(prev[b.name])
                prev[b.name] = rq
                pb.rotation_quaternion = rq
                pb.keyframe_insert('rotation_quaternion', frame=f)
                if b.name == 'CC_Hip':
                    pb.location = basis.translation
                    pb.keyframe_insert('location', frame=f)
        for bn, q in FINGER_CURL.items():
            pb = tgt.pose.bones[bn]
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=frames[0])
            pb.keyframe_insert('rotation_quaternion', frame=frames[-1])
        track = tgt.animation_data.nla_tracks.new()
        track.name = out.name
        track.strips.new(out.name, 0, out)
        track.mute = True
        tgt.animation_data.action = None
        print('CLIP', out.name, len(frames))
