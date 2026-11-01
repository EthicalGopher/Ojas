// Run with: node src/utils/assetPacksLogic.test.mjs   (Node >= 22.18 strips the TypeScript types itself)
import assert from 'node:assert/strict';
import {
  PACK_SIZES,
  READY_STATE,
  UNKNOWN_STATE,
  effectiveModel,
  failureMessage,
  formatProgress,
  gate,
  isReady,
  isStalled,
  normalizeReason,
  normalizeStatus,
  packForExercise,
} from './assetPacksLogic.ts';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    console.error('FAIL', name);
    throw e;
  }
}
const st = (status, extra = {}) => ({ ...UNKNOWN_STATE, status, ...extra });

test('constants', () => {
  assert.equal(PACK_SIZES.pose_heavy, 27709200);
  assert.equal(PACK_SIZES.tree_pose, 35431168);
  assert.deepEqual(READY_STATE, { status: 'ready', progress: 1, downloadedBytes: 0, totalBytes: 0, errorCode: 0, reason: '' });
  assert.deepEqual(UNKNOWN_STATE, { status: 'unknown', progress: 0, downloadedBytes: 0, totalBytes: 0, errorCode: 0, reason: '' });
});

test('normalizeStatus / normalizeReason', () => {
  for (const s of ['unknown', 'pending', 'downloading', 'ready', 'failed', 'waiting_wifi', 'needs_confirmation', 'unavailable']) {
    assert.equal(normalizeStatus(s), s);
  }
  assert.equal(normalizeStatus('bogus'), 'unknown');
  assert.equal(normalizeStatus(''), 'unknown');
  for (const r of ['', 'storage', 'network', 'play', 'not_owned', 'other']) assert.equal(normalizeReason(r), r);
  assert.equal(normalizeReason('weird'), 'other');
});

test('isReady', () => {
  assert.equal(isReady(READY_STATE), true);
  assert.equal(isReady(st('pending')), false);
  assert.equal(isReady(undefined), false);
});

test('effectiveModel', () => {
  assert.deepEqual(effectiveModel('high', READY_STATE), { model: 'high', downgraded: false });
  for (const s of [st('pending'), st('downloading'), st('failed'), st('unavailable'), UNKNOWN_STATE, undefined]) {
    assert.deepEqual(effectiveModel('high', s), { model: 'medium', downgraded: true });
  }
  assert.deepEqual(effectiveModel('light', st('pending')), { model: 'light', downgraded: false });
  assert.deepEqual(effectiveModel('medium', undefined), { model: 'medium', downgraded: false });
});

test('gate', () => {
  assert.equal(gate(READY_STATE), 'ready');
  assert.equal(gate(st('failed')), 'retry');
  assert.equal(gate(st('unavailable')), 'unavailable');
  for (const s of ['unknown', 'pending', 'downloading', 'waiting_wifi', 'needs_confirmation']) assert.equal(gate(st(s)), 'wait');
  assert.equal(gate(undefined), 'wait');
});

test('formatProgress', () => {
  assert.equal(formatProgress(READY_STATE, 35431168), 'Ready');
  assert.equal(formatProgress(st('downloading', { progress: 0.42, totalBytes: 100 }), 35431168), '42%');
  assert.equal(formatProgress(st('downloading', { progress: 0.424 }), 35431168), '42%');
  assert.equal(formatProgress(st('pending'), 35431168), '35 MB');
  assert.equal(formatProgress(st('pending'), 27709200), '28 MB');
  assert.equal(formatProgress(st('downloading', { progress: 1.4, totalBytes: 1 }), 1), '100%');
  assert.equal(formatProgress(st('downloading', { progress: Number.NaN, totalBytes: 1 }), 1), '0%');
  assert.equal(formatProgress(st('downloading', { progress: -3, totalBytes: 10 }), 1), '0%');
  assert.equal(formatProgress(undefined, 35431168), '35 MB');
});

test('isStalled', () => {
  const h = (status, at = 0) => ({ status, downloadedBytes: 0, progress: 0, at });
  assert.equal(isStalled(h('downloading'), 59999, 60000), false);
  assert.equal(isStalled(h('downloading'), 60000, 60000), true);
  assert.equal(isStalled(h('pending'), 60000, 60000), true);
  assert.equal(isStalled(h('unknown'), 60000, 60000), true);
  for (const s of ['failed', 'ready', 'waiting_wifi', 'needs_confirmation', 'unavailable']) {
    assert.equal(isStalled(h(s), 999999, 60000), false);
  }
});

test('packForExercise', () => {
  assert.equal(packForExercise('9'), 'tree_pose');
  assert.equal(packForExercise('Tree Pose'), 'tree_pose');
  assert.equal(packForExercise('vrikshasana'), 'tree_pose');
  assert.equal(packForExercise('squats'), null);
  assert.equal(packForExercise('90'), null);
  assert.equal(packForExercise(''), null);
  assert.equal(packForExercise('10'), null);
});

test('failureMessage', () => {
  assert.equal(failureMessage('storage'), 'Not enough storage. Free some space, then retry.');
  assert.equal(failureMessage('network'), 'No connection. Check your network, then retry.');
  assert.equal(failureMessage('play'), "Google Play isn't available. Update Google Play services, then retry.");
  assert.equal(failureMessage('not_owned'), 'Install Ojas from Google Play to download this.');
  assert.equal(failureMessage('other'), 'Download failed. Retry.');
  assert.equal(failureMessage(''), 'Download failed. Retry.');
});

console.log(`assetPacksLogic: ${passed} tests passed`);
