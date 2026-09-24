/**
 * Node test harness for the Tree Pose classification layer (no DOM, no camera).
 * Run: node test/tree_pose_engine.test.js
 *
 * Fixtures are plain {x, y} points (no visibility field -> treated as fully
 * visible). Coordinates are normalized image coords, mirrored like app.js.
 * World landmarks are approximated with 3D-ish points; since knee angles fuse
 * max(2D, 0.9*3D), tests pass world = image + z:0 to keep angles 2D-consistent.
 *
 * NOTE on smoothing: knee/torso values are EMA-smoothed inside the engine.
 * Tests feed the same frame repeatedly so smoothed values converge to the raw
 * ones, then the temporal confirmation (5 frames) runs naturally.
 */

const {
    MediaPipeTreePoseEngineJS,
    setStreamAspect,
    THRESHOLDS,
    LM
} = require('../tree_pose_engine.js');

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
// Landmark indices used: 0 nose, 11/12 shoulders, 13/14 elbows, 15/16 wrists,
// 23/24 hips, 25/26 knees, 27/28 ankles, 29/30 heels, 31/32 toes.
function makeLandmarks(overrides = {}, opts = {}) {
    // Base: standing person facing the camera, slightly offset from center.
    // x grows leftward on screen after mirroring (MediaPipe left/right swap is
    // irrelevant here; only geometry matters).
    const base = {
        0:  { x: 0.50, y: 0.10 },                 // nose
        11: { x: 0.56, y: 0.22 },                 // left shoulder (screen-left)
        12: { x: 0.44, y: 0.22 },                 // right shoulder
        13: { x: 0.59, y: 0.35 },                 // left elbow
        14: { x: 0.41, y: 0.35 },                 // right elbow
        15: { x: 0.52, y: 0.42 },                 // left wrist (prayer at chest)
        16: { x: 0.48, y: 0.42 },                 // right wrist
        23: { x: 0.54, y: 0.55 },                 // left hip
        24: { x: 0.46, y: 0.55 },                 // right hip
        25: { x: 0.545, y: 0.72 },                // left knee
        26: { x: 0.455, y: 0.72 },                // right knee
        27: { x: 0.55, y: 0.90 },                 // left ankle
        28: { x: 0.45, y: 0.90 },                 // right ankle
        29: { x: 0.545, y: 0.91 },                // left heel
        30: { x: 0.455, y: 0.91 },                // right heel
        31: { x: 0.55, y: 0.92 },                 // left toe
        32: { x: 0.45, y: 0.92 }                  // right toe
    };

    const lms = [];
    for (let i = 0; i < 33; i++) {
        const p = overrides[i] || base[i] || { x: 0.5, y: 0.5 };
        const lm = { x: p.x, y: p.y, z: p.z || 0 };
        if (opts.visibility !== undefined) lm.visibility = opts.visibility;
        else if (p.visibility !== undefined) lm.visibility = p.visibility;
        else lm.visibility = 0.95;
        lms.push(lm);
    }
    return lms;
}

// World landmarks: same geometry in metric-ish space so 3D knee angles match 2D.
function toWorld(lms) {
    return lms.map(p => ({
        x: (p.x - 0.5) * 1.2,
        y: (0.5 - p.y) * 2.0,
        z: 0
    }));
}

// Feed one frame n times (converges EMA smoothing), return last features.
function feedFrame(engine, lms, world, times = 12) {
    let f = null;
    for (let i = 0; i < times; i++) {
        f = engine.analyzePose(lms, world);
        engine.updateTreePoseState(f);
    }
    return f;
}

function newEngine() {
    const e = new MediaPipeTreePoseEngineJS();
    setStreamAspect(16, 9);
    return e;
}

