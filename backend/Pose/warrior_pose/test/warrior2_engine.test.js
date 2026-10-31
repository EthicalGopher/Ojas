/**
 * Node test harness for the Warrior II classification engine (no DOM, no camera).
 * Run: node test/warrior2_engine.test.js
 */

const {
    MediaPipeWarrior2EngineJS,
    setStreamAspect,
    THRESHOLDS,
    LM
} = require('../warrior2_engine.js');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = '') {
    if (cond) {
        passed++;
        console.log(`  PASS  ${name}`);
    } else {
        failed++;
        failures.push(name);
        console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`);
    }
}

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------
/**
 * Builds realistic synthetic 33-point pose landmarks for Warrior II.
 * Coordinates are normalized [0, 1] image space.
 */
function warrior2Fixture(opts = {}) {
    const front = opts.front || 'LEFT'; // 'LEFT' or 'RIGHT' front leg
    const frontKneeAngle = opts.frontKneeAngle ?? 108.0; // deg
    const rearKneeAngle = opts.rearKneeAngle ?? 180.0;   // deg
    const armTilt = opts.armTilt ?? 0.0;                 // deg deviation from horizontal
    const elbowAngle = opts.elbowAngle ?? 180.0;         // deg
    const torsoLean = opts.torsoLean ?? 0.0;             // deg lean from vertical
    const stanceRatio = opts.stanceRatio ?? 1.8;         // wide stance multiplier
    const ankleYDiff = opts.ankleYDiff ?? 0.0;           // ankle vertical offset
    const visibility = opts.visibility ?? 0.95;

    const midX = 0.50;
    const baseShoulderY = 0.30;
    const baseHipY = 0.52;
    const torsoH = baseHipY - baseShoulderY;

    // Torso lean offset at shoulders
    const torsoDx = Math.sin((torsoLean * Math.PI) / 180.0) * torsoH;

    const midShoulderX = midX + torsoDx;
    const midHipX = midX;

    const shoulderHalfW = 0.08;
    const hipHalfW = 0.06;

    const base = {
        0: { x: midShoulderX, y: 0.18 },
        11: { x: midShoulderX + shoulderHalfW, y: baseShoulderY }, // left shoulder
        12: { x: midShoulderX - shoulderHalfW, y: baseShoulderY }, // right shoulder
        23: { x: midHipX + hipHalfW, y: baseHipY },               // left hip
        24: { x: midHipX - hipHalfW, y: baseHipY },               // right hip
    };

    // Arms: horizontal T-shape
    const armLen = 0.16;
    const armTiltRad = (armTilt * Math.PI) / 180.0;
    const dyArm = armLen * Math.sin(armTiltRad);
    const dxArm = armLen * Math.cos(armTiltRad);

    // Left arm extends towards +x
    base[13] = { x: base[11].x + dxArm * 0.5, y: base[11].y + dyArm * 0.5 };
    if (elbowAngle < 140.0) {
        // Bend elbow by moving wrist
        base[15] = { x: base[13].x, y: base[13].y - 0.12 };
    } else {
        base[15] = { x: base[11].x + dxArm, y: base[11].y + dyArm };
    }

    // Right arm extends towards -x
    base[14] = { x: base[12].x - dxArm * 0.5, y: base[12].y + dyArm * 0.5 };
    if (elbowAngle < 140.0) {
        base[16] = { x: base[14].x, y: base[14].y - 0.12 };
    } else {
        base[16] = { x: base[12].x - dxArm, y: base[12].y + dyArm };
    }

    // Legs:
    const ankleY = 0.88;
    const totalStance = (base[23].x - base[24].x) * stanceRatio * 1.8;

    if (front === 'LEFT') {
        // Left front leg: bent knee at x = 0.74, y = 0.58. Left ankle at x = 0.74, y = 0.88
        const leftAnkleX = midHipX + totalStance * 0.55;
        const rightAnkleX = midHipX - totalStance * 0.45;

        base[27] = { x: leftAnkleX, y: ankleY + ankleYDiff };
        base[28] = { x: rightAnkleX, y: ankleY };

        // Front knee (left)
        if (frontKneeAngle > 155.0) {
            // Straight front knee
            base[25] = { x: (base[23].x + leftAnkleX) / 2.0, y: (base[23].y + ankleY) / 2.0 };
        } else {
            // Bent front knee into lunge
            const kneeY = base[23].y + 0.08;
            base[25] = { x: leftAnkleX, y: kneeY };
        }

        // Rear knee (right)
        if (rearKneeAngle < 140.0) {
            // Bent rear knee
            base[26] = { x: 0.42, y: 0.74 };
        } else {
            // Straight rear leg
            base[26] = { x: (base[24].x + rightAnkleX) / 2.0, y: (base[24].y + ankleY) / 2.0 };
        }
    } else {
        // Right front leg: bent knee at -x side. Left rear leg at +x side
        const rightAnkleX = midHipX - totalStance * 0.55;
        const leftAnkleX = midHipX + totalStance * 0.45;

        base[28] = { x: rightAnkleX, y: ankleY + ankleYDiff };
        base[27] = { x: leftAnkleX, y: ankleY };

        // Front knee (right)
        if (frontKneeAngle > 155.0) {
            base[26] = { x: (base[24].x + rightAnkleX) / 2.0, y: (base[24].y + ankleY) / 2.0 };
        } else {
            const kneeY = base[24].y + 0.08;
            base[26] = { x: rightAnkleX, y: kneeY };
        }

        // Rear knee (left)
        if (rearKneeAngle < 140.0) {
            base[25] = { x: 0.58, y: 0.74 };
        } else {
            base[25] = { x: (base[23].x + leftAnkleX) / 2.0, y: (base[23].y + ankleY) / 2.0 };
        }
    }

    base[29] = { x: base[27].x, y: base[27].y + 0.02 };
    base[30] = { x: base[28].x, y: base[28].y + 0.02 };
    base[31] = { x: base[27].x + 0.01, y: base[27].y + 0.02 };
    base[32] = { x: base[28].x - 0.01, y: base[28].y + 0.02 };

    const lms = [];
    for (let i = 0; i < 33; i++) {
        const p = opts[i] || base[i] || { x: 0.5, y: 0.5 };
        lms.push({
            x: p.x,
            y: p.y,
            z: p.z || 0,
            visibility: p.visibility !== undefined ? p.visibility : visibility
        });
    }
    return lms;
}

function toWorld(lms) {
    return lms.map(p => ({
        x: (p.x - 0.5) * 1.5,
        y: (0.5 - p.y) * 2.0,
        z: p.z || 0
    }));
}

function feedFrame(engine, lms, world, times = 14) {
    let f = null;
    for (let i = 0; i < times; i++) {
        f = engine.analyzePose(lms, world);
        engine.updateWarrior2State(f);
    }
    return f;
}

function newEngine() {
    const e = new MediaPipeWarrior2EngineJS();
    setStreamAspect(16, 9);
    return e;
}

// ===========================================================================
console.log('\n== Test 1: Correct Warrior II (Left Front Leg) ==');
{
    const engine = newEngine();
    const lms = warrior2Fixture({ front: 'LEFT' });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();

    check('status is PERFECT WARRIOR II', engine.formStatus === 'PERFECT WARRIOR II', `got "${engine.formStatus}"`);
    check('hold timer active', engine.inWarrior2 === true);
    check('state CORRECT', dbg.state === 'CORRECT');
    check('stance LEFT FRONT', engine.activeStance === 'LEFT FRONT', engine.activeStance);
    check('front knee within 90-145°', dbg.frontKneeAngle >= 90 && dbg.frontKneeAngle <= 145, `${dbg.frontKneeAngle}°`);
    check('rear knee >= 160°', dbg.rearKneeAngle >= 160, `${dbg.rearKneeAngle}°`);
    check('wide stance ratio >= 1.25', dbg.stanceRatio >= 1.25, `${dbg.stanceRatio}`);
    check('elbows straight', dbg.leftElbowAngle >= 150 && dbg.rightElbowAngle >= 150);
}

console.log('\n== Test 2: Correct Warrior II (Right Front Leg) ==');
{
    const engine = newEngine();
    const lms = warrior2Fixture({ front: 'RIGHT' });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();

    check('right-front Warrior II passes', engine.formStatus === 'PERFECT WARRIOR II', `got "${engine.formStatus}"`);
    check('stance RIGHT FRONT', engine.activeStance === 'RIGHT FRONT', engine.activeStance);
    check('inWarrior2 true', engine.inWarrior2 === true);
}

console.log('\n== Test 3: Incorrect Front Knee (Under-bent / Too Straight) ==');
{
    const engine = newEngine();
    const lms = warrior2Fixture({ front: 'LEFT', frontKneeAngle: 175.0 });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();

    check('rejected under-bent front knee', engine.inWarrior2 === false);
    check('front knee issue reported', dbg.issues.some(i => i && (i.includes('FRONT KNEE') || i.includes('NO_STANCE'))), dbg.issues.join('|'));
}

console.log('\n== Test 4: Incorrect Rear Leg (Bent Rear Knee) ==');
{
    const engine = newEngine();
    const lms = warrior2Fixture({ front: 'LEFT', rearKneeAngle: 120.0 });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();

    check('rejected bent rear knee', engine.inWarrior2 === false);
    check('rear leg issue reported', dbg.issues.some(i => i && (i.includes('REAR LEG') || i.includes('NO_STANCE'))), dbg.issues.join('|'));
}

console.log('\n== Test 5: Incorrect Arms (Drooping / Lowered Arms) ==');
{
    const engine = newEngine();
    const lms = warrior2Fixture({ front: 'LEFT', armTilt: 45.0 });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();

    check('rejected drooping arms', engine.inWarrior2 === false);
    check('arm issue reported', dbg.issues.some(i => i && i.includes('ARMS HORIZONTAL')), dbg.issues.join('|'));
}

console.log('\n== Test 6: Bent Elbows ==');
{
    const engine = newEngine();
    const lms = warrior2Fixture({ front: 'LEFT', elbowAngle: 90.0 });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();

    check('rejected bent elbows', engine.inWarrior2 === false);
    check('elbow issue reported', dbg.issues.some(i => i && i.includes('ELBOWS')), dbg.issues.join('|'));
}

console.log('\n== Test 7: Excessive Torso Lean ==');
{
    const engine = newEngine();
    const lms = warrior2Fixture({ front: 'LEFT', torsoLean: 28.0 });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();

    check('rejected torso lean', engine.inWarrior2 === false);
    check('torso issue reported', dbg.issues.some(i => i && i.includes('TORSO UPRIGHT')), dbg.issues.join('|'));
}

console.log('\n== Test 8: Narrow Stance ==');
{
    const engine = newEngine();
    const lms = warrior2Fixture({ front: 'LEFT', stanceRatio: 0.5 });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();

    check('rejected narrow stance', engine.inWarrior2 === false);
    check('stance issue reported', dbg.issues.some(i => i && (i.includes('STANCE') || i.includes('NO_STANCE'))), dbg.issues.join('|'));
}

console.log('\n== Test 9: Uneven Feet / Foot Raised Off Ground ==');
{
    const engine = newEngine();
    const lms = warrior2Fixture({ front: 'LEFT', ankleYDiff: 0.25 });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();

    check('rejected raised foot', engine.inWarrior2 === false);
    check('grounding issue reported', dbg.issues.some(i => i && i.includes('GROUNDED')), dbg.issues.join('|'));
}

console.log('\n== Test 10: Poor Landmark Visibility ==');
{
    const engine = newEngine();
    const lms = warrior2Fixture({ front: 'LEFT', visibility: 0.35 });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();

    check('status is UNCERTAIN', engine.formStatus === 'UNCERTAIN', `got "${engine.formStatus}"`);
    check('never a successful hold', engine.inWarrior2 === false);
    check('hold timer zero', engine.currentHoldSeconds === 0);
}

console.log('\n== Test 11: Natural Variation Tolerance ==');
{
    const engine = newEngine();
    const lms = warrior2Fixture({ front: 'LEFT', armTilt: 10.0, torsoLean: 7.0 });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);

    check('natural variation still confirms', engine.formStatus === 'PERFECT WARRIOR II', `got "${engine.formStatus}"`);
    check('hold timer running', engine.inWarrior2 === true);
}

console.log('\n== Temporal confirmation semantics ==');
{
    const engine = newEngine();
    const lmsValid = warrior2Fixture({ front: 'LEFT' });
    const worldValid = toWorld(lmsValid);

    // Bad frame: hand dropped down along the torso
    const lmsInvalid = warrior2Fixture({ front: 'LEFT' });
    lmsInvalid[LM.LEFT_WRIST] = { x: lmsInvalid[LM.LEFT_SHOULDER].x, y: lmsInvalid[LM.LEFT_SHOULDER].y + 0.35, z: 0, visibility: 0.95 };
    lmsInvalid[LM.LEFT_ELBOW] = { x: lmsInvalid[LM.LEFT_SHOULDER].x, y: lmsInvalid[LM.LEFT_SHOULDER].y + 0.18, z: 0, visibility: 0.95 };
    const worldInvalid = toWorld(lmsInvalid);

    // Warm-up EMA smoothing
    for (let i = 0; i < 10; i++) {
        engine.analyzePose(lmsValid, worldValid);
    }
    engine.resetTimers();

    // 1 frame does not confirm
    const f1 = engine.analyzePose(lmsValid, worldValid);
    engine.updateWarrior2State(f1);
    check('one lucky frame never confirms', engine.inWarrior2 === false);
    check('timer stays 0 while confirming', engine.currentHoldSeconds === 0);

    // 3 more frames (total 4) still do not confirm (CONFIRM_FRAMES = 5)
    for (let i = 0; i < 3; i++) {
        const f = engine.analyzePose(lmsValid, worldValid);
        engine.updateWarrior2State(f);
    }
    check('below CONFIRM_FRAMES does not confirm', engine.inWarrior2 === false);

    // 5th frame confirms
    const f5 = engine.analyzePose(lmsValid, worldValid);
    engine.updateWarrior2State(f5);
    check('CONFIRM_FRAMES valid frames confirm', engine.inWarrior2 === true);

    // 1 bad frame tolerated (BREAK_FRAMES = 3)
    const fBad1 = engine.analyzePose(lmsInvalid, worldInvalid);
    engine.updateWarrior2State(fBad1);
    check('single bad frame tolerated (timer kept)', engine.inWarrior2 === true);

    // BREAK_FRAMES consecutive bad frames break hold
    for (let i = 0; i < THRESHOLDS.BREAK_FRAMES; i++) {
        const f = engine.analyzePose(lmsInvalid, worldInvalid);
        engine.updateWarrior2State(f);
    }
    check('sustained bad frames break hold', engine.inWarrior2 === false);
    check('timer reset after break', engine.currentHoldSeconds === 0);
}

console.log('\n== No person in frame ==');
{
    const engine = newEngine();
    engine.handleFrameWithoutPerson();
    check('NO PERSON state, never holding', engine.formStatus === 'NO PERSON' && !engine.inWarrior2);
}

console.log('\n== Enter and exit pose repeatedly ==');
{
    const engine = newEngine();
    const lmsValid = warrior2Fixture({ front: 'LEFT' });
    const lmsInvalid = warrior2Fixture({ front: 'LEFT', armTilt: 60.0 });
    const worldValid = toWorld(lmsValid);
    const worldInvalid = toWorld(lmsInvalid);

    // Cycle 1: enter pose
    feedFrame(engine, lmsValid, worldValid, 15);
    check('cycle 1 entered', engine.inWarrior2 === true);
    // Cycle 1: exit pose
    feedFrame(engine, lmsInvalid, worldInvalid, 12);
    check('cycle 1 exited', engine.inWarrior2 === false);

    // Cycle 2: re-enter pose
    feedFrame(engine, lmsValid, worldValid, 15);
    check('cycle 2 re-entered', engine.inWarrior2 === true);
    // Cycle 2: exit pose
    feedFrame(engine, lmsInvalid, worldInvalid, 12);
    check('cycle 2 exited', engine.inWarrior2 === false);
}

console.log('\n== Different distances / body scales ==');
{
    const engine = newEngine();
    const lmsFar = warrior2Fixture({ front: 'LEFT' }).map(p => ({
        x: 0.5 + (p.x - 0.5) * 0.6,
        y: 0.5 + (p.y - 0.5) * 0.6,
        visibility: p.visibility
    }));
    feedFrame(engine, lmsFar, toWorld(lmsFar), 15);
    check('far distance correctly recognized', engine.formStatus === 'PERFECT WARRIOR II', `got "${engine.formStatus}"`);
}

// ===========================================================================
// Head Alignment Tests
// ===========================================================================

console.log('\n== Head Test 1: Correct head alignment (nose centered) ==');
{
    const engine = newEngine();
    const lms = warrior2Fixture({ front: 'LEFT', 0: { x: 0.50, y: 0.18 } });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();

    check('centered head is PERFECT', engine.formStatus === 'PERFECT WARRIOR II', `got "${engine.formStatus}"`);
    check('inWarrior2 true', engine.inWarrior2 === true);
    check('head check in checks object', dbg.checks.head && dbg.checks.head.ok === true, JSON.stringify(dbg.checks.head));
    check('headOffset near zero', dbg.headOffset < 0.05, `got ${dbg.headOffset}`);
}

console.log('\n== Head Test 2: Excessive forward head position ==');
{
    const engine = newEngine();
    // nose shifted 0.10 forward (ratio ~0.625, well above 0.50 threshold)
    const lms = warrior2Fixture({ front: 'LEFT', 0: { x: 0.60, y: 0.18 } });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();

    check('forward head rejected', engine.inWarrior2 === false, `got "${engine.formStatus}"`);
    check('head feedback generated', dbg.issues.some(i => i && i.includes('HEAD')), dbg.issues.join('|'));
    check('timer does not advance as valid hold', engine.currentHoldSeconds === 0);
    check('headOffset exceeds threshold', dbg.headOffset > 0.50, `got ${dbg.headOffset}`);
}

console.log('\n== Head Test 3: Excessive backward head position ==');
{
    const engine = newEngine();
    // nose shifted 0.10 backward
    const lms = warrior2Fixture({ front: 'LEFT', 0: { x: 0.40, y: 0.18 } });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();

    check('backward head rejected', engine.inWarrior2 === false, `got "${engine.formStatus}"`);
    check('backward head feedback generated', dbg.issues.some(i => i && i.includes('HEAD')), dbg.issues.join('|'));
}

console.log('\n== Head Test 4: Excessive lateral head deviation ==');
{
    const engine = newEngine();
    // nose shifted 0.11 sideways (ratio ~0.6875)
    const lms = warrior2Fixture({ front: 'LEFT', 0: { x: 0.61, y: 0.18 } });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();

    check('lateral head deviation rejected', engine.inWarrior2 === false, `got "${engine.formStatus}"`);
    check('lateral head feedback generated', dbg.issues.some(i => i && i.includes('HEAD')), dbg.issues.join('|'));
}

console.log('\n== Head Test 5: Natural head variation (small movement accepted) ==');
{
    const engine = newEngine();
    // nose shifted 0.03 — natural small movement, should still pass
    const lms = warrior2Fixture({ front: 'LEFT', 0: { x: 0.53, y: 0.18 } });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);

    check('natural head variation confirms', engine.formStatus === 'PERFECT WARRIOR II', `got "${engine.formStatus}"`);
    check('hold timer running', engine.inWarrior2 === true);
}

console.log('\n== Head Test 6: Head alignment robust to body scale ==');
{
    // Far distance: scale coordinates toward center by 0.6, nose shifted similarly
    const engine = newEngine();
    const lmsFar = warrior2Fixture({ front: 'LEFT', 0: { x: 0.53, y: 0.18 } }).map(p => ({
        x: 0.5 + (p.x - 0.5) * 0.6,
        y: 0.5 + (p.y - 0.5) * 0.6,
        visibility: p.visibility
    }));
    feedFrame(engine, lmsFar, toWorld(lmsFar), 15);
    check('far distance head alignment PASS', engine.formStatus === 'PERFECT WARRIOR II', `got "${engine.formStatus}"`);

    // Normal distance
    const engine2 = newEngine();
    const lmsNormal = warrior2Fixture({ front: 'LEFT', 0: { x: 0.53, y: 0.18 } });
    const worldNormal = toWorld(lmsNormal);
    feedFrame(engine2, lmsNormal, worldNormal, 15);
    check('normal distance head alignment PASS', engine2.formStatus === 'PERFECT WARRIOR II', `got "${engine2.formStatus}"`);

    // Close distance: scale coordinates away from center by 1.3
    const engine3 = newEngine();
    const lmsClose = warrior2Fixture({ front: 'LEFT', 0: { x: 0.53, y: 0.18 } }).map(p => ({
        x: 0.5 + (p.x - 0.5) * 1.3,
        y: 0.5 + (p.y - 0.5) * 1.3,
        visibility: p.visibility
    }));
    feedFrame(engine3, lmsClose, toWorld(lmsClose), 15);
    check('close distance head alignment PASS', engine3.formStatus === 'PERFECT WARRIOR II', `got "${engine3.formStatus}"`);
}

// ---------------------------------------------------------------------------
console.log('\n=========================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.error('Failed checks:', failures);
    process.exit(1);
} else {
    console.log('All Warrior II tests PASSED successfully!');
}
