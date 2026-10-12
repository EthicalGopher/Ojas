// HTML for the AI opponent in Human vs AI: the 3D instructor. Loaded with baseUrl
// http://127.0.0.1:8888 so three.js and the model come from the APK (works offline).
//
// The model's clips (authored in ~/Coding/Python/model/instructor/ojas/author_poses.py):
//   squat  one rep, standing at t = 0 and at the end, bottom in the middle. Never played on its
//          own clock: its time follows the bot's rep progress, so each rep scored is one squat.
//   idle   loop: breathing, weight shifts, glances (before the match, and after it if he lost)
//   rest   loop: hands on hips (the bot's pauses between reps)
//   cheer  loop: fists overhead (the AI won)
// Switching clips crossfades over CROSSFADE seconds.
//
// Behind the transparent canvas sits a gym photo (web/backdrops/, see CREDITS.md there), picked
// at random per match, with a vignette so the scoreboard and widgets stay readable.
//
// The same page shows a 1v1 duel opponent: their shop character (modelUrl) wearing their face
// and outfit (loadout: { category, config } items, as in avatarViewerHtml.ts: skinned GLBs rebound
// by bone name, `hide` material parts, `tint` linear multipliers).
//
// RN -> page: window.setAnim(mode, progress)   mode: 'squat' | 'idle' | 'rest' | 'cheer'
//             window.setLive(on)                live moves: follow the opponent's streamed pose
//             window.setPose(p)                 19 joints x [x, y, z cm, visibility 0-9], MediaPipe
//                                               world landmarks (see LIVE_JOINTS), about 12 per second
// page -> RN: { type: 'PROGRESS', progress } | { type: 'LOADED' } | { type: 'ERROR', message }
//             | { type: 'HEARTBEAT' } every 2 s while frames render (RN reloads the view if they stop)

/** stand: the duel starters' calm loop (the instructor has no such clip and keeps the last mode). */
export type AiInstructorMode = 'squat' | 'idle' | 'rest' | 'cheer' | 'stand';

import { ASSET_BUST } from '../../utils/avatarShopService';

// Per-launch query, shared with the shop / VS viewers (see ASSET_BUST).
export const BUST = ASSET_BUST;
export const AI_INSTRUCTOR_MODEL_URL = `http://127.0.0.1:8888/avatars/instructor_ai.glb${BUST}`;
export const AI_BACKDROPS = ['gym_turf', 'gym_rig', 'gym_hall'].map((n) => `/backdrops/${n}.jpg${BUST}`);

/** MediaPipe pose indices streamed for live moves, in order (CameraScreen POSE_WORLD). */
export const LIVE_JOINTS = [0, 7, 8, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28, 31, 32];

export interface AiLoadoutItem {
  category: string;
  config: {
    model_url?: string;
    hide?: string[];
    tint?: Record<string, [number, number, number]>;
    recolor?: Record<string, string>;
  };
}

export function getAiInstructorHtml(
  modelUrl: string = AI_INSTRUCTOR_MODEL_URL,
  backdrop: string = AI_BACKDROPS[Math.floor(Math.random() * AI_BACKDROPS.length)],
  loadout: AiLoadoutItem[] = [],
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0A0D14; }
    #backdrop {
      position: fixed; inset: 0;
      background: #0A0D14 url(${JSON.stringify(backdrop)}) center 58% / cover no-repeat;
    }
    /* darker at the top (scoreboard) and bottom (widgets), dimmed overall so he stands out */
    #backdrop::after {
      content: ''; position: absolute; inset: 0;
      background:
        linear-gradient(to bottom, rgba(10,13,20,0.72) 0%, rgba(10,13,20,0.18) 22%, rgba(10,13,20,0.12) 60%, rgba(10,13,20,0.78) 100%),
        radial-gradient(ellipse at 50% 55%, rgba(10,13,20,0) 40%, rgba(10,13,20,0.45) 100%);
    }
    canvas { position: fixed; inset: 0; display: block; width: 100%; height: 100%; }
  </style>
  <script src="/three/three.min.js"></script>
  <script src="/three/GLTFLoader.js"></script>