// Helper: build a full correct Tree Pose fixture with one leg standing.
// standing: 'LEFT' (left ankle down) or 'RIGHT'; direction of knee opening:
// lifted knee opens away from the body's center.
function treePoseFixture({ standing = 'LEFT', footRelY = 0.75, footDx = 0.02, visibility } = {}) {
    const overrides = {};

    // Prayer hands at chest
    overrides[15] = { x: 0.52, y: 0.38 };
    overrides[16] = { x: 0.48, y: 0.38 };

    // Standing-leg geometry shared by both variants (knee y=0.72, hip y=0.55
    // -> thigh = 0.17; ankle y=0.90 -> shin = 0.18)
    const kneeY = 0.72, hipY = 0.55, ankleY = 0.90, thigh = 0.17;
    const footY = kneeY - footRelY * thigh; // foot height interpolated along the thigh
    const kneeOpenX = 0.05;                 // lifted knee abducts from the hip center line

    if (standing === 'LEFT') {
        // Left leg standing (left ankle lower), right leg lifted & folded.
        // Lifted knee opens screen-left (away from center: lifted hip is right-of-center).
        overrides[27] = { x: 0.55, y: ankleY };             // L ankle down
        overrides[29] = { x: 0.545, y: 0.91 };              // L heel
        overrides[31] = { x: 0.55, y: 0.92 };               // L toe
        overrides[28] = { x: 0.55 - footDx, y: footY };     // R ankle at the standing leg line
        overrides[30] = { x: 0.55 - footDx - 0.01, y: footY + 0.01 };
        overrides[32] = { x: 0.55 - footDx + 0.01, y: footY + 0.02 };
        overrides[26] = { x: 0.46 - kneeOpenX, y: 0.68 };   // R knee opened outward
        overrides[25] = { x: 0.545, y: kneeY };             // L knee straight
        overrides[24] = { x: 0.46, y: hipY };
    } else {
        // Right leg standing, left leg lifted. Mirror of the above.
        overrides[28] = { x: 0.45, y: ankleY };             // R ankle down
        overrides[30] = { x: 0.455, y: 0.91 };
        overrides[32] = { x: 0.45, y: 0.92 };
        overrides[27] = { x: 0.45 + footDx, y: footY };     // L ankle at the standing leg line
        overrides[29] = { x: 0.45 + footDx + 0.01, y: footY + 0.01 };
        overrides[31] = { x: 0.45 + footDx - 0.01, y: footY + 0.02 };
        overrides[25] = { x: 0.54 + kneeOpenX, y: 0.68 };   // L knee opened outward
        overrides[26] = { x: 0.455, y: kneeY };
        overrides[23] = { x: 0.54, y: hipY };
    }
    return makeLandmarks(overrides, { visibility });
}

// ===========================================================================
console.log('\n== Test 1: Correct Tree Pose ==');
{
    const engine = newEngine();
    const lms = treePoseFixture({ standing: 'LEFT' });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();
    check('status is PERFECT TREE POSE', engine.formStatus === 'PERFECT TREE POSE', `got "${engine.formStatus}" issues=${dbg.issues.join('|')}`);
    check('hold timer active', engine.inTreePose === true);
    check('state CORRECT', dbg.state === 'CORRECT');
    check('active leg LEFT', engine.activeLeg === 'LEFT LEG', engine.activeLeg);
    check('foot placement safe', /THIGH|CALF/.test(dbg.footPlacement), dbg.footPlacement);
}
{
    // Same on the other leg
    const engine = newEngine();
    const lms = treePoseFixture({ standing: 'RIGHT' });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    check('right-leg Tree Pose passes', engine.formStatus === 'PERFECT TREE POSE', `${engine.formStatus} issues=${engine.getDebugInfo().issues.join('|')}`);
}

// ===========================================================================
console.log('\n== Test 2: Simply standing on one leg (raised/hanging foot) ==');
{
    const engine = newEngine();
    // One leg raised but NOT folded: knee stays under the hip, leg nearly straight,
    // foot far from the standing leg, hands on hips sides (not prayer/overhead).
    const overrides = {
        15: { x: 0.60, y: 0.55 },
        16: { x: 0.40, y: 0.55 },
        27: { x: 0.55, y: 0.90 },
        28: { x: 0.35, y: 0.75 },  // raised, hanging straight-ish
        25: { x: 0.545, y: 0.72 },
        26: { x: 0.40, y: 0.74 }   // knee stays in line (not folded outward)
    };
    const lms = makeLandmarks(overrides);
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();
    check('not confirmed as Tree Pose', engine.formStatus !== 'PERFECT TREE POSE', engine.formStatus);
    check('inTreePose false', engine.inTreePose === false);
    check('hold timer zero', engine.currentHoldSeconds === 0);
    console.log(`    (issues: ${dbg.issues.join(' | ')})`);
}

