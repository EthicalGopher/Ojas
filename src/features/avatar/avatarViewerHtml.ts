// HTML for the 3D avatar WebView. Loaded with baseUrl http://127.0.0.1:8888 so three.js
// and bundled models come from the APK through LocalAssetServer (works offline).
//
// Supports VRM 0.x (three-vrm 0.6) and plain GLB/glTF binaries, e.g. Daz or Blender
// exports. GLB files must embed their textures and must not use Draco compression.
//
// RN -> page: window.loadModel(url, format), window.setAutoRotate(bool), window.applyLoadout(items)
// page -> RN: { type: 'PROGRESS', progress } | { type: 'LOADED' } | { type: 'ERROR', message }
//
// Loadout items are { category, config } from the shop catalog:
//   recolor  { recolor: { "<material name part>": "#hex" } }   tops, pants, shoes and hair on the character's own materials
//   tint     { tint: { "<material name part>": [r, g, b] } }   linear multipliers (faces match the body's skin tone)
//   skinned  { model_url, hide: ["<material name part>"] }      clothing or a face (head) GLB rigged to the same skeleton
//   builtin  { builtin: "headband" | "cap" | "halo", color }     accessories drawn here, on the head bone
//   attached { model_url, bone, position, rotation, scale }      accessory GLB on a humanoid bone


/** Page-scope JS shared by every 3D character page: realistic skin / hair / cloth materials
 * (upgradeMaterials) and dyes (dyeMaterial). */
export function materialRuntimeJs(): string {
  return `
  // ---------- Realistic shading for the (Rocketbox) GLB characters ----------
  // Skin: physical material with a soft sheen and a subsurface-scattering approximation (light wraps
  // past the terminator, more in red than blue, like light travelling under skin). Hair and lash
  // cards: alpha-to-coverage instead of blending, so strands are soft-edged and sort correctly.
  // Clothes: a fabric sheen. VRM (toon) models are left alone.
  var skinChunk = null;
  function skinLighting() {
    if (skinChunk) return skinChunk;
    var src = THREE.ShaderChunk.lights_physical_pars_fragment;
    var from = 'vec3 irradiance = dotNL * directLight.color;';
    var to = 'float wrapNL = saturate( ( dot( geometry.normal, directLight.direction ) + 0.5 ) / 1.5 ); ' +
      'vec3 irradiance = vec3( mix( dotNL, wrapNL, 0.62 ), mix( dotNL, wrapNL, 0.3 ), mix( dotNL, wrapNL, 0.2 ) ) * directLight.color;';
    skinChunk = src.indexOf(from) >= 0 ? src.replace(from, to) : null;
    return skinChunk;
  }
  function isHairCard(m) { return /opacity|hair|lash|brow/i.test(m.name || '') && !!m.map; }
  function isSkin(m) { return /skin|head|neck|body/i.test(m.name || '') && !/opacity/i.test(m.name || ''); }
  function isCloth(m) { return /top|pants|shoes|kit|outfit|sport|shirt|jacket|cloth|short|hood/i.test(m.name || ''); }
  function upgradeMaterial(m) {
    if (!m || !m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || (m.userData && m.userData.upgraded)) return m;
    if (isHairCard(m)) {
      m.transparent = false;
      m.alphaTest = 0.3;
      m.alphaToCoverage = true;
      m.depthWrite = true;
      m.userData.upgraded = true;
      m.needsUpdate = true;
      return m;
    }
    var skin = isSkin(m), cloth = !skin && isCloth(m);
    if (!skin && !cloth) return m;
    var p = new THREE.MeshPhysicalMaterial();
    THREE.MeshStandardMaterial.prototype.copy.call(p, m);
    p.name = m.name;
    p.userData = Object.assign({}, m.userData, { upgraded: true });
    if (skin) {
      p.sheen = 0.22;
      p.sheenRoughness = 0.55;
      if (p.sheenColor) p.sheenColor.setRGB(1.0, 0.8, 0.72);
      p.clearcoat = 0.05;
      p.clearcoatRoughness = 0.5;
      if (skinLighting()) {
        p.onBeforeCompile = function (sh) {
          sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', skinLighting());
        };
        p.customProgramCacheKey = function () { return 'ojas-skin'; };
      }
    } else {
      // dark untextured sportswear stays black: a near-white sheen would grey it
      var plain = !p.map && /^sport_/.test(p.name);
      p.sheen = plain ? 0.3 : 0.55;
      p.sheenRoughness = 0.75;
      if (p.sheenColor) p.sheenColor.copy(p.color).lerp(new THREE.Color(1, 1, 1), plain ? 0.15 : 0.35);
    }
    return p;
  }
  function upgradeMaterials(root) {
    root.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (Array.isArray(o.material)) o.material = o.material.map(upgradeMaterial);
      else o.material = upgradeMaterial(o.material);
    });
  }


  // ---------- Dye: recolour a textured material and keep its detail ----------
  // Multiplying a near-black texture (FC1's hair) by a colour leaves it black, so a dye
  // repaints the texture from its brightness: dark cloth becomes a deep shade of the colour, sheen
  // and folds stay lighter. Alpha (cut-outs, hair strands) is kept. Cached per texture and colour.
  var dyeCache = {};
  function dyedTexture(tex, hex) {
    var key = tex.uuid + hex;
    if (dyeCache[key]) return dyeCache[key];
    var img = tex.image;
    if (!img || !img.width) return null;
    var cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    var ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var data;
    try { data = ctx.getImageData(0, 0, cv.width, cv.height); } catch (e) { return null; }
    var px = data.data, c = new THREE.Color(hex), r = c.r * 255, g = c.g * 255, b = c.b * 255;
    for (var i = 0; i < px.length; i += 4) {
      var k = 0.45 + 2.4 * (0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) / 255;
      px[i] = Math.min(255, r * k);
      px[i + 1] = Math.min(255, g * k);
      px[i + 2] = Math.min(255, b * k);
    }
    ctx.putImageData(data, 0, 0);
    var t = new THREE.CanvasTexture(cv);
    t.flipY = tex.flipY;
    t.encoding = tex.encoding;
    t.wrapS = tex.wrapS;
    t.wrapT = tex.wrapT;
    t.anisotropy = tex.anisotropy;
    t.needsUpdate = true;
    dyeCache[key] = t;
    return t;
  }
  function dyeMaterial(m, hex) {
    if (!m.map) {
      if (m.color && m.color.isColor) m.color.copy(new THREE.Color(hex).convertSRGBToLinear());
      return;
    }
    var t = dyedTexture(m.map, hex);
    if (t) { m.map = t; m.needsUpdate = true; }
  }
`;
}

