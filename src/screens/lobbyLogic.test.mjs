// Run with: node src/screens/lobbyLogic.test.mjs   (Node >= 22.18)
import assert from 'node:assert/strict';
import { DEFAULT_LAST_PLAY, modeNeedsAuth, modeSupportsExercise, parseLastPlay, playLabel } from './lobbyLogic.ts';

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
const ids = ['1', '2', '9', '10'];

test('parseLastPlay', () => {
  assert.deepEqual(parseLastPlay(null, ids), DEFAULT_LAST_PLAY);
  assert.deepEqual(parseLastPlay('{bad json', ids), DEFAULT_LAST_PLAY);
  assert.deepEqual(parseLastPlay('{"mode":"nope","exerciseId":"2"}', ids), { mode: 'ai_duel', exerciseId: '1' });
  assert.deepEqual(parseLastPlay('{"mode":"solo","exerciseId":"99"}', ids), { mode: 'solo', exerciseId: '1' });
  assert.deepEqual(parseLastPlay('{"mode":"ai_duel","exerciseId":"9"}', ids), { mode: 'ai_duel', exerciseId: '1' });
  assert.deepEqual(parseLastPlay('{"mode":"quick_duel","exerciseId":"10"}', ids), { mode: 'quick_duel', exerciseId: '10' });
});

test('modeSupportsExercise', () => {
  assert.equal(modeSupportsExercise('ai_duel', '1'), true);
  assert.equal(modeSupportsExercise('ai_duel', '9'), false);
  assert.equal(modeSupportsExercise('quick_duel', '9'), true);
});

test('modeNeedsAuth and playLabel', () => {
  assert.equal(modeNeedsAuth('quick_duel'), true);
  assert.equal(modeNeedsAuth('battle_ground'), true);
  assert.equal(modeNeedsAuth('ai_duel'), false);
  assert.equal(modeNeedsAuth('solo'), false);
  assert.equal(playLabel('quick_duel'), 'Find match');
  assert.equal(playLabel('ai_duel'), 'Fight AI');
  assert.equal(playLabel('battle_ground'), 'Enter arena');
  assert.equal(playLabel('solo'), 'Start training');
});

console.log(`lobbyLogic: ${passed} tests passed`);
