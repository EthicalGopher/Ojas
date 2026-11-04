import React from 'react';
import { Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Coins, Flame } from 'lucide-react-native';
import { useGameStats } from '../../hooks/useGameStats';
import { juice } from '../../juice/juice';
import { useUserStore } from '../../store/userStore';
import { softShadow, useColors } from '../../theme';
import { computeCoinBalance } from '../../utils/gamification';
import { GText } from './GText';
import { Slant } from './Slant';
import { StatChip } from './StatChip';

/**
 * Top bar of every screen opened from the lobby (game-menu style): back button and an angled title
 * plate on the left, currencies on the right. Screens fill the whole width; there is no tab bar.
 */
export const GameTopBar: React.FC<{
  title: string;
  onBack: () => void;
  /** Extra controls placed before the currencies. */
  right?: React.ReactNode;
  showCurrencies?: boolean;
}> = ({ title, onBack, right, showCurrencies = true }) => {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const profile = useUserStore((s) => s.profile);
  const { streak } = useGameStats();
  const coins = computeCoinBalance(profile);

  return (
    <View style={[styles.bar, { paddingLeft: Math.max(insets.left, 12), paddingRight: Math.max(insets.right, 12) }]}>
      {/* Full-screen game menus: no system status bar. */}
      <StatusBar hidden />
      <Pressable
        onPress={() => {
          juice.play('tap');
          onBack();
        }}
        accessibilityRole="button"
        accessibilityLabel="Back to lobby"
        hitSlop={8}
        style={({ pressed }) => [styles.back, { backgroundColor: c.raised, borderColor: c.edge }, softShadow(c), pressed && { transform: [{ scale: 0.94 }] }]}
      >
        <ChevronLeft size={24} color={c.text} strokeWidth={3} />
      </Pressable>
      <View style={styles.titlePlate}>
        <Slant fill={c.accentFrom} to={c.accentTo} />
        <GText variant="display" size={22} tone="onGradient" numberOfLines={1}>
          {title}
        </GText>
      </View>
      <View style={{ flex: 1 }} />
      {right}
      {showCurrencies && (
        <>
          <StatChip icon={Coins} tone="win" value={coins} accessibilityLabel={`${coins} coins`} />
          <StatChip icon={Flame} tone="accent" value={streak.current} pulse={streak.atRisk} accessibilityLabel={`${streak.current} day streak`} />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6 },
  back: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  titlePlate: { height: 40, minWidth: 150, paddingHorizontal: 26, justifyContent: 'center', alignItems: 'center' },
});
