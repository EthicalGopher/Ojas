// Run with: node src/store/profileMerge.test.mjs   (Node >= 22.18)
import assert from 'node:assert/strict';
import { resolveProfile } from './profileMerge.ts';

const server = { id: 'u', username: 'Gomu', equipped_avatar_id: 'starter_ojas' };
const blank = { id: 'u', username: 'athlete_1', load_failed: true };
const saved = { equipped_avatar_id: 'starter_ojas', equipped_items: { starter_ojas: {} } };

// a good read always wins, even over the saved look
assert.equal(resolveProfile(null, server, { equipped_avatar_id: 'starter_ojas_f' }).equipped_avatar_id, 'starter_ojas');
// a failed read keeps the profile already on screen
assert.equal(resolveProfile(server, blank, null), server);
// a failed read at launch shows the hero saved on the device
assert.equal(resolveProfile(null, blank, saved).equipped_avatar_id, 'starter_ojas');
assert.equal(resolveProfile(null, blank, saved).load_failed, true);
// a second failed read keeps that hero
const first = resolveProfile(null, blank, saved);
assert.equal(resolveProfile(first, blank, saved).equipped_avatar_id, 'starter_ojas');
// nothing saved yet: the stand-in stands, and the app falls back to the default hero
assert.equal(resolveProfile(null, blank, null).equipped_avatar_id, undefined);
console.log('profileMerge: ok');
