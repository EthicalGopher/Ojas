"""Renders the photoreal plates for the match intro (bodybuilding championship "OJAS CLASSIC").

The phone cannot path-trace, so each camera shot is pre-rendered in Cycles and the app draws the two
live athletes on top with a camera that matches exactly (src/features/match/arenaViewerHtml.ts).
Shots with the crowd in view are short seamless loops (video); stage close-ups are stills.

Run:  ~/blender/blender -b -P scripts/blender/render_arena.py -- <out_dir> [shot ...] [--frames N] [--samples N] [--test]
  out_dir/<shot>/####.png   frames (video shots), or out_dir/<shot>.png for stills
  scripts/blender/encode_plates.sh turns them into the app's assets (`make arena` does both).

      ~/blender/blender -b -P scripts/blender/render_arena.py -- <out_dir> --athletes [--samples N]
  The heroes rendered into the hall, for the app's all-image intro (ArenaIntro.tsx): each hero on each
  riser in a pose from their motion-capture clips (POSES), both_<left>_<right>.png for every pair at double size (the intro zooms
  into each athlete on it), and you_<hero>.png / rival_<hero>.png, crowd.png / wide.png. `make arena-athletes` renders and encodes them.

The crowd and judges are the app's own Rocketbox characters (assets/web/avatars/*.glb) with the
shop faces (downloaded once into scripts/blender/.cache/faces/), recoloured clothes and offset cheer loops.

Coordinates: Blender is Z-up. App (three.js, Y-up) = (x, z, -y) of Blender. Shot cameras below are
written in app coordinates so they are copied 1:1 into SHOTS in arenaViewerHtml.ts.
"""
import glob
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
AVATARS = os.path.join(ROOT, "android/app/src/main/assets/web/avatars")
FACES_DIR = os.path.join(ROOT, "scripts/blender/.cache/faces")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv and not argv[0].startswith("--") else "/tmp/arena_plates"
opts = {"frames": 48, "samples": 128, "test": False, "athletes": False}
shots_wanted = []
i = 1
while i < len(argv):
    a = argv[i]
    if a == "--frames":
        opts["frames"] = int(argv[i + 1]); i += 2; continue
    if a == "--samples":
        opts["samples"] = int(argv[i + 1]); i += 2; continue
    if a == "--test":
        opts["test"] = True; i += 1; continue
    if a == "--athletes":
        opts["athletes"] = True; i += 1; continue
    shots_wanted.append(a); i += 1

FOV_DEG = 40.0  # vertical, same as the app camera
RES = (1600, 720)  # 20:9 like the phones the app targets
LOOP = opts["frames"]

# App-space cameras (x, y, z), y up, the stage at z = -2, the crowd at +z.
SHOTS = {
    "crowd": {"pos": (0.0, 2.55, -0.5), "look": (0.0, 2.2, 9.0), "video": True},
    "wide": {"pos": (0.0, 7.2, 14.0), "look": (0.0, 2.0, -1.0), "video": True},
    "you": {"pos": (-0.5, 2.15, 0.9), "look": (-1.5, 2.05, -2.0), "video": False},
    "rival": {"pos": (0.5, 2.15, 0.9), "look": (1.5, 2.05, -2.0), "video": False},
    "both": {"pos": (0.0, 2.25, 4.2), "look": (0.0, 1.95, -2.0), "video": False},
}


def b(v):
    """App (three.js) -> Blender coordinates."""
    return Vector((v[0], -v[2], v[1]))


random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, LOOP

# ---------------------------------------------------------------- helpers

def principled(name, color=(0.5, 0.5, 0.5), rough=0.5, metal=0.0, emit=None, strength=0.0, coat=0.0, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if coat:
        p.inputs["Coat Weight"].default_value = coat
        p.inputs["Coat Roughness"].default_value = 0.04
    if sheen:
        p.inputs["Sheen Weight"].default_value = sheen
        p.inputs["Sheen Tint"].default_value = (*color, 1)
    if emit:
        p.inputs["Emission Color"].default_value = (*emit, 1)
        p.inputs["Emission Strength"].default_value = strength
    return m


def hexc(h):
    h = h.lstrip("#")
    c = [int(h[k:k + 2], 16) / 255 for k in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def add_noise_bump(m, scale=40.0, strength=0.08, rough_var=0.15):
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    nt.links.new(tex.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], p.inputs["Normal"])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["To Min"].default_value = p.inputs["Roughness"].default_value - rough_var
    mr.inputs["To Max"].default_value = p.inputs["Roughness"].default_value + rough_var
    nt.links.new(tex.outputs["Fac"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], p.inputs["Roughness"])


def mesh_obj(name, bm, mat, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = loc
    if mat:
        me.materials.append(mat)
    scene.collection.objects.link(o)
    for poly in me.polygons:
        poly.use_smooth = True
    return o


def box(name, size, loc, mat, bevel=0.0, seg=3):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=seg, affect="EDGES")
    o = mesh_obj(name, bm, mat, loc)
    if not bevel:
        for poly in o.data.polygons:
            poly.use_smooth = False
    return o


def cyl(name, r, h, loc, mat, segs=32, r2=None, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    o = mesh_obj(name, bm, mat, loc)
    if rot is not None:
        o.rotation_euler = rot
    return o


def lathe(name, profile, loc, mat, segs=48):
    """Revolve (r, z) points around Z (trophy cups)."""
    bm = bmesh.new()
    rings = []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z in profile])
    for k in range(segs):
        r0, r1 = rings[k], rings[(k + 1) % segs]
        for j in range(len(profile) - 1):
            bm.faces.new((r0[j], r1[j], r1[j + 1], r0[j + 1]))
    return mesh_obj(name, bm, mat, loc)


