// Drawn achievement medals: a metal medallion on ribbon tails with its own centre mark.
// Locked medals render in unpolished grey so the shape still shows what is coming.
import React, { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, Stop, Text as SvgText } from 'react-native-svg';

export type MedalMetal = 'bronze' | 'silver' | 'gold';
export type MedalMark =
  | { kind: 'text'; value: string }
  | { kind: 'flame'; value?: string }
  | { kind: 'star' }
  | { kind: 'duo' };

const METALS: Record<MedalMetal | 'locked', { light: string; base: string; dark: string; ribbon: string }> = {
  bronze: { light: '#F3C08F', base: '#CD7F32', dark: '#6E3B12', ribbon: '#B4380E' },
  silver: { light: '#F8FAFC', base: '#A9B4C4', dark: '#4F5868', ribbon: '#354394' },
  gold: { light: '#FEF08A', base: '#F5A90B', dark: '#8A3B0A', ribbon: '#C2283A' },
  locked: { light: '#9AA3B2', base: '#646D7C', dark: '#3A404C', ribbon: '#4A515E' },
};

const FLAME = 'M50 22 C53 31 61 35 63 44 C65 54 59 63 50 63 C41 63 35 56 36 48 C37 42 41 38 43 34 C44 40 46 43 48 44 C46 36 47 29 50 22 Z';
const STAR = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 === 0 ? 17 : 7.5;
  const a = (Math.PI / 5) * i - Math.PI / 2;
  return `${(50 + r * Math.cos(a)).toFixed(1)},${(44 + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');

export const AchievementBadge: React.FC<{ metal: MedalMetal; mark: MedalMark; unlocked: boolean; size?: number }> = ({
  metal,
  mark,
  unlocked,
  size = 56,
}) => {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const m = METALS[unlocked ? metal : 'locked'];
  const ink = unlocked ? m.light : '#6B7280';
  const metalFill = `url(#m${raw})`;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={`m${raw}`} x1="0" y1="0" x2="0.5" y2="1">
            <Stop offset="0" stopColor={m.light} />
            <Stop offset="0.5" stopColor={m.base} />
            <Stop offset="1" stopColor={m.dark} />
          </LinearGradient>
        </Defs>
        {/* ribbon tails */}
        <Polygon points="34,62 24,97 34,91 41,99 47,70" fill={m.ribbon} />
        <Polygon points="66,62 76,97 66,91 59,99 53,70" fill={m.ribbon} />
        {/* medallion */}
        <Circle cx={50} cy={44} r={36} fill={metalFill} stroke="#120F26" strokeWidth={2} />
        <Circle cx={50} cy={44} r={28} fill="#1A1633" />
        <Circle cx={50} cy={44} r={28} fill="none" stroke={m.base} strokeWidth={1.2} strokeDasharray="2 3" opacity={0.7} />
        {/* centre mark */}
        <G>
          {mark.kind === 'text' && (
            <SvgText x={50} y={53} fontSize={mark.value.length > 1 ? 21 : 27} fontWeight="900" fill={ink} textAnchor="middle">
              {mark.value}
            </SvgText>
          )}
          {mark.kind === 'flame' && (
            <>
              <Path d={FLAME} fill={unlocked ? '#FF7A1A' : '#4B5260'} />
              {mark.value && (
                <SvgText x={50} y={58} fontSize={14} fontWeight="900" fill={unlocked ? '#FFF7ED' : '#8A93A5'} textAnchor="middle">
                  {mark.value}
                </SvgText>
              )}
            </>
          )}
          {mark.kind === 'star' && <Polygon points={STAR} fill={ink} />}
          {mark.kind === 'duo' && (
            <>
              <Circle cx={43} cy={36} r={6.5} fill={ink} />
              <Path d="M31 58 C31 48 37 45 43 45 C49 45 55 48 55 58 Z" fill={ink} />
              <Circle cx={58} cy={38} r={5.5} fill={ink} opacity={0.75} />
              <Path d="M51 47 C53 46 56 46 58 46 C63 46 68 49 68 58 L57 58 C57 53 55 49 51 47 Z" fill={ink} opacity={0.75} />
            </>
          )}
        </G>
      </Svg>
    </View>
  );
};
