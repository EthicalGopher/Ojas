import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useGameStats } from '../hooks/useGameStats';
import { useUserStore } from '../store/userStore';
import { isActiveDay, toDateKey } from '../utils/gamification';
import { askForRemindersOnce, scheduleStreakReminders } from '../utils/streakReminders';
import { GradientFill } from '../features/squad/components/SquadUI';
import { Coal, MiniFlame, StreakFire, StreakFireHandle } from './streak/StreakFire';

const AUTO_HIDE_MS = 6500;
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MILESTONES = [3, 7, 14, 30, 60, 100, 365];

// Module-level so the screen shows once per app launch, even though HomeScreen
// unmounts while the camera / match screens are open.
let shownThisLaunch = false;

// Fixed dark palette: fire reads best on near-black in both themes.
const C = {
  text: '#FFF7ED',
  soft: 'rgba(255,237,213,0.66)',
  faint: 'rgba(255,237,213,0.38)',
  ember: '#FF7A1A',
  ember2: '#FFB13B',
  cell: 'rgba(255,255,255,0.06)',
  line: 'rgba(255,255,255,0.08)',
};

/** Full-screen daily streak moment, played when the home screen first opens each launch. */
export const StreakSplash: React.FC = () => {
  const profile = useUserStore((s) => s.profile);
  const setActiveTab = useUserStore((s) => s.setActiveTab);
  const { streak } = useGameStats();
  const [visible, setVisible] = useState(false);
  const [displayCount, setDisplayCount] = useState(0);
  const fireRef = useRef<StreakFireHandle>(null);

  const backdrop = useRef(new Animated.Value(0)).current;
  const countIn = useRef(new Animated.Value(0)).current;
  const contentIn = useRef(new Animated.Value(0)).current;
  const dayAnims = useRef(DAY_LETTERS.map(() => new Animated.Value(0))).current;

  const lit = streak.current > 0;
  const strong = streak.activeToday;

  const week = useMemo(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() + (today.getDay() === 0 ? -6 : 1 - today.getDay()));
    const todayKey = toDateKey(today);
    return DAY_LETTERS.map((letter, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = toDateKey(d);
      const isToday = key === todayKey;
      return {
        letter,
        key,
        isToday,
        isFuture: key > todayKey,
        active: isActiveDay(profile, key) || (isToday && streak.activeToday),
      };
    });
  }, [profile, streak.activeToday]);

  const nextMilestone = MILESTONES.find((m) => m > streak.current) ?? null;
  const prevMilestone = [...MILESTONES].reverse().find((m) => m <= streak.current) ?? 0;

  // Wait for the real profile so the number isn't a placeholder 0.
  useEffect(() => {
    if (shownThisLaunch || !profile) return;
    shownThisLaunch = true;
    setVisible(true);
  }, [profile]);

  useEffect(() => {
    if (!visible) return;
    backdrop.setValue(0);
    Animated.timing(backdrop, { toValue: 1, duration: 260, useNativeDriver: true }).start();

    // Fire catches first; the number and the week follow once it is burning.
    const igniteAt = setTimeout(() => lit && fireRef.current?.ignite(), 220);
    Animated.sequence([
      Animated.delay(lit ? 650 : 250),
      Animated.parallel([
        Animated.spring(countIn, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(contentIn, { toValue: 1, duration: 420, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.stagger(70, dayAnims.map((a) => Animated.spring(a, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }))),
      ]),
    ]).start();

    const target = streak.current;
    let n = 0;
    let counter: ReturnType<typeof setInterval> | null = null;
    const countStart = setTimeout(() => {
      if (target <= 0) return;
      const step = Math.max(30, Math.floor(650 / target));
      counter = setInterval(() => {
        n += 1;
        setDisplayCount(n);
        if (n >= target && counter) clearInterval(counter);
      }, step);
    }, lit ? 650 : 0);

    const hide = setTimeout(() => dismiss(), AUTO_HIDE_MS);
    return () => {
      clearTimeout(igniteAt);
      clearTimeout(countStart);
      clearTimeout(hide);
      if (counter) clearInterval(counter);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const dismiss = (goTrain = false) => {
    Animated.timing(backdrop, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => {
      setVisible(false);
      if (goTrain) setActiveTab('workouts');
      // Ask for reminder permission here, right after the user has seen what a streak is.
      askForRemindersOnce()
        .then((granted) => (granted ? scheduleStreakReminders(streak) : undefined))
        .catch(() => {});
    });
  };

  if (!visible) return null;

  const headline = strong ? 'Streak secured' : lit ? 'Keep it burning' : 'Light your first flame';
  const sub = strong
    ? 'Today is done. Come back tomorrow to make it bigger.'
    : lit
    ? 'Your fire goes out at midnight. One workout keeps it alive.'
    : 'Finish any workout today to start a streak.';

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={() => dismiss()}>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <GradientFill colors={['#0B0705', '#1A0A05', '#2B0F06']} vertical />

        <View style={styles.center}>
          <Text style={styles.eyebrow}>DAILY STREAK</Text>

          <View style={styles.fireSlot}>
            {lit ? <StreakFire ref={fireRef} size={132} strong={strong} /> : <Coal size={160} />}
          </View>

          <Animated.View
            style={{
              alignItems: 'center',
              opacity: countIn,
              transform: [{ scale: countIn.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            }}
          >
            <Text style={[styles.count, !lit && { color: C.faint }]}>{displayCount}</Text>
            <Text style={styles.countLabel}>{streak.current === 1 ? 'DAY' : 'DAYS'}</Text>
          </Animated.View>

          <Animated.View
            style={{
              alignItems: 'center',
              opacity: contentIn,
              transform: [{ translateY: contentIn.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
            }}
          >
            <Text style={styles.headline}>{headline}</Text>
            <Text style={styles.sub}>{sub}</Text>
          </Animated.View>

          {/* WEEK: consecutive active days are joined into one burning chain */}
          <View style={styles.weekCard}>
            {week.map((d, i) => {
              const joinNext = d.active && week[i + 1]?.active;
              return (
                <Animated.View
                  key={d.key}
                  style={[styles.day, { opacity: dayAnims[i], transform: [{ translateY: dayAnims[i].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}
                >
                  <Text style={[styles.dayLetter, d.isToday && { color: C.ember2 }]}>{d.letter}</Text>
                  <View style={styles.dayCellRow}>
                    {joinNext && <View style={styles.chain} />}
                    <View
                      style={[
                        styles.dayCell,
                        d.active && styles.dayCellActive,
                        d.isToday && !d.active && styles.dayCellToday,
                        d.isFuture && styles.dayCellFuture,
                      ]}
                    >
                      {d.active ? <MiniFlame size={15} /> : null}
                    </View>
                  </View>
                </Animated.View>
              );
            })}
          </View>

          {/* MILESTONE */}
          {nextMilestone && (
            <Animated.View style={[styles.milestone, { opacity: contentIn }]}>
              <View style={styles.milestoneTop}>
                <Text style={styles.milestoneText}>
                  {nextMilestone - streak.current} {nextMilestone - streak.current === 1 ? 'day' : 'days'} to a {nextMilestone}-day streak
                </Text>
                <Text style={styles.milestoneBest}>Best {streak.best}</Text>
              </View>
              <View style={styles.milestoneTrack}>
                <View
                  style={[
                    styles.milestoneFill,
                    { width: `${Math.max(4, ((streak.current - prevMilestone) / (nextMilestone - prevMilestone)) * 100)}%` },
                  ]}
                >
                  <GradientFill colors={['#D7261B', '#FF7A1A', '#FFB13B']} />
                </View>
              </View>
            </Animated.View>
          )}
        </View>

        <Animated.View style={[styles.actions, { opacity: contentIn }]}>
          {strong ? (
            <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.9} onPress={() => dismiss()}>
              <Text style={styles.primaryText}>KEEP GOING</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.9} onPress={() => dismiss(true)}>
                <Text style={styles.primaryText}>{lit ? "TRAIN NOW" : 'START A WORKOUT'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.8} onPress={() => dismiss()}>
                <Text style={styles.secondaryText}>Later</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', backgroundColor: '#0B0705', paddingTop: 40, paddingBottom: 36 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, width: '100%' },
  eyebrow: { color: C.faint, fontSize: 11, fontWeight: '900', letterSpacing: 3 },
  fireSlot: { height: 250, justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 },
  count: {
    color: C.text,
    fontSize: 88,
    lineHeight: 92,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(255,122,26,0.55)',
    textShadowRadius: 22,
    marginTop: 2,
  },
  countLabel: { color: C.ember, fontSize: 13, fontWeight: '900', letterSpacing: 6, marginTop: -2 },
  headline: { color: C.text, fontSize: 22, fontWeight: '900', marginTop: 18 },
  sub: { color: C.soft, fontSize: 13.5, textAlign: 'center', lineHeight: 19, marginTop: 6, maxWidth: 300 },

  weekCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 26,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: C.line,
  },
  day: { alignItems: 'center', flex: 1 },
  dayLetter: { color: C.faint, fontSize: 11, fontWeight: '900', marginBottom: 8 },
  dayCellRow: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  chain: { position: 'absolute', left: '50%', right: '-50%', height: 6, borderRadius: 3, backgroundColor: 'rgba(255,122,26,0.45)' },
  dayCell: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.cell, alignItems: 'center', justifyContent: 'center' },
  dayCellActive: { backgroundColor: '#3A1608', borderWidth: 1.5, borderColor: C.ember },
  dayCellToday: { borderWidth: 1.5, borderColor: C.ember2, borderStyle: 'dashed' },
  dayCellFuture: { opacity: 0.45 },

  milestone: { alignSelf: 'stretch', marginTop: 14 },
  milestoneTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  milestoneText: { color: C.soft, fontSize: 12, fontWeight: '800' },
  milestoneBest: { color: C.faint, fontSize: 12, fontWeight: '800' },
  milestoneTrack: { height: 8, borderRadius: 4, backgroundColor: C.cell, overflow: 'hidden' },
  milestoneFill: { height: '100%', borderRadius: 4, overflow: 'hidden' },

  actions: { alignSelf: 'stretch', paddingHorizontal: 24, gap: 6 },
  primaryBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.ember,
    borderBottomWidth: 4,
    borderBottomColor: '#B4380E',
  },
  primaryText: { color: '#1A0A05', fontSize: 15, fontWeight: '900', letterSpacing: 1.4 },
  secondaryBtn: { height: 40, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: C.soft, fontSize: 13.5, fontWeight: '800' },
});
