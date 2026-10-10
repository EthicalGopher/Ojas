import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Pointer } from 'lucide-react-native';
import { useTourStore } from './tourStore';
import { useUserStore } from '../../store/userStore';
import type { MainTab } from '../../store/userStore';

const GOLD = '#C9A163';
const CARD = '#23252B';
const TEXT = '#F2F3F5';
const MUTED = '#A3A9B4';

export interface TourStep {
  target: string;
  title: string;
  body: string;
  /** What tapping the spotlighted button does. Tabs really navigate; buttons that would open the
   * camera or a match only advance the tour. */
  goTo?: MainTab;
  /** Needs an account (the tab is locked for guests): skipped for guests. */
  auth?: boolean;
  /** Pill-shaped spotlight (tab buttons). */
  round?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: 'home-carousel',
    title: 'Battle cards',
    body: 'Swipe through the 1v1 Arena, Human vs AI against the 3D coach, and the 3-second Posture Scan. Tap a card to jump in.',
  },
  {
    target: 'home-activity',
    title: 'Your activity',
    body: 'Calories, reps and matches for the day, and your streak. Train once a day to keep the flame burning.',
  },
  {
    target: 'home-level',
    title: 'Level and rank',
    body: 'Your rank and XP to the next level. Every 10 XP is a coin for the shop, and ranked wins climb you from Bronze to Immortal.',
  },
  {
    target: 'home-news',
    title: 'News',
    body: 'Announcements, events and tournaments land here. A badge shows when something new arrives.',
  },
  {
    target: 'tab-explore',
    title: 'Squad',
    body: 'Add friends, join a squad and fight squad tournaments. Tap to open it.',
    goTo: 'explore',
    auth: true,
    round: true,
  },
  {
    target: 'tab-workouts',
    title: 'Train',
    body: 'Every exercise lives here: squats, push-ups, lunges, crunches and yoga poses. Tap to open it.',
    goTo: 'workouts',
    auth: true,
    round: true,
  },
  {
    target: 'train-first-exercise',
    title: 'Pick an exercise',
    body: 'Open one for the AI Tutor with live form corrections, Solo Practice, or a ranked battle. Stand 5 to 7 ft from the phone with your whole body in view.',
    auth: true,
  },
  {
    target: 'tab-shop',
    title: 'Shop',
    body: 'Spend your coins on 3D avatars, outfits and accessories. Tap to open it.',
    goTo: 'shop',
    round: true,
  },
  {
    target: 'tab-profile',
    title: 'Me',
    body: 'Your profile, ranks per exercise, achievements and settings. Replay this tour any time from Settings.',
    goTo: 'profile',
    auth: true,
    round: true,
  },
  {
    target: 'tab-home',
    title: "You're all set",
    body: 'Head home and start your first workout. Tap Home to finish the tour.',
    goTo: 'home',
    round: true,
  },
];

const PAD = 8;
/** The floating tab bar covers the bottom of every screen; content under it counts as hidden. */
const TAB_BAR_ZONE = 110;

interface Rect { x: number; y: number; w: number; h: number }

/**
 * The tour overlay: dims the screen except the current step's button, describes it, and moves on
 * when the user taps that button. Skip ends the tour at any step.
 */