def text(name, body, size, loc, mat, extrude=0.05, bevel=0.01):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.extrude = extrude
    cu.bevel_depth = bevel
    for f in ("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(f):
            cu.font = bpy.data.fonts.load(f)
            break
    o = bpy.data.objects.new(name, cu)
    o.location = loc
    o.rotation_euler = (math.pi / 2, 0, 0)
    o.data.materials.append(mat)
    scene.collection.objects.link(o)
    return o


# ---------------------------------------------------------------- materials

M = {
    "floor": principled("floor", hexc("#1b1b1f"), 0.45),
    "stage": principled("stage_lacquer", hexc("#060608"), 0.15, coat=1.0),
    "fascia": principled("fascia", hexc("#1a1a1e"), 0.3, 0.9),
    "carpet": principled("carpet", hexc("#6b0d12"), 0.95, sheen=0.6),
    "velvet": principled("velvet", hexc("#0b0507"), 0.9, sheen=1.0),
    "metal": principled("truss_metal", hexc("#b8bcc4"), 0.28, 1.0),
    "black_metal": principled("black_metal", hexc("#121214"), 0.35, 0.8),
    "gold": principled("gold", (1.0, 0.71, 0.29), 0.16, 1.0),
    "led_o": principled("led_orange", hexc("#ff6a1a"), 0.4, emit=hexc("#ff6a1a"), strength=14),
    "led_g": principled("led_gold", hexc("#ffc64a"), 0.4, emit=hexc("#ffc64a"), strength=12),
    "screen": principled("led_wall", hexc("#120604"), 0.3, emit=hexc("#7a1e08"), strength=1.0),
    "lens": principled("lens", hexc("#ffffff"), 0.1, emit=hexc("#fff3dc"), strength=40),
    "concrete": principled("tier_concrete", hexc("#2a2a2e"), 0.85),
    "cloth": principled("judge_cloth", hexc("#f2efe8"), 0.75, sheen=0.5),
    "flash": principled("phone_flash", hexc("#ffffff"), 0.1, emit=hexc("#ffffff"), strength=60),
}
add_noise_bump(M["floor"], 18, 0.04, 0.12)
add_noise_bump(M["concrete"], 30, 0.15, 0.1)

# ---------------------------------------------------------------- hall

STAGE_W, STAGE_D, STAGE_H = 10.0, 5.0, 1.0
box("floor", (60, 60, 0.1), (0, -8, -0.05), M["floor"])
box("stage", (STAGE_W, STAGE_D, STAGE_H), (0, STAGE_D / 2, STAGE_H / 2), M["stage"], bevel=0.02)
box("fascia", (STAGE_W + 0.02, 0.06, STAGE_H - 0.06), (0, -0.01, (STAGE_H - 0.06) / 2), M["fascia"])
box("led_front_top", (STAGE_W, 0.03, 0.04), (0, -0.05, STAGE_H - 0.12), M["led_o"])
box("led_front_bottom", (STAGE_W, 0.03, 0.03), (0, -0.05, 0.06), M["led_g"])
for k in range(4):
    box(f"stair_{k}", (2.4, 0.34, 0.25 * (k + 1)), (0, -0.34 * (4 - k) + 0.17, 0.125 * (k + 1)), M["fascia"], bevel=0.01)
box("carpet", (1.7, 4.7, 0.012), (0, 2.6, STAGE_H + 0.006), M["carpet"], bevel=0.004, seg=1)

RISER_H = 0.14
for side, x in (("you", -1.5), ("rival", 1.5)):
    cyl(f"riser_{side}", 0.78, RISER_H, (x, 2.0, STAGE_H + RISER_H / 2), M["fascia"], 64)
    cyl(f"riser_top_{side}", 0.74, 0.004, (x, 2.0, STAGE_H + RISER_H + 0.002), M["stage"], 64)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.77, minor_radius=0.012, major_segments=96, location=(x, 2.0, STAGE_H + RISER_H - 0.012))
    bpy.context.active_object.data.materials.append(M["led_o"] if side == "you" else M["led_g"])