</head>
<body>
<div id="backdrop"></div>
<script>
(function () {
  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  window.onerror = function (m, src, line) { post({ type: 'ERROR', message: 'js: ' + m + ' @' + line }); };
  if (!window.THREE || !THREE.GLTFLoader) {
    post({ type: 'ERROR', message: '3D engine failed to load' });
    return;
  }

  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    post({ type: 'ERROR', message: 'webgl context lost' });
  });

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.05, 50);

  var hemi = new THREE.HemisphereLight(0xffffff, 0x3a3f52, 0.75);
  var key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(1.6, 3.0, 3.2);
  var rim = new THREE.DirectionalLight(0xffc29a, 0.7);
  rim.position.set(-2.2, 2.0, -2.0);
  scene.add(hemi, key, rim);

  // Soft contact shadow on the photo's floor
  var shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  var sctx = shadowCanvas.getContext('2d');
  var grad = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.4)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  var shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.8),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  scene.add(shadow);

  var TARGET_HEIGHT = 1.75;
  // Front view: he faces the player.
  var YAW = 0;
  var CROSSFADE = 0.35;
  var mixer = null, actions = {}, weights = {};
  var mode = 'idle', target = 0, shown = 0;

  function frameCamera() {
    var fov = camera.fov * Math.PI / 180;
    var aspect = camera.aspect;
    // Fit the standing height, and the width of the crouch on narrow (landscape split) views.
    var fitH = (TARGET_HEIGHT * 0.6) / Math.tan(fov / 2);
    var fitW = (0.75 / aspect) / Math.tan(fov / 2);
    var dist = Math.max(fitH, fitW);
    camera.position.set(0, TARGET_HEIGHT * 0.55, dist);
    camera.lookAt(0, TARGET_HEIGHT * 0.47, 0);
  }

  // Scale to a common height, stand on y = 0, centred. Measured on the posed bones: the skinned
  // mesh's own bounds are its bind-pose geometry, which ignores the armature's transform.
  function boneBox(root) {
    root.updateMatrixWorld(true);
    var box = new THREE.Box3(), v = new THREE.Vector3();
    root.traverse(function (o) { if (o.isBone) box.expandByPoint(o.getWorldPosition(v)); });
    return box;
  }
  function normalize(root) {
    var box = boneBox(root);
    var size = box.getSize(new THREE.Vector3());
    if (!isFinite(size.y) || size.y <= 0) return;
    // Bones run from the toes to the head bone, about 92 % of standing height.
    root.scale.multiplyScalar((TARGET_HEIGHT * 0.92) / size.y);
    box = boneBox(root);
    var center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y - 0.03; // toe bones sit a little above the soles
  }

  // ---------- Loadout: face / outfit GLBs on the same Bip01 skeleton ----------
  var LOADOUT = ${JSON.stringify(loadout)};
  var model = null, floorY = 0;
  function matches(name, part) { return (name || '').toLowerCase().indexOf(part.toLowerCase()) !== -1; }
  var TINTS = LOADOUT.map(function (it) { return (it.config || {}).tint; }).filter(Boolean);
  function tintMesh(o) {
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
      if (!m || !m.color) return;
      TINTS.forEach(function (t) {
        Object.keys(t).forEach(function (part) {
          if (matches(m.name, part)) m.color.multiply(new THREE.Color(t[part][0], t[part][1], t[part][2]));
        });
      });
    });
  }
  function applyLoadout(root) {
    // shop colour items: a top / pants / shoes colour on the character's own materials
    LOADOUT.forEach(function (it) {
      var rc = (it.config || {}).recolor;
      if (!rc) return;
      root.traverse(function (o) {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          Object.keys(rc).forEach(function (part) {
            if (m && m.color && matches(m.name, part)) m.color.copy(new THREE.Color(rc[part]).convertSRGBToLinear());
          });
        });
      });
    });
    root.traverse(function (o) { if (o.isMesh) tintMesh(o); });
    LOADOUT.forEach(function (it) {
      var c = it.config || {};
      if (!c.model_url) return;
      new THREE.GLTFLoader().load(c.model_url, function (g) {
        var byName = {};
        root.traverse(function (o) { if (o.isBone) byName[o.name] = o; });
        var meshes = [];
        g.scene.traverse(function (o) { if (o.isSkinnedMesh) meshes.push(o); });
        meshes.forEach(function (mesh) {
          var bones = mesh.skeleton.bones.map(function (b) { return byName[b.name] || b; });
          mesh.frustumCulled = false;
          mesh.userData.loadout = true;
          mesh.bind(new THREE.Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix);
          root.add(mesh);
          tintMesh(mesh);
        });
        (c.hide || []).forEach(function (part) {
          root.traverse(function (o) {
            if (o.isMesh && !o.userData.loadout && o.material && matches(o.material.name, part)) o.visible = false;
          });
        });
      });
    });
  }

  // ---------- Live moves: retarget streamed MediaPipe world landmarks onto the Bip01 rig ----------
  var REST = [], B = {}, FRAMES = {};
  var J = { nose: 0, lEar: 1, rEar: 2, lSh: 3, rSh: 4, lEl: 5, rEl: 6, lWr: 7, rWr: 8, lIdx: 9, rIdx: 10,
            lHip: 11, rHip: 12, lKn: 13, rKn: 14, lAn: 15, rAn: 16, lFt: 17, rFt: 18 };
  var NJ = 19;
  var target = null, smooth = null, liveOn = false, liveUntil = 0;
  var _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  function boneKey(n) { return n.replace(/[^a-z0-9]/gi, '').toLowerCase(); }
  function captureRest(root) {
    root.traverse(function (o) {
      if (!o.isBone) return;
      B[boneKey(o.name)] = o;
      REST.push({ b: o, q: o.quaternion.clone(), p: o.position.clone() });
    });
    root.updateMatrixWorld(true);
    // body frames, in each bone's own space: across = character's left, up = toward the head
    function wp(n) { return B[n] ? B[n].getWorldPosition(new THREE.Vector3()) : null; }
    function frame(bn, across, up) {
      var b = B[bn];
      if (!b || !across || !up) return;
      var qi = b.getWorldQuaternion(new THREE.Quaternion()).invert();
      FRAMES[bn] = { a: across.clone().normalize().applyQuaternion(qi), u: up.clone().normalize().applyQuaternion(qi) };
    }
    var up = wp('bip01neck') && wp('bip01pelvis') ? wp('bip01neck').sub(wp('bip01pelvis')) : null;
    var hips = wp('bip01lthigh') && wp('bip01rthigh') ? wp('bip01lthigh').sub(wp('bip01rthigh')) : null;
    var shoulders = wp('bip01lupperarm') && wp('bip01rupperarm') ? wp('bip01lupperarm').sub(wp('bip01rupperarm')) : null;
    frame('bip01pelvis', hips, up && up.clone());
    frame('bip01spine2', shoulders, up && up.clone());
    frame('bip01head', shoulders && shoulders.clone(), new THREE.Vector3(0, 1, 0));
  }
  function lm(i, out) { return out.set(smooth[i * 4], smooth[i * 4 + 1], smooth[i * 4 + 2]); }
  function vis(i) { return target[i * 4 + 3]; }
  function mid(a, b, out) { lm(a, out); return out.add(lm(b, _v2)).multiplyScalar(0.5); }
  function setWorldQ(b, q) {
    b.parent.getWorldQuaternion(_q2).invert();
    b.quaternion.copy(_q2.multiply(q));
    b.updateMatrixWorld(true);
  }
  function basis(a, u) {
    var x = a.clone().normalize();
    var y = u.clone().sub(x.clone().multiplyScalar(u.dot(x))).normalize();
    var z = new THREE.Vector3().crossVectors(x, y);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }
  function alignFrame(bn, across, up) {
    var b = B[bn], f = FRAMES[bn];
    if (!b || !f) return;
    var q = basis(across, up).multiply(basis(f.a, f.u).invert());
    setWorldQ(b, q);
  }
  function aim(bn, cn, dir) {
    var b = B[bn], c = B[cn];
    if (!b || !c || dir.lengthSq() < 1e-6) return;
    var from = c.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
    var q = new THREE.Quaternion().setFromUnitVectors(from, dir.clone().normalize());
    setWorldQ(b, q.multiply(b.getWorldQuaternion(_q)));
  }
  function seg(a, b) { return lm(b, new THREE.Vector3()).sub(lm(a, new THREE.Vector3())); }
  function applyLive() {
    REST.forEach(function (r) { r.b.quaternion.copy(r.q); r.b.position.copy(r.p); });
    model.position.y = floorY;
    model.updateMatrixWorld(true);
    if (restLow === null) restLow = lowestFoot();
    var hipMid = mid(J.lHip, J.rHip, new THREE.Vector3());
    var shMid = mid(J.lSh, J.rSh, new THREE.Vector3());
    var up = shMid.clone().sub(hipMid);
    alignFrame('bip01pelvis', seg(J.rHip, J.lHip), up);
    alignFrame('bip01spine2', seg(J.rSh, J.lSh), up);
    if (vis(J.lEar) > 3 && vis(J.rEar) > 3) {
      var earMid = mid(J.lEar, J.rEar, new THREE.Vector3());
      alignFrame('bip01head', seg(J.rEar, J.lEar), earMid.sub(shMid));
    }
    aim('bip01lupperarm', 'bip01lforearm', seg(J.lSh, J.lEl));
    aim('bip01lforearm', 'bip01lhand', seg(J.lEl, J.lWr));
    aim('bip01lhand', 'bip01lfinger2', seg(J.lWr, J.lIdx));
    aim('bip01rupperarm', 'bip01rforearm', seg(J.rSh, J.rEl));
    aim('bip01rforearm', 'bip01rhand', seg(J.rEl, J.rWr));
    aim('bip01rhand', 'bip01rfinger2', seg(J.rWr, J.rIdx));
    aim('bip01lthigh', 'bip01lcalf', seg(J.lHip, J.lKn));
    aim('bip01lcalf', 'bip01lfoot', seg(J.lKn, J.lAn));
    aim('bip01lfoot', 'bip01ltoe0', seg(J.lAn, J.lFt));
    aim('bip01rthigh', 'bip01rcalf', seg(J.rHip, J.rKn));
    aim('bip01rcalf', 'bip01rfoot', seg(J.rKn, J.rAn));
    aim('bip01rfoot', 'bip01rtoe0', seg(J.rAn, J.rFt));
    // feet back on the floor: the streamed pose is hip-centred, so a squat would float
    var low = lowestFoot();
    if (isFinite(low)) model.position.y += restLow - low;
  }
  function lowestFoot() {
    var low = Infinity;
    ['bip01lfoot', 'bip01rfoot', 'bip01ltoe0', 'bip01rtoe0'].forEach(function (n) {
      if (B[n]) low = Math.min(low, B[n].getWorldPosition(_v1).y);
    });
    return low;
  }
  var wasLive = false;
  var restLow = null; // feet height in the rest pose, measured on the first live frame
  window.setLive = function (on) { liveOn = !!on; };
  window.setPose = function (p) {
    if (!p || p.length < NJ * 4) return;
    // MediaPipe world: metres, y down, z toward the camera negative -> three: y up, facing +z
    var t = new Array(NJ * 4);
    for (var i = 0; i < NJ; i++) {
      t[i * 4] = p[i * 4] / 100;
      t[i * 4 + 1] = -p[i * 4 + 1] / 100;
      t[i * 4 + 2] = -p[i * 4 + 2] / 100;
      t[i * 4 + 3] = p[i * 4 + 3];
    }
    var torso = Math.min(t[J.lSh * 4 + 3], t[J.rSh * 4 + 3], t[J.lHip * 4 + 3], t[J.rHip * 4 + 3]);
    if (torso < 3) return; // body not in view: keep the clips
    if (!smooth) smooth = t.slice();
    target = t;
    liveUntil = performance.now() + 1500;
  };

  new THREE.GLTFLoader().load(
    ${JSON.stringify(modelUrl)},
    function (gltf) {
      var root = gltf.scene;
      root.traverse(function (o) {
        if (o.isMesh) o.frustumCulled = false; // skinned bounds don't follow the squat
      });
      captureRest(root);
      mixer = new THREE.AnimationMixer(root);
      gltf.animations.forEach(function (clip) {
        var a = mixer.clipAction(clip);
        a.play();
        if (clip.name === 'squat') a.timeScale = 0; // driven by rep progress, not the clock
        a.setEffectiveWeight(0);
        actions[clip.name] = a;
        weights[clip.name] = 0;
      });
      // Measure on the squat clip at t = 0: standing, so this is his full height.
      if (actions.squat) { actions.squat.setEffectiveWeight(1); mixer.update(0); }
      normalize(root);
      if (!actions[mode]) mode = actions.squat ? 'squat' : Object.keys(actions)[0];
      Object.keys(actions).forEach(function (k) {
        weights[k] = k === mode ? 1 : 0;
        actions[k].setEffectiveWeight(weights[k]);
      });
      var pivot = new THREE.Group();
      pivot.rotation.y = YAW;
      pivot.add(root);
      scene.add(pivot);
      model = root;
      floorY = root.position.y;
      applyLoadout(root);
      // for remote debugging (chrome://inspect): window.__ai.state()
      window.__ai = { actions: actions, weights: weights, state: function () {
        return { mode: mode, shown: shown, w: weights, t: Object.keys(actions).map(function (k) {
          return k + ':' + actions[k].time.toFixed(2) + (actions[k].isRunning() ? '' : ' (stopped)');
        }) };
      } };
      post({ type: 'LOADED' });
    },
    function (e) {
      if (e && e.total) post({ type: 'PROGRESS', progress: e.loaded / e.total });
    },
    function () {
      post({ type: 'ERROR', message: 'Could not load the AI instructor' });
    }
  );

  window.setAnim = function (m, p) {
    if (m !== mode && actions[m] && m !== 'squat') actions[m].time = 0; // loops start from their top
    if (actions[m] || !mixer) mode = m;
    p = Math.max(0, Math.min(1, +p || 0));
    // A new rep starts at 0 after the last one ended at 1: both are the standing pose, so jump.
    if (p < target - 0.5) shown = p - (target - shown);
    target = p;
  };

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    frameCamera();
  });

  var clock = new THREE.Clock();
  var lastBeat = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (now - lastBeat > 2000) { lastBeat = now; post({ type: 'HEARTBEAT' }); }
    var dt = Math.min(clock.getDelta(), 0.1);
    // Progress arrives every 100 ms; ease toward it so the motion stays smooth at 60 fps.
    shown += (target - shown) * (1 - Math.exp(-dt * 14));
    var live = liveOn && model && target && now < liveUntil;
    if (!live && wasLive) {
      // hand back to the clips from the rest pose (the mixer only rewrites bones whose values change)
      REST.forEach(function (r) { r.b.quaternion.copy(r.q); r.b.position.copy(r.p); });
      model.position.y = floorY;
    }
    wasLive = live;
    if (live) {
      var k = 1 - Math.exp(-dt * 15);
      for (var i = 0; i < smooth.length; i++) smooth[i] += (target[i] - smooth[i]) * k;
      applyLive();
      renderer.render(scene, camera);
      return;
    }
    if (mixer) {
      var sq = actions.squat;
      if (sq) sq.time = Math.max(0, Math.min(1, shown)) * sq.getClip().duration * 0.9999;
      var step = dt / CROSSFADE;
      Object.keys(actions).forEach(function (k) {
        var w = weights[k] + (k === mode ? step : -step);
        weights[k] = Math.max(0, Math.min(1, w));
        actions[k].setEffectiveWeight(weights[k]);
      });
      mixer.update(dt);
    }
    renderer.render(scene, camera);
  }

  frameCamera();
  requestAnimationFrame(tick);
})();
</script>
</body>
</html>`;
}
