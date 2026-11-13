// Helper-bone solver for the Unreal-skeleton characters (Arjun). Their limbs are skinned to twist bones
// and corrective helpers (calf_kneeBack, upperarm_out, thigh_fwd, ...) that Unreal moves with a pose
// driver; nothing moves them here unless this runs, so knees pinch, shoulders collapse and forearms
// twist like a candy wrapper.
//
// The same rules as scripts/blender/arjun_improve/stage1_deform.py (which bakes them into the clips),
// for poses the page sets itself (the live-retarget path: a real opponent, the built-in moves):
// - <limb>_correctiveRoot takes half the joint's bend and none of its roll (a half-angle joint);
// - twist bones spread the roll along the limb: none at the joint, all of it at the far end (for the
//   forearm that includes the hand's roll).
// Angles are in each bone's own frame, Y along the bone (glTF keeps Blender's bone axes).
//
// OjasHelperBones.setup(root) -> { solve() } | null    (null: the rig has no such helpers)
//   call setup in the rest pose; call solve() after the main bones are posed, before rendering.
//
// Plain JS in a string so the same source runs in the WebView and in a node test.
export const HELPER_BONES_SOURCE = `
(function (g) {
  var Y = null;
  function key(n) { return n.replace(/[^a-z0-9]/gi, '').toLowerCase(); }
  function twistAngle(q) {
    if (q.w * q.w + q.y * q.y < 1e-12) return 0;
    var a = 2 * Math.atan2(q.y, q.w);
    return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
  }
  function swingOf(q) {
    var t = new THREE.Quaternion(0, q.y, 0, q.w);
    if (t.lengthSq() < 1e-12) return q.clone();
    t.normalize();
    var s = q.clone().multiply(t.invert());
    if (s.w < 0) s.set(-s.x, -s.y, -s.z, -s.w);
    return s;
  }
  function setup(root) {
    if (!g.THREE) return null;
    Y = new THREE.Vector3(0, 1, 0);
    var B = {}, R = {};
    root.traverse(function (o) { if (o.isBone) { B[key(o.name)] = o; R[key(o.name)] = o.quaternion.clone(); } });
    root.updateMatrixWorld(true);
    function pos(k) { return B[k].getWorldPosition(new THREE.Vector3()); }
    function fraction(k, a, b) {
      var pa = pos(a), d = pos(b).sub(pa);
      return Math.max(0, Math.min(1, pos(k).sub(pa).dot(d) / d.lengthSq()));
    }
    var spec = [];
    ['l', 'r'].forEach(function (s) {
      var U = 'cc' + s + 'upperarm', F = 'cc' + s + 'forearm', H = 'cc' + s + 'hand';
      var T = 'cc' + s + 'thigh', K = 'cc' + s + 'calf', Ft = 'cc' + s + 'foot';
      [['upperarmcorrectiveroot', U], ['lowerarmcorrectiveroot', F], ['thighcorrectiveroot', T],
       ['calfcorrectiveroot', K]].forEach(function (x) {
        spec.push({ h: x[0] + s, kind: 'half', main: x[1] });
      });
      [1, 2].forEach(function (i) {
        [['upperarmtwist0', U, null, F], ['lowerarmtwist0', F, H, H], ['thightwist0', T, null, K],
         ['calftwist0', K, null, Ft]].forEach(function (x) {
          var h = x[0] + i + s;
          if (B[h] && B[x[1]] && B[x[3]]) spec.push({ h: h, kind: 'twist', main: x[1], child: x[2], f: fraction(h, x[1], x[3]) });
        });
      });
    });
    spec = spec.filter(function (x) { return B[x.h] && B[x.main] && (!x.child || B[x.child]); });
    if (!spec.length) return null;
    var q = new THREE.Quaternion(), r = new THREE.Quaternion(), c = new THREE.Quaternion();
    function basis(k, out) { return out.copy(R[k]).invert().multiply(B[k].quaternion); }
    return {
      solve: function () {
        for (var i = 0; i < spec.length; i++) {
          var x = spec[i];
          basis(x.main, q).normalize();
          if (x.kind === 'half') {
            r.identity().slerp(swingOf(q), 0.5);
            r.premultiply(q.clone().invert());
          } else {
            var own = twistAngle(q), total = own;
            if (x.child) total += twistAngle(c.copy(B[x.child].quaternion).multiply(R[x.child].clone().invert()).normalize());
            r.setFromAxisAngle(Y, x.f * total - own);
          }
          B[x.h].quaternion.copy(r).multiply(R[x.h]);
        }
      },
      bones: spec.map(function (x) { return x.h; }),
    };
  }
  g.OjasHelperBones = { setup: setup };
})(typeof window !== 'undefined' ? window : globalThis);
`;
