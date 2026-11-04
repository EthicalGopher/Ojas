// HTML for the match-intro arena WebView. The hall, crowd, judges and lighting are photoreal plates
// path-traced in Blender Cycles (scripts/blender/render_arena.py -> assets/web/arena/): seamless video
// loops for shots with the cheering crowd, stills for the stage close-ups. The two live athletes are
// drawn on top with a camera that matches each plate exactly, lit to match, with real shadows on the
// posing risers. Loaded with baseUrl http://127.0.0.1:8888 like the avatar viewer.
//
// RN -> page: window.fight(), window.skip()
// page -> RN: { type: 'ARENA_READY' } | { type: 'SHOT', name } | { type: 'ERROR', message }
import { actorRuntimeJs } from '../avatar/avatarViewerHtml';

export interface ArenaActorConfig {
  modelUrl: string;
  format: 'vrm' | 'glb';
  /** Loadout items as AvatarViewer3D sends them: { category, config } with resolved model URLs. */
  loadout: { category: string; config: unknown }[];
}

export interface ArenaConfig {
  /** Folder with the plates, e.g. http://127.0.0.1:8888/arena */
  plateBase: string;
  /** Cache-busting query added to every plate URL. */
  bust: string;
  you: ArenaActorConfig;
  /** null in Battle Ground (one athlete on stage). */
  rival: ArenaActorConfig | null;
  youName: string;
  rivalName: string;
  /** Small line on the LED wall, e.g. "1V1 DUEL · SQUATS". */
  event: string;
}

