// Getting into position before a match: instead of the raw camera (your face), your own character fills the
// screen and copies you live, like a mirror, while a short move check runs: both hands up, arms out wide,
// hands down. Each step ticks off once you hold it for a moment. The camera keeps tracking underneath.
//
// Poses are the camera page's POSE_WORLD packets (CameraScreen): 19 joints x (x, y, z cm, visibility 0-9),
// MediaPipe world space (y down, origin at the hips).
import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { GText } from '../../../components/game';
import { Slant } from '../../../components/game/Slant';
import { useEquippedLook } from '../../../hooks/useEquippedLook';
import { useColors } from '../../../theme';
import { resolveModelUrl, viewerConfig } from '../../../utils/avatarShopService';
import { AiLoadoutItem } from '../aiInstructorHtml';
import { AIInstructor3D, AIInstructor3DHandle } from './AIInstructor3D';

// joint slots in a POSE_WORLD packet (CameraScreen J list)
const NOSE = 0, L_SH = 3, R_SH = 4, L_WR = 7, R_WR = 8;
// left/right slot pairs, swapped (with x negated) to turn the packet into its mirror image
const PAIRS: [number, number][] = [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18]];
const HOLD_FRAMES = 5; // ~0.4 s at the page's ~12 packets a second

type Pose = number[];
const at = (p: Pose, j: number) => ({ x: p[j * 4], y: p[j * 4 + 1], v: p[j * 4 + 3] });

const STEPS: { title: string; hint: string; test: (p: Pose) => boolean }[] = [
  {
    title: 'RAISE BOTH HANDS',
    hint: 'Reach up above your head',
    test: (p) => at(p, L_WR).y < at(p, NOSE).y - 5 && at(p, R_WR).y < at(p, NOSE).y - 5,
  },
  {
    title: 'ARMS OUT WIDE',
    hint: 'Stretch both arms out to the sides',
    test: (p) => {
      const ls = at(p, L_SH), rs = at(p, R_SH), lw = at(p, L_WR), rw = at(p, R_WR);
      const shoulderY = (ls.y + rs.y) / 2;
      const span = Math.abs(lw.x - rw.x);
      const shoulders = Math.max(20, Math.abs(ls.x - rs.x));
      return Math.abs(lw.y - shoulderY) < 20 && Math.abs(rw.y - shoulderY) < 20 && span > shoulders * 2.4;
    },
  },
  {
    title: 'HANDS DOWN',
    hint: 'Relax your arms by your sides',
    test: (p) => {
      const shoulderY = (at(p, L_SH).y + at(p, R_SH).y) / 2;
      return at(p, L_WR).y > shoulderY + 35 && at(p, R_WR).y > shoulderY + 35;
    },
  },
];

/** The packet as its mirror image: your right hand moves the character's arm on the right of the screen. */
export function mirror(p: Pose): Pose {
  const m = p.slice();
  for (const [a, b] of PAIRS) {
    for (let k = 0; k < 4; k++) {
      m[a * 4 + k] = p[b * 4 + k];
      m[b * 4 + k] = p[a * 4 + k];
    }
  }
  for (let j = 0; j < m.length / 4; j++) m[j * 4] = -m[j * 4];
  return m;
}

export interface PositionCheckHandle {
  pushPose: (p: number[]) => void;
}

