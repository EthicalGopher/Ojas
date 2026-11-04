// Matchmaking: the wait before the arena intro (ArenaIntro.tsx). Same championship hall as the
// intro, dimmed: your hero card on the left, a pulsing VS, and the rival's slot on the right,
// searching. The status line, a timer, a training tip and Cancel sit below.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swords, X } from 'lucide-react-native';
import { GText } from '../components/game';
import { Slant } from '../components/game/Slant';
import { HeroCard } from '../features/avatar/components/HeroCard';
import { useEquippedLook } from '../hooks/useEquippedLook';
import { juice } from '../juice/juice';
import { resolveModelUrl } from '../utils/avatarShopService';
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
  const { width, height } = useWindowDimensions();
  const look = useEquippedLook();
  const profile = useUserStore((s) => s.profile);
  const name = profile?.username || 'You';

  const [seconds, setSeconds] = useState(0);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // entrance: cards slide in from the sides, VS drops in; then the VS and the rival slot pulse
  const enter = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }).start();
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const s = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }));
    p.start();
    s.start();
    return () => {
      p.stop();
      s.stop();
    };
  }, [enter, pulse, sweep]);

  // the cards fit between the title and the footer on any landscape phone
  const cardW = Math.min(height * 0.26, width * 0.12);
  const cardH = cardW * 1.5;
  const slideL = enter.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.5, 0] });
  const slideR = enter.interpolate({ inputRange: [0, 1], outputRange: [width * 0.5, 0] });
  const vsScale = enter.interpolate({ inputRange: [0, 0.6, 1], outputRange: [3, 0.9, 1] });
  const vsGlow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.25] });
  const slotGlow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] });
  const shine = sweep.interpolate({ inputRange: [0, 1], outputRange: [-cardW * 1.2, cardW * 1.2] });
  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  const hall = useMemo(() => ({ uri: resolveModelUrl('local://arena/both.jpg') }), []);

  return (
    <View style={[StyleSheet.absoluteFill, styles.root, !fullScreen && styles.overlay]}>
      <StatusBar hidden />
      <Image source={hall} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={3} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,6,12,0.72)' }]} />

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

      {/* you · VS · rival */}
      <View style={styles.stage} pointerEvents="none">
        <Animated.View style={{ transform: [{ translateX: slideL }], alignItems: 'center', gap: 8 }}>
          <HeroCard hero={look.model} width={cardW} selected onPress={() => {}} />
          <View style={styles.nameTag}>
            <Slant fill={c.accentFrom} to={c.accentTo} />
            <GText variant="display" size={16} tone="onGradient" numberOfLines={1}>{name}</GText>
          </View>
        </Animated.View>

        {versus && (
        <View style={styles.vsWrap}>
          <Animated.View style={[styles.ring, { borderColor: c.accentTo, opacity: vsGlow, transform: [{ scale: ringScale }] }]} />
          <Animated.View style={{ transform: [{ scale: vsScale }] }}>
            <GText variant="hero" size={64} style={styles.vs}>VS</GText>
          </Animated.View>
        </View>
        )}

        {versus && (
        <Animated.View style={{ transform: [{ translateX: slideR }], alignItems: 'center', gap: 8 }}>
          <View style={[styles.slot, { width: cardW, height: cardH }]}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#3B8DFF', opacity: slotGlow }]} />
            <View style={[StyleSheet.absoluteFill, styles.slotInner]} />
            <GText variant="hero" size={cardW * 0.5} style={styles.question}>?</GText>
            <Animated.View style={[styles.shine, { width: cardW * 0.35, transform: [{ translateX: shine }, { rotate: '18deg' }] }]} />
          </View>
          <View style={styles.nameTag}>
            <Slant fill="#1F4FB8" to="#3B8DFF" />
            <GText variant="display" size={16} style={{ color: '#FFFFFF' }} numberOfLines={1}>Searching…</GText>
          </View>
        </Animated.View>
        )}
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
  stage: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 46, marginTop: -40 },
  nameTag: { height: 32, minWidth: 130, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  vsWrap: { width: 130, height: 130, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 3 },
  vs: { color: '#FFD27A', textShadowColor: '#B53214', textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 0 },
  slot: { borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(120,170,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  slotInner: { backgroundColor: 'rgba(8,14,40,0.82)' },
  question: { color: 'rgba(170,200,255,0.85)' },
  shine: { position: 'absolute', top: -20, bottom: -20, backgroundColor: 'rgba(255,255,255,0.12)' },
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
