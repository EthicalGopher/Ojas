import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Flame } from 'lucide-react-native';
import { useGameStats } from '../hooks/useGameStats';
import { useUserStore } from '../store/userStore';
import { isActiveDay, toDateKey } from '../utils/gamification';
import { colors, radius } from '../theme';

const VISIBLE_MS = 4000;
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Module-level so the splash shows once per app launch, even though HomeScreen
// unmounts while the camera / match screens are open.
let shownThisLaunch = false;

/** Animated daily-streak card shown for a few seconds when the home screen first opens. */
export const StreakSplash: React.FC = () => {
  const profile = useUserStore((s) => s.profile);
  const { streak } = useGameStats();
  const [visible, setVisible] = useState(false);
  const [displayCount, setDisplayCount] = useState(0);

  const backdrop = useRef(new Animated.Value(0)).current;
  const flameScale = useRef(new Animated.Value(0)).current;
  const flamePulse = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const textRise = useRef(new Animated.Value(24)).current;
  const dayAnims = useRef(DAY_LETTERS.map(() => new Animated.Value(0))).current;

  const week = useMemo(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() + (today.getDay() === 0 ? -6 : 1 - today.getDay()));
    return DAY_LETTERS.map((letter, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = toDateKey(d);
      const isToday = key === toDateKey(today);
      return { letter, key, isToday, active: isActiveDay(profile, key) || (isToday && streak.activeToday) };
    });
  }, [profile, streak.activeToday]);

  // Wait for the real profile so the number isn't a placeholder 0.
  useEffect(() => {
    if (shownThisLaunch || !profile) return;
    shownThisLaunch = true;
    setVisible(true);
  }, [profile]);

  useEffect(() => {
    if (!visible) return;
    const lit = streak.current > 0;

    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(flameScale, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true }),
      Animated.timing(textRise, { toValue: 0, duration: 450, delay: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.stagger(
        90,
        dayAnims.map((a) => Animated.spring(a, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }))
      ),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(flamePulse, { toValue: lit ? 1.12 : 1.04, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(flamePulse, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    glowLoop.start();

    // Count the streak number up.
    const target = streak.current;
    let n = 0;
    const step = target > 0 ? Math.max(40, Math.floor(700 / target)) : 0;
    const counter =
      target > 0
        ? setInterval(() => {
            n += 1;
            setDisplayCount(n);
            if (n >= target) clearInterval(counter!);
          }, step)
        : null;

    const hide = setTimeout(dismiss, VISIBLE_MS);
    return () => {
      pulse.stop();
      glowLoop.stop();
      if (counter) clearInterval(counter);
      clearTimeout(hide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const dismiss = () => {
    Animated.timing(backdrop, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setVisible(false));
  };

  if (!visible) return null;

  const lit = streak.current > 0;
  const flameColor = streak.activeToday ? colors.flame : lit ? colors.gold : colors.textDim;
  const headline = streak.activeToday
    ? 'Streak secured!'
    : streak.atRisk
    ? 'Keep it alive today!'
    : 'Start your streak today';
  const sub = streak.activeToday
    ? 'Come back tomorrow to keep the fire burning.'
    : streak.atRisk
    ? 'One workout today keeps your streak going.'
    : 'Finish any workout to light your first flame.';

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={dismiss}>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} />

        <View style={styles.center} pointerEvents="none">
          <View style={styles.flameWrap}>
            <Animated.View
              style={[
                styles.glow,
                {
                  backgroundColor: flameColor,
                  opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.3] }),
                  transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }) }],
                },
              ]}
            />
            <Animated.View style={{ transform: [{ scale: Animated.multiply(flameScale, flamePulse) }] }}>
              <Flame size={120} color={flameColor} fill={lit ? flameColor : 'transparent'} strokeWidth={1.6} />
            </Animated.View>
          </View>

          <Animated.View style={{ alignItems: 'center', opacity: backdrop, transform: [{ translateY: textRise }] }}>
            <Text style={[styles.count, { color: lit ? colors.text : colors.textMuted }]}>{displayCount}</Text>
            <Text style={styles.countLabel}>DAY STREAK</Text>
            <Text style={styles.headline}>{headline}</Text>
            <Text style={styles.sub}>{sub}</Text>
          </Animated.View>

          <View style={styles.weekRow}>
            {week.map((d, i) => (
              <Animated.View
                key={d.key}
                style={[styles.day, { opacity: dayAnims[i], transform: [{ scale: dayAnims[i] }] }]}
              >
                <Text style={[styles.dayLetter, d.isToday && { color: colors.flame }]}>{d.letter}</Text>
                <View
                  style={[
                    styles.dayDot,
                    d.active && styles.dayDotActive,
                    d.isToday && !d.active && styles.dayDotToday,
                  ]}
                >
                  {d.active && <Flame size={14} color={colors.onAccent} fill={colors.onAccent} />}
                </View>
              </Animated.View>
            ))}
          </View>

          <Text style={styles.best}>Best streak: {streak.best} {streak.best === 1 ? 'day' : 'days'}</Text>
        </View>

        <Text style={styles.skip}>Tap to continue</Text>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 12, 17, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { alignItems: 'center', paddingHorizontal: 28 },
  flameWrap: { width: 190, height: 190, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 180, height: 180, borderRadius: 90 },
  count: { fontSize: 72, fontWeight: '900', lineHeight: 80, marginTop: 4 },
  countLabel: { color: colors.flame, fontSize: 13, fontWeight: '900', letterSpacing: 4 },
  headline: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 18 },
  sub: { color: colors.textMuted, fontSize: 13.5, textAlign: 'center', lineHeight: 19, marginTop: 6 },
  weekRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 28,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  day: { alignItems: 'center', width: 34 },
  dayLetter: { color: colors.textMuted, fontSize: 11, fontWeight: '900', marginBottom: 6 },
  dayDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotActive: { backgroundColor: colors.flame },
  dayDotToday: { borderWidth: 2, borderColor: colors.flame },
  best: { color: colors.textDim, fontSize: 12, fontWeight: '700', marginTop: 16 },
  skip: { position: 'absolute', bottom: 56, color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '700' },
});
