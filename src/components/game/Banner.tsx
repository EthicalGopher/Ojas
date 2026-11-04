import React, { useEffect, useRef } from 'react';
import { Animated, useWindowDimensions, View } from 'react-native';
import { typeStyle, type Palette } from '../../theme';
import { usePalette } from '../../theme/PaletteContext';
import { toneText } from '../../theme/contrast';
import { GradientFill } from './Gradient';
import { useReducedMotion } from './motion';

export interface BannerProps {
  text: string;
  tone?: 'accent' | 'win' | 'rival';
  visible: boolean;
  /** Called after the slide-out with this banner's id (the parent clears the slot only if it is still current). */
  onHidden?: (id: number) => void;
  id?: number;
  palette?: Palette;
}

/** Skewed full-width ribbon for HUD callouts (design 3.3, 3.10). Position it with the parent (top at 30%). */
export const Banner: React.FC<BannerProps> = ({ text, tone = 'accent', visible, onHidden, id = 0, palette }) => {
  const c = usePalette(palette);
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const x = useRef(new Animated.Value(reduced ? 0 : -width)).current;
  const opacity = useRef(new Animated.Value(reduced ? 0 : 1)).current;

  useEffect(() => {
    if (reduced) {
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 150, useNativeDriver: true }).start(({ finished }) => {
        if (finished && !visible) onHidden?.(id);
      });
      return;
    }
    if (visible) {
      x.setValue(-width);
      Animated.timing(x, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    } else {
      Animated.timing(x, { toValue: width, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) onHidden?.(id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced, width]);

  const fill = tone === 'accent' ? c.accentFrom : c[tone];
  const fg = toneText(c, tone);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{ width, height: 48, opacity, transform: [{ translateX: x }, { skewY: '-3deg' }] }}
    >
      <View style={{ flex: 1, backgroundColor: fill, justifyContent: 'center', paddingHorizontal: 20, overflow: 'hidden' }}>
        {tone === 'accent' && <GradientFill from={c.accentFrom} to={c.accentTo} />}
        <Animated.Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          maxFontSizeMultiplier={1.2}
          style={[typeStyle('title', 22), { color: fg, textAlign: 'center' }]}
        >
          {text}
        </Animated.Text>
      </View>
    </Animated.View>
  );
};