export const CoachMarks: React.FC<{ onFinish: (how: 'done' | 'skipped') => void }> = ({ onFinish }) => {
  const { width: W, height: H } = useWindowDimensions();
  const running = useTourStore((s) => s.running);
  const step = useTourStore((s) => s.step);
  const isGuest = useUserStore((s) => s.isGuest);
  const rootRef = useRef<View>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  const steps = TOUR_STEPS.filter((s) => !(isGuest && s.auth));
  const current = steps[step];

  useEffect(() => {
    if (!running) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [running, pulse]);

  // Find and measure the target for this step. Screens need a moment to mount after a tab change,
  // and tab buttons animate their width, so measure after a short wait and retry until it settles.
  useEffect(() => {
    if (!running) return;
    if (!current) {
      onFinish('done');
      return;
    }
    setRect(null);
    fade.setValue(0);
    let cancelled = false;
    let tries = 0;
    let last: Rect | null = null;
    const attempt = () => {
      if (cancelled) return;
      tries += 1;
      const view = useTourStore.getState().targets[current.target];
      const root = rootRef.current;
      if (!view || !root) return retry();
      root.measureInWindow((rx, ry) => {
        view.measureInWindow((x, y, w, h) => {
          if (cancelled) return;
          const r = { x: x - rx, y: y - ry, w, h };
          const isTab = current.target.startsWith('tab-');
          const bottom = isTab ? H : H - TAB_BAR_ZONE;
          const visible = w > 0 && h > 0 && r.y >= 0 && r.y + r.h <= bottom && r.x + r.w > 0 && r.x < W;
          if (!visible) return retry();
          // wait until two measurements agree (animations finished)
          if (last && Math.abs(last.x - r.x) < 1 && Math.abs(last.y - r.y) < 1 && Math.abs(last.w - r.w) < 1) {
            setRect(r);
            Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
          } else {
            last = r;
            setTimeout(attempt, 120);
          }
        });
      });
    };
    const retry = () => {
      // not on screen (scrolled away, or a screen that isn't there for this user): skip the step
      if (tries > 20) {
        if (__DEV__) console.log(`[tour] step ${step} ${current.target} not on screen, skipped`);
        useTourStore.getState().next();
      }
      else setTimeout(attempt, 150);
    };
    const t = setTimeout(attempt, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, step, current?.target, W, H]);

  if (!running) return null;

  const tap = () => {
    if (!current) return;
    if (current.goTo) {
      const u = useUserStore.getState();
      u.setActiveTab(current.goTo);
      if (current.goTo === 'home') u.setHomeSubTab('feed');
    }
    if (step >= steps.length - 1) onFinish('done');
    else useTourStore.getState().next();
  };

  // spotlight geometry
  const hole = rect && { x: rect.x - PAD, y: rect.y - PAD, w: rect.w + PAD * 2, h: rect.h + PAD * 2 };
  const r = hole ? (current?.round ? hole.h / 2 : 18) : 0;
  const path = hole
    ? `M0 0H${W}V${H}H0Z M${hole.x + r} ${hole.y}H${hole.x + hole.w - r}A${r} ${r} 0 0 1 ${hole.x + hole.w} ${hole.y + r}` +
      `V${hole.y + hole.h - r}A${r} ${r} 0 0 1 ${hole.x + hole.w - r} ${hole.y + hole.h}H${hole.x + r}` +
      `A${r} ${r} 0 0 1 ${hole.x} ${hole.y + hole.h - r}V${hole.y + r}A${r} ${r} 0 0 1 ${hole.x + r} ${hole.y}Z`
    : `M0 0H${W}V${H}H0Z`;

  // tooltip goes on the side of the spotlight with more room
  const below = hole ? hole.y + hole.h / 2 < H / 2 : true;
  const tipStyle = hole
    ? below
      ? { top: hole.y + hole.h + 16 }
      : { bottom: H - hole.y + 16 }
    : { top: H / 2 - 90 };

  return (
    // elevation: the tab bar's shadow would otherwise draw it above the dimmer on Android
    <View ref={rootRef} style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 60 }]} collapsable={false}>
      {/* swallows taps everywhere except the spotlight */}
      <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true}>
        <Svg width={W} height={H}>
          <Path d={path} fill="rgba(6, 8, 12, 0.78)" fillRule="evenodd" />
        </Svg>
      </View>

      {hole && current && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="box-none">
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: hole.x,
              top: hole.y,
              width: hole.w,
              height: hole.h,
              borderRadius: r,
              borderWidth: 2,
              borderColor: GOLD,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
            }}
          />
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: r, borderWidth: 2, borderColor: GOLD }}
          />
          {/* the spotlighted button: tapping it moves the tour on */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={current.title}
            activeOpacity={0.6}
            onPress={tap}
            style={{ position: 'absolute', left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: r }}
          />

          <View style={[styles.tip, tipStyle]}>
            <Text style={styles.count}>
              STEP {step + 1} OF {steps.length}
            </Text>
            <Text style={styles.title}>{current.title}</Text>
            <Text style={styles.body}>{current.body}</Text>
            <View style={styles.row}>
              <TouchableOpacity onPress={() => onFinish('skipped')} hitSlop={10} activeOpacity={0.7}>
                <Text style={styles.skip}>Skip tour</Text>
              </TouchableOpacity>
              <View style={styles.hint}>
                <Pointer size={15} color={GOLD} />
                <Text style={styles.hintText}>Tap the highlighted button</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  tip: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(201, 161, 99, 0.35)',
  },
  count: { color: GOLD, fontSize: 11, fontWeight: '900', letterSpacing: 1.6, marginBottom: 6 },
  title: { color: TEXT, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  body: { color: MUTED, fontSize: 14.5, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  skip: { color: TEXT, fontSize: 14, fontWeight: '700', opacity: 0.8 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hintText: { color: GOLD, fontSize: 13, fontWeight: '700' },
});
