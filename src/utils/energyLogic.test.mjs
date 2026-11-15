// Run with: node src/utils/energyLogic.test.mjs   (Node >= 22.18)
import assert from 'node:assert/strict';
import { ENERGY_MAX, ENERGY_REGEN_MS, energyAt, formatCountdown, parseSnapshot, refill, spend } from './energyLogic.ts';

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
const T = 1_700_000_000_000;
const MIN = 60_000;

test('full bar stays full and keeps its clock at now', () => {
  assert.deepEqual(refill({ energy: ENERGY_MAX, updatedAt: T - 99 * MIN }, T), { energy: ENERGY_MAX, updatedAt: T });
  assert.deepEqual(energyAt({ energy: ENERGY_MAX, updatedAt: T }, T), { energy: 5, max: 5, msToNext: null, msToFull: 0 });
});

test('spending from full starts the 10-minute clock', () => {
  const r = spend({ energy: 5, updatedAt: T - 60 * MIN }, T);
  assert.equal(r.ok, true);
  assert.deepEqual(r.snap, { energy: 4, updatedAt: T });
  const e = energyAt(r.snap, T + 3 * MIN);
  assert.equal(e.energy, 4);
  assert.equal(e.msToNext, 7 * MIN);
  assert.equal(e.msToFull, 7 * MIN);
});

test('one bar back every 10 minutes, the clock keeps its remainder', () => {
  const s = { energy: 1, updatedAt: T };
  assert.equal(energyAt(s, T + 9 * MIN).energy, 1);
  assert.equal(energyAt(s, T + 10 * MIN).energy, 2);
  const r = refill(s, T + 25 * MIN);
  assert.deepEqual(r, { energy: 3, updatedAt: T + 20 * MIN });
  assert.equal(energyAt(s, T + 25 * MIN).msToNext, 5 * MIN);
  assert.equal(energyAt(s, T + 25 * MIN).msToFull, 5 * MIN + 10 * MIN);
});

test('refill caps at the max', () => {
  assert.equal(energyAt({ energy: 0, updatedAt: T }, T + 500 * MIN).energy, ENERGY_MAX);
  assert.equal(energyAt({ energy: 0, updatedAt: T }, T + 49 * MIN).energy, 4);
});

test('spending mid-refill keeps the running clock', () => {
  const r = spend({ energy: 3, updatedAt: T }, T + 4 * MIN);
  assert.deepEqual(r, { ok: true, snap: { energy: 2, updatedAt: T } });
  assert.equal(energyAt(r.snap, T + 4 * MIN).msToNext, 6 * MIN);
});

test('empty bar cannot be spent', () => {
  const r = spend({ energy: 0, updatedAt: T }, T + 5 * MIN);
  assert.equal(r.ok, false);
  assert.equal(r.snap.energy, 0);
  assert.equal(spend({ energy: 0, updatedAt: T }, T + ENERGY_REGEN_MS).ok, true);
});

test('five matches empty the bar, the sixth is refused', () => {
  let s = { energy: ENERGY_MAX, updatedAt: T };
  for (let i = 0; i < 5; i++) {
    const r = spend(s, T + i * MIN);
    assert.equal(r.ok, true, `match ${i + 1}`);
    s = r.snap;
  }
  // 5 minutes in, none back yet
  assert.equal(spend(s, T + 5 * MIN).ok, false);
});

test('a clock in the future (device time changed) is treated as now', () => {
  assert.deepEqual(refill({ energy: 2, updatedAt: T + 60 * MIN }, T), { energy: 2, updatedAt: T });
});

test('parseSnapshot reads good values and falls back to full', () => {
  assert.deepEqual(parseSnapshot(JSON.stringify({ energy: 2, updatedAt: T - MIN }), T), { energy: 2, updatedAt: T - MIN });
  assert.deepEqual(parseSnapshot(JSON.stringify({ energy: 99, updatedAt: T }), T), { energy: 5, updatedAt: T });
  assert.deepEqual(parseSnapshot('not json', T), { energy: 5, updatedAt: T });
  assert.deepEqual(parseSnapshot(null, T), { energy: 5, updatedAt: T });
  assert.deepEqual(parseSnapshot(JSON.stringify({ energy: 'x' }), T), { energy: 5, updatedAt: T });
});

test('formatCountdown', () => {
  assert.equal(formatCountdown(0), '0:00');
  assert.equal(formatCountdown(9 * MIN + 5000), '9:05');
  assert.equal(formatCountdown(1), '0:01');
  assert.equal(formatCountdown(62 * MIN + 3000), '1:02:03');
});

console.log(`energyLogic: ${passed} tests passed`);
