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
// RN -> page: window.setAnim(mode, progress)   mode: 'squat' | 'idle' | 'rest' | 'cheer'
// page -> RN: { type: 'PROGRESS', progress } | { type: 'LOADED' } | { type: 'ERROR', message }
//             | { type: 'HEARTBEAT' } every 2 s while frames render (RN reloads the view if they stop)

export type AiInstructorMode = 'squat' | 'idle' | 'rest' | 'cheer';

// LocalAssetServer marks assets immutable for a year, so a WebView kept playing an old copy of
// the model after an app update. A per-launch query makes it fetch the APK's current files.
const BUST = `?v=${Date.now().toString(36)}`;
export const AI_INSTRUCTOR_MODEL_URL = `http://127.0.0.1:8888/avatars/instructor_ai.glb${BUST}`;
export const AI_BACKDROPS = ['gym_turf', 'gym_rig', 'gym_hall'].map((n) => `/backdrops/${n}.jpg${BUST}`);

export function getAiInstructorHtml(
  modelUrl: string = AI_INSTRUCTOR_MODEL_URL,
  backdrop: string = AI_BACKDROPS[Math.floor(Math.random() * AI_BACKDROPS.length)],
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

  new THREE.GLTFLoader().load(
    ${JSON.stringify(modelUrl)},
    function (gltf) {
      var root = gltf.scene;
      root.traverse(function (o) {
        if (o.isMesh) o.frustumCulled = false; // skinned bounds don't follow the squat
      });
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
