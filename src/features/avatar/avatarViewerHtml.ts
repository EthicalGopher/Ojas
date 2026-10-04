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
//   recolor  { recolor: { "<material name part>": "#hex" } }   outfits and hair on the character's own materials
//   skinned  { model_url, hide: ["<material name part>"] }      clothing GLB rigged to the same skeleton
//   builtin  { builtin: "headband" | "cap" | "halo", color }     accessories drawn here, on the head bone
//   attached { model_url, bone, position, rotation, scale }      accessory GLB on a humanoid bone

export function getAvatarViewerHtml(opts: {
  modelUrl: string;
  format: 'vrm' | 'glb';
  autoRotate: boolean;
  interactive: boolean;
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

  // VRM toon (MToon) materials want one light; PBR GLB exports need fill and rim too.
  var hemi = new THREE.HemisphereLight(0xffffff, 0x444466, 0.9);
  var key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(1.2, 2.5, 2);
  var rim = new THREE.DirectionalLight(0xffd2b0, 0.5);
  rim.position.set(-2, 1.5, -2);
  scene.add(hemi, key, rim);
  function setLighting(isVrm) {
    hemi.visible = !isVrm;
    rim.visible = !isVrm;
    key.intensity = isVrm ? 1.0 : 0.9;
    // three-vrm 0.6 MToon already outputs display colours; GLTFLoader PBR textures need sRGB output.
    renderer.outputEncoding = isVrm ? THREE.LinearEncoding : THREE.sRGBEncoding;
    scene.traverse(function (o) {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.needsUpdate = true; });
    });
  }

  // Soft contact shadow under the feet
  var shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 40),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  scene.add(shadow);

  // Everything the model needs lives under this pivot so drag-to-rotate is one transform
  var pivot = new THREE.Group();
  scene.add(pivot);

  var TARGET_HEIGHT = 1.6;
  var current = null; // { root, vrm, mixer, bones }
  var loadToken = 0;
  var yaw = 0;
  var autoRotate = !!CONFIG.autoRotate;
  var lastInteraction = 0;
  var clock = new THREE.Clock();

  function frameCamera(height) {
    var fov = camera.fov * Math.PI / 180;
    var dist = (height * 0.62) / Math.tan(fov / 2);
    camera.position.set(0, height * 0.55, dist);
    camera.lookAt(0, height * 0.5, 0);
  }

  // Scale to a common height, stand on y = 0, centred. Daz exports are in cm, VRM in m.
  function normalize(root) {
    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(root);
    var size = box.getSize(new THREE.Vector3());
    if (!isFinite(size.y) || size.y <= 0) return;
    var s = TARGET_HEIGHT / size.y;
    root.scale.multiplyScalar(s);
    root.updateMatrixWorld(true);
    box.setFromObject(root);
    var center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
  }

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

  function show(entry, token) {
    if (token !== loadToken) return;
    disposeCurrent();
    current = entry;
    normalize(entry.root);
    pivot.add(entry.root);
    setLighting(!!entry.vrm);
    frameCamera(TARGET_HEIGHT);
    rememberMaterials(entry);
    applyLoadoutNow();
    post({ type: 'LOADED' });
  }

  // ---------- Loadout (outfits, hair, accessories) ----------

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
    var box = new THREE.Box3().setFromObject(current.root);
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
      var band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.11, 12, 48), mat(color));
      band.rotation.x = Math.PI / 2;
      band.scale.set(1, 1.14, 1.4); // after the rotation: x = width, y = depth, z = band height
      g.add(band);
    } else if (kind === 'cap') {
      var crown = new THREE.Mesh(new THREE.SphereGeometry(1.08, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(color));
      crown.scale.set(1, 0.82, 1.1);
      var brim = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.06, 32, 1, false, -Math.PI / 2.4, Math.PI / 1.2), mat(color));
      brim.position.set(0, 0.03, 0.55);
      brim.scale.set(0.95, 1, 1);
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

  function addBuiltinAccessory(cfg) {
    var info = headInfo();
    var fit = BUILTIN_FIT[cfg.builtin];
    if (!info || !fit) return;
    var d = Math.max(0.08, info.top - info.pos.y);
    var obj = buildAccessory(cfg.builtin, cfg.color || '#E25822');
    obj.scale.setScalar(d * fit.radius);
    obj.userData.follow = { bone: info.bone, lift: d * fit.lift };
    pivot.add(obj);
    loadoutObjects.push(obj);
  }

  function loadGlb(url, onDone) {
    new THREE.GLTFLoader().load(url, onDone, undefined, function () {
      post({ type: 'ITEM_ERROR', message: 'Could not download item' });
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
      if (cfg.builtin) addBuiltinAccessory(cfg);
      else if (cfg.model_url && item.category === 'outfit') addSkinnedOutfit(cfg, token);
      else if (cfg.model_url) addAttachedAccessory(cfg, token);
    });
  }

  window.applyLoadout = function (items) {
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
      if (current && current.vrm) o.rotateY(Math.PI); // VRM 0.x head faces -Z locally
      if (o.userData.spin) o.rotateY(t * 0.8);
    });
  }

  function playIdleClip(root, animations) {
    if (!animations || animations.length === 0) return null;
    var clip = animations.find(function (a) { return /idle|breath|stand/i.test(a.name); }) || animations[0];
    var mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(clip).play();
    return mixer;
  }

  window.loadModel = function (url, format) {
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
            post({ type: 'ERROR', message: 'Could not read VRM: ' + (e && e.message) });
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
        if (pct !== lastPct) { lastPct = pct; post({ type: 'PROGRESS', progress: pct / 100 }); }
      },
      function (err) {
        if (token === loadToken) post({ type: 'ERROR', message: 'Could not download model' });
      }
    );
  };

  window.setAutoRotate = function (on) { autoRotate = !!on; };

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

  if (CONFIG.interactive) {
    var dragging = false, lastX = 0;
    renderer.domElement.addEventListener('pointerdown', function (e) { dragging = true; lastX = e.clientX; lastInteraction = performance.now(); });
    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      yaw += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
      lastInteraction = performance.now();
    });
    window.addEventListener('pointerup', function () { dragging = false; });
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
    pivot.rotation.y = yaw;
    if (current) {
      if (current.mixer) current.mixer.update(dt);
      else proceduralIdle(t);
      if (current.vrm) current.vrm.update(dt);
      updateFollowers(t);
    }
    renderer.render(scene, camera);
  }

  frameCamera(TARGET_HEIGHT);
  tick();
  window.loadModel(CONFIG.modelUrl, CONFIG.format);
})();
</script>
</body>
</html>`;
}
