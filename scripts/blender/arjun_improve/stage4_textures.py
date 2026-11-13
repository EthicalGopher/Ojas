"""Arjun improvement, stage 4: GPU-compressed textures (KTX2 / Basis Universal, glTF KHR_texture_basisu).

    blender -b <versions>/arjun_v3_perf.blend -P scripts/blender/arjun_improve/stage4_textures.py -- <toktx bin dir> <out.glb>

WebP saves download size but not GPU memory: the phone decodes every texture to RGBA8 (2048 x 2048 = 21 MB
with mipmaps). KTX2 stays compressed on the GPU (transcoded by three's KTX2Loader to ASTC / ETC2 / BC7 /
ETC1, whichever the phone has).

The model is exported once with lossless PNG textures (no WebP generation loss), then every image is
encoded with KTX-Software's toktx, by what it is for:
- UASTC (high quality, 8 bits per texel on the GPU): colour and normals of everything the camera reads
  closely (face and body skin, hair, brows, lashes, eyes), and the clothes' normals, capped at 1024 px
  (512 for gloves, shoes and teeth; the clothes' JPEG sources are small, and a full-size UASTC jacket
  normal alone was 4.5 MB);
- ETC1S (smaller, 4 bits per texel): the colour of clothes, shoes, gloves and teeth, and every
  occlusion / roughness / metal map (low-frequency data).
All get mipmaps; UASTC is zstd-compressed with rate-distortion optimisation (stronger for the clothes).
"""
import json
import os
import struct
import subprocess
import sys
import tempfile

import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
TOKTX_DIR, OUT = argv[0], os.path.abspath(argv[1])
TOKTX = os.path.join(TOKTX_DIR, 'bin', 'toktx')
ENV = dict(os.environ, LD_LIBRARY_PATH=os.path.join(TOKTX_DIR, 'lib'))
CLOSE_UP = ('skin_', 'hair_', 'lash_', 'eye')  # material names whose colour gets UASTC
SMALL = ('Gloves_Normal', 'Shoes_Normal', 'Teet_Normal')  # normals of small things on screen: 512 px

tmp = tempfile.mkdtemp(prefix='arjun_ktx2_')
png_glb = os.path.join(tmp, 'png.glb')

# ---------------------------------------------------------------- export with PNG textures
scene = bpy.context.scene
arm = bpy.data.objects['CC_rig']
scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent == arm:
        o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=png_glb, use_selection=True, export_format='GLB', export_image_format='AUTO',
    export_animation_mode='NLA_TRACKS', export_morph=True, export_morph_normal=False,
    export_morph_tangent=False, export_morph_animation=False, export_try_sparse_sk=True, export_skins=True,
    export_extras=False, export_yup=True,
)

# ---------------------------------------------------------------- read the GLB
data = open(png_glb, 'rb').read()
jlen = struct.unpack_from('<I', data, 12)[0]
gltf = json.loads(data[20:20 + jlen])
bin_off = 20 + jlen + 8
binary = data[bin_off:bin_off + struct.unpack_from('<I', data, 20 + jlen)[0]]
views = [binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in gltf['bufferViews']]

# what each image is used for
use = {}  # image index -> set of ('color' | 'data' | 'normal', close_up)
for m in gltf.get('materials', []):
    close = m.get('name', '').startswith(CLOSE_UP)
    pbr = m.get('pbrMetallicRoughness', {})
    slots = [(pbr.get('baseColorTexture'), 'color'), (pbr.get('metallicRoughnessTexture'), 'data'),
             (m.get('normalTexture'), 'normal'), (m.get('occlusionTexture'), 'data'), (m.get('emissiveTexture'), 'color')]
    for ref, kind in slots:
        if ref:
            src = gltf['textures'][ref['index']]['source']
            use.setdefault(src, set()).add((kind, close))

