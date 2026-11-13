// The face driver (faceSource.ts) on Arjun's real morph targets: every face mesh found, blinks happen,
// effort and smile reach the checked amounts, every weight stays in 0..1.
//   node src/features/avatar/face.test.mjs [character.glb]
// Default file: the stage-2 build (make arjun-stage2); falls back to the app's arjun.glb.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { FACE_SOURCE } from './faceSource.ts';

const candidates = [process.argv[2], 'scripts/blender/.cache/arjun_versions/arjun_v2_face.glb',
  'android/app/src/main/assets/web/avatars/arjun.glb'].filter(Boolean);
const GLB = candidates.find((f) => fs.existsSync(f));
const buf = fs.readFileSync(GLB);
const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString());
const meshes = json.meshes
  .filter((m) => m.extras && m.extras.targetNames)
  .map((m) => {
    const dict = {};
    m.extras.targetNames.forEach((n, i) => (dict[n] = i));
    return { name: m.name, isMesh: true, morphTargetDictionary: dict, morphTargetInfluences: m.extras.targetNames.map(() => 0) };
  });
if (!meshes.length) {
  console.log(`skip: ${GLB} has no morph targets (make arjun-stage2)`);
  process.exit(0);
}
const root = { traverse: (fn) => meshes.forEach(fn) };
vm.runInThisContext(FACE_SOURCE);
const face = globalThis.OjasFace.setup(root);
assert.ok(face, 'face found');
assert.equal(globalThis.OjasFace.setup({ traverse() {} }), null, 'no targets: no face');
console.log(`${GLB}: ${meshes.length} face meshes, ${face.names.length} shapes`);

function w(name) {
  // the weight a shape has on the first mesh that carries it
  const m = meshes.find((x) => name in x.morphTargetDictionary);
  return m.morphTargetInfluences[m.morphTargetDictionary[name]];
}
function same(name) {
  // every mesh carrying a shape holds the same weight (lashes move with the lids)
  const v = meshes.filter((x) => name in x.morphTargetDictionary).map((x) => x.morphTargetInfluences[x.morphTargetDictionary[name]]);
  return v.every((x) => Math.abs(x - v[0]) < 1e-9);
}
function run(seconds, state, each) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    face.update(1 / 60, state);
    for (const m of meshes) for (const v of m.morphTargetInfluences) assert.ok(v >= 0 && v <= 1 && Number.isFinite(v), 'weight in 0..1');
    if (each) each();
  }
}
let blinks = 0, shut = false, maxLook = 0;
run(30, { effort: 0, smile: 0 }, () => {
  const b = w('eyeBlinkLeft');
  if (b > 0.95 && !shut) blinks++;
  shut = b > 0.95;
  maxLook = Math.max(maxLook, w('eyeLookOutLeft'), w('eyeLookInLeft'));
  assert.ok(same('eyeBlinkLeft') && same('eyeBlinkRight'), 'lids and lashes blink together');
});
console.log(`idle 30 s: ${blinks} blinks, glances up to ${maxLook.toFixed(2)}, jawOpen ${w('jawOpen').toFixed(3)}`);
assert.ok(blinks >= 5 && blinks <= 20, `blink rate ${blinks} / 30 s`);
assert.ok(maxLook > 0.05 && maxLook <= 0.3, 'glances are small');
run(2, { effort: 1, smile: 0 });
console.log(`effort: press ${w('mouthPressLeft').toFixed(2)} browDown ${w('browDownLeft').toFixed(2)} squint ${w('eyeSquintLeft').toFixed(2)}`);
assert.ok(Math.abs(w('mouthPressLeft') - 0.6) < 0.02 && Math.abs(w('browDownLeft') - 0.5) < 0.02, 'effort face');
run(2, { effort: 0, smile: 1 });
console.log(`cheer: smile ${w('mouthSmileLeft').toFixed(2)} press ${w('mouthPressLeft').toFixed(2)} jawOpen ${w('jawOpen').toFixed(2)}`);
assert.ok(Math.abs(w('mouthSmileLeft') - 0.85) < 0.02 && w('mouthPressLeft') < 0.02, 'cheer face');
assert.ok(same('jawOpen'), 'teeth follow the jaw');
console.log('ok');
