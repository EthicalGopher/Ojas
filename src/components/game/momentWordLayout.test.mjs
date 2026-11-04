// Run with: node src/components/game/momentWordLayout.test.mjs   (Node >= 22.18)
import assert from 'node:assert/strict';
import { estimateWordWidth, fitWordSize } from './momentWordLayout.ts';

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

test('estimateWordWidth uses the measured glyph table', () => {
  // (V .742 + I .312 + C .688 + T .644 + O .807 + R .706 + Y .645 = 4.544) + 0.2 + 0.24 = 4.984 em
  assert.ok(Math.abs(estimateWordWidth('VICTORY', 64) - 318.976) < 1e-6);
  assert.equal(estimateWordWidth('', 64), 0);
  assert.equal(estimateWordWidth('victory', 64), estimateWordWidth('VICTORY', 64));
});

test('fitWordSize', () => {
  assert.equal(fitWordSize('VICTORY', 64, 200), 40);
  assert.equal(fitWordSize('VICTORY', 64, 400), 64);
  assert.equal(fitWordSize('WWWWWWWWWWWWWWWWWWWW', 64, 100), 24);
  assert.equal(fitWordSize('', 64, 10), 64);
});

console.log(`momentWordLayout: ${passed} tests passed`);