export function getArenaHtml(cfg: ArenaConfig): string {
  const config = JSON.stringify(cfg).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #050506; }
    canvas { display: block; width: 100%; height: 100%; }
    video { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
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

  // Must match scripts/blender/render_arena.py (SHOTS, FOV_DEG, RES).
  var PLATE_ASPECT = 1600 / 720;
  var FOV = 40;
  var SHOTS = {
    crowd: { pos: [0.0, 2.55, -0.5], look: [0.0, 2.2, 9.0], video: true, dur: 2.4 },
    wide:  { pos: [0.0, 7.2, 14.0], look: [0.0, 2.0, -1.0], video: true, dur: 2.6 },
    you:   { pos: [-0.5, 2.15, 0.9], look: [-1.5, 2.05, -2.0], video: false, dur: 2.2 },
    rival: { pos: [0.5, 2.15, 0.9], look: [1.5, 2.05, -2.0], video: false, dur: 2.2 },
    both:  { pos: [0.0, 2.25, 4.2], look: [0.0, 1.95, -2.0], video: false, dur: 1e9 },
  };
  var order = CONFIG.rival ? ['crowd', 'wide', 'you', 'rival', 'both'] : ['crowd', 'wide', 'you', 'both'];

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x050506, 1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;
  document.body.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 80);
  var clock = new THREE.Clock();

  // ---------------------------------------------------------------- plate (background)

  // Drawn as a full-screen quad, cropped to "cover" the screen; the 3D camera gets the same crop.
  var bgScene = new THREE.Scene();
  var bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var bgMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthTest: false, depthWrite: false });
  bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat));
  var plates = {};

  function fitPlate() {
    var a = window.innerWidth / window.innerHeight;
    var rx = 1, ry = 1; // fraction of the plate shown
    if (a < PLATE_ASPECT) rx = a / PLATE_ASPECT; else ry = PLATE_ASPECT / a;
    if (bgMat.map) {
      bgMat.map.repeat.set(rx, ry);
      bgMat.map.offset.set((1 - rx) / 2, (1 - ry) / 2);
    }
    // vertical field of view of the visible part of the plate
    camera.fov = (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * ry) * 180) / Math.PI;
    camera.aspect = a;
    camera.updateProjectionMatrix();
  }

  function loadPlate(name) {
    var s = SHOTS[name];
    var url = CONFIG.plateBase + '/' + name + (s.video ? '.mp4' : '.jpg') + CONFIG.bust;
    return new Promise(function (resolve) {
      if (!s.video) {
        new THREE.TextureLoader().load(url, function (t) {
          t.encoding = THREE.sRGBEncoding;
          plates[name] = { tex: t };
          resolve();
        }, undefined, function () { resolve(); });
        return;
      }
      // The asset server has no range requests: fetch the whole clip, then loop it from memory.
      fetch(url).then(function (r) { return r.blob(); }).then(function (blob) {
        var v = document.createElement('video');
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.preload = 'auto';
        document.body.appendChild(v);
        var t = new THREE.VideoTexture(v);
        t.encoding = THREE.sRGBEncoding;
        plates[name] = { tex: t, video: v };
        var done = false;
        function ok() { if (!done) { done = true; resolve(); } }
        v.addEventListener('loadeddata', ok, { once: true });
        v.addEventListener('error', ok, { once: true });
        setTimeout(ok, 6000);
        v.src = URL.createObjectURL(blob);
      }).catch(function () { resolve(); });
    });
  }

  function showPlate(name) {
    Object.keys(plates).forEach(function (k) { if (plates[k].video && k !== name) plates[k].video.pause(); });
    var p = plates[name];
    if (!p) return;
    p.tex.wrapS = p.tex.wrapT = THREE.ClampToEdgeWrapping;
    bgMat.map = p.tex;
    bgMat.needsUpdate = true;
    if (p.video) { p.video.currentTime = 0; p.video.play().catch(function () {}); }
    fitPlate();
  }

  // ---------------------------------------------------------------- stage lighting (matches the plates)

  scene.add(new THREE.HemisphereLight(0xcdb8a4, 0x1a1210, 0.35));
  function keySpot(x, tx) {
    var l = new THREE.SpotLight(0xfff0dc, 2.2, 0, 0.42, 0.45, 1.2);
    l.position.set(x, 8.0, -0.4);
    l.target.position.set(tx, 1.6, -2.0);
    l.castShadow = true;
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.camera.near = 4;
    l.shadow.camera.far = 14;
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.015;
    l.shadow.radius = 4;
    scene.add(l, l.target);
  }
  keySpot(-3.3, -1.5);
  keySpot(3.3, 1.5);
  var back = new THREE.DirectionalLight(0xff9a50, 1.3);
  back.position.set(0, 7, -6);
  scene.add(back);
  var front = new THREE.DirectionalLight(0xffe2c4, 0.35);
  front.position.set(0, 3, 8);
  scene.add(front);
  try {
    var envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(
      new THREE.SphereGeometry(10, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(vec3(0.05,0.03,0.03), vec3(0.9,0.62,0.4), smoothstep(-0.2,0.9,h)), 1.0); }'
      })
    ));
    var pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
  } catch (e) {}

  // Invisible discs on the risers that only catch the athletes' shadows (the plates show the risers).
  var marks = { you: new THREE.Vector3(-1.5, 1.14, -2.0), rival: new THREE.Vector3(1.5, 1.14, -2.0) };
  ['you', 'rival'].forEach(function (k) {
    var g = new THREE.Mesh(new THREE.CircleGeometry(0.74, 48), new THREE.ShadowMaterial({ opacity: 0.55 }));
    g.rotation.x = -Math.PI / 2;
    g.position.copy(marks[k]).add(new THREE.Vector3(0, 0.002, 0));
    g.receiveShadow = true;
    scene.add(g);
  });

  // LED wall: the match names, on the wall's exact spot (Blender: 8.4 x 3.8 at y 5.125, z 3.6).
  var screenCanvas = document.createElement('canvas');
  screenCanvas.width = 1024;
  screenCanvas.height = 464;
  var screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.encoding = THREE.sRGBEncoding;
  var screen = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 3.8), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 3.6, -5.12);
  scene.add(screen);
  function drawScreen(phase) {
    var g = screenCanvas.getContext('2d'), W = screenCanvas.width, H = screenCanvas.height;
    var grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#1c0703');
    grd.addColorStop(0.5, '#4a1406');
    grd.addColorStop(1, '#120404');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.1;
    g.fillStyle = '#ffb27a';
    var o = (phase * 60) % 200;
    for (var i = -2; i < 8; i++) {
      g.beginPath();
      g.moveTo(i * 200 + o, 0); g.lineTo(i * 200 + 70 + o, 0); g.lineTo(i * 200 - 110 + o, H); g.lineTo(i * 200 - 180 + o, H);
      g.fill();
    }
    g.globalAlpha = 0.16;
    g.fillStyle = '#000';
    for (var y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
    for (var x = 0; x < W; x += 4) g.fillRect(x, 0, 1, H);
    g.globalAlpha = 1;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd27a';
    g.font = 'italic 900 40px sans-serif';
    g.fillText(CONFIG.event, W / 2, 62);
    g.fillStyle = '#ffffff';
    if (CONFIG.rival) {
      g.font = 'italic 900 78px sans-serif';
      g.fillText(CONFIG.youName.toUpperCase(), W * 0.24, H * 0.56, W * 0.38);
      g.fillText(CONFIG.rivalName.toUpperCase(), W * 0.76, H * 0.56, W * 0.38);
      g.font = 'italic 900 96px sans-serif';
      g.fillStyle = '#ff7a3c';
      g.fillText('VS', W / 2, H * 0.56);
    } else {
      g.font = 'italic 900 96px sans-serif';
      g.fillText(CONFIG.youName.toUpperCase(), W / 2, H * 0.56, W * 0.9);
    }
    screenTex.needsUpdate = true;
  }
  drawScreen(0);

  ${actorRuntimeJs()}

  // ---------------------------------------------------------------- athletes

  var shown = 0, started = false, platesReady = false;
  var expected = (CONFIG.you ? 1 : 0) + (CONFIG.rival ? 1 : 0);
  function makeActor(c, id, mark, yaw) {
    if (!c) return null;
    var a = createActor({
      scene: scene,
      post: function (m) { m.who = id; post(m); },
      onShown: function (entry) {
        entry.root.traverse(function (o) {
          if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
          if (!o.material) return;
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            if ('envMapIntensity' in m) m.envMapIntensity = 0.5;
          });
        });
        shown++;
        maybeStart();
      },
    }, { lively: false });
    a.pivot.position.copy(mark);
    a.pivot.rotation.y = yaw;
    // On the posing riser every athlete holds a calm stance, not their own run or walk loop.
    a.setBase('stand');
    a.loadModel(c.modelUrl, c.format);
    a.applyLoadout(c.loadout || []);
    return a;
  }
  var you = makeActor(CONFIG.you, 'you', marks.you, CONFIG.rival ? 0.28 : 0.15);
  var rival = makeActor(CONFIG.rival, 'rival', marks.rival, -0.28);

  // Front double biceps, blended over the clip pose. Each segment is turned in world space toward a
  // target direction (bone -> child), which works whatever the local bone axes are. The wrist is
  // kept straight (the hand continues the forearm) and the hands close into fists.
  var qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qP = new THREE.Quaternion(), qI = new THREE.Quaternion();
  var vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), vD = new THREE.Vector3();
  function aim(bone, child, dir, w) {
    bone.updateWorldMatrix(true, false);
    child.updateWorldMatrix(false, false);
    bone.getWorldPosition(vA);
    child.getWorldPosition(vB);
    vC.subVectors(vB, vA).normalize();
    qA.setFromUnitVectors(vC, dir);
    qA.slerp(qI, 1 - w);
    bone.getWorldQuaternion(qB);
    qB.premultiply(qA);
    bone.parent.getWorldQuaternion(qP);
    bone.quaternion.copy(qP.invert().multiply(qB));
    bone.updateMatrixWorld(true);
  }
  function findBoneIn(root, re) {
    var f = null;
    root.traverse(function (o) { if (!f && o.isBone && re.test(o.name)) f = o; });
    return f;
  }
  // three.js renames "Bip01 L UpperArm" to "Bip01_L_UpperArm"; CC rigs use "CC_L_Upperarm"
  function side(s, part) { return new RegExp('[ _]' + s + '[ _]' + part + '$', 'i'); }
  function flexPose(actor) {
    var state = { w: 0, on: false, bones: null, lastT: 0 };
    actor.pose = function (cur, t) {
      var dt = Math.min(0.1, Math.max(0, t - state.lastT));
      state.lastT = t;
      state.w += ((state.on ? 1 : 0) - state.w) * Math.min(1, dt * 4);
      actor.fist = state.w;
      if (state.w < 0.01) return;
      if (!state.bones) {
        state.bones = ['L', 'R'].map(function (s) {
          return {
            upper: findBoneIn(cur.root, side(s, 'UpperArm')),
            fore: findBoneIn(cur.root, side(s, 'Forearm')),
            hand: findBoneIn(cur.root, side(s, 'Hand')),
            finger: findBoneIn(cur.root, side(s, 'Finger2')) || findBoneIn(cur.root, side(s, 'Mid1')),
          };
        });
      }
      var q = actor.pivot.quaternion;
      var pump = Math.sin(t * 2.6) * 0.035;
      state.bones.forEach(function (b) {
        if (!b.upper || !b.fore || !b.hand) return;
        b.upper.getWorldPosition(vA);
        actor.pivot.worldToLocal(vA);
        var s = vA.x >= 0 ? 1 : -1;
        vD.set(s, 0.12 + pump, 0.16).normalize().applyQuaternion(q);
        aim(b.upper, b.fore, vD, state.w);
        vD.set(s * 0.16, 1, 0.1).normalize().applyQuaternion(q);
        aim(b.fore, b.hand, vD, state.w);
        if (b.finger) {
          // straight wrist: the hand points the same way as the forearm
          b.fore.getWorldPosition(vA);
          b.hand.getWorldPosition(vB);
          vD.subVectors(vB, vA).normalize();
          aim(b.hand, b.finger, vD, state.w);
        }
      });
    };
    return state;
  }
  var youFlex = you ? flexPose(you) : null;
  var rivalFlex = rival ? flexPose(rival) : null;

  // ---------------------------------------------------------------- shots

  var shotIdx = 0, shotName = null, shotT = 0;
  var shotStart = 0;
  function startShot(name) {
    shotName = name;
    shotT = 0;
    shotStart = performance.now();
    var plate = name === 'fight' ? 'both' : name;
    showPlate(plate);
    camera.position.fromArray(SHOTS[plate].pos);
    camera.lookAt(vA.fromArray(SHOTS[plate].look));
    post({ type: 'SHOT', name: name });
    // announced athletes hit a front double biceps; on 'both' they hold it together
    if (name === 'you' && youFlex) youFlex.on = true;
    if (name === 'rival' && rivalFlex) rivalFlex.on = true;
    if (name === 'both' || name === 'fight') {
      if (youFlex) youFlex.on = true;
      if (rivalFlex) rivalFlex.on = true;
    }
  }
  function maybeStart() {
    if (started || shown < expected || !platesReady) return;
    started = true;
    clock.getDelta();
    startShot(order[0]);
    post({ type: 'ARENA_READY' });
  }
  window.skip = function () {
    if (!started || shotName === 'both' || shotName === 'fight') return;
    shotIdx = order.length - 1;
    startShot('both');
  };

  var confetti = null;
  function burst() {
    var geo = new THREE.PlaneGeometry(0.06, 0.1);
    var colors = [0xff5a3c, 0xffb627, 0xffffff, 0xffd27a, 0xff8a3c];
    var mats = colors.map(function (c) { return new THREE.MeshStandardMaterial({ color: c, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide }); });
    confetti = [];
    for (var i = 0; i < 320; i++) {
      var m = new THREE.Mesh(geo, mats[i % mats.length]);
      m.position.set((Math.random() - 0.5) * 8, 5 + Math.random() * 3, -2 + (Math.random() - 0.3) * 5);
      scene.add(m);
      confetti.push({ m: m, vy: -0.5 - Math.random() * 1.0, vx: (Math.random() - 0.5) * 0.5, spin: 2 + Math.random() * 6, ph: Math.random() * 6 });
    }
  }
  window.fight = function () {
    shotIdx = order.length;
    startShot('fight');
    burst();
  };

  var wanted = order.slice();
  if (wanted.indexOf('both') < 0) wanted.push('both');
  Promise.all(wanted.map(loadPlate)).then(function () {
    platesReady = true;
    maybeStart();
  });
  // Never hang: start with whatever is there after 12 s.
  setTimeout(function () { platesReady = true; shown = expected; maybeStart(); }, 12000);

  window.addEventListener('resize', function () {
    renderer.setSize(window.innerWidth, window.innerHeight);
    fitPlate();
  });
  fitPlate();

  var screenTick = 0;
  function tick() {
    requestAnimationFrame(tick);
    var dt = Math.min(clock.getDelta(), 0.1);
    var t = clock.elapsedTime;
    if (started) {
      // wall-clock time: on slow phones dt is capped, which would stretch the shots
      shotT = (performance.now() - shotStart) / 1000;
      var s = SHOTS[shotName === 'fight' ? 'both' : shotName];
      if (shotName !== 'fight' && shotIdx < order.length - 1 && shotT >= s.dur) {
        shotIdx++;
        startShot(order[shotIdx]);
      }
    }
    screenTick += dt;
    if (screenTick > 0.1) { screenTick = 0; drawScreen(t); }
    if (confetti) {
      confetti.forEach(function (c) {
        c.m.position.y += c.vy * dt;
        c.m.position.x += (c.vx + Math.sin(t * 2 + c.ph) * 0.3) * dt;
        c.m.rotation.x += c.spin * dt;
        c.m.rotation.y += c.spin * 0.7 * dt;
        if (c.m.position.y < 1.0) c.m.position.y = 5 + Math.random() * 2;
      });
    }
    if (you) you.update(dt, t);
    if (rival) rival.update(dt, t);

    renderer.clear();
    if (bgMat.map) renderer.render(bgScene, bgCam);
    renderer.clearDepth();
    // The crowd shot looks away from the stage: no athletes or LED names in it.
    var stage = started && shotName !== 'crowd';
    if (you) you.pivot.visible = stage;
    if (rival) rival.pivot.visible = stage;
    screen.visible = stage;
    if (started) renderer.render(scene, camera);
  }
  tick();
})();
</script>
</body>
</html>`;
}
