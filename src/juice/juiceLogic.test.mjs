// Run with: node src/juice/juiceLogic.test.mjs   (Node >= 22.18 strips the TypeScript types itself)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_JUICE_SETTINGS,
  crossfadeSteps,
  duckTimeoutMs,
  isLatestUtterance,
  musicVolumeFor,
  sanitizeSettings,
  shouldPlay,
} from './juiceLogic.ts';
import { AUDIO_CREDITS, AUDIO_FILES } from '../legal/audioCredits.ts';

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
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('shouldPlay throttles the same event for 60 ms', () => {
  assert.equal(shouldPlay('rep', 1000, {}), true);
  assert.equal(shouldPlay('rep', 1059, { rep: 1000 }), false);
  assert.equal(shouldPlay('rep', 1060, { rep: 1000 }), true);
  assert.equal(shouldPlay('tap', 1001, { rep: 1000 }), true);
});

test('musicVolumeFor', () => {
  const s = { ...DEFAULT_JUICE_SETTINGS };
  close(musicVolumeFor('menu', s, false), 0.6);
  close(musicVolumeFor('match', s, false), 0.21);
  close(musicVolumeFor('menu', s, true), 0.15);
  assert.equal(musicVolumeFor('menu', { ...s, music: false }, false), 0);
  close(musicVolumeFor('menu', { ...s, musicVolume: 7 }, false), 1);
});

test('sanitizeSettings falls back per field and snaps the volume', () => {
  assert.deepEqual(sanitizeSettings(null), DEFAULT_JUICE_SETTINGS);
  assert.deepEqual(sanitizeSettings('x'), DEFAULT_JUICE_SETTINGS);
  assert.deepEqual(sanitizeSettings([1, 2]), DEFAULT_JUICE_SETTINGS);
  assert.deepEqual(sanitizeSettings({ music: false }), { ...DEFAULT_JUICE_SETTINGS, music: false });
  assert.deepEqual(sanitizeSettings({ sfx: 'no', haptics: 0 }), DEFAULT_JUICE_SETTINGS);
  assert.equal(sanitizeSettings({ musicVolume: 0.55 }).musicVolume, 0.6);
  assert.equal(sanitizeSettings({ musicVolume: 7 }).musicVolume, 1);
  assert.equal(sanitizeSettings({ musicVolume: NaN }).musicVolume, 0.6);
});

test('crossfadeSteps', () => {
  const { out, in: inn } = crossfadeSteps(0.6, 0.21, 8);
  assert.equal(out.length, 8);
  assert.equal(inn.length, 8);
  close(out[7], 0);
  close(inn[7], 0.21);
  for (let i = 1; i < 8; i++) {
    assert.ok(out[i] <= out[i - 1]);
    assert.ok(inn[i] >= inn[i - 1]);
  }
});

test('utterance tokens and duck timeout', () => {
  assert.equal(isLatestUtterance(3, 3), true);
  assert.equal(isLatestUtterance(2, 3), false);
  assert.equal(duckTimeoutMs('short'), 8000);
  assert.equal(duckTimeoutMs('x'.repeat(100)), 11000);
});

test('every audio file referenced by juiceMap has a credit entry', () => {
  const map = readFileSync(new URL('./juiceMap.ts', import.meta.url), 'utf8');
  const used = [...map.matchAll(/assets\/audio\/((?:sfx|music)\/[a-z_]+\.mp3)/g)].map((m) => m[1]);
  assert.ok(used.length >= 19, `expected 19 files, found ${used.length}`);
  for (const f of used) {
    assert.ok(AUDIO_FILES.includes(f), `${f} missing from AUDIO_FILES`);
    assert.ok(AUDIO_CREDITS.some((c) => c.file === f && c.licence === 'CC0-1.0'), `${f} has no CC0 credit`);
  }
});

console.log(`juiceLogic: ${passed} tests passed`);
