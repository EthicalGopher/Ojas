import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { useGameStats } from '../hooks/useGameStats';
import { useUserStore } from '../store/userStore';
import { colors, radius, shadow } from '../theme';

// Kept at module level: this component unmounts while the camera/match screens are open,
// which is exactly when level-ups happen, so a ref would lose the baseline.
const baseline: { profileId: string | null; level: number | null } = { profileId: null, level: null };

/** Pops a celebration whenever the athlete's level goes up during this session. */
export const LevelUpCelebration: React.FC = () => {
  const profile = useUserStore((s) => s.profile);
  const { level } = useGameStats();
  const [shownLevel, setShownLevel] = useState<number | null>(null);

  const scale = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // Don't celebrate the level a user already had when their profile first loaded.
    // A different account (or guest -> signed in) starts a fresh baseline.
    if (!profile || profile.id !== baseline.profileId) {
      baseline.profileId = profile?.id ?? null;
      baseline.level = profile ? level.level : null;
      return;
    }
    if (baseline.level !== null && level.level > baseline.level) {
      setShownLevel(level.level);
    }
    baseline.level = level.level;
  }, [profile, level.level]);

  useEffect(() => {
    if (shownLevel === null) return;
    scale.setValue(0.4);
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
  }, [shownLevel, scale]);

  if (shownLevel === null) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setShownLevel(null)}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <View style={styles.trophyCircle}>
            <Trophy size={22} color={colors.onAccent} />
          </View>
          <Text style={styles.eyebrow}>LEVEL UP</Text>
          <View style={styles.levelCircle}>
            <Text style={styles.levelNumber}>{shownLevel}</Text>
          </View>
          <Text style={styles.title}>{level.title}</Text>
          <Text style={styles.sub}>Your grind is paying off. Keep the streak alive to climb higher.</Text>
          <TouchableOpacity style={styles.btn} activeOpacity={0.9} onPress={() => setShownLevel(null)}>
            <Text style={styles.btnText}>LET'S GO</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(3,5,10,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 330,
    borderRadius: radius.xl,
    padding: 26,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.3)',
    ...shadow(16),
  },
  trophyCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  eyebrow: { color: colors.accent, fontSize: 13, fontWeight: '900', letterSpacing: 3 },
  levelCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    marginTop: 16,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.accent,
  },
  levelNumber: { color: colors.accent, fontSize: 50, fontWeight: '900' },
  title: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 14 },
  sub: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 19, marginTop: 6 },
  btn: {
    marginTop: 20,
    alignSelf: 'stretch',
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: colors.onAccent, fontSize: 15, fontWeight: '900', letterSpacing: 1 },
});
