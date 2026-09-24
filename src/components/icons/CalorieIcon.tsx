import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

const VIEW_W = 50.482196;
const VIEW_H = 63.622222;

const PATH =
  'M132 629 c-25 -10 -24 -25 4 -81 20 -39 49 -51 102 -44 49 7 72 -5 72 -35 0 -17 -2 -17 -35 -3 -38 16 -83 18 -104 5 -11 -7 -10 -13 4 -35 13 -19 16 -39 12 -74 -4 -38 -12 -53 -41 -78 -31 -27 -34 -33 -21 -44 24 -20 19 -66 -11 -89 -25 -20 -26 -22 -10 -45 28 -44 87 -95 117 -101 16 -4 44 -1 64 6 28 11 42 11 70 0 20 -7 49 -10 65 -6 73 16 171 167 178 275 8 132 -109 230 -225 188 l-43 -16 0 32 c1 17 9 56 20 86 10 30 17 57 14 59 -9 10 -27 -20 -38 -64 -7 -25 -16 -47 -21 -48 -4 -1 -14 16 -22 38 -24 73 -83 102 -151 74z m105 -31 c32 -30 31 -54 -1 -33 -13 9 -27 12 -30 7 -3 -5 6 -15 19 -22 14 -7 25 -17 25 -22 0 -14 -54 -9 -77 7 -26 19 -47 72 -30 79 29 12 72 5 94 -16z m45 -158 l38 -20 40 21 c48 25 108 22 149 -8 36 -27 71 -99 71 -148 -1 -84 -76 -213 -145 -251 -28 -15 -38 -16 -60 -6 -33 15 -70 15 -111 0 -27 -10 -36 -8 -68 11 -19 12 -45 36 -57 52 l-21 30 22 24 c19 20 22 31 17 69 -5 33 -3 47 9 57 41 34 55 115 30 172 -7 14 -3 17 21 17 15 0 45 -9 65 -20z M420 410 c0 -5 12 -10 26 -10 14 0 23 4 19 10 -3 6 -15 10 -26 10 -10 0 -19 -4 -19 -10z M500 353 c11 -21 20 -46 20 -55 0 -10 5 -18 10 -18 17 0 11 43 -10 78 -27 45 -45 40 -20 -5z M160 130 c-8 -5 -11 -12 -7 -16 4 -4 15 0 24 9 18 18 8 23 -17 7z M185 99 c-4 -6 -5 -13 -2 -16 7 -7 27 6 27 18 0 12 -17 12 -25 -2z M227 84 c-4 -4 -7 -14 -7 -23 0 -11 3 -12 11 -4 6 6 10 16 7 23 -2 6 -7 8 -11 4z';

interface CalorieIconProps {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  // Accepted for drop-in compatibility with lucide icons; the glyph is filled, not stroked.
  strokeWidth?: number;
  fill?: string;
}

/** Calorie (kcal) glyph. Same size/color API as the lucide icons used across the app. */
export const CalorieIcon: React.FC<CalorieIconProps> = ({ size = 16, color = 'currentColor', style }) => (
  <Svg width={(size * VIEW_W) / VIEW_H} height={size} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={style}>
    <G transform="translate(-9.330916 63.959783) scale(0.1 -0.1)" fill={color}>
      <Path d={PATH} />
    </G>
  </Svg>
);