export const PositionCheck = forwardRef<PositionCheckHandle, {
  exerciseId: string;
  rivalName: string;
  /** Seconds left before the match starts. */
  secondsLeft: number;
  /** 0-1: how much of the body the camera sees. */
  visibility: number;
  /** false when the match screen already shows your character (SelfCharacterView) under this HUD. */
  character?: boolean;
}>(({ exerciseId, rivalName, secondsLeft, visibility, character = true }, ref) => {
  const c = useColors();
  const look = useEquippedLook();
  const viewRef = useRef<AIInstructor3DHandle>(null);
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  const held = useRef(0);

  useImperativeHandle(ref, () => ({
    pushPose: (p) => {
      if (p.length !== 76) return;
      viewRef.current?.pushPose(mirror(p));
      const s = STEPS[stepRef.current];
      if (!s) return;
      const wristsSeen = at(p, L_WR).v >= 4 && at(p, R_WR).v >= 4;
      held.current = wristsSeen && s.test(p) ? held.current + 1 : 0;
      if (held.current >= HOLD_FRAMES) {
        held.current = 0;
        stepRef.current += 1;
        setStep(stepRef.current);
      }
    },
  }));

  const modelUrl = resolveModelUrl(look.model.model_url);
  const loadout: AiLoadoutItem[] = useMemo(
    () =>
      look.items.map((it) => {
        const cfg = viewerConfig(it, look.model);
        return { category: it.category, config: cfg.model_url ? { ...cfg, model_url: resolveModelUrl(cfg.model_url) } : cfg } as AiLoadoutItem;
      }),
    [look],
  );

  const done = step >= STEPS.length;
  const inFrame = visibility >= 0.35;
  const current = STEPS[Math.min(step, STEPS.length - 1)];
  const title = !inFrame ? 'STEP BACK' : done ? 'ALL SET!' : current.title;
  const hint = !inFrame
    ? 'Get your whole body in view of the camera'
    : done
      ? 'Your character follows you. Get ready to fight'
      : current.hint;
  const accent = !inFrame ? '#EF4444' : done ? '#10B981' : c.accentFrom;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {!character ? null : look.ready ? (
        <AIInstructor3D
          ref={viewRef}
          mode="stand"
          exerciseId={exerciseId}
          phaseProgress={0}
          modelUrl={modelUrl}
          loadout={loadout}
          live
          label="Loading your character"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0A0D14' }]} />
      )}

      {/* top: who you face, and the countdown */}
      <View style={styles.top}>
        <View style={styles.vsPlate}>
          <Slant fill="#14141C" stroke="#3A3A48" />
          <GText variant="label" size={11} style={{ color: c.accentTo, letterSpacing: 1.5 }}>GET READY</GText>
          <GText variant="hero" size={20} style={{ color: '#FFFFFF' }} numberOfLines={1}>VS {rivalName.toUpperCase()}</GText>
        </View>
        <View style={[styles.count, { borderColor: accent }]}>
          <GText variant="hero" size={28} style={{ color: '#FFFFFF' }}>{Math.max(0, secondsLeft)}</GText>
        </View>
      </View>

      {/* left column: the current instruction and the checklist, clear of the character in the middle */}
      <View style={styles.bottom}>
        <View style={styles.instruction}>
          <Slant fill={accent} />
          <GText variant="hero" size={28} style={{ color: '#FFFFFF' }} numberOfLines={1} adjustsFontSizeToFit>{title}</GText>
          <GText variant="label" size={13} style={{ color: 'rgba(255,255,255,0.9)' }} numberOfLines={2}>{hint}</GText>
        </View>
        <View style={styles.checklist}>
          {STEPS.map((s, i) => {
            const ok = i < step;
            const now = i === step && inFrame;
            return (
              <View key={s.title} style={[styles.chip, ok && styles.chipDone, now && { borderColor: c.accentFrom }]}>
                {ok ? <Check size={13} color="#FFFFFF" strokeWidth={3.5} /> : <GText variant="label" size={11} style={{ color: '#FFFFFF' }}>{i + 1}</GText>}
                <GText variant="label" size={11} style={{ color: '#FFFFFF' }} numberOfLines={1}>{s.title}</GText>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
});
PositionCheck.displayName = 'PositionCheck';

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 14, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vsPlate: { paddingHorizontal: 30, paddingVertical: 6, minWidth: 240 },
  count: { width: 60, height: 60, borderRadius: 30, borderWidth: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,6,12,0.75)' },
  bottom: { position: 'absolute', left: 16, top: 96, width: '34%', maxWidth: 380, alignItems: 'flex-start', gap: 10 },
  instruction: { paddingHorizontal: 30, paddingVertical: 8, alignSelf: 'stretch' },
  checklist: { gap: 8, alignItems: 'flex-start' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(5,6,12,0.7)',
  },
  chipDone: { backgroundColor: '#10B981', borderColor: '#10B981' },
});