def gltf_size(b):
    """width of a square PNG or JPEG"""
    if b[:8] == b'\x89PNG\r\n\x1a\n':
        return struct.unpack('>I', b[16:20])[0]
    i = 2
    while i < len(b):
        marker, size = b[i + 1], struct.unpack('>H', b[i + 2:i + 4])[0]
        if marker in (0xC0, 0xC1, 0xC2):
            return struct.unpack('>H', b[i + 7:i + 9])[0]
        i += 2 + size
    raise ValueError('unknown image')


# ---------------------------------------------------------------- encode
report = []
for i, img in enumerate(gltf['images']):
    kinds = use.get(i, {('color', False)})
    srgb = any(k == 'color' for k, _ in kinds)
    close = any(c for _, c in kinds)
    normal = any(k == 'normal' for k, _ in kinds)
    data = not srgb and not normal  # occlusion / roughness / metal
    uastc = (close or normal) and not data
    small = any(n in img.get('name', '') for n in SMALL)
    ext = '.png' if img.get('mimeType') == 'image/png' else '.jpg'
    src = os.path.join(tmp, f'{i}{ext}')
    dst = os.path.join(tmp, f'{i}.ktx2')
    open(src, 'wb').write(views[img['bufferView']])
    cmd = [TOKTX, '--t2', '--genmipmap', '--assign_oetf', 'srgb' if srgb else 'linear']
    w = gltf_size(views[img['bufferView']])
    cap = 512 if small else 1024 if (uastc and not close) else w
    if w > cap:
        cmd += ['--resize', f'{cap}x{cap}']
        w = cap
    if uastc:
        cmd += ['--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '1.5' if close else '3', '--zcmp', '19']
    else:
        cmd += ['--encode', 'etc1s', '--clevel', '5', '--qlevel', '255']
    subprocess.run(cmd + [dst, src], check=True, env=ENV)
    before = len(views[img['bufferView']])
    views[img['bufferView']] = open(dst, 'rb').read()
    img['mimeType'] = 'image/ktx2'
    img.pop('uri', None)
    # GPU bytes with mipmaps: RGBA8 when decoded from PNG / WebP, about 1 byte per texel for UASTC
    # (ASTC 4x4 / BC7) and 0.5 for ETC1S (ETC1 / ETC2 RGB; alpha doubles it)
    w0 = gltf_size(open(src, 'rb').read())
    gpu_before = w0 * w0 * 4 * 4 / 3
    gpu_after = w * w * (1.0 if uastc else 0.5) * 4 / 3
    report.append((img.get('name', str(i)), 'UASTC' if uastc else 'ETC1S', 'sRGB' if srgb else 'linear',
                   before, len(views[img['bufferView']]), w, gpu_before, gpu_after))
for t in gltf['textures']:
    t['extensions'] = {'KHR_texture_basisu': {'source': t.pop('source')}}
for key in ('extensionsUsed', 'extensionsRequired'):
    gltf[key] = sorted(set(gltf.get(key, [])) | {'KHR_texture_basisu'})

# ---------------------------------------------------------------- write the GLB
blob = bytearray()
for v, b in zip(gltf['bufferViews'], views):
    while len(blob) % 8:
        blob.append(0)
    v['byteOffset'] = len(blob)
    v['byteLength'] = len(b)
    blob += b
while len(blob) % 4:
    blob.append(0)
gltf['buffers'] = [{'byteLength': len(blob)}]
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
open(OUT, 'wb').write(out)

for name, enc, cs, a, b, w, g0, g1 in report:
    print(f'TEX {name:38s} {enc:5s} {cs:6s} {w:4d}px  file {a / 1e6:5.2f} -> {b / 1e6:5.2f} MB  GPU {g0 / 1e6:5.1f} -> {g1 / 1e6:4.1f} MB')
print(f'GPU textures: {sum(r[6] for r in report) / 1e6:.0f} MB -> {sum(r[7] for r in report) / 1e6:.0f} MB (estimate)')
print(f'WROTE {OUT} {len(out) / 1e6:.2f} MB')
