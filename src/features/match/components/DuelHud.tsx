// The 1v1 battle HUD, fighting-game style (same look as the VS screen): your orange plate on the left and
// the rival's blue plate on the right, each with a big score; the clock in the middle; and a tug-of-war
// bar under them that shifts toward whoever is ahead. The live pose call (DOWN / UP / HOLD...) sits
// under the clock. At the end the clock becomes the result.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Crown } from 'lucide-react-native';
import { GText } from '../../../components/game';
import { Slant } from '../../../components/game/Slant';
import { useColors } from '../../../theme';

const BLUE_FROM = '#1F4FB8';
const BLUE_TO = '#3B8DFF';
const GOLD = '#FFD27A';

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const DuelHud: React.FC<{
  selfName: string;
  rivalName: string;
  selfScore: number;
  rivalScore: number;
  /** Score bump animations (scale), from the scoreboard. */
  selfScale: Animated.Value;
  rivalScale: Animated.Value;
  timeLeft: number;
  ended: boolean;
  isBot?: boolean;
  suffix?: string;
  poseState?: { text: string; color: string };
}> = ({ selfName, rivalName, selfScore, rivalScore, selfScale, rivalScale, timeLeft, ended, isBot, suffix = '', poseState }) => {
  const c = useColors();
  const { width } = useWindowDimensions();
  const plateW = Math.min(340, width * 0.32);
  const leader = selfScore === rivalScore ? null : selfScore > rivalScore ? 'self' : 'rival';
  const urgent = !ended && timeLeft > 0 && timeLeft <= 10;

  // tug-of-war: share of the bar that is yours (0.5 when level), eased
  const share = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const total = selfScore + rivalScore;
    const target = total === 0 ? 0.5 : 0.15 + 0.7 * (selfScore / total);
    Animated.timing(share, { toValue: target, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [selfScore, rivalScore, share]);

  // the clock pulses red in the last ten seconds
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!urgent) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 320, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [urgent, pulse]);

  const outcome = selfScore > rivalScore ? 'VICTORY' : selfScore < rivalScore ? 'DEFEAT' : 'DRAW';
  const outcomeColor = outcome === 'VICTORY' ? '#34D399' : outcome === 'DEFEAT' ? '#EF4444' : GOLD;
  const barW = plateW * 2 + 150;

  return (
    <View style={styles.root} pointerEvents="none">
      <View style={styles.row}>
        {/* you */}
        <View style={[styles.plate, { width: plateW }]}>
          <Slant fill={c.accentFrom} to={c.accentTo} />
          <View style={styles.plateText}>
            <View style={styles.tagRow}>
              <GText variant="label" size={11} style={styles.tag}>YOU</GText>
              {leader === 'self' && !ended && <Crown size={12} color={GOLD} fill={GOLD} />}
            </View>
            <GText variant="hero" size={20} style={styles.name} numberOfLines={1}>{selfName.toUpperCase()}</GText>
          </View>
          <Animated.View style={[styles.scoreBox, { transform: [{ scale: selfScale }] }]}>
            <GText variant="number" size={34} style={{ color: '#FFFFFF' }} numberOfLines={1} adjustsFontSizeToFit>
              {selfScore}{suffix}
            </GText>
          </Animated.View>
        </View>

        {/* clock / result */}
        <Animated.View style={[styles.clock, { borderColor: ended ? outcomeColor : urgent ? '#EF4444' : GOLD, transform: [{ scale: pulse }] }]}>
          {ended ? (
            <GText variant="hero" size={18} style={{ color: outcomeColor }} numberOfLines={1} adjustsFontSizeToFit>{outcome}</GText>
          ) : (
            <>
              <GText variant="number" size={26} style={{ color: urgent ? '#EF4444' : '#FFFFFF' }}>{formatClock(timeLeft)}</GText>
              <GText variant="label" size={9} style={styles.clockUnit}>TIME LEFT</GText>
            </>
          )}
        </Animated.View>

        {/* rival */}
        <View style={[styles.plate, styles.plateRight, { width: plateW }]}>
          <Slant fill={BLUE_FROM} to={BLUE_TO} />
          <Animated.View style={[styles.scoreBox, { transform: [{ scale: rivalScale }] }]}>
            <GText variant="number" size={34} style={{ color: '#FFFFFF' }} numberOfLines={1} adjustsFontSizeToFit>
              {rivalScore}{suffix}
            </GText>
          </Animated.View>
          <View style={[styles.plateText, { alignItems: 'flex-end' }]}>
            <View style={styles.tagRow}>
              {leader === 'rival' && !ended && <Crown size={12} color={GOLD} fill={GOLD} />}
              <GText variant="label" size={11} style={styles.tag}>{isBot ? 'AI RIVAL' : 'RIVAL'}</GText>
            </View>
            <GText variant="hero" size={20} style={styles.name} numberOfLines={1}>{rivalName.toUpperCase()}</GText>
          </View>
        </View>
      </View>

      {/* tug-of-war lead bar */}
      <View style={[styles.bar, { width: barW }]}>
        <Animated.View style={[styles.barSelf, { backgroundColor: c.accentFrom, width: share.interpolate({ inputRange: [0, 1], outputRange: [0, barW] }) }]} />
        <View style={[styles.barRival, { backgroundColor: BLUE_TO }]} />
        <Animated.View style={[styles.barKnot, { left: share.interpolate({ inputRange: [0, 1], outputRange: [-5, barW - 5] }) }]} />
      </View>

      {/* the live pose call */}
      {!ended && poseState?.text ? (
        <View style={styles.call}>
          <Slant fill="#0B0D14" stroke={poseState.color} />
          <GText variant="hero" size={16} style={{ color: poseState.color, letterSpacing: 1 }} numberOfLines={1}>{poseState.text}</GText>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center', zIndex: 90, elevation: 30 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  plate: { height: 58, flexDirection: 'row', alignItems: 'center', paddingLeft: 24, paddingRight: 12, gap: 10 },
  plateRight: { paddingLeft: 12, paddingRight: 24, justifyContent: 'flex-end' },
  plateText: { flex: 1, minWidth: 0 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tag: { color: 'rgba(255,255,255,0.85)', letterSpacing: 1.5 },
  name: { color: '#FFFFFF' },
  scoreBox: {
    minWidth: 64,
    height: 46,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(5,6,12,0.82)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clock: {
    width: 120,
    height: 64,
    borderRadius: 12,
    borderWidth: 3,
    backgroundColor: 'rgba(5,6,12,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockUnit: { color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, marginTop: -2 },
  bar: { height: 8, marginTop: 6, borderRadius: 4, overflow: 'visible', flexDirection: 'row', backgroundColor: 'rgba(5,6,12,0.7)' },
  barSelf: { height: 8, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  barRival: { flex: 1, height: 8, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  barKnot: { position: 'absolute', top: -4, width: 10, height: 16, borderRadius: 3, backgroundColor: GOLD, borderWidth: 2, borderColor: '#05060C' },
  call: { marginTop: 8, height: 32, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
});
