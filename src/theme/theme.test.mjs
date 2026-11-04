// Run with: node src/theme/theme.test.mjs   (Node >= 22.18)
import assert from 'node:assert/strict';
import { palettes } from './palettes.ts';
import { CONTRAST_PAIRS, contrastRatio, toneText } from './contrast.ts';
import { VARIANTS, buildTypeStyle } from './typeSpec.ts';

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

test('contrastRatio', () => {
  assert.equal(contrastRatio('#FFFFFF', '#000000'), 21);
  assert.ok(Math.abs(contrastRatio('#14233A', '#FF9A3C') - 7.47) < 0.05);
});

test('every CONTRAST_PAIRS entry meets its minimum in both palettes', () => {
  const failures = [];
  for (const [mode, p] of Object.entries(palettes)) {
    for (const pair of CONTRAST_PAIRS) {
      if (pair.only && pair.only !== mode) continue;
      const r = contrastRatio(pair.fg(p), pair.bg(p));
      if (r < pair.min) failures.push(`${mode}: ${pair.name} ${r.toFixed(2)} < ${pair.min}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('toneText picks navy or white and accent uses onGradient', () => {
  assert.equal(toneText(palettes.light, 'accent'), palettes.light.onGradient);
  assert.equal(toneText(palettes.light, 'rival'), '#FFFFFF');
  assert.equal(toneText(palettes.light, 'you'), palettes.light.textOnLight);
});

test('both palettes have the same keys', () => {
  assert.deepEqual(Object.keys(palettes.light).sort(), Object.keys(palettes.dark).sort());
});

test('buildTypeStyle', () => {
  const ok = buildTypeStyle(VARIANTS.hero, true);
  assert.equal(ok.fontFamily, 'Nunito_900Black_Italic');
  assert.equal(ok.fontWeight, undefined);
  assert.equal(ok.fontStyle, undefined);
  assert.equal(ok.textTransform, 'uppercase');
  const fallback = buildTypeStyle(VARIANTS.hero, false);
  assert.equal(fallback.fontFamily, undefined);
  assert.equal(fallback.fontWeight, '900');
  assert.equal(fallback.fontStyle, 'italic');
  const title22 = buildTypeStyle(VARIANTS.title, true, 22);
  assert.equal(title22.fontSize, 22);
  assert.equal(title22.lineHeight, 26);
});

console.log(`theme: ${passed} tests passed`);