// ===========================================================================
console.log('\n== Test 3: Foot on knee joint ==');
{
    const engine = newEngine();
    // Lifted foot at knee height (relFootY ~ 0), close to the standing leg.
    const lms = treePoseFixture({ standing: 'LEFT', footRelY: 0.0, footDx: 0.02 });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();
    check('not confirmed as Tree Pose', engine.formStatus !== 'PERFECT TREE POSE', engine.formStatus);
    check('knee-joint danger flagged', dbg.footPlacement.includes('KNEE JOINT'), dbg.footPlacement);
}

// ===========================================================================
console.log('\n== Test 4: Floating foot (near thigh height but far from leg) ==');
{
    const engine = newEngine();
    // Foot at thigh height but pushed sideways far from the standing leg line.
    // footDx shifts the whole foot chain (ankle+heel+toe) via the fixture.
    const lms = treePoseFixture({ standing: 'LEFT', footRelY: 0.75, footDx: 0.20 });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();
    check('not confirmed as Tree Pose', engine.formStatus !== 'PERFECT TREE POSE', engine.formStatus);
    check('placement rejected', dbg.footPlacement === 'TOO FAR FROM LEG', dbg.footPlacement);
}

// ===========================================================================
console.log('\n== Test 5: Straight lifted leg ==');
{
    const engine = newEngine();
    const overrides = {
        15: { x: 0.52, y: 0.38 },
        16: { x: 0.48, y: 0.38 },
        27: { x: 0.55, y: 0.90 },
        // Raised leg held straight and collinear: hip (0.46,0.55) -> knee (0.455,0.64) -> ankle (0.45,0.73)
        28: { x: 0.45, y: 0.73 },
        26: { x: 0.455, y: 0.64 },
        25: { x: 0.545, y: 0.72 }
    };
    const lms = makeLandmarks(overrides);
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    check('not confirmed as Tree Pose', engine.formStatus !== 'PERFECT TREE POSE', `${engine.formStatus} issues=${engine.getDebugInfo().issues.join('|')}`);
}

// ===========================================================================
console.log('\n== Test 6: Bent standing leg ==');
{
    const engine = newEngine();
    const lms = treePoseFixture({ standing: 'LEFT' });
    // Bend the standing knee: left knee pushed forward in x
    lms[25] = { x: 0.50, y: 0.72, z: 0, visibility: 0.95 };
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();
    check('not confirmed as Tree Pose', engine.formStatus !== 'PERFECT TREE POSE', engine.formStatus);
    check('standing knee issue reported', dbg.issues.some(i => i.includes('LOCK STANDING KNEE')), dbg.issues.join('|'));
}

// ===========================================================================
console.log('\n== Test 7: Wrong hands ==');
{
    const engine = newEngine();
    const lms = treePoseFixture({ standing: 'LEFT' });
    // Hands apart, down by the sides
    lms[15] = { x: 0.62, y: 0.58, z: 0, visibility: 0.95 };
    lms[16] = { x: 0.38, y: 0.58, z: 0, visibility: 0.95 };
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();
    check('not confirmed as Tree Pose', engine.formStatus !== 'PERFECT TREE POSE', engine.formStatus);
    check('hands issue reported', dbg.issues.some(i => i.includes('HANDS')), dbg.issues.join('|'));
}

// ===========================================================================
console.log('\n== Test 8: Excessive torso lean ==');
{
    const engine = newEngine();
    const lms = treePoseFixture({ standing: 'LEFT' });
    // Shift shoulders far sideways relative to hips (in BOTH landmark sets,
    // since torso lean is measured on world landmarks). +0.25 in normalized x
    // -> ~24 deg of world-space lean (world x is scaled by 1.2, y by 2.0).
    for (const i of [0, 11, 12, 13, 14, 15, 16]) {
        lms[i] = { ...lms[i], x: lms[i].x + 0.25 };
    }
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();
    check('not confirmed as Tree Pose', engine.formStatus !== 'PERFECT TREE POSE', engine.formStatus);
    check('spine issue reported', dbg.issues.some(i => i.includes('SPINE')), dbg.issues.join('|'));
}

// ===========================================================================
console.log('\n== Test 9: Poor landmark visibility ==');
{
    const engine = newEngine();
    const lms = treePoseFixture({ standing: 'LEFT', visibility: 0.25 });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    check('status is UNCERTAIN', engine.formStatus === 'UNCERTAIN', engine.formStatus);
    check('never a successful hold', engine.inTreePose === false && engine.currentHoldSeconds === 0);
}

