import React, { useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * Absolute-fill gradient for pills and panels. Put it first inside a View with a solid base colour.
 * The Svg gets measured pixel sizes: percentage sizes did not fill the parent on Android.
 */
export const GradientFill: React.FC<{ from: string; to: string; direction?: 'horizontal' | 'vertical'; radius?: number }> = ({
  from,
  to,
  direction = 'horizontal',
  radius = 0,
}) => {
  // Unique per instance: several gradients on one screen must not share an id.
  const id = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const vertical = direction === 'vertical';
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
      }}
    >
      {size && size.w > 0 && size.h > 0 && (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0'}>
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} rx={radius} ry={radius} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
};
