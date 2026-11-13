"""Arjun improvement, stage 6: his face reshaped toward his film (longer lower face, narrower jaw,
firmer chin).

    blender -b <versions>/arjun_v5_film.blend -P scripts/blender/arjun_improve/stage6_face.py -- <out.blend> [stretch narrow chin]

One smooth displacement field over the head, in the bind pose (world metres, the face looks along -Y):
- the lower face stretches down: nothing moves at the eyes, the chin moves STRETCH down, and the throat
  under it follows, fading out at the base of the neck;
- the jaw and cheeks narrow by NARROW (a fraction of their width), most at jaw level;
- the chin comes forward by CHIN.
It is applied to every mesh on the head (skin, mouth, eyes, brows, lashes, hair), and to every shape key
as the basis's displacement, so the ARKit expressions keep their exact deltas.
"""
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
OUT = args[0]
STRETCH, NARROW, CHIN = (float(a) for a in args[1:4]) if len(args) >= 4 else (0.017, 0.10, 0.006)

EYE_Z, CHIN_Z, NECK_Z = 1.72, 1.61, 1.52   # measured on the bind pose


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def field(p):
    front = smooth(-0.02, -0.09, p.y)                       # the face, not the back of the head
    # vertical stretch: 0 at the eyes, full at the chin, fading out down the neck
    if p.z >= CHIN_Z:
        g = max(0.0, (EYE_Z - p.z) / (EYE_Z - CHIN_Z))
    else:
        g = smooth(NECK_Z, CHIN_Z, p.z)
    dz = -STRETCH * g * front
    # narrower jaw and cheeks: most between the chin and the mouth corners, none at the eyes or the neck
    band = smooth(NECK_Z + 0.03, CHIN_Z, p.z) * (1 - smooth(1.66, EYE_Z - 0.01, p.z))
    dx = -p.x * NARROW * band * smooth(-0.0, -0.06, p.y)
    # firmer chin: forward at the chin's middle
    chin = smooth(CHIN_Z - 0.03, CHIN_Z, p.z) * (1 - smooth(CHIN_Z + 0.02, CHIN_Z + 0.05, p.z)) \
        * (1 - smooth(0.015, 0.04, abs(p.x))) * front
    dy = -CHIN * chin
    return Vector((dx, dy, dz))


arm = bpy.data.objects['CC_rig']
HEAD = ('Arjun_body', 'Arjun_mouth', 'Arjun_eye', 'Arjun_eyebrows', 'Arjun_eyeleash', 'Arjun_hair')
for name in HEAD:
    o = bpy.data.objects[name]
    me, mw = o.data, o.matrix_world
    inv3 = mw.to_3x3().inverted()
    base = [mw @ v.co for v in me.vertices]
    disp = [inv3 @ field(p) for p in base]
    moved = sum(1 for d in disp if d.length > 1e-5)
    if me.shape_keys:
        for kb in me.shape_keys.key_blocks:
            for i, d in enumerate(disp):
                kb.data[i].co += d
    for v, d in zip(me.vertices, disp):
        v.co += d
    me.update()
    print('FACE', name, moved, 'vertices moved, max', round(max(d.length for d in disp) * mw.to_scale().x, 4), 'm')

bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(OUT) if OUT.startswith('//') else __import__('os').path.abspath(OUT))
print('WROTE', OUT)