# Trophies: polished gold cups on black pedestals
cup_profile = [(0.0, 0.0), (0.17, 0.0), (0.17, 0.03), (0.06, 0.06), (0.035, 0.12), (0.03, 0.3), (0.06, 0.34), (0.2, 0.42), (0.24, 0.6), (0.25, 0.72), (0.235, 0.74), (0.2, 0.62), (0.0, 0.5)]
for x in (-4.2, 4.2):
    box(f"pedestal_{x}", (0.62, 0.62, 1.1), (x, 3.6, STAGE_H + 0.55), M["black_metal"], bevel=0.02)
    lathe(f"cup_{x}", cup_profile, (x, 3.6, STAGE_H + 1.1), M["gold"])
    for s in (-1, 1):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.1, minor_radius=0.018, location=(x + s * 0.25, 3.6, STAGE_H + 1.72), rotation=(math.pi / 2, 0, 0))
        bpy.context.active_object.data.materials.append(M["gold"])

# Backdrop: velvet curtain with folds, the LED wall, side pillars and the title
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=240, y_segments=2, size=1.0)
for v in bm.verts:
    x, z = v.co.x * 11, (v.co.y + 1) * 5
    v.co = Vector((x, 0.12 * math.sin(x * 4.2) + 0.05 * math.sin(x * 9.7), z))
curtain = mesh_obj("curtain", bm, M["velvet"], (0, 5.6, 0))
box("wall_frame", (8.8, 0.15, 4.2), (0, 5.25, STAGE_H + 2.6), M["black_metal"], bevel=0.02)
box("led_wall", (8.4, 0.05, 3.8), (0, 5.15, STAGE_H + 2.6), M["screen"])
for k, x in enumerate((-5.7, 5.7)):
    box(f"pillar_{k}", (1.2, 0.7, 7.6), (x, 5.0, 3.8), M["black_metal"], bevel=0.03)
    for j, dx in enumerate((-0.38, 0.0, 0.38)):
        box(f"pillar_led_{k}{j}", (0.05, 0.03, 6.8), (x + dx, 4.63, 3.9), M["led_g"] if j == 1 else M["led_o"])
text("title", "OJAS CLASSIC", 1.1, (0, 5.05, STAGE_H + 5.3), M["gold"], 0.08, 0.012)
text("subtitle", "CHAMPIONSHIP", 0.36, (0, 5.05, STAGE_H + 4.6), M["led_o"], 0.02, 0.0)

# Truss (box truss: four chords + lacing) on two towers
def truss_beam(name, a, c, w=0.32):
    a, c = Vector(a), Vector(c)
    d = c - a
    n = int(d.length / 0.5)
    q = Vector((1, 0, 0)).rotation_difference(d.normalized())
    parts = []
    for oy in (-w / 2, w / 2):
        for oz in (-w / 2, w / 2):
            off = q @ Vector((0, oy, oz))
            o = cyl(f"{name}_chord", 0.025, d.length, (a + c) / 2 + off, M["metal"], 10)
            o.rotation_mode = "QUATERNION"
            o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
            parts.append(o)
    for k in range(n):
        p0 = a + d * (k / n)
        p1 = a + d * ((k + 1) / n)
        for oy, oz in ((-w / 2, -w / 2), (w / 2, w / 2), (-w / 2, w / 2), (w / 2, -w / 2)):
            s0 = p0 + q @ Vector((0, oy, oz))
            s1 = p1 + q @ Vector((0, -oy, oz)) if k % 2 else p1 + q @ Vector((0, oy, -oz))
            dd = s1 - s0
            o = cyl(f"{name}_lace", 0.01, dd.length, (s0 + s1) / 2, M["metal"], 6)
            o.rotation_mode = "QUATERNION"
            o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(dd.normalized())
            parts.append(o)
    return parts


TRUSS_Z = 8.4
for y in (0.4, 3.8):
    truss_beam(f"truss_{y}", (-8, y, TRUSS_Z), (8, y, TRUSS_Z))
for x in (-8, 8):
    truss_beam(f"tower_{x}", (x, 0.4, 0), (x, 0.4, TRUSS_Z))

# ---------------------------------------------------------------- lighting

world = bpy.data.worlds.new("hall")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.004, 0.004, 0.006, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
scene.world = world

