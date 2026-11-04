"""Build Arjun for the app from the Survival Character FBX (Unreal "Manny" skeleton).

    blender -b --python scripts/blender/build_arjun.py -- <character.fbx> <textures dir> <clips.glb> <out.glb>

<character.fbx> Survival_Character.fbx (body, hair, brows, lashes, eyes, mouth, jacket, jeans, gloves,
                shoes, backpack; 160 bones)
<textures dir>  the unpacked Textures.zip (Body/, Hair/, Jacket/, ... found by file name)
<clips.glb>     any Rocketbox avatar from web/avatars (carries squat / idle / rest / cheer / stand)
<out.glb>       phone-sized result with the five clips retargeted onto the character's own skeleton

What it does:
- drops the backpack, the shape keys (ARKit face poses) and vertex colours;
- rebuilds every material from the texture files, named so the runtime recognises them (skin_*,
  hair_*, lash_opacity). The clothes are gear_*: the runtime's cloth sheen (for top / pants / shoes
  / jacket names) greys the textured jacket and jeans, so they stay plain PBR. The body's UDIM tiles (1001 head, 1002 body,
  1003 arms) become one material each, with the UVs moved into 0-1, since glTF has no UDIMs.
  Unreal normal maps are DirectX style, so their green channel is flipped; the hair and brow
  colour maps get their opacity map as alpha;
- renames the main bones to CC names (pelvis -> CC_Hip, spine_01 -> CC_Waist, upperarm_l ->
  CC_L_Upperarm, middle_01_l -> CC_L_Mid1, ...), which the app's runtimes already understand; twist,
  corrective and IK bones keep their names;
- retargets the Rocketbox clips onto it, with relaxed fingers (retarget_clips.py);
- shrinks textures (2048 for the face, 1024 for the rest) and writes WebP.
"""
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retarget_clips import retarget_clips, parse_extra  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
FBX_PATH, TEX_DIR, CLIPS_PATH, OUT_PATH = argv[:4]
EXTRA = parse_extra(argv[4:])  # Mixamo clips: name=clip.fbx[,inplace][,xN] (retarget_clips.py)

FACE_SIZE, SIZE = 2048, 1024

# Unreal Manny bone -> CC name. Sides are filled in below; anything not listed keeps its name.
BONES = {
    'pelvis': 'CC_Hip', 'spine_01': 'CC_Waist', 'spine_02': 'CC_Spine01', 'spine_03': 'CC_Spine02',
    'spine_04': 'CC_Spine03', 'spine_05': 'CC_Spine04', 'neck_01': 'CC_NeckTwist01',
    'neck_02': 'CC_NeckTwist02', 'head': 'CC_Head',
}
for s in 'lr':
    S = s.upper()
    BONES.update({
        f'clavicle_{s}': f'CC_{S}_Clavicle', f'upperarm_{s}': f'CC_{S}_Upperarm',
        f'lowerarm_{s}': f'CC_{S}_Forearm', f'hand_{s}': f'CC_{S}_Hand',
        f'thigh_{s}': f'CC_{S}_Thigh', f'calf_{s}': f'CC_{S}_Calf', f'foot_{s}': f'CC_{S}_Foot',
        f'ball_{s}': f'CC_{S}_ToeBase',
    })
    for ue, cc in (('thumb', 'Thumb'), ('index', 'Index'), ('middle', 'Mid'), ('ring', 'Ring'), ('pinky', 'Pinky')):
        for i in (1, 2, 3):
            BONES[f'{ue}_0{i}_{s}'] = f'CC_{S}_{cc}{i}'

# Body UDIM tile -> material name
SKIN_TILES = {1001: 'skin_head', 1002: 'skin_body', 1003: 'skin_arm'}


def find_texture(name):
    for root, _, files in os.walk(TEX_DIR):
        if name in files:
            return os.path.join(root, name)
    raise FileNotFoundError(name)


def load(name, size=SIZE, normal=False, data=False):
    img = bpy.data.images.load(find_texture(name))
    # before any edit: changing the colour space reloads the file
    if normal or data:
        img.colorspace_settings.name = 'Non-Color'
    if img.size[0] > size:
        img.scale(size, size)
    if normal:
        px = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        px[1::4] = 1.0 - px[1::4]  # DirectX -> OpenGL
        img.pixels.foreach_set(px)
    img.pack()
    return img


def with_alpha(color_name, alpha_name, size=SIZE):
    """The colour map with the opacity map's red channel as alpha."""
    color, alpha = load(color_name, size), load(alpha_name, size, data=True)
    w, h = color.size
    if tuple(alpha.size) != (w, h):
        alpha.scale(w, h)
    px = np.empty(w * h * 4, dtype=np.float32)
    color.pixels.foreach_get(px)
    a = np.empty(w * h * 4, dtype=np.float32)
    alpha.pixels.foreach_get(a)
    px[3::4] = a[0::4]
    out = bpy.data.images.new(color_name.rsplit('.', 1)[0] + '_rgba', w, h, alpha=True)
    out.pixels.foreach_set(px)
    out.pack()
    bpy.data.images.remove(color)
    bpy.data.images.remove(alpha)
    return out


