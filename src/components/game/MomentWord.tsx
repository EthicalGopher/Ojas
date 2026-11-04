import React, { useEffect, useId, useRef } from 'react';
import { Animated, Easing, Platform, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import type { Palette } from '../../theme';
import { usePalette } from '../../theme/PaletteContext';
import { fontsAvailable, FONT } from '../../theme/fonts';
import { GText } from './GText';
import { estimateWordWidth, fitWordSize } from './momentWordLayout';
import { useReducedMotion } from './motion';

export type MomentTone = 'accent' | 'win' | 'loss' | 'draw' | 'rival';

export interface MomentWordProps {
  text: string;
  tone?: MomentTone;
  size?: number;
  maxWidth?: number;
  animateIn?: boolean;
  palette?: Palette;
  testID?: string;
}

/**
 * Spike 4.0: react-native-svg on Android only finds fonts in android/app/src/main/assets/fonts/, where
 * Nunito_900Black_Italic.ttf is bundled. iOS is not verified yet, so it uses the shadowed-text fallback.
 */
const SVG_FONT_OK = Platform.select({ android: true, ios: false, default: false });

// Fixed light gradient stops per tone (the only hex literals allowed in this primitive, design 3.9).
function stops(c: Palette, tone: MomentTone): [string, string] {
  switch (tone) {
    case 'win':
      return ['#FFE08A', c.win];
    case 'loss':
      return ['#FF8A95', c.loss];
    case 'draw':
      return ['#E3ECEF', c.draw];
    case 'rival':
      return ['#8EC1FF', c.rival];
    default:
      return [c.accentTo, c.accentFrom];
  }
}

const SHADOW = 'rgba(20, 35, 58, 0.35)';

/** Big stylised word: white outline, gradient fill, offset shadow (design 3.3, 3.10). */
export const MomentWord: React.FC<MomentWordProps> = ({ text, tone = 'accent', size = 64, maxWidth, animateIn = true, palette, testID }) => {
  const c = usePalette(palette);
  const window = useWindowDimensions();
  const reduced = useReducedMotion();
  const limit = maxWidth ?? window.width - 32;
  const word = text.toUpperCase();
  const fitted = fitWordSize(word, size, limit);
  const id = 'mw' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [top, bottom] = stops(c, tone);

  const scale = useRef(new Animated.Value(animateIn && !reduced ? 1.6 : 1)).current;
  const opacity = useRef(new Animated.Value(animateIn && !reduced ? 0 : 1)).current;
  useEffect(() => {
    if (!animateIn || reduced) {
      scale.setValue(1);
      opacity.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [animateIn, reduced, scale, opacity, word]);

  const wrapper = { transform: [{ scale }], opacity, alignSelf: 'center' as const };

  if (!SVG_FONT_OK || !fontsAvailable()) {
    return (
      <Animated.View style={wrapper} testID={testID} accessibilityRole="header" accessibilityLabel={text}>
        <GText
          variant="hero"
          size={fitted}
          allowFontScaling={false}
          numberOfLines={1}
          style={{ color: bottom, textShadowColor: SHADOW, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 1.5 }}
        >
          {word}
        </GText>
      </Animated.View>
    );
  }

  const estimate = estimateWordWidth(word, fitted);
  const vbWidth = estimate + 0.5 * fitted;
  const vbHeight = 1.35 * fitted;
  const width = Math.min(limit, vbWidth);
  const height = (vbHeight * width) / vbWidth;
  const x = vbWidth / 2;
  const y = 1.0 * fitted;
  const common = { x, y, textAnchor: 'middle' as const, fontFamily: FONT.blackItalic, fontSize: fitted };

  return (
    <Animated.View style={wrapper} testID={testID} accessibilityRole="header" accessibilityLabel={text}>
      <Svg width={width} height={height} viewBox={`0 0 ${vbWidth} ${vbHeight}`} preserveAspectRatio="xMidYMid meet">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="1" stopColor={bottom} />
          </LinearGradient>
        </Defs>
        <SvgText {...common} dx={3} dy={3} fill={SHADOW} stroke={SHADOW} strokeWidth={0.12 * fitted} strokeLinejoin="round">
          {word}
        </SvgText>
        <SvgText {...common} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={0.12 * fitted} strokeLinejoin="round">
          {word}
        </SvgText>
        <SvgText {...common} fill={`url(#${id})`}>
          {word}
        </SvgText>
      </Svg>
    </Animated.View>
  );
};