# Haze for visible light shafts (bounded so the render stays fast)
haze = box("haze", (19, 9, 10), (0, 1.5, 5.0), None)  # over the stage only
hm = bpy.data.materials.new("haze")
hm.use_nodes = True
nt = hm.node_tree
for n in list(nt.nodes):
    if n.type != "OUTPUT_MATERIAL":
        nt.nodes.remove(n)
vol = nt.nodes.new("ShaderNodeVolumePrincipled")
vol.inputs["Density"].default_value = 0.035
vol.inputs["Anisotropy"].default_value = 0.55
nt.links.new(vol.outputs["Volume"], nt.nodes["Material Output"].inputs["Volume"])
haze.data.materials.append(hm)
haze.visible_shadow = False

fixtures = []


def spot(name, loc, target, power, size_deg, color=(1, 0.95, 0.88), blend=0.35, radius=0.08):
    li = bpy.data.lights.new(name, "SPOT")
    li.energy = power
    li.spot_size = math.radians(size_deg)
    li.spot_blend = blend
    li.color = color
    li.shadow_soft_size = radius
    o = bpy.data.objects.new(name, li)
    o.location = loc
    scene.collection.objects.link(o)
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    # the fixture body with a glowing lens
    body = cyl(name + "_body", 0.17, 0.42, Vector(loc) - d.normalized() * 0.2, M["black_metal"], 24)
    body.rotation_mode = "QUATERNION"
    body.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    lens = cyl(name + "_lens", 0.14, 0.01, Vector(loc) + d.normalized() * 0.01, M["lens"], 24)
    lens.rotation_mode = "QUATERNION"
    lens.rotation_quaternion = body.rotation_quaternion
    # the fixture model must not block its own light
    body.visible_shadow = False
    lens.visible_shadow = False
    fixtures.append((o, body, lens))
    return o


# Stage key spots on the two risers (front truss) and backlights (rear truss)
for x, tx in ((-4.5, -1.5), (-2.2, -1.5), (2.2, 1.5), (4.5, 1.5)):
    spot(f"key_{x}", (x, 0.4, TRUSS_Z - 0.4), (tx, 2.0, STAGE_H + 1.0), 14000, 20)
for x, tx in ((-1.5, -1.5), (1.5, 1.5)):
    spot(f"back_{x}", (x * 1.6, 3.8, TRUSS_Z - 0.4), (tx, 2.2, STAGE_H + 1.4), 12000, 22, color=(1.0, 0.62, 0.32))
spot("center_wash", (0, 3.8, TRUSS_Z - 0.4), (0, 2.2, STAGE_H), 6000, 44, color=(1.0, 0.85, 0.7), blend=0.8)
# Sweeping beams over the crowd (animated below)
sweepers = []
for k, x in enumerate((-6.5, -3.5, 3.5, 6.5)):
    s = spot(f"sweep_{k}", (x, 0.4, TRUSS_Z - 0.4), (x * 0.6, -8, 1.5), 9000, 7, color=[(1, 0.55, 0.2), (0.35, 0.55, 1), (0.35, 0.55, 1), (1, 0.55, 0.2)][k], blend=0.2)
    sweepers.append(s)
