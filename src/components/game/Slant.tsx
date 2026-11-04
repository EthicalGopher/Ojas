import React, { useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';

/**
 * Parallelogram background (the angled game-menu shape). Android ignores skew transforms on Views, so the
 * shape is drawn with an Svg polygon at measured size. Put it first inside the element it decorates.
 */
export const Slant: React.FC<{
  fill: string;
  /** Optional gradient end colour (left -> right). */
  to?: string;
  stroke?: string;
  /** Horizontal offset of the slant, as a fraction of the height (0.21 ≈ 12 degrees). */
  slope?: number;
  /** Shift down in dp (for a lip drawn under the face). */
  offsetY?: number;
}> = ({ fill, to, stroke, slope = 0.21, offsetY = 0 }) => {
  const id = 's' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, offsetY ? { top: offsetY, bottom: -offsetY } : null]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
      }}
    >
      {size && size.w > 0 && size.h > 0 && (
        <Svg width={size.w} height={size.h}>
          {to && (
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={fill} />
                <Stop offset="1" stopColor={to} />
              </LinearGradient>
            </Defs>
          )}
          <Polygon
            points={`${size.h * slope},0.5 ${size.w - 0.5},0.5 ${size.w - size.h * slope},${size.h - 0.5} 0.5,${size.h - 0.5}`}
            fill={to ? `url(#${id})` : fill}
            stroke={stroke}
            strokeWidth={stroke ? 1 : 0}
            strokeLinejoin="round"
          />
        </Svg>
      )}
    </View>
  );
};
