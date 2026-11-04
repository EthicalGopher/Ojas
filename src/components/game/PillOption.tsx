import React from 'react';
import { Pressable, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { softShadow, typeStyle, type Palette } from '../../theme';
import { usePalette } from '../../theme/PaletteContext';
import { juice } from '../../juice/juice';
import { GText } from './GText';
import { GradientFill } from './Gradient';

export interface PillOptionProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  /** Dimmed with a lock but still pressable, so the caller can explain why. */
  locked?: boolean;
  /** Reason shown to screen readers for a locked pill. */
  lockedHint?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** Tabs: an accent bar under the selected pill (Ojas's focus marker). */
  underline?: boolean;
  palette?: Palette;
  testID?: string;
}

/** Selectable pill for tabs and choice lists (design 3.3, 3.10). */
export const PillOption: React.FC<PillOptionProps> = ({
  label,
  selected,
  onPress,
  icon: Icon,
  locked = false,
  lockedHint,
  disabled = false,
  size = 'sm',
  underline = false,
  palette,
  testID,
}) => {
  const c = usePalette(palette);
  const height = size === 'sm' ? 32 : 44;
  const fg = selected ? c.onGradient : c.text;
  const textStyle = size === 'sm' ? typeStyle('label') : typeStyle('title', 17);

  return (
    <View style={{ alignSelf: 'flex-start', alignItems: 'center' }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled }}
        accessibilityHint={locked ? lockedHint : undefined}
        disabled={disabled}
        onPress={() => {
          juice.play('toggle');
          onPress();
        }}
        style={[
          {
            height,
            borderRadius: height / 2,
            paddingHorizontal: size === 'sm' ? 12 : 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            overflow: 'hidden',
            backgroundColor: selected ? c.accentFrom : c.raised,
            borderWidth: selected ? 0 : 1,
            borderColor: c.edge,
            opacity: disabled ? 0.4 : locked ? 0.5 : 1,
          },
          selected ? null : softShadow(c),
        ]}
      >
        {selected && <GradientFill from={c.accentFrom} to={c.accentTo} radius={height / 2} />}
        {Icon && <Icon size={size === 'sm' ? 14 : 18} color={fg} />}
        <GText style={[textStyle, { color: fg }]} numberOfLines={1}>
          {label}
        </GText>
        {locked && <Lock size={12} color={fg} />}
      </Pressable>
      {underline && (
        <View style={{ marginTop: 4, height: 3, width: '60%', borderRadius: 1.5, backgroundColor: selected ? c.accentFrom : 'transparent' }} />
      )}
    </View>
  );
};