# Soft house fill so the crowd reads
for loc in ((0, -9, 9), (-9, -6, 7), (9, -6, 7)):
    li = bpy.data.lights.new("house", "AREA")
    li.energy = 900
    li.size = 8
    li.color = (0.75, 0.82, 1.0)
    o = bpy.data.objects.new("house", li)
    o.location = loc
    o.rotation_euler = (Vector((0, -6, 1)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    o.visible_volume_scatter = False  # light the people, not the haze
    scene.collection.objects.link(o)

# Animate the sweepers: a smooth loop over the plate length
for k, s in enumerate(sweepers):
    base = s.rotation_euler.copy()
    for f in range(1, LOOP + 2, 4):
        ph = 2 * math.pi * (f - 1) / LOOP + k * 1.7
        s.rotation_euler = (base.x + 0.18 * math.sin(ph), base.y, base.z + 0.35 * math.cos(ph))
        s.keyframe_insert("rotation_euler", frame=f)

# ---------------------------------------------------------------- people

def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
    return new


BODIES = {}
for key, fname in (("m", "ojas_default.glb"), ("f", "ojas_female.glb"), ("coach", "instructor_ai.glb")):
    objs = import_glb(os.path.join(AVATARS, fname))
    arm = next(o for o in objs if o.type == "ARMATURE")
    meshes = [o for o in objs if o.type == "MESH" and len(o.data.polygons) > 1000]
    BODIES[key] = {"arm": arm, "meshes": meshes}
ACTIONS = {a.name.split(".")[0]: a for a in bpy.data.actions}  # first import's copies

def ensure_faces():
    """Download the shop's face heads (public avatar-models bucket) into the cache once."""
    if glob.glob(os.path.join(FACES_DIR, "*.glb")):
        return
    import re
    import urllib.request
    os.makedirs(FACES_DIR, exist_ok=True)
    src = open(os.path.join(ROOT, "src/utils/avatarFaces.generated.ts")).read()
    base = "https://locsjrjekkyjbeapgreu.supabase.co/storage/v1/object/public/avatar-models/avatars/faces/"
    for name in sorted(set(re.findall(r"local://avatars/faces/([a-z0-9_]+)\.glb", src))):
        try:
            urllib.request.urlretrieve(base + name + ".glb", os.path.join(FACES_DIR, name + ".glb"))
        except Exception as e:
            print(f"[render] face {name} not downloaded: {e}")


ensure_faces()
FACES = {"m": [], "f": []}
for p in sorted(glob.glob(os.path.join(FACES_DIR, "*.glb"))):
    k = os.path.basename(p)[0]
    if k in FACES and "m_18" not in p:  # m_18 has no back of the head
        objs = import_glb(p)
        FACES[k].append([o for o in objs if o.type == "MESH"])
        for o in objs:
            if o.type == "ARMATURE":
                bpy.data.objects.remove(o)
print(f"[render] faces m={len(FACES['m'])} f={len(FACES['f'])}")

INVISIBLE = bpy.data.materials.new("invisible")
INVISIBLE.use_nodes = True
_nt = INVISIBLE.node_tree
_nt.nodes.remove(_nt.nodes["Principled BSDF"])
_tr = _nt.nodes.new("ShaderNodeBsdfTransparent")
_nt.links.new(_tr.outputs[0], _nt.nodes["Material Output"].inputs["Surface"])

CLOTH = ["#e25822", "#ffb627", "#2f6fd6", "#f4f4f4", "#1c1c24", "#c8283c", "#2fa36b", "#7a48c8", "#ececec", "#ff7a3c",
         "#18305e", "#5b5b63", "#d9c7a5", "#0d0d10", "#b5162c"]
PANTS = ["#141418", "#1f2a44", "#2b2b30", "#3a3328", "#d9d6cf", "#22314f"]
_cloth_mats = {}


def cloth_mat(base_name, hex_):
    key = (base_name, hex_)
    if key not in _cloth_mats:
        m = principled(f"{base_name}_{hex_}", hexc(hex_), 0.8, sheen=0.3)
        _cloth_mats[key] = m
    return _cloth_mats[key]


people = 0


def person(kind, loc, yaw, action="cheer", speed=1.0, face=True):
    """Instance a body (shared mesh data), its own armature + NLA loop, a face and recoloured clothes."""
    global people
    src = BODIES[kind]
    arm = src["arm"].copy()
    arm.animation_data_clear()
    scene.collection.objects.link(arm)
    arm.location = loc
    # glTF imports use quaternion rotation; turn around world Z on top of the import rotation
    arm.rotation_mode = "QUATERNION"
    arm.rotation_quaternion = Quaternion((0, 0, 1), yaw) @ src["arm"].rotation_quaternion
    # A cycle that divides the plate length exactly, starting at a random phase: seamless loops.
    act = ACTIONS[action]
    length = act.frame_range[1] - act.frame_range[0]
    cycle = max(8, round(LOOP / max(1, round(LOOP / (length / speed)))))
    ad = arm.animation_data_create()
    tr = ad.nla_tracks.new()
    start = -random.randint(0, cycle - 1)
    st = tr.strips.new(action, start, act)
    st.scale = cycle / length
    st.repeat = math.ceil((LOOP - start + cycle) / cycle) + 1
    st.extrapolation = "HOLD"
    for o in src["meshes"]:
        m = o.copy()
        scene.collection.objects.link(m)
        m.parent = arm
        m.matrix_parent_inverse = Matrix.Identity(4)
        for mod in m.modifiers:
            if mod.type == "ARMATURE":
                mod.object = arm
        if kind != "coach":
            top, pants = random.choice(CLOTH), random.choice(PANTS)
            for slot in m.material_slots:
                n = slot.material.name if slot.material else ""
                if "ojas_top" in n:
                    slot.link = "OBJECT"
                    slot.material = cloth_mat("top", top)
                elif "ojas_pants" in n:
                    slot.link = "OBJECT"
                    slot.material = cloth_mat("pants", pants)
                elif face and FACES[kind] and ("ojas_head" in n or "ojas_neck" in n):
                    slot.link = "OBJECT"
                    slot.material = INVISIBLE
    if face and kind != "coach" and FACES[kind]:
        for fo in random.choice(FACES[kind]):
            f = fo.copy()
            scene.collection.objects.link(f)
            f.parent = arm
            f.matrix_parent_inverse = Matrix.Identity(4)
            for mod in f.modifiers:
                if mod.type == "ARMATURE":
                    mod.object = arm
    people += 1
    return arm


# Judges: five at the table facing the stage
box("judge_table", (6.2, 0.9, 0.78), (0, -2.0, 0.39), M["cloth"], bevel=0.02)
box("judge_skirt_led", (6.22, 0.02, 0.05), (0, -1.54, 0.7), M["led_o"])
for k, x in enumerate((-2.4, -1.2, 0.0, 1.2, 2.4)):
    person(random.choice(["m", "f", "m"]), (x, -2.85, 0.0), math.pi, "stand", 1.0)

# Crowd: standing tiers in an arc facing the stage, behind a barrier
CENTER = Vector((0, 2.0, 0))
ROWS = 3 if opts["test"] else 5
for row in range(ROWS):
    radius = 7.6 + row * 1.15
    z = row * 0.5
    span = math.radians(112)
    n = int(radius * span / 0.78)
    # concrete step for this row
    bm = bmesh.new()
    segs = 48
    for k in range(segs):
        a0 = -span / 2 + span * k / segs
        a1 = -span / 2 + span * (k + 1) / segs
        pts = []
        for a in (a0, a1):
            for rr in (radius - 0.55, radius + 0.6):
                pts.append(Vector((math.sin(a) * rr, -math.cos(a) * rr + CENTER.y, 0)))
        quad_top = [bm.verts.new(p + Vector((0, 0, z + 0.001))) for p in (pts[0], pts[1], pts[3], pts[2])]
        bm.faces.new(quad_top)
        quad_front = [bm.verts.new(p) for p in (pts[0] + Vector((0, 0, z)), pts[2] + Vector((0, 0, z)), pts[2] + Vector((0, 0, max(0, z - 0.5))), pts[0] + Vector((0, 0, max(0, z - 0.5))))]
        bm.faces.new(quad_front)
    mesh_obj(f"tier_{row}", bm, M["concrete"])
    for k in range(n):
        if random.random() < 0.06:
            continue
        a = -span / 2 + span * (k + 0.5) / n + random.uniform(-0.01, 0.01)
        px = math.sin(a) * radius
        py = -math.cos(a) * radius + CENTER.y
        kind = random.choice(["m", "m", "f", "f", "m", "coach"]) if row else random.choice(["m", "f"])
        act = random.choice(["cheer", "cheer", "cheer", "idle"])
        person(kind, (px, py, z), a + math.pi + random.uniform(-0.15, 0.15), act, random.uniform(0.85, 1.25))  # bodies face -Y; turn to the stage

# The hall behind the crowd: a dark curved wall, a ring of warm house lights and hanging banners
bm = bmesh.new()
segs = 64
span_w = math.radians(170)
verts = []
for k in range(segs + 1):
    a = -span_w / 2 + span_w * k / segs
    p = (math.sin(a) * 19.0, -math.cos(a) * 19.0 + CENTER.y)
    verts.append((bm.verts.new((p[0], p[1], 0)), bm.verts.new((p[0], p[1], 11))))
for k in range(segs):
    bm.faces.new((verts[k][0], verts[k + 1][0], verts[k + 1][1], verts[k][1]))
mesh_obj("hall_wall", bm, M["velvet"])
WARM = principled("house_bulb", hexc("#ffd9a8"), 0.3, emit=hexc("#ffcf94"), strength=25)
BANNERS = [principled(f"banner_{h}", hexc(h), 0.8, emit=hexc(h), strength=0.35) for h in ("#e25822", "#1f4fb8", "#ffb627")]
for k in range(30):
    a = -math.radians(80) + math.radians(160) * k / 29
    p = Vector((math.sin(a) * 18.8, -math.cos(a) * 18.8 + CENTER.y, 8.6))
    cyl(f"bulb_{k}", 0.09, 0.05, p, WARM, 12, rot=(math.pi / 2, 0, a))
for k in range(7):
    a = -math.radians(60) + math.radians(120) * k / 6
    p = Vector((math.sin(a) * 18.7, -math.cos(a) * 18.7 + CENTER.y, 5.6))
    o = box(f"banner_{k}", (1.4, 0.03, 3.4), p, BANNERS[k % 3])
    o.rotation_euler = (0, 0, a)
# a mid-height ring of practical lights so the upper hall is not a void
for k in range(12):
    a = -math.radians(75) + math.radians(150) * k / 11
    li = bpy.data.lights.new("wash", "SPOT")
    li.energy = 1500
    li.spot_size = math.radians(70)
    li.spot_blend = 1.0
    li.color = (1.0, 0.75, 0.5)
    o = bpy.data.objects.new("wash", li)
    o.location = (math.sin(a) * 18.0, -math.cos(a) * 18.0 + CENTER.y, 10.5)
    o.rotation_euler = (Vector((math.sin(a) * 11, -math.cos(a) * 11 + CENTER.y, 1.5)) - o.location).to_track_quat("-Z", "Y").to_euler()
    o.visible_volume_scatter = False
    scene.collection.objects.link(o)

# Barrier in front of the crowd
for k in range(40):
    a = -math.radians(56) + math.radians(112) * k / 39
    p = Vector((math.sin(a) * 6.8, -math.cos(a) * 6.8 + CENTER.y, 0))
    o = box(f"barrier_{k}", (0.95, 0.06, 1.1), p + Vector((0, 0, 0.55)), M["metal"], bevel=0.01)
    o.rotation_euler = (0, 0, a)

# Phone flashes popping in the crowd (1-2 frames each)
for k in range(26):
    a = random.uniform(-0.9, 0.9)
    rr = random.uniform(7.8, 12.5)
    f = cyl(f"flash_{k}", 0.025, 0.004, (math.sin(a) * rr, -math.cos(a) * rr + CENTER.y, 2.0 + (rr - 7.6) / 1.15 * 0.5), M["flash"], 8, rot=(math.pi / 2, 0, a))
    f.hide_render = True
    f.keyframe_insert("hide_render", frame=1)
    for _ in range(2):
        fr = random.randint(2, LOOP - 2)
        f.hide_render = False
        f.keyframe_insert("hide_render", frame=fr)
        f.hide_render = True
        f.keyframe_insert("hide_render", frame=fr + 1)

print(f"[render] people={people}")

# ---------------------------------------------------------------- render setup

scene.render.engine = "CYCLES"
cp = bpy.context.preferences.addons["cycles"].preferences
for dev_type in ("OPTIX", "CUDA"):
    try:
        cp.compute_device_type = dev_type
        cp.get_devices()
        if any(d.type == dev_type for d in cp.devices):
            for d in cp.devices:
                d.use = d.type == dev_type
            break
    except Exception:
        continue
scene.cycles.device = "GPU"
scene.cycles.samples = opts["samples"]
scene.cycles.use_denoising = True
scene.cycles.denoiser = "OPTIX" if cp.compute_device_type == "OPTIX" else "OPENIMAGEDENOISE"
scene.cycles.max_bounces = 6
scene.cycles.volume_bounces = 0
scene.cycles.volume_step_rate = 4.0
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
scene.cycles.blur_glossy = 1.0
scene.render.use_persistent_data = True
scene.render.resolution_x, scene.render.resolution_y = RES
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_depth = "8"
print(f"[render] device={cp.compute_device_type} samples={opts['samples']}")

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
cam.data.sensor_fit = "VERTICAL"
cam.data.angle = math.radians(FOV_DEG)
cam.data.clip_start = 0.1
cam.data.clip_end = 200
scene.camera = cam

os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- heroes on stage (--athletes)

# The app's heroes: model, skin tint (their look in avatarShopService.ts). Height as the app draws them.
HEROES = {"meera": ("ojas_fc1.glb", (0.74, 0.58, 0.46)), "arjun": ("arjun.glb", None)}
HERO_H = 1.6
RISERS = {"you": (-1.5, 0.28), "rival": (1.5, -0.28)}  # app x, yaw (turned a little toward the centre)
# Each hero's own pose, as on their card, as (clip, frame, extra turn toward the centre in radians);
# the rival takes the second in a mirror match.
POSES = {
    "meera": (("hero_idle", 3, 0.9), ("cheer", 30, 0)),
    "arjun": (("cheer", 30, 0), ("hero_move2", 140, 0)),
}


def tint_skin(objs, tint):
    for o in objs:
        for slot in getattr(o, "material_slots", []):
            m = slot.material
            if not m or not m.name.startswith("skin_") or m.get("tinted"):
                continue
            m = m.copy()
            slot.material = m
            m["tinted"] = True
            nt = m.node_tree
            bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
            link = next((l for l in nt.links if l.to_socket == bsdf.inputs["Base Color"]), None)
            mul = nt.nodes.new("ShaderNodeMix")
            mul.data_type = "RGBA"
            mul.blend_type = "MULTIPLY"
            mul.inputs["Factor"].default_value = 1.0
            mul.inputs["B"].default_value = (*tint, 1.0)
            if link:
                nt.links.new(link.from_socket, mul.inputs["A"])
            nt.links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])


