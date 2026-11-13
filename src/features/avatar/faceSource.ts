// Facial life for characters with ARKit morph targets (Arjun, from scripts/blender/arjun_improve/stage2_face.py):
// blinks, small eye glances, breathing, an effort face on hard reps and a smile when cheering. Every face mesh
// (body, eyes, brows, lashes, mouth) carries the same ARKit names, so one weight moves them all together.
//
// OjasFace.setup(root) -> { update(dt, state), names } | null   (null: no ARKit targets on this model)
//   state: { effort: 0..1 (rep depth), smile: 0..1 }; values are eased, so callers can pass raw states.
// The amounts match the expressions checked in scripts/blender/arjun_improve/face_renders.py.
//
// Plain JS in a string so the same source runs in the WebViews and in a node test.
export const FACE_SOURCE = `
(function (g) {
  function setup(root) {
    var T = {};
    root.traverse(function (o) {
      if (!o.isMesh || !o.morphTargetDictionary || !o.morphTargetInfluences) return;
      Object.keys(o.morphTargetDictionary).forEach(function (n) {
        (T[n] = T[n] || []).push([o, o.morphTargetDictionary[n]]);
      });
    });
    if (!T.eyeBlinkLeft) return null;
    function set(n, v) {
      var l = T[n];
      if (!l) return;
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      for (var i = 0; i < l.length; i++) l[i][0].morphTargetInfluences[l[i][1]] = v;
    }
    var t = 0, e = 0, sm = 0;
    var blinkAt = 1.5 + Math.random() * 2, blinkT = -1, again = false;
    var lookAt = 1 + Math.random() * 2, gx = 0, gy = 0, tx = 0, ty = 0;
    function blinkValue() {
      if (blinkT < 0) return 0;
      if (blinkT < 0.07) return blinkT / 0.07;          // close
      if (blinkT < 0.10) return 1;                       // shut
      if (blinkT < 0.22) return 1 - (blinkT - 0.10) / 0.12; // open
      blinkT = -1;
      return 0;
    }
    return {
      names: Object.keys(T),
      update: function (dt, s) {
        dt = Math.min(dt || 0, 0.1);
        t += dt;
        var k = 1 - Math.exp(-dt * 6);
        e += ((s && s.effort || 0) - e) * k;
        sm += ((s && s.smile || 0) - sm) * k;
        // blinks: every 2-6 s, sometimes twice in a row
        if (blinkT >= 0) blinkT += dt;
        else if (t >= blinkAt) {
          blinkT = 0;
          if (again) { again = false; blinkAt = t + 2 + Math.random() * 4; }
          else if (Math.random() < 0.2) { again = true; blinkAt = t + 0.3; }
          else blinkAt = t + 2 + Math.random() * 4;
        }
        var b = blinkValue();
        // glances: a quick saccade to a new small target every 1.5-4 s
        if (t >= lookAt) {
          tx = (Math.random() * 2 - 1) * 0.3;
          ty = (Math.random() * 2 - 1) * 0.2;
          lookAt = t + 1.5 + Math.random() * 2.5;
        }
        var ks = 1 - Math.exp(-dt * 25);
        gx += (tx - gx) * ks;
        gy += (ty - gy) * ks;
        var breath = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI / 4.2);
        set('eyeBlinkLeft', b);
        set('eyeBlinkRight', b);
        set('eyeSquintLeft', 0.5 * e + 0.25 * sm);
        set('eyeSquintRight', 0.5 * e + 0.25 * sm);
        set('cheekSquintLeft', 0.3 * e + 0.5 * sm);
        set('cheekSquintRight', 0.3 * e + 0.5 * sm);
        set('browDownLeft', 0.5 * e);
        set('browDownRight', 0.5 * e);
        set('browInnerUp', 0.25 * e + 0.15 * sm);
        set('mouthPressLeft', 0.6 * e * (1 - sm));
        set('mouthPressRight', 0.6 * e * (1 - sm));
        set('mouthStretchLeft', 0.35 * e);
        set('mouthStretchRight', 0.35 * e);
        set('mouthSmileLeft', 0.85 * sm);
        set('mouthSmileRight', 0.85 * sm);
        set('jawOpen', (0.02 + 0.03 * breath) * (1 - e) * (1 - sm) + 0.08 * e + 0.15 * sm);
        // gx > 0: toward the character's left (left eye out, right eye in)
        set('eyeLookOutLeft', gx);
        set('eyeLookInRight', gx);
        set('eyeLookInLeft', -gx);
        set('eyeLookOutRight', -gx);
        set('eyeLookUpLeft', gy);
        set('eyeLookUpRight', gy);
        set('eyeLookDownLeft', -gy + 0.3 * b);
        set('eyeLookDownRight', -gy + 0.3 * b);
      },
    };
  }
  g.OjasFace = { setup: setup };
})(typeof window !== 'undefined' ? window : globalThis);
`;