// ===========================================================================
console.log('\n== Test 10: Natural variation tolerance ==');
{
    // Slightly different arm angles, small head turn (nose offset), minor
    // jitter across frames — must still confirm.
    const engine = newEngine();
    let last = null;
    for (let f = 0; f < 8; f++) {
        const jitter = (f % 2 === 0) ? 0.004 : -0.004;
        const overrides = {
            0: { x: 0.52, y: 0.10 },      // head turned slightly
            15: { x: 0.53 + jitter, y: 0.40 },
            16: { x: 0.47 - jitter, y: 0.40 }
        };
        const lms = treePoseFixture({ standing: 'LEFT', ...{} });
        Object.assign(lms[0], overrides[0]);
        Object.assign(lms[15], overrides[15]);
        Object.assign(lms[16], overrides[16]);
        const world = toWorld(lms);
        last = engine.analyzePose(lms, world);
        engine.updateTreePoseState(last);
    }
    check('natural variation still confirms', engine.formStatus === 'PERFECT TREE POSE', `${engine.formStatus} issues=${engine.getDebugInfo().issues.join('|')}`);
}

// ===========================================================================
console.log('\n== Temporal confirmation semantics ==');
{
    const lms = treePoseFixture({ standing: 'LEFT' });
    const world = toWorld(lms);

    // 1 lucky frame must NOT confirm
    const luckyEngine = newEngine();
    let f = luckyEngine.analyzePose(lms, world);
    luckyEngine.updateTreePoseState(f);
    check('one lucky frame never confirms', luckyEngine.formStatus !== 'PERFECT TREE POSE', luckyEngine.formStatus);

    const engine2 = newEngine();
    f = null;
    for (let i = 0; i < THRESHOLDS.CONFIRM_FRAMES - 1; i++) {
        f = engine2.analyzePose(lms, world);
        engine2.updateTreePoseState(f);
    }
    check('below CONFIRM_FRAMES does not confirm', engine2.formStatus === 'CONFIRMING', engine2.formStatus);
    check('timer stays 0 while confirming', engine2.currentHoldSeconds === 0);

    // One more valid frame confirms and starts the timer
    f = engine2.analyzePose(lms, world);
    engine2.updateTreePoseState(f);
    check('CONFIRM_FRAMES valid frames confirm', engine2.formStatus === 'PERFECT TREE POSE', engine2.formStatus);
    check('timer starts after confirmation', engine2.inTreePose === true);

    // A single bad frame (jitter) must not immediately break the hold
    const badLms = treePoseFixture({ standing: 'LEFT' });
    badLms[16] = { x: 0.30, y: 0.58, z: 0, visibility: 0.95 }; // hand out to the side
    f = engine2.analyzePose(badLms, toWorld(badLms));
    engine2.updateTreePoseState(f);
    check('single bad frame tolerated (timer kept)', engine2.currentHoldSeconds >= 0 && engine2.correctStreak > 0, `streak=${engine2.correctStreak}`);

    // But BREAK_FRAMES consecutive bad frames break it
    for (let i = 0; i < THRESHOLDS.BREAK_FRAMES; i++) {
        f = engine2.analyzePose(badLms, toWorld(badLms));
        engine2.updateTreePoseState(f);
    }
    check('sustained bad frames break the hold', engine2.formStatus !== 'PERFECT TREE POSE', engine2.formStatus);
    check('timer reset after break', engine2.currentHoldSeconds === 0);
}

// ===========================================================================
console.log('\n== No person in frame ==');
{
    const engine = newEngine();
    engine.handleFrameWithoutPerson();
    check('NO PERSON state, never holding', engine.formStatus === 'NO PERSON' && !engine.inTreePose);
}

// ===========================================================================
console.log('\n== Head alignment: normally aligned head ==');
{
    // Nose sits on the shoulder-line midpoint -> confirm.
    const engine = newEngine();
    const lms = treePoseFixture({ standing: 'LEFT' });
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();
    check('status is PERFECT TREE POSE', engine.formStatus === 'PERFECT TREE POSE', `${engine.formStatus} issues=${dbg.issues.join('|')}`);
    check('headAlignment check ok', dbg.checks.headAlignment && dbg.checks.headAlignment.ok === true);
}