def place_hero(hero, side, pose):
    fname, tint = HEROES[hero]
    actions_before = set(bpy.data.actions)
    objs = import_glb(os.path.join(AVATARS, fname))
    own = [a for a in bpy.data.actions if a not in actions_before]
    for o in objs:
        scene.collection.objects.link(o)
    arm = next(o for o in objs if o.type == "ARMATURE")
    meshes = [o for o in objs if o.type == "MESH" and o.parent == arm]
    for o in [o for o in objs if o.type == "MESH" and o.parent != arm]:
        bpy.data.objects.remove(o)  # the importer's bone-shape helper
    if tint:
        tint_skin(meshes, tint)
    # clothes: no metallic sheen under the stage spots (it turned the leather jacket grey)
    for o in meshes:
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.name.startswith("gear_") or not m.use_nodes:
                continue
            nt = m.node_tree
            bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
            for l in [l for l in nt.links if l.to_socket == bsdf.inputs["Metallic"]]:
                nt.links.remove(l)
            bsdf.inputs["Metallic"].default_value = 0.0
            bsdf.inputs["Specular IOR Level"].default_value = 0.3
    ad = arm.animation_data
    if ad:
        for t in ad.nla_tracks:
            t.mute = True
        ad.action = next((a for a in own if a.name.split(".")[0] == "stand"), None)
        if ad.action and ad.action.slots:
            ad.action_slot = ad.action.slots[0]
    scene.frame_set(1)
    root = arm
    while root.parent:
        root = root.parent

    def mesh_zs():
        bpy.context.view_layer.update()
        deps = bpy.context.evaluated_depsgraph_get()
        zs = []
        for o in meshes:
            ev = o.evaluated_get(deps)
            me = ev.to_mesh()
            zs += [(ev.matrix_world @ v.co).z for v in me.vertices]
            ev.to_mesh_clear()
        return zs

    # scale to the app's height from the standing pose, then take the hero's pose and hold it
    zs = mesh_zs()
    k = HERO_H / (max(zs) - min(zs))
    clip, frame, turn = pose
    if ad:
        ad.action = next(a for a in own if a.name.split(".")[0] == clip)
        if ad.action.slots:
            ad.action_slot = ad.action.slots[0]
    scene.frame_set(frame)
    held = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
    zs = mesh_zs()
    # stand on the riser, turn toward the centre
    x, yaw = RISERS[side]
    root.scale = root.scale * k
    root.rotation_mode = "XYZ"
    root.rotation_euler.z += yaw + math.copysign(turn, yaw)
    bpy.context.view_layer.update()
    root.location = b((x, 0, -2.0)) + Vector((0, 0, STAGE_H + RISER_H - min(zs) * k))
    bpy.context.view_layer.update()
    for o in meshes:
        o.hide_render = True
    # drop the clip so the stills' frame change can't move the held pose
    if ad:
        ad.action = None
        for t in list(ad.nla_tracks):
            ad.nla_tracks.remove(t)
    for pb in arm.pose.bones:
        pb.matrix_basis = held[pb.name]
    return meshes


