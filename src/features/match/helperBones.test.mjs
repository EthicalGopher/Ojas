// The page's helper-bone solver (helperBonesSource.ts) against the values Blender baked into the clips
// (scripts/blender/arjun_improve/stage1_deform.py): same main-bone pose in, same helper rotations out.
//   node src/features/match/helperBones.test.mjs [character.glb]
// Default file: the stage-1 build in scripts/blender/.cache/arjun_versions (make arjun-stage1).
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { HELPER_BONES_SOURCE } from './helperBonesSource.ts';

const GLB = process.argv[2] || 'scripts/blender/.cache/arjun_versions/arjun_v1_deform.glb';
if (!fs.existsSync(GLB)) {
  console.log(`skip: ${GLB} not built (make arjun-stage1)`);
  process.exit(0);
}
const ctx = {};
vm.runInNewContext(fs.readFileSync('android/app/src/main/assets/web/three/three.min.js', 'utf8'), ctx);
globalThis.THREE = ctx.THREE;
vm.runInThisContext(HELPER_BONES_SOURCE);
const THREE = globalThis.THREE;

// ---- minimal GLB reader: node tree + animation samplers
const buf = fs.readFileSync(GLB);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
const bin = buf.subarray(20 + jsonLen + 8);
function accessor(i) {
  const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
  const off = (v.byteOffset || 0) + (a.byteOffset || 0);
  assert.equal(a.componentType, 5126, 'float accessors only');
  return { n, data: new Float32Array(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * 4)) };
}
const nodes = gltf.nodes.map((nd) => {
  const b = new THREE.Bone();
  b.name = nd.name || '';
  if (nd.translation) b.position.fromArray(nd.translation);
  if (nd.rotation) b.quaternion.fromArray(nd.rotation);
  if (nd.scale) b.scale.fromArray(nd.scale);
  return b;
});
gltf.nodes.forEach((nd, i) => (nd.children || []).forEach((c) => nodes[i].add(nodes[c])));
const root = new THREE.Group();
gltf.scenes[0].nodes.forEach((i) => root.add(nodes[i]));
root.updateMatrixWorld(true);
const rig = globalThis.OjasHelperBones.setup(root);
assert.ok(rig, 'the rig has helper bones');
const helpers = new Set(rig.bones);
console.log(`${rig.bones.length} helper bones`);

const restQ = new Map(nodes.map((b) => [b, b.quaternion.clone()]));
let worst = 0, compared = 0, frames = 0, moved = 0;
for (const anim of gltf.animations) {
  const ch = anim.channels
    .filter((c) => c.target.path === 'rotation')
    .map((c) => ({ node: nodes[c.target.node], s: anim.samplers[c.sampler] }))
    .map((c) => ({ ...c, t: accessor(c.s.input).data, v: accessor(c.s.output) }));
  const baked = ch.filter((c) => helpers.has(c.node.name.replace(/[^a-z0-9]/gi, '').toLowerCase()));
  if (!baked.length) continue;
  const times = baked[0].t;
  for (let k = 0; k < times.length; k += 3) {
    for (const c of ch) {
      // the sample at this time (every channel is sampled on the same frames when baked)
      let j = c.t.findIndex((x) => Math.abs(x - times[k]) < 1e-4);
      if (j < 0) j = Math.min(k, c.t.length - 1);
      c.node.quaternion.fromArray(c.v.data, j * 4);
    }
    const want = baked.map((c) => c.node.quaternion.clone());
    rig.solve();
    baked.forEach((c, i) => {
      const got = c.node.quaternion;
      assert.ok([got.x, got.y, got.z, got.w].every(Number.isFinite), 'no NaN');
      const ang = 2 * Math.acos(Math.min(1, Math.abs(got.dot(want[i])))) * 180 / Math.PI;
      worst = Math.max(worst, ang);
      moved = Math.max(moved, 2 * Math.acos(Math.min(1, Math.abs(want[i].dot(restQ.get(c.node))))) * 180 / Math.PI);
      compared++;
    });
    frames++;
  }
  console.log(`${anim.name}: ${baked.length} baked helper tracks`);
}
assert.ok(compared > 0, 'the file has baked helper tracks to compare against');
console.log(`${frames} frames, ${compared} helper rotations (up to ${moved.toFixed(0)} deg from rest), worst difference ${worst.toFixed(3)} deg`);
assert.ok(moved > 10, 'the baked helpers actually move');
assert.ok(worst < 0.5, `runtime solver disagrees with the Blender bake by ${worst.toFixed(2)} deg`);
console.log('ok');
