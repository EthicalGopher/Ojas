import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { softShadow, type Palette } from '../../theme';
import { usePalette } from '../../theme/PaletteContext';
import { GText } from './GText';
import { useReducedMotion } from './motion';

export interface StatChipProps {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  value: string | number;
  /** Colours the icon only; 'win' uses winInk (win on white is 2.95:1). */
  tone?: 'win' | 'accent' | 'text' | 'success';
  pulse?: boolean;
  /** Small success dot before the value (online count). */
  dot?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
  testID?: string;
  palette?: Palette;
}

export const StatChip: React.FC<StatChipProps> = ({ icon: Icon, value, tone = 'text', pulse = false, dot = false, onPress, accessibilityLabel, testID, palette }) => {
  const c = usePalette(palette);
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse || reduced) {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: 600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced, scale]);

  const iconColor = tone === 'win' ? c.winInk : tone === 'accent' ? c.accent : tone === 'success' ? c.success : c.text;

  const body = (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={[
        { height: 32, borderRadius: 16, paddingHorizontal: 10, gap: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: c.raised, borderWidth: 1, borderColor: c.edge },
        softShadow(c),
      ]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon size={16} color={iconColor} />
      </Animated.View>
      {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.success }} />}
      <GText variant="number" size={18} maxFontSizeMultiplier={1.2}>
        {value}
      </GText>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {body}
    </Pressable>
  ) : (
    body
  );
};