if opts["athletes"]:
    cast = {(side, hero): place_hero(hero, side, POSES[hero][0]) for side in RISERS for hero in HEROES}
    cast.update({("mirror", hero): place_hero(hero, "rival", POSES[hero][1]) for hero in HEROES})

    def show(only):
        for key, meshes in cast.items():
            for o in meshes:
                o.hide_render = key not in only

    def still(shot, path, scale=100):
        s = SHOTS[shot]
        scene.render.resolution_percentage = scale
        cam.location = b(s["pos"])
        cam.rotation_euler = (b(s["look"]) - b(s["pos"])).to_track_quat("-Z", "Y").to_euler()
        scene.frame_set(1)
        scene.render.filepath = os.path.join(OUT, path)
        bpy.ops.render.render(write_still=True)
        print(f"[render] {path} done")

    show(set())
    still("crowd", "crowd.png")
    still("wide", "wide.png")
    for hero in HEROES:
        show({("you", hero)})
        still("you", f"you_{hero}.png")
        show({("rival", hero)})
        still("rival", f"rival_{hero}.png")
    for left in HEROES:
        for right in HEROES:
            show({("you", left), ("mirror" if left == right else "rival", right)})
            # double size: the app zooms into each athlete on this one still
            still("both", f"both_{left}_{right}.png", 200)
    sys.exit(0)

for name, s in SHOTS.items():
    if shots_wanted and name not in shots_wanted:
        continue
    cam.location = b(s["pos"])
    cam.rotation_euler = (b(s["look"]) - b(s["pos"])).to_track_quat("-Z", "Y").to_euler()
    if s["video"] and not opts["test"]:
        scene.frame_start, scene.frame_end = 1, LOOP
        scene.render.filepath = os.path.join(OUT, name, "####")
        bpy.ops.render.render(animation=True)
    else:
        scene.frame_set(1)
        scene.render.filepath = os.path.join(OUT, name + ".png")
        bpy.ops.render.render(write_still=True)
    print(f"[render] shot {name} done")