export function actorRuntimeJs(): string {
  return `
  var TARGET_HEIGHT = 1.6;
  // three r137 boxes a SkinnedMesh by its raw geometry, which is off by the rig's scale when the
  // mesh sits under a scaled bone (Rocketbox: Bip01 at 0.01). Measure skinned vertices as posed.
  function modelBox(root) {
    var box = new THREE.Box3(), v = new THREE.Vector3(), skinned = false;
    root.traverse(function (o) {
      if (!o.isSkinnedMesh || !o.geometry.attributes.position) return;
      skinned = true;
      o.skeleton.update();
      var pos = o.geometry.attributes.position;
      for (var i = 0; i < pos.count; i += 5) {
        v.fromBufferAttribute(pos, i);
        o.boneTransform(i, v);
        box.expandByPoint(v.applyMatrix4(o.matrixWorld));
      }
    });
    return skinned ? box : box.setFromObject(root);
  }

  // Scale to a common height, stand on y = 0, centred. Daz exports are in cm, VRM in m.
  function normalize(root) {
    root.updateMatrixWorld(true);
    var box = modelBox(root);
    var size = box.getSize(new THREE.Vector3());
    if (!isFinite(size.y) || size.y <= 0) return;
    var s = TARGET_HEIGHT / size.y;
    root.scale.multiplyScalar(s);
    root.updateMatrixWorld(true);
    box = modelBox(root);
    var center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
  }

${materialRuntimeJs()}
  // One character on the stage: its model, clips, loadout and followers, all under its own pivot.
  // env: { scene, post(msg), onShown(entry) }; opts: { lively }.
  function createActor(env, opts) {
  // Everything the model needs lives under this pivot so drag-to-rotate is one transform
  var pivot = new THREE.Group();
  env.scene.add(pivot);

  var current = null; // { root, vrm, mixer: clip player or null, bones }
  var loadToken = 0;

  function disposeCurrent() {
    if (!current) return;
    pivot.remove(current.root);
    current.root.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          for (var k in m) if (m[k] && m[k].isTexture) m[k].dispose();
          m.dispose();
        });
      }
    });
    current = null;
  }

  function vrmBones(vrm) {
    var H = THREE_VRM.VRMSchema.HumanoidBoneName;
    function b(name) { return vrm.humanoid ? vrm.humanoid.getBoneNode(name) : null; }
    return {
      spine: b(H.Spine), chest: b(H.Chest), head: b(H.Head),
      lUpper: b(H.LeftUpperArm), rUpper: b(H.RightUpperArm),
      lLower: b(H.LeftLowerArm), rLower: b(H.RightLowerArm),
    };
  }

  // The hand-authored clips key the fingers into a tight claw. Every frame we replace the finger
  // rotations with a relaxed hand: each finger part is its rest pose plus a curl around local Z
  // (Biped fingers run along local X and bend around +Z on both hands). Knuckles bend a little,
  // middle joints more, tips a little; the little finger curls most, the thumb only slightly.
  var CURL = { base: 0.3, mid: 0.5, tip: 0.32 };
  var THUMB_CURL = { base: 0, mid: 0.22, tip: 0.18 };
  // A clenched fist (flex poses): every joint folded, the thumb across the front.
  var FIST = { base: 1.35, mid: 1.55, tip: 1.05 };
  var FIST_THUMB = { base: 0.35, mid: 0.75, tip: 0.6 };
  function fingerPose(o, finger, seg, axis) {
    var angle = finger === 0 ? THUMB_CURL[seg] : CURL[seg] + (finger === 4 ? 0.12 : finger === 3 ? 0.06 : 0);
    var fistAngle = finger === 0 ? FIST_THUMB[seg] : FIST[seg];
    return {
      bone: o,
      target: o.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle)),
      fist: o.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, fistAngle)),
    };
  }
  function collectFingers(root) {
    var list = [];
    var zAxis = new THREE.Vector3(0, 0, 1);
    root.traverse(function (o) {
      var m = o.isBone && /finger([0-4])([0-9]?)$/i.exec(o.name);
      if (!m) return;
      list.push(fingerPose(o, +m[1], m[2] === '' ? 'base' : m[2] === '1' ? 'mid' : 'tip', zAxis));
    });
    return list.length ? list : collectCcFingers(root);
  }
  // CC rigs (L_Thumb1 .. R_Pinky3) have no shared bend axis, so each joint's axis is worked out
  // from the bind pose: across the finger, turning it toward the palm. The palm normal comes from
  // the knuckles (index to pinky) and the hand's forward direction; mirrored for the right hand.
  var CC_FINGERS = { Thumb: 0, Index: 1, Mid: 2, Ring: 3, Pinky: 4 };
  function collectCcFingers(root) {
    var bones = {};
    root.traverse(function (o) {
      var m = o.isBone && /(?:^|_)([LR])_(Hand|Thumb|Index|Mid|Ring|Pinky)([1-3]?)$/.exec(o.name);
      if (m) bones[m[1] + m[2] + m[3]] = o;
    });
    root.updateMatrixWorld(true);
    function pos(b) { return b.getWorldPosition(new THREE.Vector3()); }
    var list = [];
    ['L', 'R'].forEach(function (s) {
      var hand = bones[s + 'Hand'], index = bones[s + 'Index1'], pinky = bones[s + 'Pinky1'], mid = bones[s + 'Mid1'];
      if (!hand || !index || !pinky || !mid) return;
      var across = pos(pinky).sub(pos(index)).normalize();
      var fwd = pos(mid).sub(pos(hand)).normalize();
      var palm = s === 'L' ? new THREE.Vector3().crossVectors(across, fwd) : new THREE.Vector3().crossVectors(fwd, across);
      palm.normalize();
      var thumbToward = palm.clone().multiplyScalar(0.5).add(across).normalize();
      Object.keys(CC_FINGERS).forEach(function (name) {
        var finger = CC_FINGERS[name];
        var dir = null;
        for (var i = 1; i <= 3; i++) {
          var b = bones[s + name + i];
          if (!b) continue;
          var next = bones[s + name + (i + 1)];
          if (next) dir = pos(next).sub(pos(b)).normalize();
          if (!dir) continue;
          var axis = new THREE.Vector3().crossVectors(dir, finger === 0 ? thumbToward : palm).normalize();
          axis.applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert());
          list.push(fingerPose(b, finger, i === 1 ? 'base' : i === 2 ? 'mid' : 'tip', axis));
        }
      });
    });
    return list;
  }
  function relaxFingers() {
    var f = current && current.fingers;
    if (!f) return;
    var k = api.fist || 0;
    for (var i = 0; i < f.length; i++) {
      if (k > 0.001) f[i].bone.quaternion.copy(f[i].target).slerp(f[i].fist, k);
      else f[i].bone.quaternion.copy(f[i].target);
    }
  }

  function show(entry, token) {
    if (token !== loadToken) return;
    disposeCurrent();
    // Rest pose is read before the first mixer update, so it is the model's bind pose.
    if (entry.mixer) entry.fingers = collectFingers(entry.root);
    current = entry;
    normalize(entry.root);
    pivot.add(entry.root);
    if (!entry.vrm) upgradeMaterials(entry.root);
    rememberMaterials(entry);
    applyLoadoutNow();
    env.onShown(entry);
  }

  // ---------- Loadout (tops, pants, shoes, hair, accessories) ----------

  var CLOTHING = { kit: true, top: true, pants: true, shoes: true, face: true }; // skinned GLBs on the character's rig
  var pendingLoadout = [];
  var loadoutToken = 0;
  var loadoutObjects = []; // things we added, removed on the next applyLoadout

  function eachMaterial(root, fn) {
    root.traverse(function (o) {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { fn(m, o); });
    });
  }

  function rememberMaterials(entry) {
    eachMaterial(entry.root, function (m) {
      if (m.userData.orig) return;
      m.userData.orig = {
        map: m.map || null,
        color: m.color ? m.color.clone() : null,
        shade: m.shadeColor ? m.shadeColor.clone() : null,
      };
    });
  }

  function resetLoadout() {
    if (!current) return;
    loadoutObjects.forEach(function (o) { if (o.parent) o.parent.remove(o); });
    loadoutObjects = [];
    eachMaterial(current.root, function (m, mesh) {
      var orig = m.userData.orig;
      if (orig && orig.color) m.color.copy(orig.color);
      if (orig && m.map !== orig.map) { m.map = orig.map; m.needsUpdate = true; }
      if (orig && orig.shade) m.shadeColor.copy(orig.shade);
      if ('shouldApplyUniforms' in m) m.shouldApplyUniforms = true;
      if (mesh.userData.hiddenByOutfit) { mesh.visible = true; mesh.userData.hiddenByOutfit = false; }
    });
  }

  function matches(name, part) { return (name || '').toLowerCase().indexOf(part.toLowerCase()) !== -1; }

  // MToon (VRM) colours are Vector4 in display space; PBR colours are THREE.Color in linear space.
  function tint(m, hex) {
    var c = new THREE.Color(hex);
    if (m.color && m.color.isVector4) {
      m.color.set(c.r, c.g, c.b, m.color.w);
      if (m.shadeColor && m.shadeColor.isVector4) m.shadeColor.set(c.r * 0.78, c.g * 0.72, c.b * 0.8, m.shadeColor.w);
      m.shouldApplyUniforms = true; // three-vrm 0.6 only copies colours to the shader when flagged
    } else if (m.color && m.color.isColor) {
      m.color.copy(c.convertSRGBToLinear());
    }
  }

  function applyRecolor(map) {
    eachMaterial(current.root, function (m) {
      Object.keys(map).forEach(function (part) { if (matches(m.name, part)) tint(m, map[part]); });
    });
  }

  function applyDye(map) {
    eachMaterial(current.root, function (m) {
      Object.keys(map).forEach(function (part) { if (matches(m.name, part)) dyeMaterial(m, map[part]); });
    });
  }

  // Linear RGB factors, may exceed 1: a face item brings the body's skin to its own tone.
  function applyTint(map, root) {
    eachMaterial(root || current.root, function (m) {
      Object.keys(map).forEach(function (part) {
        var f = map[part];
        if (matches(m.name, part) && m.color && m.color.isColor) m.color.multiply(new THREE.Color(f[0], f[1], f[2]));
      });
    });
  }

  function findBone(name) {
    if (current.vrm && current.vrm.humanoid) {
      var node = current.vrm.humanoid.getBoneNode(name);
      if (node) return node;
    }
    var found = null;
    var re = new RegExp(name, 'i');
    current.root.traverse(function (o) { if (!found && o.isBone && re.test(o.name)) found = o; });
    return found;
  }

  // Head metrics in world units: bone position, distance to the top of the model, facing direction.
  function headInfo() {
    var head = findBone('head');
    if (!head) return null;
    current.root.updateMatrixWorld(true);
    var pos = head.getWorldPosition(new THREE.Vector3());
    // modelBox, not Box3.setFromObject: r137 boxes skinned meshes by their raw (unscaled) geometry,
    // which put the "top" below the head on these rigs and shrank caps into the head.
    var box = modelBox(current.root);
    return { bone: head, pos: pos, top: box.max.y, scale: head.getWorldScale(new THREE.Vector3()).x };
  }

  // Accessory material that matches the character's lighting: VRM scenes render without gamma
  // conversion and with a single light, so colours stay in display space and get some self-fill.
  function mat(color, opts) {
    var isVrm = !!(current && current.vrm);
    var c = new THREE.Color(color);
    if (!isVrm) c.convertSRGBToLinear();
    return new THREE.MeshStandardMaterial(Object.assign({
      color: c,
      emissive: c.clone().multiplyScalar(isVrm ? 0.45 : 0.15),
      roughness: 0.6,
      metalness: 0.05,
    }, opts || {}));
  }

  // Built in at unit size (head radius = 1); scaled from the measured head below.
  function buildAccessory(kind, color) {
    var g = new THREE.Group();
    if (kind === 'headband') {
      var band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 12, 48), mat(color));
      band.rotation.x = Math.PI / 2;
      band.scale.set(1, 1.14, 1.6); // after the rotation: x = width, y = depth, z = band height
      g.add(band);
    } else if (kind === 'cap') {
      var crown = new THREE.Mesh(new THREE.SphereGeometry(1.08, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(color));
      crown.scale.set(1, 0.82, 1.1);
      // the peak: a half-disc out front, angled down a little so it reads from the camera height
      var brim = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.09, 32, 1, false, -Math.PI / 2, Math.PI), mat(color));
      brim.position.set(0, 0.06, 0.5);
      brim.scale.set(0.9, 1, 1.15);
      brim.rotation.x = 0.22;
      var button = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), mat('#FFFFFF'));
      button.position.y = 0.88;
      g.add(crown, brim, button);
    } else if (kind === 'halo') {
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.08, 16, 64),
        mat(color, { emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.3 })
      );
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      g.userData.spin = true;
    }
    return g;
  }

  // Sized from the head: d = head bone to the top of the model (a head-and-a-bit for VRoid models).
  var BUILTIN_FIT = {
    headband: { radius: 0.43, lift: 0.53 },
    cap: { radius: 0.48, lift: 0.5 },
    halo: { radius: 0.42, lift: 1.12 },
  };
  // Biped (GLB) rigs: the head bone sits at the jaw, so d is about a head-and-a-half.
  var BUILTIN_FIT_GLB = {
    headband: { radius: 0.45, lift: 0.53 },
    cap: { radius: 0.5, lift: 0.55 },
    halo: { radius: 0.48, lift: 1.35 },
  };

  // CC rigs: the head bone sits at the base of the skull, and the base character's hair is fuller.
  var BUILTIN_FIT_CC = {
    headband: { radius: 0.52, lift: 0.6 },
    cap: { radius: 0.57, lift: 0.6 },
    halo: { radius: 0.48, lift: 1.12 },
  };

  function addBuiltinAccessory(cfg) {
    var info = headInfo();
    var fit = (current.vrm ? BUILTIN_FIT : /^CC_/.test(info ? info.bone.name : '') ? BUILTIN_FIT_CC : BUILTIN_FIT_GLB)[cfg.builtin];
    if (!info || !fit) return;
    var d = Math.max(0.08, info.top - info.pos.y);
    var obj = buildAccessory(cfg.builtin, cfg.color || '#E25822');
    obj.scale.setScalar(d * fit.radius);
    // Head bones on Biped rigs point along local X (not Y), so keep the accessory's orientation
    // relative to the head as it is now: upright at attach time, then following head turns and tilts.
    var headQ = info.bone.getWorldQuaternion(new THREE.Quaternion());
    var offset = headQ.invert().multiply(pivot.getWorldQuaternion(new THREE.Quaternion()));
    obj.userData.follow = { bone: info.bone, lift: d * fit.lift, offset: offset };
    pivot.add(obj);
    loadoutObjects.push(obj);
  }

  function loadGlb(url, onDone) {
    new THREE.GLTFLoader().load(url, onDone, undefined, function () {
      env.post({ type: 'ITEM_ERROR', message: 'Could not download item' });
    });
  }

  function addAttachedAccessory(cfg, token) {
    loadGlb(cfg.model_url, function (gltf) {
      if (token !== loadoutToken || !current) return;
      var bone = findBone(cfg.bone || 'head');
      if (!bone) return;
      var obj = gltf.scene;
      var p = cfg.position || [0, 0, 0], r = cfg.rotation || [0, 0, 0];
      obj.position.set(p[0], p[1], p[2]);
      obj.rotation.set(r[0], r[1], r[2]);
      if (cfg.scale) obj.scale.setScalar(cfg.scale);
      bone.add(obj);
      loadoutObjects.push(obj);
    });
  }

  // Clothing authored on the same rig: rebind every skinned mesh to the character's bones by name.
  // Short hair with real volume for faces whose hair is only painted on the skin (close crops):
  // a copy of the scalp pushed out along the normals, fuller on the crown, with a soft hairline
  // (vertex alpha) and a strand-noise texture. Skinned to the same bones, so it follows the head.
  var hairTexture = null;
  function strandTexture() {
    if (hairTexture) return hairTexture;
    var cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    var g = cv.getContext('2d');
    g.fillStyle = '#d8d8d8';
    g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 2600; i++) {
      var x = Math.random() * 256, y = Math.random() * 256, l = 3 + Math.random() * 6, a = Math.random() * Math.PI;
      var v = Math.floor(120 + Math.random() * 135);
      g.strokeStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      g.lineWidth = 0.8 + Math.random();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.4);
      g.stroke();
    }
    hairTexture = new THREE.CanvasTexture(cv);
    hairTexture.wrapS = hairTexture.wrapT = THREE.RepeatWrapping;
    hairTexture.repeat.set(10, 10);
    hairTexture.encoding = THREE.sRGBEncoding;
    return hairTexture;
  }
  function smooth(e0, e1, x) { var t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

  function addHairShell(src, color) {
    var info = headInfo();
    if (!info || !src.geometry || !src.geometry.attributes.position) return;
    var geo = src.geometry;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    var pos = geo.attributes.position, nrm = geo.attributes.normal, n = pos.count;
    var R = geo.boundingSphere.radius;
    current.root.updateMatrixWorld(true);
    src.skeleton.update();
    // work in pivot space: +y up, +z = the way the character faces
    var head = pivot.worldToLocal(info.pos.clone());
    var topY = pivot.worldToLocal(new THREE.Vector3(info.pos.x, info.top, info.pos.z)).y;
    var span = Math.max(0.05, topY - head.y);
    var cz = head.z, cx = head.x;
    var v = new THREE.Vector3();
    var alpha = new Float32Array(n), lift = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      src.boneTransform(i, v);
      v.applyMatrix4(src.matrixWorld);
      pivot.worldToLocal(v);
      var h = (v.y - head.y) / span;
      var front = Math.max(-1, Math.min(1, (v.z - cz) / (span * 0.5)));
      var side = Math.min(1, Math.abs(v.x - cx) / (span * 0.5));
      // hairline: high on the forehead, lower over the ears, lowest at the nape
      var line = front > 0 ? 0.64 + 0.16 * front - 0.06 * side : 0.6 + 0.16 * front;
      alpha[i] = smooth(line, line + 0.08, h);
      lift[i] = alpha[i] > 0 ? 0.008 + 0.028 * smooth(line, line + 0.35, h) : 0;
    }
    var idx = geo.index ? geo.index.array : null;
    var tris = [];
    var count = idx ? idx.length : n;
    for (var t = 0; t < count; t += 3) {
      var a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2;
      if (alpha[a] > 0.001 || alpha[b] > 0.001 || alpha[c] > 0.001) tris.push(a, b, c);
    }
    if (tris.length === 0) return;
    var out = new THREE.BufferGeometry();
    var p2 = new Float32Array(n * 3), col = new Float32Array(n * 4);
    for (var k = 0; k < n; k++) {
      var off = lift[k] * R;
      p2[k * 3] = pos.getX(k) + nrm.getX(k) * off;
      p2[k * 3 + 1] = pos.getY(k) + nrm.getY(k) * off;
      p2[k * 3 + 2] = pos.getZ(k) + nrm.getZ(k) * off;
      col[k * 4] = col[k * 4 + 1] = col[k * 4 + 2] = 1;
      col[k * 4 + 3] = alpha[k];
    }
    out.setAttribute('position', new THREE.BufferAttribute(p2, 3));
    out.setAttribute('normal', nrm.clone());
    if (geo.attributes.uv) out.setAttribute('uv', geo.attributes.uv.clone());
    out.setAttribute('skinIndex', geo.attributes.skinIndex.clone());
    out.setAttribute('skinWeight', geo.attributes.skinWeight.clone());
    out.setAttribute('color', new THREE.BufferAttribute(col, 4));
    out.setIndex(tris);
    var hc = new THREE.Color(color);
    if (!current.vrm) hc.convertSRGBToLinear();
    var material = new THREE.MeshStandardMaterial({
      color: hc, map: strandTexture(), roughness: 0.85, metalness: 0, transparent: true, vertexColors: true,
    });
    material.envMapIntensity = 0.35;
    var shell = new THREE.SkinnedMesh(out, material);
    shell.frustumCulled = false;
    shell.renderOrder = 2;
    shell.bind(src.skeleton, src.bindMatrix);
    (src.parent || current.root).add(shell);
    loadoutObjects.push(shell);
  }

  function addSkinnedOutfit(cfg, token) {
    loadGlb(cfg.model_url, function (gltf) {
      if (token !== loadoutToken || !current) return;
      var bonesByName = {};
      current.root.traverse(function (o) { if (o.isBone) bonesByName[o.name] = o; });
      var meshes = [];
      gltf.scene.traverse(function (o) { if (o.isSkinnedMesh) meshes.push(o); });
      meshes.forEach(function (mesh) {
        var bones = mesh.skeleton.bones.map(function (b) { return bonesByName[b.name] || b; });
        var parent = bonesByName[mesh.skeleton.bones[0] && mesh.skeleton.bones[0].name] ? current.root : null;
        if (!parent) return;
        mesh.frustumCulled = false;
        mesh.bind(new THREE.Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix);
        current.root.add(mesh);
        loadoutObjects.push(mesh);
        if (!current.vrm) upgradeMaterials(mesh);
        if (cfg.hairShell) addHairShell(mesh, cfg.hairShell);
        // loaded after the loadout's tints ran: give an outfit's skin the face's tone too
        pendingLoadout.forEach(function (it) { if (it.config && it.config.tint) applyTint(it.config.tint, mesh); });
      });
      (cfg.hide || []).forEach(function (part) {
        current.root.traverse(function (o) {
          if (o.isMesh && loadoutObjects.indexOf(o) === -1 && o.material && matches(o.material.name, part)) {
            o.visible = false;
            o.userData.hiddenByOutfit = true;
          }
        });
      });
    });
  }

  function applyLoadoutNow() {
    if (!current) return;
    var token = ++loadoutToken;
    resetLoadout();
    pendingLoadout.forEach(function (item) {
      var cfg = item.config || {};
      if (cfg.recolor) applyRecolor(cfg.recolor);
      if (cfg.tint) applyTint(cfg.tint);
      if (cfg.dye) applyDye(cfg.dye);
      if (cfg.builtin) addBuiltinAccessory(cfg);
      else if (cfg.model_url && CLOTHING[item.category]) addSkinnedOutfit(cfg, token);
      else if (cfg.model_url) addAttachedAccessory(cfg, token);
    });
  }

  function applyLoadout(items) {
    pendingLoadout = Array.isArray(items) ? items : [];
    applyLoadoutNow();
  };

  var tmpV = new THREE.Vector3();
  var tmpQ = new THREE.Quaternion();
  function updateFollowers(t) {
    loadoutObjects.forEach(function (o) {
      var f = o.userData.follow;
      if (!f) return;
      f.bone.getWorldPosition(tmpV);
      pivot.worldToLocal(tmpV);
      o.position.set(tmpV.x, tmpV.y + f.lift, tmpV.z);
      f.bone.getWorldQuaternion(tmpQ);
      o.quaternion.copy(pivot.quaternion).invert().multiply(tmpQ);
      if (f.offset) o.quaternion.multiply(f.offset);
      else if (current && current.vrm) o.rotateY(Math.PI); // VRM 0.x head faces -Z locally
      if (o.userData.spin) o.rotateY(t * 0.8);
    });
  }

  var wantBase = null; // a world's own loop (setBase)
  // Clip player: one looping base clip, with one-off moves cross-faded on top (lively mode).
  function playIdleClip(root, animations) {
    if (!animations || animations.length === 0) return null;
    var clips = {};
    animations.forEach(function (a) { clips[a.name.toLowerCase()] = a; });
    // A hero never just stands: their own loop (hero_idle, author_hero_clips.py) comes first. Other
    // bodies get a calm standing loop (the starters' "idle" is a busy warm-up for the duel screen).
    var calm = clips.hero_idle || animations.find(function (a) { return /stand|breath/i.test(a.name); })
      || animations.find(function (a) { return /idle/i.test(a.name); }) || animations[0];
    var mixer = new THREE.AnimationMixer(root);
    var base = clips.hero_idle || (opts.lively ? (clips.idle || calm) : calm);
    var p = { mixer: mixer, clips: clips, base: base, home: base, active: null, busy: false, nextAt: performance.now() + 2500 };
    if (wantBase && clips[wantBase]) p.base = clips[wantBase];
    fadeTo(p, p.base, 1, true);
    mixer.addEventListener('finished', function (e) {
      if (e.action !== p.active || !p.busy) return;
      p.busy = false;
      fadeTo(p, p.base, 1, true);
      p.nextAt = performance.now() + 5000 + Math.random() * 5000;
    });
    return p;
  }

  function fadeTo(p, clip, reps, loop) {
    var next = p.mixer.clipAction(clip);
    next.reset();
    next.setLoop(THREE.LoopRepeat, loop ? Infinity : reps);
    next.clampWhenFinished = !loop;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (p.active && p.active !== next) next.crossFadeFrom(p.active, 0.35, false);
    next.play();
    p.active = next;
  }

  var SHARED_MOVES = [
    { name: 'cheer', reps: 1 },
    { name: 'squat', reps: 2 },
    { name: 'rest', reps: 1 },
  ];
  // a hero's own signature moves, with squats
  var HERO_MOVES = [
    { name: 'hero_move1', reps: 1 },
    { name: 'hero_move2', reps: 1 },
    { name: 'squat', reps: 2 },
  ];
  var chosenMoves = null; // setMoves: an explicit list, e.g. only motion-captured clips
  function moves() {
    var p = current && current.mixer;
    if (p && chosenMoves) {
      if (!chosenMoves.length) return []; // none: the hero just keeps to their loop
      var list = chosenMoves.filter(function (n) { return p.clips[n]; }).map(function (n) { return { name: n, reps: n === 'squat' ? 2 : 1 }; });
      if (list.length) return list.length > 1 ? list : list.concat(list); // tapReact reads [0] and [1]
    }
    return p && p.clips.hero_move1 ? HERO_MOVES : SHARED_MOVES;
  }

  // Plays a one-off move, then returns to the base loop. Tells RN so the lobby can react.
  function playAction(name, reps, tapped) {
    var p = current && current.mixer;
    if (!p || !p.clips[name]) return;
    p.busy = true;
    fadeTo(p, p.clips[name], reps || 1, false);
    env.post({ type: 'ACTION', name: name, tapped: !!tapped });
  };

  function randomMove(exclude) {
    var all = moves(), options = all.filter(function (m) { return m.name !== exclude; });
    if (!options.length) options = all;
    return options[Math.floor(Math.random() * options.length)];
  }

  function livelyTick() {
    var p = current && current.mixer;
    if (!opts.lively || !p || p.busy || performance.now() < p.nextAt) return;
    var m = randomMove(p.lastMove);
    if (!m) return;
    p.lastMove = m.name;
    playAction(m.name, m.reps, false);
  }

  function loadModel(url, format) {
    var token = ++loadToken;
    var lastPct = -1;
    var loader = new THREE.GLTFLoader();
    loader.load(
      url,
      function (gltf) {
        if (token !== loadToken) return;
        var isVrm = format === 'vrm' && gltf.userData && gltf.userData.gltfExtensions && gltf.userData.gltfExtensions.VRM;
        if (isVrm) {
          THREE_VRM.VRMUtils.removeUnnecessaryJoints(gltf.scene);
          THREE_VRM.VRM.from(gltf).then(function (vrm) {
            vrm.scene.rotation.y = Math.PI; // VRM 0.x faces -Z
            vrm.scene.traverse(function (o) { o.frustumCulled = false; });
            show({ root: vrm.scene, vrm: vrm, bones: vrmBones(vrm), mixer: playIdleClip(vrm.scene, gltf.animations) }, token);
          }).catch(function (e) {
            env.post({ type: 'ERROR', message: 'Could not read VRM: ' + (e && e.message) });
          });
        } else {
          var root = gltf.scene || gltf.scenes[0];
          root.traverse(function (o) { o.frustumCulled = false; });
          show({ root: root, vrm: null, bones: null, mixer: playIdleClip(root, gltf.animations) }, token);
        }
      },
      function (ev) {
        if (token !== loadToken || !ev || !ev.total) return;
        var pct = Math.floor((ev.loaded / ev.total) * 20) * 5; // report in 5% steps
        if (pct !== lastPct) { lastPct = pct; env.post({ type: 'PROGRESS', progress: pct / 100 }); }
      },
      function (err) {
        if (token === loadToken) env.post({ type: 'ERROR', message: 'Could not download model' });
      }
    );
  };


  // Procedural idle for rigs without animation clips: arms relaxed from T-pose, breathing, look-around.
  function proceduralIdle(t) {
    var b = current && current.bones;
    if (!b) return;
    var breathe = Math.sin(t * 1.6);
    if (b.lUpper) b.lUpper.rotation.z = 1.22 + breathe * 0.02;
    if (b.rUpper) b.rUpper.rotation.z = -1.22 - breathe * 0.02;
    if (b.lLower) b.lLower.rotation.y = 0.18;
    if (b.rLower) b.rLower.rotation.y = -0.18;
    if (b.chest) b.chest.rotation.x = breathe * 0.015;
    if (b.spine) b.spine.rotation.y = Math.sin(t * 0.5) * 0.04;
    if (b.head) {
      b.head.rotation.y = Math.sin(t * 0.37) * 0.12;
      b.head.rotation.x = Math.sin(t * 0.23) * 0.04;
    }
  }

    // Per frame: clips (or the procedural idle), an optional pose on top, relaxed fingers, followers.
    function update(dt, t) {
      if (!current) return;
      if (current.mixer) {
        livelyTick();
        current.mixer.mixer.update(dt);
        if (api.pose) api.pose(current, t);
        relaxFingers();
      } else proceduralIdle(t);
      if (current.vrm) current.vrm.update(dt);
      updateFollowers(t);
    }

    var api = {
      pivot: pivot,
      loadModel: loadModel,
      applyLoadout: applyLoadout,
      playAction: playAction,
      update: update,
      current: function () { return current; },
      setMoves: function (names) { chosenMoves = Array.isArray(names) ? names : null; },
      /** The loop to return to between moves: a world's own loop (a climb on the rock face), or null
       * for the hero's usual one. Kept for models loaded later. */
      setBase: function (name) {
        wantBase = name;
        var p = current && current.mixer;
        if (!p) return;
        var next = (name && p.clips[name]) || p.home;
        if (next === p.base) return;
        p.base = next;
        if (!p.busy) fadeTo(p, p.base, 1, true);
      },
      tapReact: function () {
        var p = current && current.mixer;
        if (!p) return;
        var list = moves();
        if (!list.length) return;
        var m = p.lastMove === list[0].name ? list[1] : list[0]; // taps get the fun ones
        p.lastMove = m.name;
        playAction(m.name, m.reps, true);
      },
      pose: null,
      /** 0 = relaxed hands, 1 = clenched fists. */
      fist: 0,
    };
    return api;
  }
`;
}

