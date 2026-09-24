import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../theme';

interface ProgressRingProps {
  size: number;
  strokeWidth?: number;
  progress: number; // 0..1
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
}

/** Circular progress ring that animates when `progress` changes. */
export const ProgressRing: React.FC<ProgressRingProps> = ({
  size,
  strokeWidth = 4,
  progress,
  color = colors.accent,
  trackColor = 'rgba(255,255,255,0.1)',
  children,
}) => {
  const clamped = Math.min(1, Math.max(0, progress || 0));
  const anim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const listener = anim.addListener(({ value }) => setShown(value));
    Animated.timing(anim, { toValue: clamped, duration: 900, useNativeDriver: false }).start();
    return () => anim.removeListener(listener);
  }, [anim, clamped]);

  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - shown)}
        />
      </Svg>
      {children}
    </View>
  );
};
