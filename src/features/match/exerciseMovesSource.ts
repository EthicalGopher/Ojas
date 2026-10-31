// Procedural moves for the 3D opponent in every exercise except squats (those use the authored
// `squat` clip). Embedded in the AI instructor page (aiInstructorHtml.ts), which feeds the poses
// built here through its live-retarget path, the same one that mirrors a real opponent's pose.
//
// A pose is a "spec": the hip, torso direction, head, and a target point for each wrist and ankle.
// Two-bone IK finds the elbows and knees, so hands and feet land where the spec says (on the floor
// in a push-up, on the thigh in Tree Pose). Axes are three.js: x = the character's left, y = up,
// z = toward the camera, metres, floor at y = 0. Only directions matter to the retarget; the page
// puts the lowest foot back on the floor.
//
// OjasMoves.pose(id, p, t, blend) -> 19 joints x [x, y, z, visibility 9]  (LIVE_JOINTS order)
//   id     exercise id '2'..'9'      p  rep progress 0..1..0 (reps)      t  seconds (sway)
//   blend  0 = standing .. 1 = in the move (eased in/out by the page)
// OjasMoves.info(id) -> { hold, stay, wide, lying } | null
//
// Plain JS in a string so the same source runs in the WebView and in a node test.
export const EXERCISE_MOVES_SOURCE = `
(function (g) {
  var L = { sh: 0.19, hp: 0.10, to: 0.50, th: 0.43, sn: 0.42, ua: 0.30, fa: 0.27, hand: 0.09, ft: 0.14, nk: 0.25 };
  function len(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
  function n(v) { var l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function sc(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function perp(v, u) {
    var p = sub(v, sc(u, dot(v, u)));
    if (len(p) < 1e-4) p = cross(u, Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
    return n(p);
  }
  // root -> mid -> end with bone lengths a, b; the mid joint bulges toward hint.
  function ik(root, target, a, b, hint) {
    var d = sub(target, root), D = len(d);
    var dd = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, D));
    var u = D > 1e-6 ? sc(d, 1 / D) : [0, -1, 0];
    var x = (a * a - b * b + dd * dd) / (2 * dd);
    var h = Math.sqrt(Math.max(0, a * a - x * x));
    return { mid: add(add(root, sc(u, x)), sc(perp(hint, u), h)), end: add(root, sc(u, dd)) };
  }

  function build(s) {
    var up = n(s.up);
    var ac = perp(s.across, up);
    var hip = s.hip;
    var pac = n(s.pAcross); // the pelvis stays level while the torso bends sideways
    var lH = add(hip, sc(pac, L.hp)), rH = add(hip, sc(pac, -L.hp));
    var sm = add(hip, sc(up, L.to));
    var lS = add(sm, sc(ac, L.sh)), rS = add(sm, sc(ac, -L.sh));
    var hd = n(s.head);
    var hac = perp(s.hAcross, hd);
    var hf = cross(hac, hd);
    var nose = add(add(sm, sc(hd, L.nk)), sc(hf, 0.09));
    var lEar = add(add(sm, sc(hd, 0.22)), sc(hac, 0.075));
    var rEar = add(add(sm, sc(hd, 0.22)), sc(hac, -0.075));
    var lA = ik(lS, s.lw, L.ua, L.fa, s.lwh), rA = ik(rS, s.rw, L.ua, L.fa, s.rwh);
    var lL = ik(lH, s.la, L.th, L.sn, s.lah), rL = ik(rH, s.ra, L.th, L.sn, s.rah);
    var lIdx = add(lA.end, sc(n(s.lh || sub(lA.end, lA.mid)), L.hand));
    var rIdx = add(rA.end, sc(n(s.rh || sub(rA.end, rA.mid)), L.hand));
    var lFt = add(lL.end, sc(n(s.lft), L.ft)), rFt = add(rL.end, sc(n(s.rft), L.ft));
    var pts = [nose, lEar, rEar, lS, rS, lA.mid, rA.mid, lA.end, rA.end, lIdx, rIdx,
               lH, rH, lL.mid, rL.mid, lL.end, rL.end, lFt, rFt];
    var out = new Array(pts.length * 4);
    for (var i = 0; i < pts.length; i++) {
      out[i * 4] = pts[i][0]; out[i * 4 + 1] = pts[i][1]; out[i * 4 + 2] = pts[i][2]; out[i * 4 + 3] = 9;
    }
    return out;
  }

  function mix(a, b, t) {
    var o = {};
    var keys = {};
    Object.keys(a).forEach(function (k) { keys[k] = true; });
    Object.keys(b).forEach(function (k) { keys[k] = true; });
    Object.keys(keys).forEach(function (k) {
      if (a[k] && b[k]) {
        o[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t, a[k][2] + (b[k][2] - a[k][2]) * t];
      } else {
        o[k] = (b[k] || a[k]).slice();
      }
    });
    return o;
  }
  function spec(base, over) {
    var o = {};
    Object.keys(base).forEach(function (k) { o[k] = base[k].slice(); });
    Object.keys(over || {}).forEach(function (k) { o[k] = over[k].slice(); });
    return o;
  }

  // Facing the camera, arms down, feet together.
  var FRONT = {
    hip: [0, 0.93, 0], up: [0, 1, 0], across: [1, 0, 0], pAcross: [1, 0, 0], head: [0, 1, 0], hAcross: [1, 0, 0],
    lw: [0.31, 0.86, 0.03], lwh: [0.5, 0, -1], rw: [-0.31, 0.86, 0.03], rwh: [-0.5, 0, -1],
    lh: [0, -1, 0], rh: [0, -1, 0],
    la: [0.10, 0.08, 0], lah: [0, 0, 1], ra: [-0.10, 0.08, 0], rah: [0, 0, 1],
    lft: [0, -0.1, 1], rft: [0, -0.1, 1]
  };
  // Side on, facing screen right: his right side is toward the camera.
  var SIDE = spec(FRONT, {
    across: [0, 0, -1], pAcross: [0, 0, -1], hAcross: [0, 0, -1],
    lw: [0.03, 0.86, -0.27], lwh: [-1, 0, -0.5], rw: [0.03, 0.86, 0.27], rwh: [-1, 0, 0.5],
    la: [0, 0.08, -0.10], lah: [1, 0, 0], ra: [0, 0.08, 0.10], rah: [1, 0, 0],
    lft: [1, -0.1, 0], rft: [1, -0.1, 0]
  });

  function bell(p) { return 0.5 - 0.5 * Math.cos(2 * Math.PI * p); } // 0 -> 1 -> 0, periodic
  var DEG = Math.PI / 180;

  // ---- Push-ups: straight body from the toes, hands under the shoulders ----
  function pushup(p) {
    var phi = (19 - 12 * bell(p)) * DEG;
    var dir = [Math.cos(phi), Math.sin(phi), 0];
    var hip = add([0, 0.14, 0], sc(dir, 0.85));
    var hd = phi + 0.3;
    return spec(SIDE, {
      hip: hip, up: dir, head: [Math.cos(hd), Math.sin(hd), 0],
      lw: [1.30, 0.04, -0.21], lwh: [-1, 0.6, 0], rw: [1.30, 0.04, 0.21], rwh: [-1, 0.6, 0],
      la: [0, 0.14, -0.10], lah: [0, 1, 0], ra: [0, 0.14, 0.10], rah: [0, 1, 0],
      lft: [0.8, -0.55, 0], rft: [0.8, -0.55, 0]
    });
  }

  // ---- Sit-ups / crunches: on the back, knees bent, hands behind the head ----
  function supine(maxDeg) {
    return function (p) {
      var th = (3 + (maxDeg - 3) * bell(p)) * DEG;
      var up = [Math.cos(th), Math.sin(th), 0];
      var hip = [0, 0.12, 0];
      var ac = [0, 0, 1];
      var fwd = cross(ac, up);
      var sm = add(hip, sc(up, L.to));
      var back = add(add(sm, sc(up, 0.22)), sc(fwd, -0.08));
      var hd = th + 0.3;
      return spec(SIDE, {
        hip: hip, up: up, across: ac, pAcross: ac, hAcross: ac, head: [Math.cos(hd), Math.sin(hd), 0],
        lw: add(back, sc(ac, 0.10)), lwh: add(ac, [0, 0.3, 0]),
        rw: add(back, sc(ac, -0.10)), rwh: add(sc(ac, -1), [0, 0.3, 0]),
        la: [-0.45, 0.08, 0.10], lah: [0, 1, 0], ra: [-0.45, 0.08, -0.10], rah: [0, 1, 0],
        lft: [-1, -0.1, 0], rft: [-1, -0.1, 0]
      });
    };
  }

  // ---- Lunge: right leg forward, back knee to the floor ----
  var LUNGE_DOWN = spec(SIDE, {
    hip: [0, 0.58, 0], up: [0.03, 1, 0],
    lw: [0.05, 0.53, -0.27], rw: [0.05, 0.53, 0.27],
    la: [-0.55, 0.17, -0.10], lah: [1, -1, 0], ra: [0.38, 0.08, 0.10], rah: [1, 0.3, 0],
    lft: [0.6, -0.8, 0], rft: [1, -0.1, 0]
  });
  function lunge(p) { return mix(SIDE, LUNGE_DOWN, bell(p)); }

  // ---- Holds (p unused, t gives a slow breathing sway) ----
  function tree(p, t) {
    var sw = 0.02 * Math.sin(t * 1.2);
    return spec(FRONT, {
      hip: [-0.02, 0.93, 0],
      up: [sw, 1, 0],
      lw: [0.015, 1.20, 0.22], lwh: [1, -0.6, 0], rw: [-0.055, 1.20, 0.22], rwh: [-1, -0.6, 0],
      lh: [0, 0.95, 0.3], rh: [0, 0.95, 0.3],
      la: [-0.02, 0.80, 0.01], lah: [1, -0.05, 0],
      ra: [-0.06, 0.08, 0], rah: [0, 0, 1],
      lft: [-0.05, -0.98, 0.05],
      rft: [0, -0.1, 1]
    });
  }
  function triangle(p, t) {
    var th = (80 + 2 * Math.sin(t * 1.2)) * DEG;
    var up = [Math.sin(th), Math.cos(th), 0];
    return spec(FRONT, {
      hip: [0, 0.80, 0], up: up, across: [Math.cos(th), -Math.sin(th), 0],
      head: [0.35, 0.94, 0], hAcross: [1, 0, 0],
      lw: [0.52, 0.12, 0.05], lwh: [0, 0, -1], rw: [0.46, 1.66, 0], rwh: [0, 0, -1],
      la: [0.55, 0.08, 0], lah: [0, 0, 1], ra: [-0.55, 0.08, 0], rah: [0, 0, 1],
      lft: [0.9, -0.2, 0.3], rft: [-0.2, -0.2, 1]
    });
  }
  function cobra(p, t) {
    var th = (52 + 3 * Math.sin(t * 1.3)) * DEG;
    var up = [Math.cos(th), Math.sin(th), 0];
    var hd = th - 0.35;
    return spec(SIDE, {
      hip: [0, 0.12, 0], up: up, head: [Math.cos(hd), Math.sin(hd), 0],
      lw: [0.40, 0.04, -0.22], lwh: [-1, 0.3, 0], rw: [0.40, 0.04, 0.22], rwh: [-1, 0.3, 0],
      la: [-0.85, 0.10, -0.10], lah: [0, 1, 0], ra: [-0.85, 0.10, 0.10], rah: [0, 1, 0],
      lft: [-1, -0.15, 0], rft: [-1, -0.15, 0]
    });
  }
  function child(p, t) {
    var th = (6 + 1.2 * Math.sin(t * 1.1)) * DEG;
    return spec(SIDE, {
      hip: [0, 0.27, 0], up: [Math.cos(th), Math.sin(th), 0], head: [0.85, -0.5, 0],
      lw: [1.06, 0.05, -0.20], lwh: [0, 1, 0], rw: [1.06, 0.05, 0.20], rwh: [0, 1, 0],
      la: [-0.03, 0.09, -0.10], lah: [1, 0, 0], ra: [-0.03, 0.09, 0.10], rah: [1, 0, 0],
      lft: [-1, -0.1, 0], rft: [-1, -0.1, 0]
    });
  }
  function warrior(p, t) {
    var sw = 0.012 * Math.sin(t * 1.2);
    return spec(FRONT, {
      hip: [0.02, 0.65, 0], up: [sw, 1, 0], head: [0, 1, 0], hAcross: [0.15, 0, -0.99],
      lw: [0.78, 1.15, 0], lwh: [0, -1, 0], rw: [-0.74, 1.15, 0], rwh: [0, -1, 0],
      la: [0.50, 0.08, 0], lah: [0.92, 0, 0.08], ra: [-0.70, 0.08, 0], rah: [-0.1, 0, 0.2],
      lft: [1, -0.1, 0], rft: [0.38, -0.1, 0.92]
    });
  }

  // stay: keeps the start pose between reps; wide: needs a wider camera frame (metres, half width)
  var MOVES = {
    '2': { f: supine(80), base: SIDE, stay: true, hold: false, wide: 1.0, lying: true },
    '3': { f: triangle, base: FRONT, stay: false, hold: true, wide: 1.0, lying: false },
    '4': { f: lunge, base: SIDE, stay: false, hold: false, wide: 0.8, lying: false },
    '5': { f: supine(32), base: SIDE, stay: true, hold: false, wide: 1.0, lying: true },
    '6': { f: cobra, base: SIDE, stay: false, hold: true, wide: 1.0, lying: true },
    '7': { f: pushup, base: SIDE, stay: true, hold: false, wide: 1.1, lying: true },
    '8': { f: child, base: SIDE, stay: false, hold: true, wide: 1.0, lying: true },
    '9': { f: tree, base: FRONT, stay: false, hold: true, wide: 0.75, lying: false },
    '10': { f: warrior, base: FRONT, stay: false, hold: true, wide: 1.15, lying: false }
  };

  g.OjasMoves = {
    info: function (id) {
      var m = MOVES[id];
      return m ? { hold: m.hold, stay: m.stay, wide: m.wide, lying: m.lying } : null;
    },
    spec: function (id, p, t) { return MOVES[id].f(p, t); },
    pose: function (id, p, t, blend) {
      var m = MOVES[id];
      var b = Math.max(0, Math.min(1, blend));
      b = b * b * (3 - 2 * b);
      return build(mix(m.base, m.f(p, t), b));
    },
    build: build
  };
})(typeof window !== 'undefined' ? window : globalThis);
`;