export function getAvatarViewerHtml(opts: {
  modelUrl: string;
  format: 'vrm' | 'glb';
  autoRotate: boolean;
  interactive: boolean;
  /** Starting turn in radians (+ turns the model to its left). */
  initialYaw?: number;
  /** Lobby mode: warm-up loop, a random move every few seconds, and a reaction when tapped. */
  lively?: boolean;
  /** Stand the character on a game arena platform with a glowing ring. */
  platform?: boolean;
}): string {
  const config = JSON.stringify(opts);
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; }
    /* pan-y: vertical swipes scroll the RN screen, horizontal drags spin the model */
    html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; touch-action: pan-y; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
  <script src="/three/three.min.js"></script>
  <script src="/three/GLTFLoader.js"></script>
  <script src="/three/three-vrm.min.js"></script>
</head>
<body>
<script>
(function () {
  var CONFIG = ${config};
  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  if (!window.THREE || !THREE.GLTFLoader) {
    post({ type: 'ERROR', message: '3D engine failed to load' });
    return;
  }

  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  document.body.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.05, 50);

  // VRM toon (MToon) materials want one light; PBR GLB exports get a game-style rig: key, fill,
  // and two coloured rims (warm back-left, cool back-right) that pick the silhouette out.
  var hemi = new THREE.HemisphereLight(0xffffff, 0x3a3550, 0.55);
  var key = new THREE.DirectionalLight(0xfff4e8, 1.15);
  key.position.set(1.2, 2.5, 2);
  // Self-shadowing (arms on the torso, chin on the neck) and a shadow on the platform.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -1.1; key.shadow.camera.right = 1.1;
  key.shadow.camera.top = 2.0; key.shadow.camera.bottom = -0.2;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 8;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.015;
  key.shadow.radius = 3;
  var rim = new THREE.DirectionalLight(0xff9a5c, 0.9);
  rim.position.set(-2.2, 1.8, -2);
  var rim2 = new THREE.DirectionalLight(0x7fb6ff, 0.7);
  rim2.position.set(2.4, 1.4, -1.8);
  scene.add(hemi, key, rim, rim2);

  // Soft studio reflections for PBR materials (fabric sheen, shoe and skin highlights).
  var envMap = null;
  try {
    var envScene = new THREE.Scene();
    var sky = new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 top = vec3(1.0,0.96,0.92); vec3 bot = vec3(0.16,0.15,0.22); gl_FragColor = vec4(mix(bot, top, smoothstep(-0.4, 0.7, h)), 1.0); }'
      })
    );
    envScene.add(sky);
    [[3, 4, 3, 1.6], [-4, 2, -2, 1.0]].forEach(function (b) {
      var box = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(b[3], b[3], b[3]), side: THREE.DoubleSide }));
      box.position.set(b[0], b[1], b[2]);
      box.lookAt(0, 0, 0);
      envScene.add(box);
    });
    var pmrem = new THREE.PMREMGenerator(renderer);
    envMap = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
  } catch (e) { envMap = null; }

  function setLighting(isVrm) {
    hemi.visible = !isVrm;
    rim.visible = !isVrm;
    rim2.visible = !isVrm;
    key.intensity = isVrm ? 1.0 : 1.15;
    scene.environment = isVrm ? null : envMap;
    renderer.toneMapping = isVrm ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    // three-vrm 0.6 MToon already outputs display colours; GLTFLoader PBR textures need sRGB output.
    renderer.outputEncoding = isVrm ? THREE.LinearEncoding : THREE.sRGBEncoding;
    var aniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
    scene.traverse(function (o) {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
        // crisper fabric and face textures at grazing angles
        ['map', 'normalMap', 'roughnessMap'].forEach(function (k) { if (m[k]) { m[k].anisotropy = aniso; m[k].needsUpdate = true; } });
        if (!isVrm && 'envMapIntensity' in m) m.envMapIntensity = 0.6;
        m.needsUpdate = true;
      });
    });
  }

  // Game arena platform: a dark disc with a glowing orange ring (lobby, sign-in, character creation).
  if (CONFIG.platform) {
    var plat = new THREE.Group();
    var disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.66, 0.07, 64),
      new THREE.MeshStandardMaterial({ color: 0x23262f, roughness: 0.8, metalness: 0.0, envMapIntensity: 0.25 })
    );
    disc.position.y = -0.036;
    disc.receiveShadow = true;
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.012, 12, 96),
      new THREE.MeshBasicMaterial({ color: 0xff7a3c })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.002;
    var glow = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.86, 64),
      new THREE.MeshBasicMaterial({ color: 0xff7a3c, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.001;
    var inner = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.315, 64),
      new THREE.MeshBasicMaterial({ color: 0xffb27a, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.003;
    plat.add(disc, ring, glow, inner);
    plat.userData.glow = glow;
    plat.userData.lit = [ring, glow, inner];
    scene.add(plat);
    window.__platform = plat;
  }

  // Soft contact shadow under the feet
  var shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 40),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  scene.add(shadow);


  function frameCamera(height) {
    var fov = camera.fov * Math.PI / 180;
    var dist = (height * 0.62) / Math.tan(fov / 2);
    camera.position.set(0, height * 0.55, dist);
    camera.lookAt(0, height * 0.5, 0);
  }

  ${actorRuntimeJs()}

  var yaw = CONFIG.initialYaw || 0;
  var autoRotate = !!CONFIG.autoRotate;
  var lastInteraction = 0;
  var clock = new THREE.Clock();

  var actor = createActor(
    {
      scene: scene,
      post: post,
      onShown: function (entry) {
        setLighting(!!entry.vrm);
        if (view === 'stage') frameCamera(TARGET_HEIGHT);
        post({ type: 'LOADED' });
      },
    },
    { lively: !!CONFIG.lively }
  );
  var pivot = actor.pivot;
  window.loadModel = actor.loadModel;
  window.applyLoadout = actor.applyLoadout;
  window.playAction = actor.playAction;

  // ---------- Hero effect: the hero's colour on the platform, and sparks rising on every move ----------
  var effect = null, sparks = [];
  var sparkGeo = new THREE.SphereGeometry(0.018, 6, 4);
  window.setEffect = function (hex) {
    effect = hex ? new THREE.Color(hex) : null;
    if (aura) { showAura(false); showAura(true); }
    if (!window.__platform) return;
    var lit = window.__platform.userData.lit;
    var base = effect || new THREE.Color(0xff7a3c);
    lit[0].material.color.copy(base);
    lit[1].material.color.copy(base);
    lit[2].material.color.copy(base).lerp(new THREE.Color(0xffffff), 0.4);
  };
  function burst() {
    if (!effect) return;
    for (var i = 0; i < 46; i++) {
      var m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: effect.clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      var a = Math.random() * Math.PI * 2, r = 0.35 + Math.random() * 0.3;
      m.position.set(Math.cos(a) * r, 0.02 + Math.random() * 0.3, Math.sin(a) * r);
      m.userData = { v: 0.5 + Math.random() * 0.9, spin: (Math.random() - 0.5) * 1.6, life: 1.2 + Math.random() * 0.8, age: 0 };
      scene.add(m);
      sparks.push(m);
    }
  }
  function updateSparks(dt) {
    for (var i = sparks.length - 1; i >= 0; i--) {
      var m = sparks[i], u = m.userData;
      u.age += dt;
      m.position.y += u.v * dt;
      var a = Math.atan2(m.position.z, m.position.x) + u.spin * dt, r = Math.hypot(m.position.x, m.position.z);
      m.position.x = Math.cos(a) * r;
      m.position.z = Math.sin(a) * r;
      m.material.opacity = Math.max(0, 1 - u.age / u.life);
      if (u.age >= u.life) {
        scene.remove(m);
        m.material.dispose();
        sparks.splice(i, 1);
      }
    }
  }
  // a hero move: play the clip, with the hero's effect around it
  window.heroMove = function (name) {
    burst();
    actor.playAction(name, name === 'squat' ? 2 : 1);
  };
  window.setAutoRotate = function (on) { autoRotate = !!on; };

  // ---------- Hero worlds: the hero runs or hikes through their own place ----------
  // The hero stays on the spot (the clips are treadmill gaits) and the world slides past at the speed
  // their planted foot moves, so a run looks like running down the track. The world sits in the
  // pivot, so it turns with the hero. Character faces +Z; metres; the model is 1.6 tall.
  var world = null;
  function canvasTexture(w, h, draw, rx, ry) {
    var cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    draw(cv.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function skyDome(top, mid, low) {
    var dome = new THREE.Mesh(
      new THREE.SphereGeometry(42, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, low: { value: new THREE.Color(low) } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : mix(mid, low, smoothstep(0.0, -0.25, h)); gl_FragColor = vec4(c, 1.0); }',
      })
    );
    dome.renderOrder = -1; // drawn first, so far scenery beyond its radius still shows
    dome.scale.setScalar(4);
    return dome;
  }
  function stars(n, color) {
    var g = new THREE.BufferGeometry(), p = [];
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, e = 0.08 + Math.random() * 1.2;
      p.push(Math.cos(a) * Math.cos(e) * 38, Math.sin(e) * 38, Math.sin(a) * Math.cos(e) * 38);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: color, size: 0.14, fog: false, transparent: true, opacity: 0.85 }));
  }
  function glowSprite(color, size) {
    var tex = canvasTexture(64, 64, function (c, w) {
      var gr = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr;
      c.fillRect(0, 0, w, w);
    }, 1, 1);
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    s.scale.set(size, size, 1);
    return s;
  }

  // Meera: a night stadium. Red lanes under floodlights, the stands' lights glowing past.
  function buildTrack() {
    var g = new THREE.Group(), movers = [];
    g.add(skyDome(0x070b24, 0x2b1d5c, 0x110a22));
    g.add(stars(260, 0xcfd8ff));
    var grass = new THREE.Mesh(new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, function (c, w, h) {
        c.fillStyle = '#1f4a2c'; c.fillRect(0, 0, w, h);
        for (var i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#1d4529' : '#21492c'; c.fillRect(0, i * h / 8, w, h / 8); }
      }, 20, 20), roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.004;
    grass.receiveShadow = true;
    var trackTex = canvasTexture(512, 512, function (c, w, h) {
      c.fillStyle = '#9A3122'; c.fillRect(0, 0, w, h);
      for (var i = 0; i < 3000; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,190,160,0.06)'; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      c.fillStyle = '#F4EFE8';
      for (var l = 0; l <= 4; l++) c.fillRect(l * (w / 4) - 3, 0, 6, h); // lane lines run along the track
    }, 1, 6);
    var track = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 90), new THREE.MeshStandardMaterial({ map: trackTex, roughness: 0.85 }));
    track.rotation.x = -Math.PI / 2;
    track.receiveShadow = true;
    g.add(grass, track);
    // floodlight towers down both sides, and lane-side markers
    for (var i = 0; i < 6; i++) {
      [-1, 1].forEach(function (sd) {
        var tower = new THREE.Group();
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 8), new THREE.MeshStandardMaterial({ color: 0x2a2f3d, roughness: 0.6 }));
        pole.position.y = 3;
        var head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.2), new THREE.MeshBasicMaterial({ color: 0xf6f3e6, fog: false }));
        head.position.y = 6.2;
        var halo = glowSprite(0xfff3d6, 5);
        halo.position.y = 6.2;
        tower.add(pole, head, halo);
        tower.position.set(sd * (sd > 0 ? 14 : 9.5), 0, -30 + i * 12 + (sd > 0 ? 6 : 0));
        g.add(tower);
        movers.push(tower);
      });
    }
    for (var k = 0; k < 16; k++) {
      [-1, 1].forEach(function (sd) {
        var cone = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
        cone.position.set(sd * 2.6, 0.09, -30 + k * 3.75);
        cone.castShadow = true;
        g.add(cone);
        movers.push(cone);
      });
    }
    return { group: g, movers: movers, tex: trackTex, tile: 90 / 6, fog: new THREE.Fog(0x241a4a, 16, 46),
      light: { key: 0xf2f4ff, rim: 0xff7aa8, rim2: 0x8fb0ff, hemiSky: 0xb9c4ff, hemiGround: 0x3a1c2c } };
  }

  // Arjun: a mountain trail at dusk. Snow peaks ahead, pines sliding past, a dirt path underfoot.
  function buildTrail() {
    var g = new THREE.Group(), movers = [];
    g.add(skyDome(0x1d2a5e, 0xe08a5a, 0x2a2440));
    var groundTex = canvasTexture(512, 512, function (c, w, h) {
      c.fillStyle = '#4c6b3a'; c.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) { c.fillStyle = ['#3f5d30', '#5a7a43', '#6b6a45'][i % 3]; c.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
      var pw = w * 0.36;
      c.fillStyle = '#8a6a48'; c.fillRect((w - pw) / 2, 0, pw, h);
      for (var j = 0; j < 900; j++) { c.fillStyle = Math.random() < 0.5 ? '#76583b' : '#a3825d'; c.fillRect((w - pw) / 2 + Math.random() * pw, Math.random() * h, 3, 3); }
      for (var s = 0; s < 40; s++) { c.fillStyle = '#9b9894'; c.beginPath(); c.arc((w - pw) / 2 + Math.random() * pw, Math.random() * h, 3 + Math.random() * 5, 0, Math.PI * 2); c.fill(); }
    }, 1, 8);
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(9, 90), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    var meadow = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshLambertMaterial({ color: 0x2e4a26 }));
    meadow.rotation.x = -Math.PI / 2;
    meadow.position.y = -0.004;
    g.add(meadow, ground);
    // a ring of snow-capped peaks (far, fixed)
    for (var i = 0; i < 11; i++) {
      var a = (i / 11) * Math.PI * 2 + Math.random() * 0.25, r = 34 + Math.random() * 4, hgt = 8 + Math.random() * 8;
      var peak = new THREE.Group();
      var rock = new THREE.Mesh(new THREE.ConeGeometry(hgt * 0.55, hgt, 6), new THREE.MeshLambertMaterial({ color: 0x2b2d4a, flatShading: true, fog: false }));
      rock.position.y = hgt / 2 - 0.5;
      var snow = new THREE.Mesh(new THREE.ConeGeometry(hgt * 0.193, hgt * 0.35, 6), new THREE.MeshLambertMaterial({ color: 0xe8e6f4, flatShading: true, fog: false }));
      snow.position.y = hgt - 0.5 - hgt * 0.175 + 0.02;
      peak.add(rock, snow);
      peak.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      g.add(peak);
    }
    // pines along the trail
    for (var k = 0; k < 18; k++) {
      [-1, 1].forEach(function (sd) {
        var tree = new THREE.Group(), h = 2 + Math.random() * 2.5;
        var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, h * 0.3, 6), new THREE.MeshStandardMaterial({ color: 0x4a3426 }));
        trunk.position.y = h * 0.15;
        var crown = new THREE.Mesh(new THREE.ConeGeometry(h * 0.28, h * 0.85, 7), new THREE.MeshLambertMaterial({ color: 0x123524, flatShading: true }));
        crown.position.y = h * 0.3 + h * 0.42;
        crown.castShadow = true;
        tree.add(trunk, crown);
        tree.position.set(sd > 0 ? 7 + Math.random() * 6 : -(3 + Math.random() * 6), 0, -30 + k * 3.4 + Math.random() * 2);
        g.add(tree);
        movers.push(tree);
      });
    }
    return { group: g, movers: movers, tex: groundTex, tile: 90 / 8, fog: new THREE.Fog(0x6e5068, 18, 52),
      light: { key: 0xffd7a8, rim: 0xff8a4c, rim2: 0x9fb4ff, hemiSky: 0xffd9c0, hemiGround: 0x2c3a26 } };
  }


  // Arjun: the last stretch of the mountain, straight up. A rock face in front of him (he faces +Z),
  // holds and ledges sliding down as he climbs, the valley far below and the peaks around.
  function buildCliff() {
    var g = new THREE.Group(), movers = [];
    g.add(skyDome(0x1d2a5e, 0xe08a5a, 0x3a3050));
    // granite: soft light and dark patches, fine grain, then cracks and a few seams
    var rockTex = canvasTexture(1024, 1024, function (c, w, h) {
      c.fillStyle = '#5a524c'; c.fillRect(0, 0, w, h);
      for (var i = 0; i < 160; i++) {
        var x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 140, l = Math.random() < 0.5;
        var gr = c.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, l ? 'rgba(140,128,116,0.28)' : 'rgba(30,26,24,0.28)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gr;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      var img = c.getImageData(0, 0, w, h), d = img.data;
      for (var k = 0; k < d.length; k += 4) { var n = (Math.random() - 0.5) * 26; d[k] += n; d[k + 1] += n; d[k + 2] += n; }
      c.putImageData(img, 0, 0);
      c.lineCap = 'round';
      for (var q = 0; q < 34; q++) {
        var cx = Math.random() * w, cy = Math.random() * h;
        c.strokeStyle = 'rgba(18,15,14,0.7)';
        c.lineWidth = 1.5 + Math.random() * 3;
        c.beginPath();
        c.moveTo(cx, cy);
        for (var st = 0; st < 7; st++) { cx += (Math.random() - 0.5) * 50; cy += 12 + Math.random() * 40; c.lineTo(cx, cy); }
        c.stroke();
        c.strokeStyle = 'rgba(170,158,146,0.35)';
        c.lineWidth = 1;
        c.stroke();
      }
    }, 7, 6);
    // A 40-degree rock slope rising ahead of him (+Z), built flat in the slope group and tilted. It ends in an
    // edge on his right, past which the drop and the far peaks show. The app keeps its surface under his
    // hands and feet and slides it down as he pulls (gripSpeed does both).
    var SLOPE = 40 * Math.PI / 180;
    var slope = new THREE.Group();
    slope.rotation.x = -SLOPE;
    var face = new THREE.Mesh(new THREE.PlaneGeometry(30, 64), new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.95, envMapIntensity: 0.2 }));
    face.rotation.x = -Math.PI / 2;
    face.position.x = -12.2;
    face.receiveShadow = true;
    slope.add(face);
    var rockMat = new THREE.MeshStandardMaterial({ color: 0x4d443d, roughness: 1, flatShading: true, envMapIntensity: 0.15 });
    // holds around him, boulders and ledges further out
    for (var i = 0; i < 80; i++) {
      var near = i < 45, r = near ? 0.05 + Math.random() * 0.07 : 0.2 + Math.random() * 0.55;
      var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
      var x = near ? (Math.random() - 0.5) * 1.4 : -(1.0 + Math.random() * 14);
      rock.position.set(x, r * 0.25, -30 + Math.random() * 60);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      rock.scale.set(1.3, 0.6, 1.2);
      rock.castShadow = rock.receiveShadow = true;
      slope.add(rock);
      movers.push(rock);
    }
    g.add(slope);
    // the valley far below and the range around it
    // forest and meadow patches far below
    var valley = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ map: canvasTexture(512, 512, function (c, w, h) {
      c.fillStyle = '#26382a'; c.fillRect(0, 0, w, h);
      for (var i = 0; i < 900; i++) {
        c.fillStyle = ['#1c2c22', '#30442c', '#3a4a30', '#2a3326'][i % 4];
        c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 14, 0, Math.PI * 2); c.fill();
      }
    }, 10, 10) }));
    valley.rotation.x = -Math.PI / 2;
    valley.position.y = -26;
    g.add(valley);
    // the range, far out in the haze all around
    for (var p = 0; p < 16; p++) {
      var a = (p / 16) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      var rr = 120 + Math.random() * 40, hgt = 26 + Math.random() * 22;
      var peak = new THREE.Group();
      var body = new THREE.Mesh(new THREE.ConeGeometry(hgt * 0.6, hgt, 7), new THREE.MeshLambertMaterial({ color: 0x2b2d4a, flatShading: true }));
      body.position.y = hgt / 2;
      var cap = new THREE.Mesh(new THREE.ConeGeometry(hgt * 0.21, hgt * 0.35, 7), new THREE.MeshLambertMaterial({ color: 0xe8e6f4, flatShading: true }));
      cap.position.y = hgt - hgt * 0.175;
      peak.add(body, cap);
      peak.position.set(Math.cos(a) * rr, -26, Math.sin(a) * rr);
      g.add(peak);
    }
    return {
      group: g, movers: movers, tex: rockTex, tile: 64 / 6, slope: slope, angle: SLOPE, fog: new THREE.Fog(0x9a7088, 25, 190),
      light: { key: 0xffd7a8, rim: 0xff8a4c, rim2: 0x9fb4ff, hemiSky: 0xffd9c0, hemiGround: 0x3a3040 },
      base: 'hero_world',
      // side-on from his right, past the edge, so the slope, the drop and the peaks all show
      showcase: { pos: [3.6, 1.6, -0.9], look: [-0.6, 0.75, 0.6] },
      shots: {
        face: { pos: [0.7, 1.3, 1.7], look: [0, 1.0, 0.4], push: 0.2 },
        feet: { pos: [1.7, 0.6, -0.5], look: [0, 0.45, 0.4], push: 0.15 },
        low: { pos: [2.0, 0.35, -1.6], look: [0, 0.9, 0.6], push: 0.15 },
        back: { pos: [0.3, 1.4, -2.4], look: [0, 0.9, 0.6], push: 0.15 },
        wide: { pos: [6.5, 2.4, -5.5], look: [0, 0.6, 0.6], push: 0.1 },
        orbit: { pos: [3.0, 1.3, 0], look: [0, 0.8, 0.4], orbit: -1.4 },
        hero: { pos: [0.35, 1.9, 2.3], look: [0, 0.75, 0], push: 0.15 },
        side: { pos: [3.2, 1.2, 0.2], look: [0, 0.8, 0.4], push: 0.12 },
      },
    };
  }

  var WORLDS = { track: buildTrack, trail: buildTrail, cliff: buildCliff };
  var groundSpeed = 0, feet = null, feetOf = null, prevFoot = {};
  window.setWorld = function (name) {
    if (world) { pivot.remove(world.group); world = null; scene.fog = null; actor.setBase(null); }
    if (window.__platform) window.__platform.visible = !WORLDS[name];
    if (!WORLDS[name]) return;
    world = WORLDS[name]();
    // the worlds give display (sRGB) colours; three.js lights in linear
    world.group.traverse(function (o) {
      if (!o.material || o.material.isShaderMaterial) return;
      if (o.material.color && !o.material.map && !o.material.userData.linear) {
        o.material.color.convertSRGBToLinear();
        o.material.userData.linear = true;
      }
    });
    world.fog.color.convertSRGBToLinear();
    camera.far = 260; // far scenery
    camera.updateProjectionMatrix();
    pivot.add(world.group);
    scene.fog = world.fog;
    key.color.setHex(world.light.key);
    rim.color.setHex(world.light.rim);
    rim2.color.setHex(world.light.rim2);
    hemi.color.setHex(world.light.hemiSky);
    hemi.groundColor.setHex(world.light.hemiGround);
    shadow.visible = false; // the key light's real shadow lands on the ground or the rock
    if (world.base) actor.setBase(world.base);
  };
  // speed of the planted foot sliding back (metres per second), from the toe bones
  var tmpFoot = new THREE.Vector3();
  function footSpeed(dt) {
    var cur = actor.current();
    if (!cur || !dt) return groundSpeed;
    if (feetOf !== cur) {
      feetOf = cur;
      feet = [];
      prevFoot = {};
      cur.root.traverse(function (o) { if (o.isBone && /(ToeBase|Toe0)$/.test(o.name)) feet.push(o); });
    }
    if (feet.length < 2) return 0;
    var low = null, lowY = Infinity, speedNow = null;
    feet.forEach(function (b) {
      b.getWorldPosition(tmpFoot);
      pivot.worldToLocal(tmpFoot);
      var prev = prevFoot[b.uuid];
      if (prev && tmpFoot.y < lowY) { lowY = tmpFoot.y; low = (prev.z - tmpFoot.z) / dt; }
      prevFoot[b.uuid] = tmpFoot.clone();
    });
    if (low !== null && lowY < 0.07) speedNow = Math.max(0, Math.min(low, 12));
    if (speedNow !== null) groundSpeed += (speedNow - groundSpeed) * Math.min(1, dt * 5);
    return groundSpeed;
  }
  // climbing: the hand or foot gripping the rock slides down as he pulls up; the fastest one sets the pace
  var limbs = null, limbsOf = null, prevLimb = {}, climbSpeed = 0;
  function gripSpeed(dt) {
    var cur = actor.current();
    if (!cur || !dt) return climbSpeed;
    if (limbsOf !== cur) {
      limbsOf = cur;
      limbs = [];
      prevLimb = {};
      cur.root.traverse(function (o) { if (o.isBone && /(ToeBase|Toe0|_Hand|Hand)$/.test(o.name)) limbs.push(o); });
    }
    // up the slope, and out of it
    var a = world.angle, ux = 0, uy = Math.sin(a), uz = Math.cos(a), ny = Math.cos(a), nz = -Math.sin(a);
    var down = 0, lowest = Infinity;
    limbs.forEach(function (b) {
      b.getWorldPosition(tmpFoot);
      pivot.worldToLocal(tmpFoot);
      var prev = prevLimb[b.uuid];
      if (prev) down = Math.max(down, ((prev.y - tmpFoot.y) * uy + (prev.z - tmpFoot.z) * uz) / dt);
      lowest = Math.min(lowest, tmpFoot.y * ny + tmpFoot.z * nz);
      prevLimb[b.uuid] = tmpFoot.clone();
    });
    climbSpeed += (Math.min(down, 3) - climbSpeed) * Math.min(1, dt * 2.5);
    // the surface sits under the lowest hand or foot, rising back slowly between grips
    if (world.surface === undefined) world.surface = lowest;
    world.surface = Math.min(lowest, world.surface + dt * 0.04);
    world.slope.position.set(0, ny * (world.surface - 0.03), nz * (world.surface - 0.03));
    return climbSpeed;
  }
  function scrollWorld(dt) {
    if (world.slope) {
      var ds = gripSpeed(dt) * dt;
      world.tex.offset.y -= ds / world.tile;
      world.movers.forEach(function (m) {
        m.position.z -= ds;
        if (m.position.z < -30) m.position.z += 60;
      });
      return;
    }
    var v = footSpeed(dt), dz = v * dt;
    world.tex.offset.y -= dz / world.tile;
    world.movers.forEach(function (m) {
      m.position.z -= dz;
      if (m.position.z < -30) m.position.z += 60;
    });
  }

  // ---------- Camera: the stage view, the hero showcase, and story shots ----------
  var view = 'stage', story = null;
  // shots in the hero's frame (faces +Z): camera position and look-at, metres
  var SHOTS = {
    face: { pos: [0.35, 1.42, 1.25], look: [0, 1.36, 0], push: 0.22 },
    feet: { pos: [1.1, 0.16, 0.5], look: [0, 0.22, -0.2], push: 0.15 },
    side: { pos: [3.2, 1.0, 0.0], look: [0, 0.85, 0], push: 0.12 },
    low: { pos: [0.5, 0.25, 1.9], look: [0, 1.15, 0], push: 0.2 },
    back: { pos: [0.4, 1.35, -2.4], look: [0, 1.0, 1.5], push: 0.15 },
    wide: { pos: [4.5, 2.2, 4.5], look: [0, 0.9, 0], push: 0.1 },
    orbit: { pos: [2.6, 1.0, 0], look: [0, 0.9, 0], orbit: 1.4 },
    hero: { pos: [-0.9, 0.55, 2.6], look: [0, 1.1, 0], push: 0.18 },
  };
  var tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  function placeCamera(pos, look) {
    tmpA.fromArray(pos);
    tmpB.fromArray(look);
    pivot.localToWorld(tmpA);
    pivot.localToWorld(tmpB);
    camera.position.copy(tmpA);
    camera.lookAt(tmpB);
  }
  function showcaseCamera(t) {
    // side-on three-quarter view with the hero right of centre, a slow breathing drift
    var d = Math.sin(t * 0.3) * 0.08;
    if (world && world.showcase) placeCamera([world.showcase.pos[0] + d, world.showcase.pos[1], world.showcase.pos[2]], world.showcase.look);
    else placeCamera([3.7 + d, 1.2, 2.7], [-0.5, 0.95, 1.2]);
  }
  window.setView = function (name) {
    view = name;
    showAura(name === 'lobby');
    if (name === 'stage') frameCamera(TARGET_HEIGHT);
  };
  // ---------- Lobby glory: a halo behind the hero and light rays fanning out ----------
  var aura = null;
  function rayTexture() {
    return canvasTexture(64, 256, function (c, w, h) {
      var gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr;
      c.fillRect(0, 0, w, h);
      var side = c.createLinearGradient(0, 0, w, 0);
      side.addColorStop(0, 'rgba(0,0,0,1)');
      side.addColorStop(0.5, 'rgba(0,0,0,0)');
      side.addColorStop(1, 'rgba(0,0,0,1)');
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = side;
      c.fillRect(0, 0, w, h);
    }, 1, 1);
  }
  function buildAura() {
    var g = new THREE.Group(), color = effect || new THREE.Color(0xffb27a);
    var halo = glowSprite(color, 3.4);
    halo.position.set(0, 1.15, -0.8);
    halo.material.opacity = 0.4;
    g.add(halo);
    var core = glowSprite(0xffffff, 1.6);
    core.position.set(0, 1.25, -0.9);
    core.material.opacity = 0.16;
    g.add(core);
    var rays = new THREE.Group(), tex = rayTexture();
    for (var i = 0; i < 9; i++) {
      var ray = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 7), new THREE.MeshBasicMaterial({
        map: tex, color: color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
      }));
      ray.geometry.translate(0, 3.5, 0);
      ray.rotation.z = (i - 4) * 0.28;
      rays.add(ray);
    }
    rays.position.set(0, 0.6, -1.4);
    g.add(rays);
    return { group: g, rays: rays, halo: halo, color: color };
  }
  function updateAura(dt, t) {
    aura.rays.rotation.z = Math.sin(t * 0.15) * 0.08;
    aura.halo.material.opacity = 0.32 + Math.sin(t * 1.3) * 0.08;
  }
  function showAura(on) {
    if (on && !aura) {
      aura = buildAura();
      pivot.add(aura.group);
    } else if (!on && aura) {
      pivot.remove(aura.group);
      aura = null;
    }
  }
  // the lobby: the hero big, from the knees up, a little left of centre and seen from slightly below
  function lobbyCamera(t) {
    var d = Math.sin(t * 0.25) * 0.06;
    placeCamera([1.05 + d, 0.95, 2.35], [0.32, 1.02, 0]);
  }
  // the moves a lively hero plays between loops (the lobby picks only motion-captured ones)
  window.setMoves = function (names) { actor.setMoves(names); };

  function startShot() {
    var s = story.shots[story.i];
    story.t = 0;
    var cur = actor.current();
    if (cur && cur.mixer) cur.mixer.mixer.timeScale = s.slow || 1;
    if (s.clip && s.clip !== 'hero_idle') actor.playAction(s.clip, s.reps || 1);
    if (s.burst) burst();
    post({ type: 'STORY', event: 'shot', index: story.i });
  }
  function endStory(silent) {
    if (!story) return;
    story = null;
    var cur = actor.current();
    if (cur && cur.mixer) cur.mixer.mixer.timeScale = 1;
    if (!silent) post({ type: 'STORY', event: 'end' });
  }
  window.playStory = function (shots) {
    yaw = 0;
    autoRotate = false;
    story = { shots: shots, i: 0, t: 0 };
    startShot();
  };
  window.stopStory = function () { endStory(true); };
  function storyCamera(dt) {
    var s = story.shots[story.i], set = (world && world.shots) || SHOTS, c = set[s.cam] || SHOTS[s.cam] || SHOTS.side;
    story.t += dt;
    var k = Math.min(1, story.t / s.dur), e = k * k * (3 - 2 * k);
    if (c.orbit) {
      var a = e * c.orbit, r = Math.hypot(c.pos[0], c.pos[2]);
      placeCamera([Math.cos(a) * r, c.pos[1], Math.sin(a) * r], c.look);
    } else {
      var p = c.pos.map(function (v, i) { return v + (c.look[i] - v) * c.push * e; });
      placeCamera(p, c.look);
    }
    if (story.t >= s.dur) {
      story.i++;
      if (story.i >= story.shots.length) endStory(false);
      else startShot();
    }
  }

  if (CONFIG.interactive) {
    var dragging = false, lastX = 0, downX = 0, downAt = 0;
    renderer.domElement.addEventListener('pointerdown', function (e) {
      dragging = true; lastX = downX = e.clientX; downAt = lastInteraction = performance.now();
    });
    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      yaw += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
      lastInteraction = performance.now();
    });
    window.addEventListener('pointerup', function (e) {
      if (!dragging) return;
      dragging = false;
      // a short tap without a drag: the character reacts (lively mode)
      if (CONFIG.lively && Math.abs(e.clientX - downX) < 10 && performance.now() - downAt < 400) actor.tapReact();
    });
    window.addEventListener('pointercancel', function () { dragging = false; });
  }

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function tick() {
    requestAnimationFrame(tick);
    var dt = Math.min(clock.getDelta(), 0.1);
    var t = clock.elapsedTime;
    if (autoRotate && performance.now() - lastInteraction > 2500) yaw += dt * 0.45;
    if (window.__platform) window.__platform.userData.glow.material.opacity = 0.14 + Math.sin(t * 2.2) * 0.06;
    pivot.rotation.y = yaw;
    actor.update(dt, t);
    if (world) scrollWorld(dt);
    if (story) storyCamera(dt);
    else if (view === 'showcase') showcaseCamera(t);
    else if (view === 'lobby') lobbyCamera(t);
    if (aura) updateAura(dt, t);
    if (sparks.length) updateSparks(dt);
    renderer.render(scene, camera);
  }

  frameCamera(TARGET_HEIGHT);
  tick();
  actor.loadModel(CONFIG.modelUrl, CONFIG.format);
})();
</script>
</body>
</html>`;
}