// ===========================================================================
console.log('\n== Head alignment: slight natural tilt -> valid ==');
{
    // Nose offset 0.02 from the shoulder midpoint (well under the threshold).
    const engine = newEngine();
    const lms = treePoseFixture({ standing: 'LEFT' });
    lms[0] = { x: 0.52, y: 0.10, z: 0, visibility: 0.95 };
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();
    check('status is PERFECT TREE POSE', engine.formStatus === 'PERFECT TREE POSE', `${engine.formStatus} issues=${dbg.issues.join('|')}`);
    check('headAlignment check ok', dbg.checks.headAlignment && dbg.checks.headAlignment.ok === true);
    check('head offset below threshold', dbg.headLateralOffset !== null && dbg.headLateralOffset < THRESHOLDS.HEAD_ALIGNMENT_MAX_OFFSET, `offset=${dbg.headLateralOffset}`);
}

// ===========================================================================
console.log('\n== Head alignment: clearly excessive LEFT tilt -> invalid ==');
{
    // Nose shifted far screen-left of the shoulder midpoint (offset ~0.35).
    const engine = newEngine();
    const lms = treePoseFixture({ standing: 'LEFT' });
    lms[0] = { x: 0.25, y: 0.10, z: 0, visibility: 0.95 };
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();
    check('not confirmed as Tree Pose', engine.formStatus !== 'PERFECT TREE POSE', engine.formStatus);
    check('head issue reported', dbg.issues.some(i => i.includes('HEAD')), dbg.issues.join('|'));
    check('headAlignment check failed', dbg.checks.headAlignment && dbg.checks.headAlignment.ok === false);
}

// ===========================================================================
console.log('\n== Head alignment: clearly excessive RIGHT tilt -> invalid ==');
{
    // Mirror of the left tilt (offset ~0.35).
    const engine = newEngine();
    const lms = treePoseFixture({ standing: 'LEFT' });
    lms[0] = { x: 0.75, y: 0.10, z: 0, visibility: 0.95 };
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();
    check('not confirmed as Tree Pose', engine.formStatus !== 'PERFECT TREE POSE', engine.formStatus);
    check('head issue reported', dbg.issues.some(i => i.includes('HEAD')), dbg.issues.join('|'));
    check('headAlignment check failed', dbg.checks.headAlignment && dbg.checks.headAlignment.ok === false);
}

// ===========================================================================
console.log('\n== Head alignment: poor-quality / missing nose landmark ==');
{
    // Nose visibility below the single-landmark floor: the global quality gate
    // (critical landmarks only) stays ok, so the state is NOT UNCERTAIN — the
    // head validator itself fails closed so a bad nose can never allow a hold.
    const engine = newEngine();
    const lms = treePoseFixture({ standing: 'LEFT' });
    lms[0] = { x: 0.75, y: 0.10, z: 0, visibility: 0.2 }; // bad visibility, bad position
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    const dbg = engine.getDebugInfo();
    check('not confirmed as Tree Pose', engine.formStatus !== 'PERFECT TREE POSE', engine.formStatus);
    check('never a successful hold', engine.inTreePose === false && engine.currentHoldSeconds === 0);
    check('head issue reported', dbg.issues.some(i => i.includes('HEAD')), dbg.issues.join('|'));
    check('headAlignment check failed', dbg.checks.headAlignment && dbg.checks.headAlignment.ok === false);
    check('global quality gate untouched', engine.landmarkQuality && engine.landmarkQuality.ok === true);
}
{
    // Nose landmark fully invisible (MediaPipe drops it): must not confirm.
    const engine = newEngine();
    const lms = treePoseFixture({ standing: 'LEFT' });
    lms[0] = { x: 0.75, y: 0.10, z: 0, visibility: 0.0 };
    const world = toWorld(lms);
    feedFrame(engine, lms, world);
    check('invisible nose: not confirmed', engine.formStatus !== 'PERFECT TREE POSE', engine.formStatus);
    check('invisible nose: never holding', engine.inTreePose === false && engine.currentHoldSeconds === 0);
    // And a missing head measurement (null offset) fails closed, never crashes.
    const nullCheck = engine.validateHeadAlignment({ headLateralOffset: null });
    check('null offset fails closed', nullCheck.ok === false && nullCheck.reason.includes('HEAD'));
}

// ===========================================================================
console.log('\n=========================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length) {
    console.log('Failed checks:');
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
}