def occlusion_group():
    """The node group the glTF exporter reads an occlusion texture from."""
    g = bpy.data.node_groups.get('glTF Material Output')
    if not g:
        g = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    return g


def material(name, base, normal=None, orm=None, alpha=False, roughness=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = roughness

    def tex(img):
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        return n

    t = tex(base)
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha:
        nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
    if normal:
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tex(normal).outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if orm:
        # Unreal ORM: R occlusion, G roughness, B metallic (the glTF layout)
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(tex(orm).outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
        # occlusion: soft shadow in folds and seams, through the exporter's material output group
        out = nt.nodes.new('ShaderNodeGroup')
        out.node_tree = occlusion_group()
        nt.links.new(sep.outputs['Red'], out.inputs['Occlusion'])
    return m


def kit(name, prefix, size=SIZE):
    return material(name, load(f'{prefix}_BaseColor.jpg', size), load(f'{prefix}_Normal.jpg', size, normal=True),
                    load(f'{prefix}_OcclusionRoughnessMetallic.jpg', SIZE, data=True))


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
bpy.ops.import_scene.fbx(filepath=FBX_PATH)
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
tgt = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
if tgt.animation_data:
    tgt.animation_data_clear()
# The survival backpack does not suit a workout character.
bpy.data.objects.remove(bpy.data.objects['Backpack'])
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    if o.data.shape_keys:
        o.shape_key_clear()
    for attr in list(o.data.color_attributes):
        o.data.color_attributes.remove(attr)
old_materials = set(bpy.data.materials)
old_images = set(bpy.data.images)

# ---------------------------------------------------------------- materials

skin = {}
for tile, name in SKIN_TILES.items():
    size = FACE_SIZE if tile == 1001 else SIZE
    skin[tile] = material(name, load(f'Body_BaseColor.{tile}.png', size), load(f'Body_Normal.{tile}.png', size, normal=True),
                          load(f'Body_OcclusionRoughnessMetallic.{tile}.png', SIZE, data=True))
brows = material('hair_brows', with_alpha('Eyebrows_BaseColor.jpg', 'Eyebrows_Opacity.jpg'), alpha=True)
lashes = material('lash_opacity', brows.node_tree.nodes['Image Texture'].image, alpha=True)
MATERIALS = {
    'Hair': material('hair_main', with_alpha('HairBrown_Diffuse_2.jpg', 'HairBrown_Alpha.jpg', FACE_SIZE),
                     load('HairBrown_Normal.jpg', normal=True), alpha=True),
    'Eyebrows': brows,
    'Eyeleash': lashes,
    'Eye': material('eye', load('Eye_BaseColor.png'), roughness=0.15),
    'Mouth1': material('teeth', load('TeethBaseColor.png'), load('Teet_Normal.png', normal=True),
                       load('Teeth_ORM.png', data=True)),
    # what the camera sees most: double the detail of the rest
    'Jacket': kit('gear_upper', 'Jacket', FACE_SIZE),
    'Jeans': kit('gear_lower', 'Jeans', FACE_SIZE),
    'Shoes': kit('gear_feet', 'Shoes'),
    'Gloves': kit('gear_gloves', 'Gloves'),
}

for o in meshes:
    me = o.data
    if o.name.startswith('Body'):
        # one material per UDIM tile; the tile's UVs move into 0-1
        uv = me.uv_layers.active.data
        me.materials.clear()
        for tile in SKIN_TILES:
            me.materials.append(skin[tile])
        for poly in me.polygons:
            us = [uv[li].uv for li in poly.loop_indices]
            du = math.floor(sum(u.x for u in us) / len(us))
            dv = math.floor(sum(u.y for u in us) / len(us))
            poly.material_index = list(SKIN_TILES).index(1001 + du + 10 * dv)
            for li in poly.loop_indices:
                uv[li].uv = (uv[li].uv.x - du, uv[li].uv.y - dv)
        o.name = 'Arjun_body'
    else:
        m = MATERIALS[o.name]
        me.materials.clear()
        me.materials.append(m)
        for poly in me.polygons:
            poly.material_index = 0
        o.name = 'Arjun_' + o.name.lower().rstrip('1')
    print('MESH', o.name, len(me.polygons), [m.name for m in me.materials])

for m in old_materials:
    bpy.data.materials.remove(m)
for img in old_images:
    bpy.data.images.remove(img)

# ---------------------------------------------------------------- bones and clips

for b in tgt.data.bones:
    if b.name in BONES:
        b.name = BONES[b.name]
tgt.name = 'CC_rig'
retarget_clips(tgt, CLIPS_PATH, EXTRA)

# ---------------------------------------------------------------- export

bpy.ops.object.select_all(action='DESELECT')
tgt.select_set(True)
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT_PATH,
    use_selection=True,
    export_format='GLB',
    export_image_format='WEBP',
    export_image_quality=88,
    export_animation_mode='NLA_TRACKS',
    export_morph=False,
    export_skins=True,
    export_extras=False,
    export_yup=True,
)
print('WROTE', OUT_PATH)
