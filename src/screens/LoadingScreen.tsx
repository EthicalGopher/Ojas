// Matchmaking: the wait before the match intro (ArenaIntro.tsx). Full-height characters: yours on the
// left half, a VS in the middle, and the rival's half on the right as a "?" silhouette while searching.
// The status line, a timer, a training tip and Cancel sit below.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swords, X } from 'lucide-react-native';
import { useEquippedLook } from '../hooks/useEquippedLook';
import { BUNDLED_AVATARS, characterStandArt, characterVsScene } from '../utils/avatarShopService';
import { FighterPanel } from '../features/match/components/FighterPanel';
import { GText } from '../components/game';
import { Slant } from '../components/game/Slant';
import { juice } from '../juice/juice';
import { useUserStore } from '../store/userStore';
import { useColors } from '../theme';

const TIPS = [
  'Drive through your heels on the way up.',
  'Keep your chest up and your knees over your toes.',
  'Breathe out on the effort, in on the way down.',
  'Steady reps beat fast sloppy ones: form scores points.',
  'Warm up your hips and ankles before a squat duel.',
  'Hold the bottom for a beat: control wins duels.',
];

export interface LoadingScreenProps {
  message?: string;
  title?: string;
  badgeText?: string;
  subInfo?: string;
  onCancel?: () => void;
  fullScreen?: boolean;
  /** Matchmaking shows the VS and the rival's slot; a solo workout loading just your hero. */
  versus?: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Searching for a worthy rival',
  title = 'Finding opponent',
  badgeText,
  subInfo,
  onCancel,
  fullScreen = true,
  versus = true,
}) => {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const profile = useUserStore((s) => s.profile);
  const name = profile?.username || 'You';
  const look = useEquippedLook();
  const scene = characterVsScene(look.model);
  // the unknown rival: the other hero's body, as a silhouette
  const rivalSilhouette = characterStandArt(BUNDLED_AVATARS.find((b) => b.category === 'character' && b.model_url !== look.model.model_url) ?? look.model);

  const [seconds, setSeconds] = useState(0);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // entrance: the VS drops in; then the status dot pulses
  const enter = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }).start();
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    p.start();
    return () => p.stop();
  }, [enter, pulse]);

  const vsScale = enter.interpolate({ inputRange: [0, 0.6, 1], outputRange: [3, 0.9, 1] });
  const vsGlow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] });
  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <View style={[StyleSheet.absoluteFill, styles.root, !fullScreen && styles.overlay]}>
      <StatusBar hidden />

      {/* you (left) · VS · rival (right): full-height characters */}
      <FighterPanel side="left" scene={scene} label="YOU" name={name} />
      {versus && (
        <FighterPanel
          side="right"
          scene={null}
          silhouette={rivalSilhouette}
          label="OPPONENT"
          name="Searching…"
          placeholder={<GText variant="hero" size={110} style={styles.question}>?</GText>}
        />
      )}
      {versus && (
        <View style={styles.vsWrap} pointerEvents="none">
          <Animated.View style={{ transform: [{ scale: vsScale }] }}>
            <GText variant="hero" size={72} style={styles.vs}>VS</GText>
          </Animated.View>
        </View>
      )}

      {/* title */}
      <View style={[styles.header, { top: insets.top + 18 }]}>
        <View style={styles.titlePlate}>
          <Slant fill="#14141C" stroke="#3A3A48" />
          <Swords size={16} color={c.accentTo} />
          <GText variant="hero" size={20} numberOfLines={1} style={{ color: '#FFFFFF', letterSpacing: 1, flexShrink: 0 }}>{title.toUpperCase()}</GText>
        </View>
        {badgeText ? (
          <View style={[styles.badge, { borderColor: c.accentFrom }]}>
            <GText variant="label" size={11} style={{ color: c.accentTo, letterSpacing: 1 }}>{badgeText}</GText>
          </View>
        ) : null}
      </View>

      {/* status, timer, tip, cancel */}
      <View style={[styles.footer, { bottom: Math.max(insets.bottom, 12) + 10 }]}>
        <View style={styles.statusRow}>
          <Animated.View style={[styles.dot, { backgroundColor: c.accentFrom, opacity: vsGlow }]} />
          <GText variant="label" size={14} style={{ color: '#FFFFFF' }} numberOfLines={1}>{message}</GText>
          {versus && <GText variant="number" size={14} style={{ color: c.accentTo }}>{mmss}</GText>}
        </View>
        <GText variant="caption" style={styles.tip} numberOfLines={2}>{subInfo || `Tip: ${tip}`}</GText>
        {onCancel && (
          <Pressable
            onPress={() => {
              juice.play('tap');
              onCancel();
            }}
            accessibilityRole="button"
            accessibilityLabel="Cancel matchmaking"
            hitSlop={10}
            style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}
          >
            <X size={15} color="#FFFFFF" strokeWidth={3} />
            <GText variant="label" size={13} style={{ color: '#FFFFFF', letterSpacing: 1 }}>CANCEL</GText>
          </Pressable>
        )}
      </View>
    </View>
  );
};


const styles = StyleSheet.create({
  root: { backgroundColor: '#05060C' },
  overlay: { zIndex: 9999, elevation: 25 },
  header: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 8 },
  titlePlate: { height: 40, minWidth: 300, paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  badge: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 3, backgroundColor: 'rgba(0,0,0,0.4)' },
  vsWrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  vs: { color: '#FFD27A', textShadowColor: '#B53214', textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 0 },
  question: { color: 'rgba(170,200,255,0.85)', marginTop: -80 },
  footer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tip: { color: 'rgba(225,232,255,0.75)', maxWidth: 520, textAlign: 'center' },
  cancel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});

export default LoadingScreen;
