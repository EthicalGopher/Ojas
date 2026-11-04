import React, { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { softShadow, typeStyle, type Palette } from '../../theme';
import { usePalette } from '../../theme/PaletteContext';
import { toneText } from '../../theme/contrast';
import { juice } from '../../juice/juice';
import type { JuiceEvent } from '../../juice/juiceLogic';
import { GradientFill } from './Gradient';

export interface GameButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'md' | 'lg' | 'xl';
  icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  disabled?: boolean;
  loading?: boolean;
  /** Default 'tap'; null plays nothing. */
  juiceEvent?: JuiceEvent | null;
  palette?: Palette;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

const LIP = 3;
const SIZES = {
  md: { height: 44, padX: 20, minWidth: 96, icon: 18, text: () => typeStyle('title', 17) },
  lg: { height: 56, padX: 28, minWidth: 160, icon: 22, text: () => typeStyle('display', 22) },
  xl: { height: 72, padX: 36, minWidth: 220, icon: 26, text: () => typeStyle('display', 30) },
} as const;

/** Pill button with a lip that sinks when pressed (design 3.3, 3.10). Total height includes the lip. */
export const GameButton: React.FC<GameButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon: Icon,
  disabled = false,
  loading = false,
  juiceEvent = 'tap',
  palette,
  style,
  testID,
  accessibilityLabel,
}) => {
  const c = usePalette(palette);
  const s = SIZES[size];
  const face = s.height - LIP;
  const press = useRef(new Animated.Value(0)).current;

  const faceColor = variant === 'primary' ? c.accentFrom : variant === 'danger' ? c.loss : c.raised;
  const lipColor = variant === 'primary' ? c.accentLip : variant === 'danger' ? c.lossLip : c.surfaceHi;
  const labelColor = variant === 'primary' ? c.onGradient : variant === 'danger' ? toneText(c, 'loss') : c.text;

  const animate = (to: number) => Animated.timing(press, { toValue: to, duration: 80, useNativeDriver: true }).start();
  const translateY = press.interpolate({ inputRange: [0, 1], outputRange: [0, LIP - 1] });

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPressIn={() => animate(1)}
      onPressOut={() => animate(0)}
      onPress={() => {
        juice.play(juiceEvent);
        onPress();
      }}
      style={[{ height: s.height, minWidth: s.minWidth, opacity: disabled ? 0.4 : 1 }, style]}
    >
      <View style={[{ position: 'absolute', left: 0, right: 0, top: LIP, height: face, borderRadius: face / 2, backgroundColor: lipColor }, softShadow(c)]} />
      <Animated.View
        style={{
          height: face,
          borderRadius: face / 2,
          backgroundColor: faceColor,
          paddingHorizontal: s.padX,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          overflow: 'hidden',
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: c.edge,
          transform: [{ translateY }],
        }}
      >
        {variant === 'primary' && <GradientFill from={c.accentFrom} to={c.accentTo} radius={face / 2} />}
        {loading ? (
          <ActivityIndicator color={labelColor} />
        ) : (
          <>
            {Icon && <Icon size={s.icon} color={labelColor} strokeWidth={2.6} />}
            <Animated.Text numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2} style={[s.text(), { color: labelColor }]}>
              {label}
            </Animated.Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
};
