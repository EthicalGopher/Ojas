import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import type { Palette } from '../../theme';
import { usePalette } from '../../theme/PaletteContext';
import { GradientFill } from './Gradient';

export interface MeterBarProps {
  value: number;
  tone?: 'accent' | 'you' | 'rival' | 'win';
  height?: number;
  animate?: boolean;
  palette?: Palette;
}

/** Pill-shaped progress bar; value is clamped to 0..1. */
export const MeterBar: React.FC<MeterBarProps> = ({ value, tone = 'accent', height = 8, animate = true, palette }) => {
  const c = usePalette(palette);
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const anim = useRef(new Animated.Value(animate ? 0 : v)).current;
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    if (!animate) {
      anim.setValue(v);
      return;
    }
    Animated.timing(anim, { toValue: v, duration: 500, useNativeDriver: false }).start();
  }, [v, animate, anim]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: [0, trackWidth] });
  const r = height / 2;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={{ height, borderRadius: r, backgroundColor: c.surfaceSunken, overflow: 'hidden' }}
    >
      <Animated.View style={{ width, height, borderRadius: r, overflow: 'hidden', backgroundColor: tone === 'accent' ? c.accentFrom : c[tone] }}>
        {tone === 'accent' && <GradientFill from={c.accentFrom} to={c.accentTo} radius={r} />}
      </Animated.View>
    </View>
  );
};
